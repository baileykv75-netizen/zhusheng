import { building1602Dataset, entityById } from "../building-intelligence/catalog.ts";
import type { BuildingIntelligenceDataset } from "../building-intelligence/types.ts";

export const CASE_1602_PATH = "/case-1602";
export const CASE_1602_SPACE_ID = "SPACE-1602-BATHROOM";

export function isCase1602Path(pathname: string | null | undefined) {
  const normalized = (pathname ?? "").replace(/\/+$/, "");
  return normalized.endsWith(CASE_1602_PATH);
}

export function resolveComponentLifeObjectId(
  rawBusinessId: string | null | undefined,
  dataset: BuildingIntelligenceDataset = building1602Dataset
): string | null {
  const businessId = rawBusinessId?.trim();
  if (!businessId) return null;
  const entity = entityById(businessId, dataset);
  if (!entity || entity.spaceId !== CASE_1602_SPACE_ID) return null;
  return entity.businessId;
}

export function componentLifeHref(
  businessId: string,
  dataset: BuildingIntelligenceDataset = building1602Dataset
): string | null {
  const resolved = resolveComponentLifeObjectId(businessId, dataset);
  if (!resolved) return null;
  const params = new URLSearchParams({ object: resolved });
  return `${CASE_1602_PATH}?${params.toString()}`;
}
