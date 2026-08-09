import { calculateConfidence } from "./confidence.ts";
import { EXPECTED_FACTS, DIAGNOSTIC_RULES } from "./rules.ts";
import { findColdWaterJointCandidates, findComponentsInSpace } from "./topology-traversal.ts";
import { HYPOTHESES } from "./types.ts";
import type { BuildingMemory, FactEvaluation, Hypothesis, HypothesisResult, RuleContribution } from "./types.ts";

function candidateIds(memory: BuildingMemory, spaceId: string, hypothesis: Hypothesis): string[] {
  if (hypothesis === "COLD_WATER_JOINT_LEAK") return findColdWaterJointCandidates(memory, spaceId).map((item) => item.businessId);
  if (hypothesis === "WATERPROOFING_FAILURE") return findComponentsInSpace(memory, spaceId).filter((item) => item.ifcClass === "IfcCovering").map((item) => item.businessId);
  if (hypothesis === "CONDENSATION_OR_AMBIENT_HUMIDITY") return findComponentsInSpace(memory, spaceId).filter((item) => item.ifcClass === "IfcSensor").map((item) => item.businessId);
  return [];
}

export function evaluateHypotheses(memory: BuildingMemory, spaceId: string, evaluation: FactEvaluation): HypothesisResult[] {
  const provisional = HYPOTHESES.map((hypothesis) => {
    const contributions: RuleContribution[] = [];
    for (const rule of DIAGNOSTIC_RULES.filter((item) => item.hypothesis === hypothesis)) {
      const required = rule.requiredFacts.map((factId) => evaluation.facts[factId]);
      if (required.some((item) => !item?.present)) continue;
      const reliability = required.length ? required.reduce((sum, item) => sum + item.reliability, 0) / required.length : 1;
      contributions.push({
        ruleId: rule.ruleId,
        hypothesis,
        contribution: Math.round(rule.contribution * reliability * 100) / 100,
        evidenceIds: [...new Set(required.flatMap((item) => item.inputRefs))].sort(),
        explanation: rule.explanation
      });
    }
    const expected = EXPECTED_FACTS[hypothesis];
    const covered = expected.filter((factId) => evaluation.facts[factId]?.present).length;
    return {
      hypothesis,
      candidateBusinessIds: candidateIds(memory, spaceId, hypothesis),
      rawScore: Math.round(contributions.reduce((sum, item) => sum + item.contribution, 0) * 100) / 100,
      evidenceCoverage: expected.length ? Math.round((covered / expected.length) * 1000) / 1000 : 0,
      gapFromLeader: 0,
      confidence: "INSUFFICIENT" as const,
      contributions
    };
  }).sort((a, b) => b.rawScore - a.rawScore || a.hypothesis.localeCompare(b.hypothesis));

  const leaderScore = provisional[0]?.rawScore ?? 0;
  const secondScore = provisional[1]?.rawScore ?? 0;
  return provisional.map((item, index) => {
    const gap = index === 0 ? Math.max(0, leaderScore - secondScore) : Math.max(0, leaderScore - item.rawScore);
    return {
      ...item,
      gapFromLeader: Math.round(gap * 100) / 100,
      confidence: index === 0
        ? calculateConfidence(item.rawScore, item.evidenceCoverage, gap, {
          hasContradiction: Boolean(evaluation.contradictions.length),
          hasCriticalMissing: evaluation.missingEvidence.some((missing) => ["METER_READING", "RESIDENT_WALL_PHOTO", "PIPE_INSTALLATION_RECORD"].includes(missing.evidenceType))
        })
        : "NOT_APPLICABLE"
    };
  });
}
