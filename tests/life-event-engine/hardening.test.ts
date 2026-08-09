import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultLifeEventEngine, fixedClock, hashAuditEvent, loadLifeEventContext,
  replayAuditLog, replayLifeEventArtifact, toLifeEventArtifact, verifyLifeEventArtifact
} from "../../lib/life-event-engine/index.ts";
import type { AuditEvent, LifeEventInput, LifeEventResult, ScenarioDocument } from "../../lib/life-event-engine/index.ts";
import { clone, scenario } from "./helpers.ts";

const engine = () => createDefaultLifeEventEngine({ clock: fixedClock("2026-07-30T00:00:00.000Z") });

function resume(input: LifeEventInput, evaluatedAt: string): LifeEventInput {
  return { ...clone(input), evaluatedAt, observations: [], evidence: [], requestedAction: undefined, authorizationRecords: undefined };
}

function runPrefix(document: ScenarioDocument, count: number): LifeEventResult {
  const instance = engine();
  let result: LifeEventResult | undefined;
  for (const step of document.steps.slice(0, count)) result = instance.evaluate(step, result);
  return result!;
}

test("same immutable IDs with identical content are idempotent", () => {
  const firstInput = scenario("joint-leak-supported").steps[0];
  const instance = engine();
  const first = instance.evaluate(firstInput);
  const duplicate = { ...clone(firstInput), evaluatedAt: "2026-07-29T08:36:00.000Z" };
  const second = instance.evaluate(duplicate, first);
  assert.equal(second.input.observations.length, firstInput.observations.length);
  assert.equal(second.input.evidence.length, firstInput.evidence.length);
});

test("same observation, evidence and authorization IDs cannot overwrite content", () => {
  const document = scenario("post-isolation-recovery");
  const first = runPrefix(document, 1);
  const changedObservation = resume(document.steps[0], "2026-07-29T12:06:00.000Z");
  changedObservation.observations = [{ ...clone(document.steps[0].observations[0]), value: 12 }];
  assert.throws(() => engine().evaluate(changedObservation, first), /SensorObservation .* immutable/);
  const changedEvidence = resume(document.steps[0], "2026-07-29T12:06:00.000Z");
  changedEvidence.evidence = [{ ...clone(document.steps[0].evidence[0]), reliability: 0.1 }];
  assert.throws(() => engine().evaluate(changedEvidence, first), /EvidenceItem .* immutable/);
  const changedAuth = resume(document.steps[0], "2026-07-29T12:06:00.000Z");
  changedAuth.authorizationRecords = [{ ...clone(document.steps[0].authorizationRecords![0]), actorId: "CHANGED" }];
  assert.throws(() => engine().evaluate(changedAuth, first), /AuthorizationRecord .* immutable/);
});

test("evidence revisions use new IDs and preserve the superseded record", () => {
  const input = scenario("joint-leak-supported").steps[0];
  const instance = engine();
  const first = instance.evaluate(input);
  const revision = resume(input, "2026-07-29T08:40:00.000Z");
  revision.evidence = [{
    ...clone(input.evidence.find((item) => item.type === "METER_READING")!), id: "EVD-METER-J02",
    supersedesId: "EVD-METER-J01", revisionReason: "人工复核修订", capturedAt: "2026-07-29T08:39:00.000Z"
  }];
  const result = instance.evaluate(revision, first);
  assert.ok(result.input.evidence.some((item) => item.id === "EVD-METER-J01"));
  assert.ok(result.input.evidence.some((item) => item.supersedesId === "EVD-METER-J01"));
});

test("sensor physical ranges and future data are rejected", () => {
  for (const [metric, value] of [["RELATIVE_HUMIDITY", -1], ["RELATIVE_HUMIDITY", 101], ["MICRO_FLOW", -0.01]] as const) {
    const document = scenario("joint-leak-supported");
    document.steps[0].observations.find((item) => item.metric === metric)!.value = value;
    assert.throws(() => engine().runScenario(document), /humidity|flow/);
  }
  const future = scenario("joint-leak-supported");
  future.steps[0].evidence.find((item) => item.type === "METER_READING")!.capturedAt = "2026-07-29T08:36:00.000Z";
  assert.throws(() => engine().runScenario(future), /future evidence/);
});

test("missing baseline does not create a strong anomaly", () => {
  const document = scenario("joint-leak-supported");
  delete document.steps[0].observations.find((item) => item.metric === "MICRO_FLOW")!.baseline;
  const result = engine().runScenario(document);
  assert.notEqual(result.decisionConfidence, "HIGH");
  assert.equal(result.authorizationRequests.length, 0);
});

test("event observations must come from the event space and cold-water system", () => {
  const { memory, manifest } = loadLifeEventContext();
  const wrongSpace = clone(memory);
  wrongSpace.components.find((item) => item.businessId === "SENSOR-1602-HUM-01")!.spaceId = "SPACE-1602-KITCHEN";
  assert.throws(() => createDefaultLifeEventEngine({ clock: fixedClock("2026-07-30T00:00:00.000Z"), memory: wrongSpace, manifest }).runScenario(scenario("joint-leak-supported")), /event-space humidity sensor/);
  const wrongSystem = clone(memory);
  wrongSystem.systems.find((item) => item.systemType === "DOMESTIC_COLD_WATER")!.memberIds = wrongSystem.systems.find((item) => item.systemType === "DOMESTIC_COLD_WATER")!.memberIds.filter((id) => id !== "METER-1602-FLOW-01");
  assert.throws(() => createDefaultLifeEventEngine({ clock: fixedClock("2026-07-30T00:00:00.000Z"), memory: wrongSystem, manifest }).runScenario(scenario("joint-leak-supported")), /related cold-water flow meter/);
});

test("evidence type, system and source actor constraints are enforced", () => {
  const irrelevantPipe = scenario("joint-leak-supported");
  irrelevantPipe.steps[0].evidence.find((item) => item.type === "PIPE_INSTALLATION_RECORD")!.relatedBusinessIds = ["PIPE-1602-HW-01"];
  assert.throws(() => engine().runScenario(irrelevantPipe), /required type, space and system/);
  const unrelatedMeter = scenario("joint-leak-supported");
  unrelatedMeter.steps[0].evidence.find((item) => item.type === "METER_READING")!.relatedBusinessIds = ["PIPE-1602-HW-01"];
  assert.throws(() => engine().runScenario(unrelatedMeter), /required type, space and system/);
  const wrongActor = scenario("joint-leak-supported");
  wrongActor.steps[0].evidence.find((item) => item.type === "PIPE_INSTALLATION_RECORD")!.sourceActor = "SYSTEM";
  assert.throws(() => engine().runScenario(wrongActor), /cannot be submitted/);
});

test("a present photo with NO_VISIBLE_MOISTURE does not support wall moisture", () => {
  const document = scenario("joint-leak-supported");
  document.steps[0].evidence.find((item) => item.type === "RESIDENT_WALL_PHOTO")!.observedValue = "NO_VISIBLE_MOISTURE";
  const result = engine().runScenario(document);
  const cold = result.rankedHypotheses.find((item) => item.hypothesis === "COLD_WATER_JOINT_LEAK")!;
  assert.ok(!cold.contributions.some((item) => item.ruleId === "RULE-CW-003"));
});

test("authorization cannot precede its request or the evaluation clock", () => {
  const early = scenario("post-isolation-recovery");
  early.steps[0].authorizationRecords![0].decidedAt = "2026-07-29T12:04:00.000Z";
  assert.throws(() => engine().runScenario(early), /cannot precede/);
  const future = scenario("post-isolation-recovery");
  future.steps[0].authorizationRecords![0].decidedAt = "2026-07-29T12:06:00.000Z";
  assert.throws(() => engine().runScenario(future), /future authorization/);
});

test("preloaded and wrong-target isolation evidence are rejected", () => {
  assert.throws(() => engine().runScenario(scenario("preloaded-recovery-evidence")), /Preloaded isolation evidence/);
  const wrong = scenario("post-isolation-recovery");
  wrong.steps[1].evidence.find((item) => item.type === "VALVE_ISOLATION_OBSERVATION")!.actionTargetBusinessId = "J-1602-CW-03";
  assert.throws(() => engine().runScenario(wrong), /wrong isolation valve/);
  const wrongSequence = scenario("post-isolation-recovery");
  wrongSequence.steps[1].evidence.find((item) => item.type === "VALVE_ISOLATION_OBSERVATION")!.actionAuditSequence = 5;
  assert.throws(() => engine().runScenario(wrongSequence), /current close action audit sequence/);
  const missingTime = scenario("post-isolation-recovery");
  delete missingTime.steps[1].evidence.find((item) => item.type === "VALVE_ISOLATION_OBSERVATION")!.capturedAt;
  assert.throws(() => engine().runScenario(missingTime), /requires capturedAt/);
});

test("isolation recovery only controls the event and cannot imply repair", () => {
  const result = engine().runScenario(scenario("post-isolation-recovery"));
  assert.equal(result.state, "REPAIR_PENDING");
  assert.equal(result.valvePosition, "CLOSED");
  assert.notEqual(result.visualDirective.moistureState, "REPAIRED");
});

test("repair chronology and post-repair observations guard RESOLVED", () => {
  const complete = scenario("repair-and-post-verification");
  assert.equal(runPrefix(complete, 2).state, "REPAIR_PENDING");
  assert.equal(runPrefix(complete, 3).state, "POST_REPAIR_VERIFYING");
  const earlyRepair = clone(complete);
  earlyRepair.steps[2].evidence[0].capturedAt = "2026-07-29T12:40:00.000Z";
  assert.throws(() => engine().runScenario(earlyRepair), /after isolation confirmation/);
  const abnormal = clone(complete);
  abnormal.steps[3].observations.find((item) => item.metric === "MICRO_FLOW")!.value = 0.05;
  assert.equal(engine().runScenario(abnormal).state, "REOPENED");
  assert.equal(engine().runScenario(complete).state, "RESOLVED");
});

test("action output categories enforce authorization semantics", () => {
  const pending = engine().runScenario(scenario("joint-leak-supported"));
  assert.deepEqual(pending.visualDirective.allowedActions, ["REQUEST_HUMAN_AUTHORIZATION"]);
  assert.equal(pending.authorizedActions.length, 0);
  const authorizationOnly = scenario("post-isolation-recovery");
  delete authorizationOnly.steps[0].requestedAction;
  const authorized = runPrefix(authorizationOnly, 1);
  assert.equal(authorized.state, "AUTHORIZED");
  assert.deepEqual(authorized.authorizedActions.map((item) => item.action), ["SIMULATE_CLOSE_VALVE"]);
  const completed = runPrefix(scenario("post-isolation-recovery"), 1);
  assert.equal(completed.authorizedActions.length, 0);
  assert.deepEqual(completed.completedActions.map((item) => item.action), ["SIMULATE_CLOSE_VALVE"]);
});

test("only the leader receives decision confidence", () => {
  const result = engine().runScenario(scenario("joint-leak-supported"));
  assert.equal(result.rankedHypotheses[0].confidence, result.decisionConfidence);
  for (const candidate of result.rankedHypotheses.slice(1)) assert.equal(candidate.confidence, "NOT_APPLICABLE");
});

test("audit chain detects deletion, reordering and field tampering", () => {
  const artifact = toLifeEventArtifact(engine().runScenario(scenario("repair-and-post-verification")));
  const deleted = clone(artifact); deleted.auditLog.splice(4, 1);
  assert.throws(() => verifyLifeEventArtifact(deleted), /sequence|state|previous hash/);
  const swapped = clone(artifact); [swapped.auditLog[3], swapped.auditLog[4]] = [swapped.auditLog[4], swapped.auditLog[3]];
  assert.throws(() => verifyLifeEventArtifact(swapped), /sequence|state|previous hash/);
  const actor = clone(artifact); actor.auditLog.find((item) => item.actorId)!.actorId = "TAMPERED";
  assert.throws(() => verifyLifeEventArtifact(actor), /hash mismatch/);
});

test("artifact snapshot hashes detect changed evidence", () => {
  const artifact = toLifeEventArtifact(engine().runScenario(scenario("repair-and-post-verification")));
  const tampered = JSON.parse(JSON.stringify(artifact)) as typeof artifact;
  Object.values(tampered.evidenceSnapshots)[0][0].reliability = 0;
  assert.throws(() => verifyLifeEventArtifact(tampered), /Evidence snapshot hash mismatch/);
});

test("forged illegal transitions cannot be replayed even with recomputed hashes", () => {
  const result = engine().runScenario(scenario("joint-leak-supported"));
  const log = clone(result.auditLog);
  log[0].nextState = "AUTHORIZED";
  log[1].previousState = "AUTHORIZED";
  let previousHash = log[0].previousHash;
  for (const entry of log) {
    entry.previousHash = previousHash;
    const { entryHash: _ignored, ...base } = entry;
    entry.entryHash = hashAuditEvent(base);
    previousHash = entry.entryHash;
  }
  assert.throws(() => replayAuditLog(log), /Illegal replay transition/);
});

test("artifact replay restores state, valve position and last decision", () => {
  const result = engine().runScenario(scenario("repair-and-post-verification"));
  const artifact = toLifeEventArtifact(result);
  assert.equal(verifyLifeEventArtifact(artifact), true);
  const replayed = replayLifeEventArtifact(artifact);
  assert.equal(replayed.state, "RESOLVED");
  assert.equal(replayed.valvePosition, "OPEN");
  assert.equal(replayed.lastDecision.eventId, result.eventId);
  assert.equal(replayed.lastDecision.decisionConfidence, result.decisionConfidence);
});
