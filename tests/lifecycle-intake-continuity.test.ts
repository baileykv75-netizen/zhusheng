import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLifeEventEngine } from "../lib/life-event-engine/index.ts";
import {
  buildAssessmentInput,
  controlsFromTemplate,
  decideAuthorization,
  evaluateControls,
  executeAuthorizedClose,
  resumeInconclusiveAssessment
} from "../lib/life-event-lab/model.ts";

const now = Date.parse("2026-08-20T02:40:00.000Z");
const deterministicEngine = () => createDefaultLifeEventEngine({
  clock: { now: () => new Date(now).toISOString() }
});

test("lab assessment keeps the legacy staged clock without resident evidence", () => {
  const input = buildAssessmentInput(controlsFromTemplate("joint-supported"), 1, now);
  assert.equal(Date.parse(input.detectedAt), now - 10 * 60_000);
  assert.ok(input.observations.every((item) => Date.parse(item.observedAt) === now - 5 * 60_000));
  assert.equal(Date.parse(input.evaluatedAt), now - 60_000);
});

test("resident-backed assessment follows source then system observation then evaluation", () => {
  const submittedAt = new Date(now - 5_000).toISOString();
  const input = buildAssessmentInput(controlsFromTemplate("joint-supported"), 1, now, submittedAt);
  const residentEvidence = input.evidence.filter((item) => item.sourceActor === "RESIDENT");
  const observedTimes = input.observations.map((item) => Date.parse(item.observedAt));

  assert.equal(input.detectedAt, submittedAt);
  assert.ok(residentEvidence.length >= 2);
  assert.ok(residentEvidence.every((item) => item.capturedAt === submittedAt));
  assert.ok(observedTimes.every((value) => value > Date.parse(submittedAt)));
  assert.ok(observedTimes.every((value) => value < Date.parse(input.evaluatedAt)));
  assert.ok(Date.parse(input.evaluatedAt) <= now);
});

test("resident-backed first assessment still allows a monotonic human authorization and explicit valve action", () => {
  let auditNow = now;
  const engine = createDefaultLifeEventEngine({
    clock: { now: () => new Date(auditNow).toISOString() }
  });
  const submittedAt = new Date(now - 5_000).toISOString();
  let result = evaluateControls(engine, controlsFromTemplate("joint-supported"), 1, now, submittedAt);
  assert.equal(result.state, "AUTHORIZATION_PENDING");
  const firstEvaluatedAt = result.input.evaluatedAt;
  const initialAuditCount = result.auditLog.length;

  auditNow = now + 2_000;
  result = decideAuthorization(engine, result, {
    actorType: "RESIDENT",
    actorId: "DEMO-RESIDENT-1602",
    decision: "APPROVED",
    reason: "resident-backed continuity test"
  }, now + 2_000);
  assert.equal(result.state, "AUTHORIZED");
  assert.ok(Date.parse(result.input.evaluatedAt) >= Date.parse(firstEvaluatedAt));
  assert.ok(result.auditLog.length > initialAuditCount);

  const authorizationAuditAt = Date.parse(result.auditLog.at(-1)!.timestamp);
  auditNow = now + 3_000;
  result = executeAuthorizedClose(engine, result, now + 3_000);
  assert.equal(result.state, "VERIFYING");
  assert.equal(result.valvePosition, "CLOSED");
  assert.ok(Date.parse(result.auditLog.at(-1)!.timestamp) > authorizationAuditAt);
});

test("new resident evidence refines an INCONCLUSIVE result on the same event id with a new observation cycle", () => {
  const engine = deterministicEngine();
  const first = evaluateControls(engine, controlsFromTemplate("contradictory-evidence"), 1, now);
  assert.equal(first.state, "INCONCLUSIVE");

  const newSubmissionAt = new Date(now - 30_000).toISOString();
  assert.ok(Date.parse(newSubmissionAt) > Date.parse(first.input.evaluatedAt));

  const refined = resumeInconclusiveAssessment(
    engine,
    first,
    controlsFromTemplate("joint-supported"),
    newSubmissionAt,
    now
  );

  assert.equal(refined.eventId, first.eventId);
  assert.equal(refined.input.detectedAt, first.input.detectedAt);
  assert.ok(refined.input.evidence.some((item) => item.supersedesId));
  assert.ok(refined.input.evidence.some((item) => item.id.startsWith("EVD-METER-REFINE-")));
  const refinedResidentEvidence = refined.input.evidence.filter((item) => item.id.includes("REFINE") && item.sourceActor === "RESIDENT");
  const refinedObservations = refined.input.observations.filter((item) => item.id.includes("REFINE"));
  assert.ok(refinedResidentEvidence.every((item) => item.capturedAt === newSubmissionAt));
  assert.ok(refinedObservations.every((item) => Date.parse(item.observedAt) > Date.parse(newSubmissionAt)));
  assert.ok(refinedObservations.every((item) => Date.parse(item.observedAt) < Date.parse(refined.input.evaluatedAt)));
  assert.notEqual(refined.state, "INCONCLUSIVE");
});
