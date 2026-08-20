import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLifeEventEngine } from "../lib/life-event-engine/index.ts";
import {
  buildAssessmentInput,
  controlsFromTemplate,
  evaluateControls,
  resumeInconclusiveAssessment
} from "../lib/life-event-lab/model.ts";

const now = Date.parse("2026-08-20T02:40:00.000Z");

test("lab assessment keeps the legacy one-minute clock margin without resident evidence", () => {
  const input = buildAssessmentInput(controlsFromTemplate("joint-supported"), 1, now);
  assert.equal(Date.parse(input.evaluatedAt), now - 60_000);
});

test("resident-backed assessment cannot predate its immutable resident source", () => {
  const submittedAt = new Date(now - 5_000).toISOString();
  const input = buildAssessmentInput(controlsFromTemplate("joint-supported"), 1, now, submittedAt);
  const residentEvidence = input.evidence.filter((item) => item.sourceActor === "RESIDENT");

  assert.ok(residentEvidence.length >= 2);
  assert.ok(residentEvidence.every((item) => item.capturedAt === submittedAt));
  assert.ok(Date.parse(input.evaluatedAt) > Date.parse(submittedAt));
  assert.ok(Date.parse(input.evaluatedAt) <= now);
});

test("new resident evidence refines an INCONCLUSIVE result on the same event id", () => {
  const engine = createDefaultLifeEventEngine();
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
  assert.notEqual(refined.state, "INCONCLUSIVE");
});
