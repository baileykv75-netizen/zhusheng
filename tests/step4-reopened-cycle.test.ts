import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEvidence } from "../lib/life-event-engine/evidence-evaluator.ts";
import { createDefaultLifeEventEngine } from "../lib/life-event-engine/index.ts";
import {
  DEFAULT_ISOLATION_CONTROLS,
  controlsFromTemplate,
  decideAuthorization,
  defaultRepairDraft,
  evaluateControls,
  executeAuthorizedClose,
  executeAuthorizedReopen,
  submitIsolationObservation,
  submitPostRepairObservation,
  submitRepairRecord
} from "../lib/life-event-lab/model.ts";
import { resumeReopenedAssessment } from "../lib/life-event-lab/reopened-cycle.ts";

const start = Date.parse("2026-08-13T10:00:00.000Z");

function approve(engine: ReturnType<typeof createDefaultLifeEventEngine>, result: ReturnType<typeof evaluateControls>, nowMs: number) {
  return decideAuthorization(engine, result, {
    actorType: "RESIDENT",
    actorId: "DEMO-RESIDENT-1602",
    decision: "APPROVED",
    reason: "STEP 4 reopened cycle test"
  }, nowMs);
}

function driveToReopened() {
  const engine = createDefaultLifeEventEngine();
  let result = evaluateControls(engine, controlsFromTemplate("joint-supported"), 1, start);
  assert.equal(result.state, "AUTHORIZATION_PENDING");

  result = approve(engine, result, start + 2 * 60_000);
  assert.equal(result.state, "AUTHORIZED");
  result = executeAuthorizedClose(engine, result, start + 3 * 60_000);
  assert.equal(result.state, "VERIFYING");
  result = submitIsolationObservation(engine, result, DEFAULT_ISOLATION_CONTROLS, start + 5 * 60_000);
  assert.equal(result.state, "REPAIR_PENDING");

  const repairNow = start + 30 * 60_000;
  const repairDraft = defaultRepairDraft(repairNow);
  repairDraft.targetBusinessId = result.rankedHypotheses[0]!.candidateBusinessIds[0]!;
  result = submitRepairRecord(engine, result, repairDraft, repairNow);
  assert.equal(result.state, "AUTHORIZATION_PENDING");
  assert.equal(result.authorizationRequirement?.action, "SIMULATE_REOPEN_VALVE");

  result = approve(engine, result, start + 32 * 60_000);
  assert.equal(result.state, "AUTHORIZED");
  result = executeAuthorizedReopen(engine, result, start + 33 * 60_000);
  assert.equal(result.state, "POST_REPAIR_VERIFYING");

  result = submitPostRepairObservation(engine, result, {
    humidity: 82,
    humidityBaseline: 55,
    humidityQuality: "GOOD",
    microFlow: 0.06,
    microFlowBaseline: 0,
    microFlowQuality: "GOOD",
    durationMinutes: 30,
    observationNote: "维修后仍有潮湿与微流量。"
  }, start + 40 * 60_000);
  assert.equal(result.state, "REOPENED");
  return { engine, reopened: result };
}

test("reopened second assessment keeps one event and uses the newest sensor cycle", () => {
  const { engine, reopened } = driveToReopened();
  const previousAuditCount = reopened.auditLog.length;
  const previousObservationIds = new Set(reopened.input.observations.map((item) => item.id));

  const recheck = controlsFromTemplate("joint-supported");
  recheck.humidity = { value: 58, baseline: 55, durationMinutes: 30, quality: "GOOD" };
  recheck.microFlow = { value: 0, baseline: 0, durationMinutes: 30, quality: "GOOD" };
  recheck.residentPhoto = "PRESENT";
  recheck.photoFinding = "NO_VISIBLE_MOISTURE";
  recheck.meterReading = "PRESENT";
  recheck.meterFinding = "NO_CHANGE";

  const second = resumeReopenedAssessment(engine, reopened, recheck, start + 45 * 60_000);
  assert.equal(second.eventId, reopened.eventId);
  assert.ok(second.auditLog.length > previousAuditCount);

  const newestHumidity = second.input.observations
    .filter((item) => item.metric === "RELATIVE_HUMIDITY")
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .at(-1)!;
  const newestFlow = second.input.observations
    .filter((item) => item.metric === "MICRO_FLOW")
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .at(-1)!;
  assert.equal(newestHumidity.value, 58);
  assert.equal(newestFlow.value, 0);
  assert.equal(previousObservationIds.has(newestHumidity.id), false);
  assert.equal(previousObservationIds.has(newestFlow.id), false);

  const evidence = evaluateEvidence(second.input, engine.memory);
  assert.equal(evidence.facts.HUMIDITY_ANOMALY.present, false);
  assert.equal(evidence.facts.MICRO_FLOW_ANOMALY.present, false);
  assert.deepEqual(evidence.facts.HUMIDITY_ANOMALY.inputRefs, [newestHumidity.id]);
  assert.deepEqual(evidence.facts.MICRO_FLOW_ANOMALY.inputRefs, [newestFlow.id]);
  assert.notEqual(second.authorizationRequirement?.action, "SIMULATE_CLOSE_VALVE");
});

test("reopened assessment with a genuinely new abnormal cycle can diagnose again", () => {
  const { engine, reopened } = driveToReopened();
  const recheck = controlsFromTemplate("joint-supported");
  const second = resumeReopenedAssessment(engine, reopened, recheck, start + 45 * 60_000);
  const evidence = evaluateEvidence(second.input, engine.memory);

  assert.equal(second.eventId, reopened.eventId);
  assert.equal(evidence.facts.HUMIDITY_ANOMALY.present, true);
  assert.equal(evidence.facts.MICRO_FLOW_ANOMALY.present, true);
  assert.ok(evidence.facts.HUMIDITY_ANOMALY.inputRefs.every((id) => id.includes("REOPEN")));
  assert.ok(evidence.facts.MICRO_FLOW_ANOMALY.inputRefs.every((id) => id.includes("REOPEN")));
});
