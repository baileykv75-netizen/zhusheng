import type { EvidenceItem, LifeEventResult } from "../life-event-engine/types.ts";
import type { LabControls } from "../life-event-lab/types.ts";
import type { ResidentEvidenceDraft } from "./evidence.ts";

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

export function residentDomainEvidenceRefs(result: LifeEventResult): {
  photoEvidenceId?: string;
  meterEvidenceId?: string;
} {
  const active = result.input.evidence.filter((item): item is EvidenceItem => item.sourceActor === "RESIDENT");
  return {
    photoEvidenceId: active.find((item) => item.type === "RESIDENT_WALL_PHOTO")?.id,
    meterEvidenceId: active.find((item) => item.type === "METER_READING")?.id
  };
}
