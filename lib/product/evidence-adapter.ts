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

const productToDomainType = {
  RESIDENT_PHOTO_OBSERVATION: "RESIDENT_WALL_PHOTO",
  RESIDENT_METER_OBSERVATION: "METER_READING"
} as const satisfies Partial<Record<ProductEvidenceRecord["type"], EvidenceItem["type"]>>;

type LinkableProductType = keyof typeof productToDomainType;

function domainEvidenceTimeline(result: LifeEventResult, type: EvidenceItem["type"]): EvidenceItem[] {
  return result.input.evidence
    .filter((item): item is EvidenceItem => item.sourceActor === "RESIDENT" && item.type === type)
    .sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "") || a.id.localeCompare(b.id));
}

function productEvidenceTimeline(records: ProductEvidenceRecord[], type: LinkableProductType): ProductEvidenceRecord[] {
  return records
    .filter((record) => record.sourceActor === "RESIDENT" && record.type === type)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
}

function exactDomainEvidence(record: ProductEvidenceRecord, result: LifeEventResult): EvidenceItem | null {
  const domainType = productToDomainType[record.type as LinkableProductType];
  if (!domainType) return null;
  const exact = domainEvidenceTimeline(result, domainType)
    .filter((item) => item.capturedAt === record.capturedAt);
  return exact.length === 1 ? exact[0] : null;
}

/**
 * Resolve a single record only when the immutable source timestamp provides an
 * unambiguous link. This intentionally has no "latest evidence" fallback:
 * after multiple resident cycles that would rewrite historical provenance.
 */
export function derivedDomainEvidenceRefs(record: ProductEvidenceRecord, result: LifeEventResult | null): string[] {
  if (record.domainEvidenceRefs.length) return [...record.domainEvidenceRefs];
  if (!result || record.sourceActor !== "RESIDENT" || record.eventId !== result.eventId) return [];
  const exact = exactDomainEvidence(record, result);
  return exact ? [exact.id] : [];
}

/**
 * Project immutable Product Evidence to its deterministic Domain Evidence.
 *
 * 1. Prefer exact type + capturedAt matches.
 * 2. For legacy sessions whose old adapters shifted domain timestamps, allow
 *    chronological one-to-one recovery only when Product and Domain counts for
 *    that evidence type are equal.
 * 3. Never bind unmatched historical rows to the latest domain evidence.
 */
export function projectProductEvidenceDomainLinks(
  records: ProductEvidenceRecord[],
  result: LifeEventResult | null
): ProductEvidenceRecord[] {
  const projected = records.map((record) => ({
    ...record,
    relatedBusinessIds: [...record.relatedBusinessIds],
    relatedEvidenceIds: [...record.relatedEvidenceIds],
    domainEvidenceRefs: [...record.domainEvidenceRefs]
  }));
  if (!result) return projected;

  for (const productType of Object.keys(productToDomainType) as LinkableProductType[]) {
    const productRows = productEvidenceTimeline(projected, productType)
      .filter((record) => record.eventId === result.eventId);
    const domainRows = domainEvidenceTimeline(result, productToDomainType[productType]);
    const usedDomainIds = new Set<string>();

    for (const record of productRows) {
      if (record.domainEvidenceRefs.length) {
        record.domainEvidenceRefs.forEach((id) => usedDomainIds.add(id));
        continue;
      }
      const exact = domainRows.filter((item) => !usedDomainIds.has(item.id) && item.capturedAt === record.capturedAt);
      if (exact.length === 1) {
        record.domainEvidenceRefs = [exact[0].id];
        usedDomainIds.add(exact[0].id);
      }
    }

    const unmatchedProducts = productRows.filter((record) => record.domainEvidenceRefs.length === 0);
    const unmatchedDomains = domainRows.filter((item) => !usedDomainIds.has(item.id));
    if (unmatchedProducts.length && unmatchedProducts.length === unmatchedDomains.length) {
      unmatchedProducts.forEach((record, index) => {
        record.domainEvidenceRefs = [unmatchedDomains[index].id];
      });
    }
  }

  return projected;
}
