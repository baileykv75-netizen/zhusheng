import { allEntities, entityById } from "../../lib/building-intelligence/catalog.ts";
import type { BuildingFact, GroundedBuildingClaim } from "../../lib/building-intelligence/types.ts";

const CONTROLLED_ENUMS = new Set([
  "IFC_DERIVED", "BUILDING_SPEC_DERIVED", "EXISTING_BUILDING_MEMORY", "SYNTHETIC_ENGINEERING_RECORD", "RUNTIME_OBSERVATION",
  "FLUID_FLOW", "DRAINAGE_FLOW", "ELECTRICAL_POWER", "SIGNAL", "BEHIND", "INSIDE", "ADJACENT_TO", "ABOVE", "BELOW",
  "DOMESTIC_COLD_WATER", "DOMESTIC_HOT_WATER", "SANITARY_DRAINAGE", "ELECTRICAL_LIGHTING", "ENVIRONMENT_MONITORING",
  "NOT_RECORDED", "VERIFIED_SEED", "PASSED_AT_CONSTRUCTION", "SESSION_REFERENCE"
]);
const MATERIAL_TERMS = ["不锈钢", "镀锌钢", "铜", "铝", "玻璃", "陶瓷", "混凝土", "塑料", "ppr", "pvc", "pe", "金属"];

export class ClaimGroundingError extends Error {
  readonly rejectedClaims: GroundedBuildingClaim[];
  constructor(message: string, rejectedClaims: GroundedBuildingClaim[]) {
    super(message);
    this.rejectedClaims = rejectedClaims;
  }
}

function normalizeText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s·•，,。；;：:（）()【】\[\]“”"'`]/g, "");
}

function normalizedDates(value: string) {
  const output = new Set<string>();
  const patterns = [
    /\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/g,
    /\b(20\d{2})-(\d{2})-(\d{2})T/g
  ];
  for (const pattern of patterns) for (const match of value.matchAll(pattern)) output.add(`${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`);
  return output;
}

function normalizedNumbers(value: string) {
  const withoutIdsAndDates = value
    .replace(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/gi, " ")
    .replace(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g, " ");
  const output = new Set<string>();
  for (const match of withoutIdsAndDates.matchAll(/(?<![\p{L}\p{N}])\d+(?:\.\d+)?(?![\p{L}\p{N}])/gu)) output.add(String(Number(match[0])));
  return output;
}

function normalizedUnits(value: string) {
  const output = new Set<string>();
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  for (const match of normalized.matchAll(/%|℃|°c|l\s*\/\s*min|m³\s*\/\s*h|mm|cm|(?:^|\d)\s*m(?![a-z])/g)) output.add(match[0].replace(/^\d\s*/, "").replaceAll(" ", "").replace("°c", "℃"));
  return output;
}

function businessIds(value: string) {
  return new Set(value.match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/g) ?? []);
}

function enumValues(value: string) {
  return new Set((value.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? []).filter((item) => CONTROLLED_ENUMS.has(item)));
}

function governedValues(value: string) {
  const output = new Set<string>();
  const patterns = [
    /(?:品牌|厂家|生产商|制造商)(?:为|是|：|:)?\s*([\p{L}\p{N}._/-]{1,40})/gu,
    /(?:型号|规格)(?:为|是|：|:)?\s*([\p{L}\p{N}._/-]{1,40})/gu,
    /(?:材料|材质)(?:为|是|：|:)?\s*([\p{L}\p{N}._/-]{1,40})/gu
  ];
  for (const pattern of patterns) for (const match of value.matchAll(pattern)) {
    const candidate = match[1].replace(/(?:生产|制造|记录|数据|信息|未记录|未知).*$/u, "");
    if (candidate && !["未", "没有", "未知", "当前", "未记录"].includes(candidate)) output.add(normalizeText(candidate));
  }
  for (const match of value.matchAll(/\b(?:DN|PN|IP)\s*\d+(?:\.\d+)?\b/gi)) output.add(normalizeText(match[0]));
  const normalized = value.toLocaleLowerCase();
  for (const material of MATERIAL_TERMS) if (normalized.includes(material)) output.add(normalizeText(material));
  return output;
}

function factSupportText(facts: BuildingFact[]) {
  const values: string[] = [];
  for (const fact of facts) {
    values.push(fact.factId, fact.subjectBusinessId, fact.predicate, String(Array.isArray(fact.value) ? fact.value.join(" ") : fact.value), ...fact.sourceIds, ...fact.provenance);
    const ids = new Set([fact.subjectBusinessId, ...businessIds(String(fact.value))]);
    for (const id of ids) {
      const entity = entityById(id);
      if (entity) values.push(entity.businessId, entity.displayName, ...(entity.aliases ?? []));
    }
  }
  return values.join(" ");
}

function unsupportedTokens(claimText: string, facts: BuildingFact[]) {
  const support = factSupportText(facts);
  const normalizedSupport = normalizeText(support);
  const failures: string[] = [];
  for (const id of businessIds(claimText)) if (!businessIds(support).has(id)) failures.push(`BusinessId:${id}`);
  for (const date of normalizedDates(claimText)) if (!normalizedDates(support).has(date)) failures.push(`日期:${date}`);
  for (const number of normalizedNumbers(claimText)) if (!normalizedNumbers(support).has(number)) failures.push(`数字:${number}`);
  for (const unit of normalizedUnits(claimText)) if (!normalizedUnits(support).has(unit)) failures.push(`单位:${unit}`);
  for (const value of enumValues(claimText)) if (!enumValues(support).has(value)) failures.push(`状态:${value}`);
  for (const value of governedValues(claimText)) if (!normalizedSupport.includes(value)) failures.push(`受控值:${value}`);

  const knownAliases = allEntities().flatMap((entity) => [entity.displayName, ...(entity.aliases ?? [])].map((alias) => ({ alias, businessId: entity.businessId })));
  for (const { alias, businessId } of knownAliases) {
    if (claimText.includes(alias) && !normalizedSupport.includes(normalizeText(alias)) && !businessIds(support).has(businessId)) failures.push(`对象别名:${alias}`);
  }
  return [...new Set(failures)];
}

export function verifyGroundedClaims(claims: GroundedBuildingClaim[], availableFacts: BuildingFact[], originalQuestion = "") {
  const byId = new Map(availableFacts.map((fact) => [fact.factId, fact]));
  const rejected: GroundedBuildingClaim[] = [];
  const reasons: string[] = [];
  for (const claim of claims) {
    if (/[？?]\s*$/u.test(claim.text) || (originalQuestion && normalizeText(claim.text) === normalizeText(originalQuestion))) {
      rejected.push(claim);
      reasons.push("claim是疑问句或原问题复述，不是基于facts形成的陈述性回答");
      continue;
    }
    const referenced = claim.factIds.map((id) => byId.get(id));
    const missingIds = claim.factIds.filter((id, index) => !referenced[index]);
    if (missingIds.length) {
      rejected.push(claim);
      reasons.push(`claim引用了本轮工具未产生的Fact ID：${missingIds.join(", ")}`);
      continue;
    }
    const unsupported = unsupportedTokens(claim.text, referenced as BuildingFact[]);
    if (unsupported.length) {
      rejected.push(claim);
      reasons.push(`claim包含引用facts不支持的新事实值：${unsupported.join(", ")}`);
    }
  }
  if (rejected.length) throw new ClaimGroundingError(reasons.join("；"), rejected);
  return claims;
}
