import { DIAGNOSTIC_THRESHOLDS } from "./rules.ts";
import type { ConfidenceLevel } from "./types.ts";

const levels: ConfidenceLevel[] = ["INSUFFICIENT", "LOW", "MEDIUM", "HIGH"];

export function calculateConfidence(
  score: number,
  coverage: number,
  gap: number,
  options: { hasContradiction: boolean; hasCriticalMissing: boolean }
): ConfidenceLevel {
  const thresholds = DIAGNOSTIC_THRESHOLDS.confidence;
  let result: ConfidenceLevel = "INSUFFICIENT";
  if (score >= thresholds.high.score && coverage >= thresholds.high.coverage && gap >= thresholds.high.gap) result = "HIGH";
  else if (score >= thresholds.medium.score && coverage >= thresholds.medium.coverage && gap >= thresholds.medium.gap) result = "MEDIUM";
  else if (score >= thresholds.low.score) result = "LOW";
  if (options.hasContradiction && levels.indexOf(result) > levels.indexOf("LOW")) return "LOW";
  if (options.hasCriticalMissing && result === "HIGH") return "MEDIUM";
  return result;
}
