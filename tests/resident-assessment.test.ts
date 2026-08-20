import assert from "node:assert/strict";
import test from "node:test";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";
import type { ResidentEvidenceSubmission } from "../lib/product/evidence.ts";
import { latestResidentSubmission, residentEvidenceNeedsAssessment } from "../lib/product/resident-assessment.ts";

function submission(time: string, sequence = 1): ResidentEvidenceSubmission {
  return {
    submissionId: `RES-SUB-EVT-1602-LAB-001-${sequence}`,
    eventId: "EVT-1602-LAB-001",
    submittedAt: time,
    submittedBy: "DEMO-RESIDENT-1602",
    evidenceIds: [`TEXT-${sequence}`, `PHOTO-${sequence}`, `METER-${sequence}`],
    descriptionEvidenceId: `TEXT-${sequence}`,
    photoEvidenceId: `PHOTO-${sequence}`,
    meterEvidenceId: `METER-${sequence}`,
    photoFinding: "MOISTURE_VISIBLE",
    meterFinding: "FLOW_CONFIRMED_NO_USE",
    immutable: true
  };
}

function result(state: "INCONCLUSIVE" | "REOPENED", evaluatedAt: string, reopenedAt?: string) {
  return {
    state,
    input: { evaluatedAt },
    auditLog: reopenedAt ? [{ nextState: "REOPENED", timestamp: reopenedAt }] : []
  } as unknown as LifeEventResult;
}

test("latest resident submission is deterministic and empty input remains empty", () => {
  assert.equal(latestResidentSubmission(undefined), null);
  assert.equal(latestResidentSubmission([]), null);
  const first = submission("2026-08-20T01:00:00.000Z", 1);
  const second = submission("2026-08-20T01:10:00.000Z", 2);
  assert.equal(latestResidentSubmission([first, second])?.submissionId, second.submissionId);
});

test("initial intake needs property assessment as soon as one resident submission exists", () => {
  const first = submission("2026-08-20T01:00:00.000Z");
  assert.equal(residentEvidenceNeedsAssessment(null, []), false);
  assert.equal(residentEvidenceNeedsAssessment(null, [first]), true);
});

test("INCONCLUSIVE only accepts resident evidence newer than the previous evaluation", () => {
  const previous = result("INCONCLUSIVE", "2026-08-20T01:05:00.000Z");
  const old = submission("2026-08-20T01:00:00.000Z", 1);
  const fresh = submission("2026-08-20T01:10:00.000Z", 2);

  assert.equal(residentEvidenceNeedsAssessment(previous, [old]), false);
  assert.equal(residentEvidenceNeedsAssessment(previous, [old, fresh]), true);
});

test("REOPENED only accepts evidence captured after the reopen audit", () => {
  const previous = result(
    "REOPENED",
    "2026-08-20T01:20:00.000Z",
    "2026-08-20T01:21:00.000Z"
  );
  const stale = submission("2026-08-20T01:20:30.000Z", 1);
  const fresh = submission("2026-08-20T01:22:00.000Z", 2);

  assert.equal(residentEvidenceNeedsAssessment(previous, [stale]), false);
  assert.equal(residentEvidenceNeedsAssessment(previous, [stale, fresh]), true);
});
