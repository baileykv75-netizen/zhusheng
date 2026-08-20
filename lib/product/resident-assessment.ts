import type { LifeEventResult } from "../life-event-engine/types.ts";
import { hasFreshEvidenceAfterReopen } from "../life-event-lab/reopened-cycle.ts";
import type { ResidentEvidenceSubmission } from "./evidence.ts";

export function latestResidentSubmission(
  submissions: readonly ResidentEvidenceSubmission[] | undefined
): ResidentEvidenceSubmission | null {
  return submissions?.at(-1) ?? null;
}

export function residentEvidenceNeedsAssessment(
  result: LifeEventResult | null,
  submissions: readonly ResidentEvidenceSubmission[] | undefined
): boolean {
  const latest = latestResidentSubmission(submissions);
  if (!latest) return false;
  if (!result) return true;

  if (result.state === "INCONCLUSIVE") {
    return Date.parse(latest.submittedAt) > Date.parse(result.input.evaluatedAt);
  }

  if (result.state === "REOPENED") {
    return hasFreshEvidenceAfterReopen(result, [latest.submittedAt]);
  }

  return false;
}
