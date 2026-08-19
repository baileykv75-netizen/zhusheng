import { building1602Dataset } from "../building-intelligence/catalog.ts";
import { resolveBuildingMemoryRelevance, type RelevantBuildingMemory } from "../building-intelligence/memory-relevance.ts";
import type { BuildingMemoryClass, BuildingMemoryTrade, BuildingRecord, BuildingRecordMemory } from "../building-intelligence/types.ts";
import type { LabSession } from "../life-event-lab/types.ts";
import { derive1602MemoryRelevanceInput } from "./property-event-view-model.ts";

export type MemoryLifecycleStageId =
  | "PREPARATION"
  | "INSTALLATION"
  | "FINISH"
  | "INSPECTION"
  | "HANDOVER"
  | "OPERATION";

export type MemoryFilterId =
  | "ALL"
  | "WATER_SUPPLY"
  | "DRAINAGE"
  | "WATERPROOFING"
  | "ELECTRICAL"
  | "FIXTURES"
  | "ENVIRONMENT"
  | "FIELD_CHANGE"
  | "INSPECTION"
  | "HANDOVER"
  | "OPERATIONS";

export const MEMORY_STAGE_ORDER: Array<{ id: MemoryLifecycleStageId; label: string; english: string }> = [
  { id: "PREPARATION", label: "施工准备", english: "PREPARATION" },
  { id: "INSTALLATION", label: "隐蔽与机电施工", english: "INSTALLATION" },
  { id: "FINISH", label: "防水与完成面", english: "FINISH" },
  { id: "INSPECTION", label: "检查与验收", english: "VERIFICATION" },
  { id: "HANDOVER", label: "交付基线", english: "HANDOVER" },
  { id: "OPERATION", label: "运行与维修", english: "OPERATION" }
];

export const MEMORY_FILTERS: Array<{ id: MemoryFilterId; label: string }> = [
  { id: "ALL", label: "全部" },
  { id: "WATER_SUPPLY", label: "给水" },
  { id: "DRAINAGE", label: "排水" },
  { id: "WATERPROOFING", label: "防水" },
  { id: "ELECTRICAL", label: "电气" },
  { id: "FIXTURES", label: "器具" },
  { id: "ENVIRONMENT", label: "环境" },
  { id: "FIELD_CHANGE", label: "现场调整" },
  { id: "INSPECTION", label: "验收" },
  { id: "HANDOVER", label: "交付" },
  { id: "OPERATIONS", label: "运行" }
];

export const MEMORY_TRADE_LABELS: Partial<Record<BuildingMemoryTrade, string>> = {
  ARCHITECTURE: "建筑",
  COORDINATION: "综合协调",
  COLD_WATER: "冷水",
  HOT_WATER: "热水",
  DRAINAGE: "排水",
  WATERPROOFING: "防水",
  ELECTRICAL: "电气",
  FIXTURES: "器具",
  ENVIRONMENT: "环境",
  HANDOVER: "交付",
  OPERATIONS: "运行"
};

export const MEMORY_CLASS_LABELS: Partial<Record<BuildingMemoryClass, string>> = {
  NORMAL: "正常记录",
  BASELINE: "基线记录",
  INSPECTION_LIMIT: "检查边界",
  REWORK: "返工记录",
  FIELD_CHANGE: "现场调整",
  HANDOVER: "交付记录",
  RUNTIME: "运行记录"
};

export type BuildingMemoryEntry = {
  recordId: string;
  title: string;
  summary: string;
  occurredAt: string;
  recordType: BuildingRecord["recordType"];
  subjectBusinessIds: string[];
  visualTargetBusinessId: string | null;
  memory: BuildingRecordMemory;
  memoryClass: BuildingMemoryClass | null;
  trade: BuildingMemoryTrade | null;
  stage: MemoryLifecycleStageId;
  special: boolean;
  eventRelation: RelevantBuildingMemory | null;
};

export type BuildingMemoryViewModel = {
  eventId: string;
  totalRecords: number;
  specialRecords: number;
  eventRelatedRecords: number;
  tradeCount: number;
  entries: BuildingMemoryEntry[];
  defaultRecordId: string | null;
};

function phaseText(record: BuildingRecord) {
  return `${record.memory?.phase ?? ""} ${record.status ?? ""}`.toUpperCase();
}

export function memoryLifecycleStage(record: BuildingRecord): MemoryLifecycleStageId {
  const memoryClass = record.memory?.memoryClass;
  const trade = record.memory?.trade;
  const phase = phaseText(record);

  if (memoryClass === "RUNTIME" || trade === "OPERATIONS" || record.recordType === "MAINTENANCE" || /RUNTIME|OPERATION|MAINTENANCE/u.test(phase)) return "OPERATION";
  if (memoryClass === "HANDOVER" || memoryClass === "BASELINE" || trade === "HANDOVER" || /HANDOVER/u.test(phase)) return "HANDOVER";
  if (/MATERIAL|PREINSTALL|PREPARATION|SETTING_OUT|SETTING|COORDINATION/u.test(phase)) return "PREPARATION";
  if (record.recordType === "INSPECTION" || memoryClass === "INSPECTION_LIMIT" || /INSPECTION|COMMISSION|TEST|CHECK|VERIFICATION/u.test(phase)) return "INSPECTION";
  if (trade === "WATERPROOFING" || trade === "FIXTURES" || /WATERPROOF|FINISH|TILING|FIXTURE|TERMINAL/u.test(phase)) return "FINISH";
  return "INSTALLATION";
}

function visualTarget(record: BuildingRecord) {
  const specific = record.subjectBusinessIds.filter((id) => !id.startsWith("SPACE-") && !id.startsWith("SYS-"));
  const visualIds = new Set(building1602Dataset.visualBindings.map((item) => item.businessId));
  return specific.find((id) => visualIds.has(id)) ?? specific[0] ?? null;
}

function isSpecial(record: BuildingRecord) {
  return ["REWORK", "FIELD_CHANGE", "INSPECTION_LIMIT"].includes(record.memory?.memoryClass ?? "");
}

function recordMatchesFilter(entry: BuildingMemoryEntry, filter: MemoryFilterId) {
  if (filter === "ALL") return true;
  if (filter === "WATER_SUPPLY") return entry.trade === "COLD_WATER" || entry.trade === "HOT_WATER";
  if (filter === "DRAINAGE") return entry.trade === "DRAINAGE";
  if (filter === "WATERPROOFING") return entry.trade === "WATERPROOFING";
  if (filter === "ELECTRICAL") return entry.trade === "ELECTRICAL";
  if (filter === "FIXTURES") return entry.trade === "FIXTURES";
  if (filter === "ENVIRONMENT") return entry.trade === "ENVIRONMENT";
  if (filter === "FIELD_CHANGE") return entry.memoryClass === "REWORK" || entry.memoryClass === "FIELD_CHANGE";
  if (filter === "INSPECTION") return entry.recordType === "INSPECTION" || entry.memoryClass === "INSPECTION_LIMIT";
  if (filter === "HANDOVER") return entry.stage === "HANDOVER";
  return entry.stage === "OPERATION";
}

export function filterBuildingMemoryEntries(entries: BuildingMemoryEntry[], filter: MemoryFilterId) {
  return entries.filter((entry) => recordMatchesFilter(entry, filter));
}

export function groupBuildingMemoryEntries(entries: BuildingMemoryEntry[]) {
  return MEMORY_STAGE_ORDER.map((stage) => ({
    ...stage,
    entries: entries.filter((entry) => entry.stage === stage.id)
  })).filter((stage) => stage.entries.length > 0);
}

export function deriveBuildingMemoryViewModel(session: LabSession): BuildingMemoryViewModel {
  const relationInput = derive1602MemoryRelevanceInput(session);
  const relations = resolveBuildingMemoryRelevance({
    ...relationInput,
    // Browsing a memory record changes selectedBusinessId. Do not let that UI selection
    // inflate the record's event relevance; event relation must remain stable.
    selectedBusinessId: null
  });
  const relationById = new Map(relations.map((item) => [item.recordId, item]));
  const entries = building1602Dataset.records
    .filter((record): record is BuildingRecord & { memory: BuildingRecordMemory } => Boolean(record.memory))
    .map((record): BuildingMemoryEntry => ({
      recordId: record.recordId,
      title: record.title,
      summary: record.summary,
      occurredAt: record.occurredAt,
      recordType: record.recordType,
      subjectBusinessIds: [...record.subjectBusinessIds],
      visualTargetBusinessId: visualTarget(record),
      memory: record.memory,
      memoryClass: record.memory.memoryClass ?? null,
      trade: record.memory.trade ?? null,
      stage: memoryLifecycleStage(record),
      special: isSpecial(record),
      eventRelation: relationById.get(record.recordId) ?? null
    }))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.recordId.localeCompare(b.recordId));

  const firstHighSpecial = entries.find((entry) => entry.special && entry.eventRelation?.relevance === "HIGH");
  const firstSpecial = entries.find((entry) => entry.special);

  return {
    eventId: session.result?.eventId ?? "EVT-1602",
    totalRecords: entries.length,
    specialRecords: entries.filter((entry) => entry.special).length,
    eventRelatedRecords: entries.filter((entry) => entry.eventRelation && ["HIGH", "MEDIUM"].includes(entry.eventRelation.relevance)).length,
    tradeCount: new Set(entries.map((entry) => entry.trade).filter(Boolean)).size,
    entries,
    defaultRecordId: firstHighSpecial?.recordId ?? firstSpecial?.recordId ?? entries[0]?.recordId ?? null
  };
}
