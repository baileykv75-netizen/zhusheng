import { resolveBuildingMemoryRelevance, type RelevantBuildingMemory } from "@/lib/building-intelligence/memory-relevance.ts";
import { deriveGuardedLifecycleProjection, type GuardedLifecycleProjection } from "@/lib/life-event-engine/guarded-lifecycle.ts";
import type { Hypothesis, LifeEventResult, MissingEvidence } from "@/lib/life-event-engine/types.ts";
import type { LabSession } from "@/lib/life-event-lab/types.ts";
import { hasFreshEvidenceAfterReopen } from "@/lib/life-event-lab/reopened-cycle.ts";

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

function activeSystemsFor(result: LifeEventResult | null) {
  const hypothesis = result?.rankedHypotheses[0]?.hypothesis;
  if (hypothesis === "COLD_WATER_JOINT_LEAK") return ["SYS-1602-CW"];
  if (hypothesis === "WATERPROOFING_FAILURE") return [];
  return ["SYS-1602-CW"];
}

function phenomenonTags(result: LifeEventResult | null) {
  const tags = ["DAMPNESS"];
  const micro = result?.input.observations.find((item) => item.metric === "MICRO_FLOW");
  if (!micro || micro.value > (micro.baseline ?? 0)) tags.push("MICROFLOW", "COLD_WATER_LEAK");
  if (result?.rankedHypotheses[0]?.hypothesis === "WATERPROOFING_FAILURE") tags.push("LEAKAGE");
  return tags;
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

export function derivePropertyEventViewModel(session: LabSession): PropertyEventViewModel {
  const result = session.result;
  const submissionTimes = (session.residentSubmissions ?? []).map((item) => item.submittedAt);
  const residentEvidenceReady = hasFreshEvidenceAfterReopen(result, submissionTimes);
  const projection = deriveGuardedLifecycleProjection(result, { hasResidentEvidence: residentEvidenceReady });
  const leader = result?.rankedHypotheses[0] ?? null;
  const topologyBusinessIds = leader?.candidateBusinessIds ?? [];
  const relevantMemories = resolveBuildingMemoryRelevance({
    spaceId: "SPACE-1602-BATHROOM",
    selectedBusinessId: session.selectedBusinessId,
    activeSystemIds: activeSystemsFor(result),
    observationTags: phenomenonTags(result),
    topologyBusinessIds,
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
        ? "重新打开后的事件不能复用上一轮住户证据，需要新的描述、照片观察和水表观察。"
        : "物业不能代替住户填写原始描述、照片观察与水表观察。"
    });
  }

  return {
    eventId: result?.eventId ?? "EVT-1602",
    spaceLabel: "1602卫生间",
    projection,
    assessment: assessmentFor(result, projection),
    observations: [
      {
        id: "HUMIDITY",
        label: "持续湿度",
        value: `${session.controls.humidity.value}% · ${session.controls.humidity.durationMinutes} min`,
        status: "OBSERVED"
      },
      {
        id: "MICROFLOW",
        label: "无人用水微流量",
        value: `${session.controls.microFlow.value} L/min · ${session.controls.microFlow.durationMinutes} min`,
        status: "OBSERVED"
      }
    ],
    relevantMemories,
    evidenceGaps,
    residentEvidenceReady,
    latestResidentSubmissionId: session.residentSubmissions?.at(-1)?.submissionId ?? null,
    selectedBusinessId: session.selectedBusinessId,
    result
  };
}
