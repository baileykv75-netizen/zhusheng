import { allEntities, building1602Dataset, entityById } from "./catalog.ts";
import type { BuildingIntelligenceDataset, TargetEntityResolution } from "./types.ts";

const TARGET_NOUN = /([\p{Script=Han}A-Za-z0-9-]{1,12}(?:灯|阀|泵|风机|传感器|接头|水表))/gu;
const PRONOUN = /它|这个|该构件|这个构件|选中/;

function normalized(value: string) { return value.normalize("NFKC").toLocaleLowerCase(); }

export function resolveTargetEntity(question: string, selectedBusinessId?: string | null, dataset: BuildingIntelligenceDataset = building1602Dataset): TargetEntityResolution | null {
  if (selectedBusinessId && PRONOUN.test(question)) {
    const selected = entityById(selectedBusinessId, dataset);
    if (selected) return { status: "RESOLVED", mention: selected.displayName, businessIds: [selected.businessId], candidates: [{ businessId: selected.businessId, displayName: selected.displayName }] };
  }
  const input = normalized(question);
  const mentions = allEntities(dataset).flatMap((entity) => [entity.businessId, entity.displayName, ...(entity.aliases ?? [])]
    .filter((alias) => input.includes(normalized(alias)))
    .map((alias) => ({ alias, entity })));
  if (mentions.length) {
    const maxLength = Math.max(...mentions.map((item) => normalized(item.alias).length));
    let mostSpecific = mentions.filter((item) => normalized(item.alias).length === maxLength);
    if (mostSpecific.some((item) => !["SPACE", "SYSTEM"].includes(item.entity.entityType))) mostSpecific = mostSpecific.filter((item) => !["SPACE", "SYSTEM"].includes(item.entity.entityType));
    const candidates = [...new Map(mostSpecific.map(({ entity }) => [entity.businessId, { businessId: entity.businessId, displayName: entity.displayName }])).values()];
    return { status: candidates.length === 1 ? "RESOLVED" : "AMBIGUOUS", mention: mostSpecific[0].alias, businessIds: candidates.map((item) => item.businessId), candidates };
  }
  const equipmentMention = [...question.matchAll(TARGET_NOUN)].map((match) => match[1]).sort((a, b) => b.length - a.length)[0];
  if (!equipmentMention) return null;
  return { status: "NOT_FOUND", mention: equipmentMention.replace(/^(?:查询|查找|请问|看看)/, ""), businessIds: [], candidates: [] };
}
