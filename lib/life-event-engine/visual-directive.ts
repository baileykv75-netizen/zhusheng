import { findIsolationValve, findRelatedMeters, findRelatedSensors } from "./topology-traversal.ts";
import type {
  ActionProposal,
  BuildingMemory,
  FactEvaluation,
  HypothesisResult,
  LifeEventState,
  VisualDirective,
  VisualManifest
} from "./types.ts";

const anchorByEvidence: Record<string, string> = {
  PIPE_INSTALLATION_RECORD: "EVIDENCE-ANCHOR-PIPE-INSTALL",
  WATERPROOFING_RECORD: "EVIDENCE-ANCHOR-WATERPROOF",
  CLOSED_WATER_TEST: "EVIDENCE-ANCHOR-CLOSED-WATER-TEST",
  RESIDENT_WALL_PHOTO: "EVIDENCE-ANCHOR-RESIDENT-WALL-PHOTO",
  METER_READING: "EVIDENCE-ANCHOR-METER-READING",
  VALVE_ISOLATION_OBSERVATION: "EVIDENCE-ANCHOR-REPAIR-RESULT",
  REPAIR_RESULT: "EVIDENCE-ANCHOR-REPAIR-RESULT"
};

function moistureState(evaluation: FactEvaluation, state: LifeEventState, valvePosition: "OPEN" | "CLOSED"): VisualDirective["moistureState"] {
  if (state === "RESOLVED") return "REPAIRED";
  if (state === "POST_REPAIR_VERIFYING") return "DAMP_LIGHT";
  if (valvePosition === "CLOSED" && ["REPAIR_RECORDED", "ACTION_PROPOSED", "AUTHORIZATION_PENDING", "AUTHORIZED", "SIMULATED_ACTION_APPLIED"].includes(state)) return "REPAIR_OPEN";
  const humidity = evaluation.latestHumidity?.value;
  if (humidity === undefined || !evaluation.facts.HUMIDITY_ANOMALY.present) return "DRY";
  if (humidity < 70) return "DAMP_LIGHT";
  if (humidity < 85) return "DAMP_MODERATE";
  return "DAMP_SEVERE";
}

export function createVisualDirective(
  memory: BuildingMemory,
  manifest: VisualManifest,
  top: HypothesisResult,
  evaluation: FactEvaluation,
  state: LifeEventState,
  valvePosition: "OPEN" | "CLOSED",
  allowedActionNames: string[],
  authorizationRequired: boolean
): VisualDirective {
  const highlights = new Set(top.candidateBusinessIds);
  for (const candidateId of top.candidateBusinessIds) {
    if (top.hypothesis !== "COLD_WATER_JOINT_LEAK") continue;
    const valve = findIsolationValve(memory, candidateId);
    if (valve) highlights.add(valve.businessId);
    for (const meter of findRelatedMeters(memory, candidateId)) highlights.add(meter.businessId);
    for (const sensor of findRelatedSensors(memory, candidateId)) highlights.add(sensor.businessId);
  }
  const highlightBusinessIds = [...highlights].filter((id) => Boolean(manifest.nodes[id])).sort();
  const evidenceTypes = new Set([
    ...evaluation.missingEvidence.map((item) => item.evidenceType),
    ...(evaluation.facts.METER_SUPPORTS_FLOW.present || evaluation.facts.METER_REPORTS_NO_CHANGE.present ? ["METER_READING"] : []),
    ...(evaluation.facts.WALL_PHOTO_PRESENT.present ? ["RESIDENT_WALL_PHOTO"] : []),
    ...(evaluation.facts.POST_ISOLATION_RECOVERY.present || evaluation.facts.POST_ISOLATION_NO_RECOVERY.present ? ["VALVE_ISOLATION_OBSERVATION"] : [])
  ]);
  const evidenceAnchorIds = [...evidenceTypes]
    .map((type) => anchorByEvidence[type])
    .filter((id): id is string => Boolean(id && manifest.evidenceAnchors[id]))
    .sort();
  const allowedActions = evaluation.contradictions.length
    ? ["REQUEST_METER_RETEST"]
    : [
        ...evaluation.missingEvidence.map((item) => `REQUEST_${item.evidenceType}`),
        ...allowedActionNames
      ];
  const maintenanceStates: LifeEventState[] = ["REPAIR_PENDING", "REPAIR_RECORDED", "POST_REPAIR_VERIFYING", "RESOLVED", "REOPENED"];
  const repairAuthorization = valvePosition === "CLOSED" && ["ACTION_PROPOSED", "AUTHORIZATION_PENDING", "AUTHORIZED", "SIMULATED_ACTION_APPLIED"].includes(state);
  const view: VisualDirective["view"] = maintenanceStates.includes(state) || repairAuthorization ? "VIEW_MAINTENANCE" : "VIEW_DIAGNOSTIC";
  if (!manifest.views[view]) throw new Error(`Visual manifest does not define ${view}`);
  const visualState = moistureState(evaluation, state, valvePosition);
  if (!manifest.visualStates.states.includes(visualState)) throw new Error(`Visual manifest does not define ${visualState}`);
  for (const id of [...highlightBusinessIds, ...evidenceAnchorIds]) {
    if (!manifest.nodes[id]) throw new Error(`Visual directive references unknown GLB node: ${id}`);
  }
  return {
    view,
    highlightBusinessIds,
    moistureState: visualState,
    valvePosition,
    evidenceAnchorIds,
    allowedActions: [...new Set(allowedActions)].sort(),
    authorizationRequired
  };
}
