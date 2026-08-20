import type { EvidenceItem, LifeEventResult } from "../life-event-engine/types.ts";
import type { LabControls } from "../life-event-lab/types.ts";
import type { ProductEvidenceRecord, ResidentEvidenceDraft } from "./evidence.ts";

/**
 * Product evidence is richer than the deterministic diagnosis input. This
 * allow-list is the only place where a resident submission is projected into
 * the existing domain evidence controls.
 */
export function residentEvidenceToDomainControls(
  base: LabControls,
  draft: ResidentEvidenceDraft
): LabControls {
  if ((draft.photo.finding as string) === "UNCONFIRMED") {
    throw new Error("住户尚未确认照片观察，不能转换成领域证据");
  }
  return {
    ...base,
    residentPhoto: "PRESENT",
    photoFinding: draft.photo.finding,
    meterReading: draft.meterFinding === "UNREADABLE" ? "UNVERIFIED" : "PRESENT",
    meterFinding: draft.meterFinding
  };
}

function latestResidentEvidence(active: EvidenceItem[], type: EvidenceItem["type"]): EvidenceItem | undefined {
  return active
    .filter((item) => item.type === type)
    .sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""))
    .at(-1);
}

export function residentDomainEvidenceRefs(result: LifeEventResult): {
  photoEvidenceId?: string;
  meterEvidenceId?: string;
} {
  const active = result.input.evidence.filter((item): item is EvidenceItem => item.sourceActor === "RESIDENT");
  return {
    photoEvidenceId: latestResidentEvidence(active, "RESIDENT_WALL_PHOTO")?.id,
    meterEvidenceId: latestResidentEvidence(active, "METER_READING")?.id
  };
}

/**
 * The raw product record remains immutable. Once the deterministic event is
 * evaluated we derive its domain references for display/export rather than
 * editing the original resident submission after the fact.
 */
export function derivedDomainEvidenceRefs(record: ProductEvidenceRecord, result: LifeEventResult | null): string[] {
  if (record.domainEvidenceRefs.length) return [...record.domainEvidenceRefs];
  if (!result || record.sourceActor !== "RESIDENT") return [];
  const refs = residentDomainEvidenceRefs(result);
  if (record.type === "RESIDENT_PHOTO_OBSERVATION") return refs.photoEvidenceId ? [refs.photoEvidenceId] : [];
  if (record.type === "RESIDENT_METER_OBSERVATION") return refs.meterEvidenceId ? [refs.meterEvidenceId] : [];
  return [];
}

export function projectProductEvidenceDomainLinks(records: ProductEvidenceRecord[], result: LifeEventResult | null): ProductEvidenceRecord[] {
  return records.map((record) => ({
    ...record,
    relatedBusinessIds: [...record.relatedBusinessIds],
    relatedEvidenceIds: [...record.relatedEvidenceIds],
    domainEvidenceRefs: derivedDomainEvidenceRefs(record, result)
  }));
}
