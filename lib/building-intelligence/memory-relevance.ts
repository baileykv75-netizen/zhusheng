import { building1602Dataset } from "./catalog.ts";
import type {
  BuildingIntelligenceDataset,
  BuildingMemoryClass,
  BuildingRecord,
  BuildingRecordMemory
} from "./types.ts";

export type MemoryRelevanceLevel = "HIGH" | "MEDIUM" | "CONTEXT";
export type HistoricalSignal = "ELEVATED_HISTORY" | "SCOPE_LIMIT" | "RUNTIME_CONTEXT" | "BACKGROUND";
export type MemoryRelevanceReasonCode =
  | "SELECTED_BUSINESS_ID"
  | "ACTIVE_SYSTEM"
  | "SAME_SPACE"
  | "DIAGNOSTIC_TAG"
  | "TOPOLOGY_PATH"
  | "REWORK_HISTORY"
  | "FIELD_CHANGE_HISTORY"
  | "INSPECTION_SCOPE_LIMIT";

export type MemoryRelevanceReason = {
  code: MemoryRelevanceReasonCode;
  label: string;
  weight: number;
  detail?: string;
};

export type MemoryRelevanceInput = {
  spaceId?: string | null;
  selectedBusinessId?: string | null;
  activeSystemIds?: string[];
  observationTags?: string[];
  queryTags?: string[];
  topologyBusinessIds?: string[];
  limit?: number;
};

export type RelevantBuildingMemory = {
  recordId: string;
  title: string;
  summary: string;
  occurredAt: string;
  recordType: BuildingRecord["recordType"];
  memoryClass: BuildingMemoryClass | null;
  trade: BuildingRecordMemory["trade"] | null;
  relevance: MemoryRelevanceLevel;
  score: number;
  historicalSignal: HistoricalSignal;
  reasons: MemoryRelevanceReason[];
  subjectBusinessIds: string[];
  relatedBusinessIds: string[];
  checkedItems: string[];
  uncheckedItems: string[];
  historicalBoundary: string;
  diagnosticPriority: number | null;
};

const CLASS_SIGNAL: Record<BuildingMemoryClass, HistoricalSignal> = {
  REWORK: "ELEVATED_HISTORY",
  FIELD_CHANGE: "ELEVATED_HISTORY",
  INSPECTION_LIMIT: "SCOPE_LIMIT",
  RUNTIME: "RUNTIME_CONTEXT",
  NORMAL: "BACKGROUND",
  BASELINE: "BACKGROUND",
  HANDOVER: "BACKGROUND"
};

const SIGNAL_SORT: Record<HistoricalSignal, number> = {
  ELEVATED_HISTORY: 0,
  SCOPE_LIMIT: 1,
  RUNTIME_CONTEXT: 2,
  BACKGROUND: 3
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function specificBusinessIds(ids: string[]) {
  return ids.filter((id) => !id.startsWith("SPACE-") && !id.startsWith("SYS-"));
}

function systemMembership(dataset: BuildingIntelligenceDataset) {
  const membership = new Map<string, Set<string>>();
  for (const system of dataset.systems) {
    const ids = [system.businessId, ...system.memberIds];
    for (const id of ids) {
      const current = membership.get(id) ?? new Set<string>();
      current.add(system.businessId);
      membership.set(id, current);
    }
  }
  for (const component of dataset.components) {
    if (!component.systemId) continue;
    const current = membership.get(component.businessId) ?? new Set<string>();
    current.add(component.systemId);
    membership.set(component.businessId, current);
  }
  return membership;
}

function recordSystemIds(record: BuildingRecord, membership: Map<string, Set<string>>) {
  return unique(record.subjectBusinessIds.flatMap((id) => [...(membership.get(id) ?? [])]));
}

function recordMatchesSpace(record: BuildingRecord, spaceId: string | null | undefined, dataset: BuildingIntelligenceDataset) {
  if (!spaceId) return false;
  if (record.subjectBusinessIds.includes(spaceId)) return true;
  const byId = new Map([...dataset.components, ...dataset.systems, ...dataset.spaces].map((entity) => [entity.businessId, entity]));
  return record.subjectBusinessIds.some((id) => byId.get(id)?.spaceId === spaceId);
}

function historicalBoundary(record: BuildingRecord) {
  const memory = record.memory;
  if (memory?.residualRisk) return memory.residualRisk;

  const checked = memory?.verification?.checkedItems ?? [];
  const unchecked = memory?.verification?.uncheckedItems ?? [];
  if (unchecked.length) {
    const checkedText = checked.length ? `当时已检查：${checked.join("、")}；` : "";
    return `${checkedText}未单独覆盖：${unchecked.join("、")}。该记录只能说明当时检查范围内的结果，不能证明当前运行状态。`;
  }

  if (memory?.memoryClass === "BASELINE" || memory?.memoryClass === "HANDOVER") {
    return "该记录仅反映交付或记录当时的基线状态，不代表当前运行状态仍然相同。";
  }

  if (memory?.verification) {
    return `该记录仅证明 ${record.occurredAt.slice(0, 10)} 按“${memory.verification.method}”得到的当时结果，不能据此排除当前运行期异常。`;
  }

  return "该记录用于还原这栋建筑当时发生过什么；没有新的现场证据时，不应把它直接升级为当前故障结论或排除依据。";
}

function relevanceLevel(score: number): MemoryRelevanceLevel {
  if (score >= 10) return "HIGH";
  if (score >= 5) return "MEDIUM";
  return "CONTEXT";
}

function signalFor(memoryClass?: BuildingMemoryClass): HistoricalSignal {
  return memoryClass ? CLASS_SIGNAL[memoryClass] : "BACKGROUND";
}

function reason(
  code: MemoryRelevanceReasonCode,
  label: string,
  weight: number,
  detail?: string
): MemoryRelevanceReason {
  return { code, label, weight, ...(detail ? { detail } : {}) };
}

function scoreRecord(
  record: BuildingRecord,
  input: MemoryRelevanceInput,
  dataset: BuildingIntelligenceDataset,
  membership: Map<string, Set<string>>
): RelevantBuildingMemory | null {
  const reasons: MemoryRelevanceReason[] = [];
  const memoryClass = record.memory?.memoryClass ?? null;
  const activeSystems = new Set(input.activeSystemIds ?? []);
  const topology = new Set(input.topologyBusinessIds ?? []);
  const requestedTags = new Set(unique([...(input.observationTags ?? []), ...(input.queryTags ?? [])]));

  if (input.selectedBusinessId && record.subjectBusinessIds.includes(input.selectedBusinessId)) {
    reasons.push(reason("SELECTED_BUSINESS_ID", "命中当前选中构件", 6, input.selectedBusinessId));
  }

  const matchedSystems = recordSystemIds(record, membership).filter((id) => activeSystems.has(id));
  if (matchedSystems.length) {
    reasons.push(reason("ACTIVE_SYSTEM", "命中当前相关系统", 4, matchedSystems.join("、")));
  }

  if (recordMatchesSpace(record, input.spaceId, dataset)) {
    reasons.push(reason("SAME_SPACE", "位于当前空间", 2, input.spaceId ?? undefined));
  }

  const matchedTags = unique((record.memory?.diagnosticTags ?? []).filter((tag) => requestedTags.has(tag)));
  for (const tag of matchedTags) {
    reasons.push(reason("DIAGNOSTIC_TAG", "命中当前现象标签", 4, tag));
  }

  const topologyMatches = specificBusinessIds(record.subjectBusinessIds).filter((id) => topology.has(id));
  if (topologyMatches.length) {
    reasons.push(reason("TOPOLOGY_PATH", "位于当前拓扑路径", 3, topologyMatches.join("、")));
  }

  if (memoryClass === "REWORK") {
    reasons.push(reason("REWORK_HISTORY", "存在明确返工历史", 3));
  } else if (memoryClass === "FIELD_CHANGE") {
    reasons.push(reason("FIELD_CHANGE_HISTORY", "存在现场调整历史", 3));
  } else if (memoryClass === "INSPECTION_LIMIT") {
    reasons.push(reason("INSPECTION_SCOPE_LIMIT", "历史检查存在范围边界", 2));
  }

  if (!reasons.length) return null;

  const score = reasons.reduce((sum, item) => sum + item.weight, 0);
  return {
    recordId: record.recordId,
    title: record.title,
    summary: record.summary,
    occurredAt: record.occurredAt,
    recordType: record.recordType,
    memoryClass,
    trade: record.memory?.trade ?? null,
    relevance: relevanceLevel(score),
    score,
    historicalSignal: signalFor(memoryClass ?? undefined),
    reasons,
    subjectBusinessIds: [...record.subjectBusinessIds],
    relatedBusinessIds: specificBusinessIds(record.subjectBusinessIds),
    checkedItems: [...(record.memory?.verification?.checkedItems ?? [])],
    uncheckedItems: [...(record.memory?.verification?.uncheckedItems ?? [])],
    historicalBoundary: historicalBoundary(record),
    diagnosticPriority: record.memory?.diagnosticPriority ?? null
  };
}

export function resolveBuildingMemoryRelevance(
  input: MemoryRelevanceInput,
  dataset: BuildingIntelligenceDataset = building1602Dataset
): RelevantBuildingMemory[] {
  const membership = systemMembership(dataset);
  const matches = dataset.records
    .map((record) => scoreRecord(record, input, dataset, membership))
    .filter((item): item is RelevantBuildingMemory => Boolean(item))
    .sort((a, b) =>
      b.score - a.score
      || SIGNAL_SORT[a.historicalSignal] - SIGNAL_SORT[b.historicalSignal]
      || (a.diagnosticPriority ?? 99) - (b.diagnosticPriority ?? 99)
      || a.occurredAt.localeCompare(b.occurredAt)
      || a.recordId.localeCompare(b.recordId)
    );

  return typeof input.limit === "number" ? matches.slice(0, Math.max(0, input.limit)) : matches;
}
