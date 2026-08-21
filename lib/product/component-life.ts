import { building1602Dataset, entityById } from "../building-intelligence/catalog.ts";
import type { BuildingEntity, BuildingIntelligenceDataset, BuildingRecord, BuildingSystem } from "../building-intelligence/types.ts";
import type { EvidenceItem, LifeEventResult, RepairRecord, SensorObservation } from "../life-event-engine/types.ts";
import type { ProductEvidenceRecord } from "./evidence.ts";

export type ComponentCandidateStatus =
  | "NO_LIVE_EVENT"
  | "PENDING_ASSESSMENT"
  | "PENDING_REASSESSMENT"
  | "CURRENT_CANDIDATE"
  | "NOT_CURRENT_CANDIDATE";

export type ComponentLifeContext = {
  productEvidence?: readonly ProductEvidenceRecord[];
  result: LifeEventResult | null;
  currentCandidateIds: readonly string[];
  pendingResidentAssessment: boolean;
};

export type ComponentLifeView = {
  entity: BuildingEntity;
  systems: BuildingSystem[];
  records: BuildingRecord[];
  productEvidence: ProductEvidenceRecord[];
  domainEvidence: EvidenceItem[];
  observations: SensorObservation[];
  repairs: RepairRecord[];
  auditEntries: LifeEventResult["auditLog"];
  candidateStatus: ComponentCandidateStatus;
  eventId: string | null;
  eventState: LifeEventResult["state"] | null;
  boundary: string;
};

function candidateStatus(
  businessId: string,
  context: ComponentLifeContext
): ComponentCandidateStatus {
  if (context.pendingResidentAssessment) {
    return context.result ? "PENDING_REASSESSMENT" : "PENDING_ASSESSMENT";
  }
  if (!context.result) return "NO_LIVE_EVENT";
  return context.currentCandidateIds.includes(businessId)
    ? "CURRENT_CANDIDATE"
    : "NOT_CURRENT_CANDIDATE";
}

function systemsFor(
  businessId: string,
  entity: BuildingEntity,
  dataset: BuildingIntelligenceDataset
) {
  return dataset.systems.filter((system) =>
    system.businessId === businessId
    || system.memberIds.includes(businessId)
    || entity.systemId === system.businessId
  );
}

export function deriveComponentLifeView(
  businessId: string | null | undefined,
  context: ComponentLifeContext,
  dataset: BuildingIntelligenceDataset = building1602Dataset
): ComponentLifeView | null {
  if (!businessId) return null;
  const entity = entityById(businessId, dataset);
  if (!entity) return null;

  const result = context.result;
  const records = dataset.records
    .filter((record) => record.subjectBusinessIds.includes(businessId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.recordId.localeCompare(b.recordId));
  const productEvidence = [...(context.productEvidence ?? [])]
    .filter((item) => item.relatedBusinessIds.includes(businessId))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
  const domainEvidence = (result?.input.evidence ?? [])
    .filter((item) => item.relatedBusinessIds.includes(businessId))
    .sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "") || a.id.localeCompare(b.id));
  const observations = (result?.input.observations ?? [])
    .filter((item) => item.sensorBusinessId === businessId)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
  const repairs = (result?.repairRecords ?? [])
    .filter((item) => item.targetBusinessId === businessId)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.repairRecordId.localeCompare(b.repairRecordId));
  const auditEntries = (result?.auditLog ?? [])
    .filter((item) => item.componentRefs.includes(businessId))
    .sort((a, b) => a.sequence - b.sequence);

  return {
    entity,
    systems: systemsFor(businessId, entity, dataset),
    records,
    productEvidence,
    domainEvidence,
    observations,
    repairs,
    auditEntries,
    candidateStatus: candidateStatus(businessId, context),
    eventId: result?.eventId ?? null,
    eventState: result?.state ?? null,
    boundary: context.pendingResidentAssessment
      ? result
        ? "新的住户事实正在等待本轮重新评估；这里保留历史与已发生记录，但不复用上一轮候选身份。"
        : "住户事实正在等待第一次确定性评估；此时尚未形成正式事件，也不存在可展示的当前候选身份。"
      : "历史记录、证据关联和维修经历用于解释这个对象经历过什么；只有当前确定性事件结果才能说明它是否处于本轮候选集合。"
  };
}
