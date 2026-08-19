import { resolveBuildingMemoryRelevance, type MemoryRelevanceInput, type RelevantBuildingMemory } from "../building-intelligence/memory-relevance.ts";
import { deriveGuardedLifecycleProjection, type GuardedLifecycleProjection } from "../life-event-engine/guarded-lifecycle.ts";
import type { Hypothesis, LifeEventResult, MissingEvidence, SensorObservation } from "../life-event-engine/types.ts";
import type { LabSession } from "../life-event-lab/types.ts";
import { hasFreshEvidenceAfterReopen } from "../life-event-lab/reopened-cycle.ts";

const HYPOTHESIS_LABELS: Record<Hypothesis, string> = {
  COLD_WATER_JOINT_LEAK: "冷水系统局部渗漏",
  WATERPROOFING_FAILURE: "防水节点异常",
  CONDENSATION_OR_AMBIENT_HUMIDITY: "环境潮湿或冷凝",
  UNRESOLVED: "尚未收敛到单一原因"
};

const EVIDENCE_LABELS: Record<MissingEvidence["evidenceType"], string> = {
  PIPE_INSTALLATION_RECORD: "给水安装记录",
  WATERPROOFING_RECORD: "防水施工记录",
  CLOSED_WATER_TEST: "闭水试验记录",
  RESIDENT_WALL_PHOTO: "住户现场照片观察",
  METER_READING: "无人用水水表观察",
  VALVE_ISOLATION_OBSERVATION: "隔离后的新观察",
  REPAIR_RESULT: "维修结果记录"
};

export type PropertyObservation = {
  id: "HUMIDITY" | "MICROFLOW";
  label: string;
  value: string;
  status: "OBSERVED" | "BASELINE";
};

export type PropertyAssessment = {
  title: string;
  confidence: string;
  targetBusinessIds: string[];
  explanation: string;
};

export type PropertyEvidenceGap = {
  id: string;
  label: string;
  actor: "住户" | "物业" | "工友";
  reason: string;
};

export type PropertyEventViewModel = {
  eventId: string;
  spaceLabel: string;
  projection: GuardedLifecycleProjection;
  assessment: PropertyAssessment;
  observations: PropertyObservation[];
  relevantMemories: RelevantBuildingMemory[];
  evidenceGaps: PropertyEvidenceGap[];
  residentEvidenceReady: boolean;
  latestResidentSubmissionId: string | null;
  selectedBusinessId: string | null;
  result: LifeEventResult | null;
};

function actorLabel(actor: MissingEvidence["requestedFrom"]): PropertyEvidenceGap["actor"] {
  if (actor === "RESIDENT") return "住户";
  if (actor === "WORKER") return "工友";
  return "物业";
}

function latestObservation(result: LifeEventResult, metric: SensorObservation["metric"]) {
  return result.input.observations
    .filter((item) => item.metric === metric)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .at(-1);
}

function activeSystemsFor(result: LifeEventResult | null) {
  if (result?.rankedHypotheses[0]?.hypothesis === "COLD_WATER_JOINT_LEAK") return ["SYS-1602-CW"];
  return [];
}

function phenomenonTags(result: LifeEventResult | null) {
  if (!result) return [];
  const tags: string[] = [];
  const humidity = latestObservation(result, "RELATIVE_HUMIDITY");
  const micro = latestObservation(result, "MICRO_FLOW");
  const photoShowsMoisture = result.input.evidence.some((item) =>
    item.type === "RESIDENT_WALL_PHOTO"
    && item.status === "PRESENT"
    && String(item.observedValue ?? "").toUpperCase() === "MOISTURE_VISIBLE"
  );

  if (photoShowsMoisture || (humidity?.baseline !== undefined && humidity.value > humidity.baseline)) tags.push("DAMPNESS");
  if (micro?.baseline !== undefined && micro.value > micro.baseline) tags.push("MICROFLOW");
  if (result.rankedHypotheses[0]?.hypothesis === "COLD_WATER_JOINT_LEAK" && tags.includes("MICROFLOW")) tags.push("COLD_WATER_LEAK");
  if (result.rankedHypotheses[0]?.hypothesis === "WATERPROOFING_FAILURE") tags.push("LEAKAGE");
  return tags;
}

export function derive1602MemoryRelevanceInput(session: LabSession): MemoryRelevanceInput {
  const result = session.result;
  const leader = result?.rankedHypotheses[0] ?? null;
  return {
    spaceId: "SPACE-1602-BATHROOM",
    // Event relevance must not change merely because a user clicked a component in 3D.
    selectedBusinessId: null,
    activeSystemIds: activeSystemsFor(result),
    observationTags: phenomenonTags(result),
    topologyBusinessIds: leader?.candidateBusinessIds ?? []
  };
}

function assessmentFor(result: LifeEventResult | null, projection: GuardedLifecycleProjection): PropertyAssessment {
  const leader = result?.rankedHypotheses[0];
  if (!leader) {
    return {
      title: "等待现场事实进入确定性评估",
      confidence: "尚未评估",
      targetBusinessIds: [],
      explanation: projection.summary
    };
  }

  return {
    title: HYPOTHESIS_LABELS[leader.hypothesis],
    confidence: leader.confidence,
    targetBusinessIds: [...leader.candidateBusinessIds],
    explanation: leader.hypothesis === "COLD_WATER_JOINT_LEAK"
      ? "当前湿度、无人用水微流量与冷水系统候选共同进入事件引擎；历史返工只能调整排查优先级，不能直接证明今天发生了渗漏。"
      : leader.hypothesis === "WATERPROOFING_FAILURE"
        ? "当前证据使防水节点进入候选，但仍需要结合用水时序、表面观察与后续验证才能确认。"
        : "当前事实尚不足以把异常稳定收敛到单一构件，继续按事件引擎要求补证。"
  };
}

function observationsFor(result: LifeEventResult | null): PropertyObservation[] {
  if (!result) return [];
  const observations: PropertyObservation[] = [];
  const humidity = latestObservation(result, "RELATIVE_HUMIDITY");
  const micro = latestObservation(result, "MICRO_FLOW");
  if (humidity) {
    observations.push({
      id: "HUMIDITY",
      label: "湿度观察",
      value: `${humidity.value}% · ${humidity.durationMinutes ?? 0} min`,
      status: "OBSERVED"
    });
  }
  if (micro) {
    observations.push({
      id: "MICROFLOW",
      label: "微流量观察",
      value: `${micro.value} L/min · ${micro.durationMinutes ?? 0} min`,
      status: "OBSERVED"
    });
  }
  return observations;
}

export function derivePropertyEventViewModel(session: LabSession): PropertyEventViewModel {
  const result = session.result;
  const submissionTimes = (session.residentSubmissions ?? []).map((item) => item.submittedAt);
  const residentEvidenceReady = hasFreshEvidenceAfterReopen(result, submissionTimes);
  const projection = deriveGuardedLifecycleProjection(result, { hasResidentEvidence: residentEvidenceReady });
  const relevantMemories = resolveBuildingMemoryRelevance({
    ...derive1602MemoryRelevanceInput(session),
    limit: 5
  });

  const evidenceGaps: PropertyEvidenceGap[] = (result?.missingEvidence ?? []).map((item, index) => ({
    id: `${item.evidenceType}-${index}`,
    label: EVIDENCE_LABELS[item.evidenceType],
    actor: actorLabel(item.requestedFrom),
    reason: item.reason
  }));

  if (!residentEvidenceReady && !evidenceGaps.some((item) => item.actor === "住户")) {
    evidenceGaps.unshift({
      id: "resident-origin-evidence",
      label: result?.state === "REOPENED" ? "重新打开后的住户新证据" : "住户原始现场证据",
      actor: "住户",
      reason: result?.state === "REOPENED"
        ? "重新打开后的事件不能复用上一轮住户证据，需要新的现场描述与观察；后续补证项由本轮事实重新决定。"
        : "物业不能代替住户填写原始描述与现场观察；后续是否需要水表等补证，由当前事实决定。"
    });
  }

  return {
    eventId: result?.eventId ?? "EVT-1602",
    spaceLabel: "1602卫生间",
    projection,
    assessment: assessmentFor(result, projection),
    observations: observationsFor(result),
    relevantMemories,
    evidenceGaps,
    residentEvidenceReady,
    latestResidentSubmissionId: session.residentSubmissions?.at(-1)?.submissionId ?? null,
    selectedBusinessId: session.selectedBusinessId,
    result
  };
}
