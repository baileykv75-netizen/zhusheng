import type { BuildingFact, BuildingRecord } from "./types.ts";
import { building1602Dataset } from "./catalog.ts";

export type EngineeringHypothesis = {
  id: string;
  title: string;
  mechanism: string;
  verification: string;
  priority: number;
  sourceRecordId?: string;
  evidence?: string;
};

export type EngineeringReasoning = {
  kind: "DRAINAGE_ODOR" | "DAMPNESS" | "LIGHTING_FAULT";
  summary: string;
  confirmedFactIds: string[];
  confirmedSummary: string;
  hypotheses: EngineeringHypothesis[];
  nextStep: string;
  boundary: string;
  memoryBased: boolean;
  memoryRecordIds: string[];
};

type DiagnosticProfile = {
  kind: EngineeringReasoning["kind"];
  tag: string;
  symptomLabel: string;
};

function profileForQuestion(question: string): DiagnosticProfile | null {
  if (/(臭味|异味|返味|反味|臭气|下水道味)/u.test(question)) return { kind: "DRAINAGE_ODOR", tag: "ODOR", symptomLabel: "返味" };
  if (/(潮湿|返潮|湿痕|水印|渗水|漏水|墙脚湿|地面湿)/u.test(question)) return { kind: "DAMPNESS", tag: "DAMPNESS", symptomLabel: "潮湿/渗水" };
  if (/(镜前灯|顶灯|照明|灯具)/u.test(question) && /(不亮|闪烁|跳闸|异常|故障|原因|为什么|排查)/u.test(question)) return { kind: "LIGHTING_FAULT", tag: "LIGHTING", symptomLabel: "照明异常" };
  return null;
}

function factText(fact: BuildingFact) {
  const value = Array.isArray(fact.value) ? fact.value.join(" ") : String(fact.value);
  return `${fact.factId} ${fact.subjectBusinessId} ${fact.predicate} ${value}`;
}

function relevantFacts(profile: DiagnosticProfile, facts: BuildingFact[]) {
  if (profile.kind === "DRAINAGE_ODOR") return facts.filter((fact) => /SYS-1602-DRAIN|DRAIN-1602|排水/u.test(factText(fact)));
  if (profile.kind === "DAMPNESS") return facts.filter((fact) => /SYS-1602-CW|J-1602-CW-03|PIPE-1602-CW|WP-1602-BATHROOM|SLAB-1602-BATHROOM|防水|冷水/u.test(factText(fact)));
  return facts.filter((fact) => /SYS-1602-EL-LIGHT|LIGHT-1602|CABLE-1602-LIGHT|CONDUIT-1602-LIGHT|照明|镜前灯|顶灯/u.test(factText(fact)));
}

function queriedRecordIds(facts: BuildingFact[]) {
  const knownRecordIds = new Set(building1602Dataset.records.map((record) => record.recordId));
  return new Set(facts.map((fact) => fact.factId).filter((factId) => knownRecordIds.has(factId)));
}

function hasTag(record: BuildingRecord, tag: string) {
  return record.memory?.diagnosticTags?.includes(tag) ?? false;
}

function componentOverlap(a: string[], b: string[]) {
  const right = new Set(b.filter((id) => !id.startsWith("SYS-")));
  return a.some((id) => !id.startsWith("SYS-") && right.has(id));
}

function memoryCandidates(tag: string, facts: BuildingFact[]) {
  const queried = queriedRecordIds(facts);
  return building1602Dataset.records
    .filter((record) => record.recordType === "CONSTRUCTION" && queried.has(record.recordId) && hasTag(record, tag) && record.memory?.diagnosticTitle && record.memory?.diagnosticReason && record.memory?.recommendedCheck)
    .sort((a, b) => (a.memory?.diagnosticPriority ?? 99) - (b.memory?.diagnosticPriority ?? 99) || a.occurredAt.localeCompare(b.occurredAt));
}

function matchingInspection(record: BuildingRecord, tag: string, facts: BuildingFact[]) {
  const queried = queriedRecordIds(facts);
  return building1602Dataset.records.find((candidate) =>
    candidate.recordType === "INSPECTION"
    && queried.has(candidate.recordId)
    && hasTag(candidate, tag)
    && componentOverlap(candidate.subjectBusinessIds, record.subjectBusinessIds)
  );
}

function dateLabel(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}

function memoryEvidence(record: BuildingRecord, inspection?: BuildingRecord) {
  const unchecked = inspection?.memory?.verification?.uncheckedItems ?? record.memory?.verification?.uncheckedItems ?? [];
  const uncheckedText = unchecked.length ? `；当时未单独覆盖：${unchecked.join("、")}` : "";
  const inspectionText = inspection ? `；${dateLabel(inspection.occurredAt)} ${inspection.title}：${inspection.summary}` : "";
  return `${dateLabel(record.occurredAt)} ${record.title}：${record.summary}${inspectionText}${uncheckedText}`;
}

function odorFallback(): EngineeringHypothesis[] {
  return [
    {
      id: "WATER_SEAL_LOW",
      title: "地漏或台盆水封不足",
      mechanism: "水封不足或干涸时，排水管内气体可能通过排水末端进入室内。",
      verification: "先检查地漏与台盆存水状态；补水后短时间观察气味是否明显减弱。",
      priority: 1
    },
    {
      id: "DRAIN_INTERFACE_SEAL",
      title: "排水接口密封异常",
      mechanism: "器具与排水接口之间如果出现密封失效，可能形成绕过水封的气味通道。",
      verification: "检查坐便器底部、台盆排水接口和地漏周边是否存在松动、开裂或密封缺口。",
      priority: 2
    },
    {
      id: "VENT_PRESSURE",
      title: "排水通气或压力波动",
      mechanism: "排水时产生的压力波动可能影响水封稳定性，但当前建筑记忆没有记录该故障已经发生。",
      verification: "观察冲水或集中排水后是否出现咕噜声、水封波动或气味加重；如有再由物业检查通气路径。",
      priority: 3
    }
  ];
}

export function deriveEngineeringReasoning(question: string, facts: BuildingFact[]): EngineeringReasoning | null {
  const profile = profileForQuestion(question);
  if (!profile) return null;

  const relevant = relevantFacts(profile, facts);
  const candidates = memoryCandidates(profile.tag, facts);
  const memoryHypotheses = candidates.map((record, index) => {
    const inspection = matchingInspection(record, profile.tag, facts);
    return {
      id: `MEMORY_${record.recordId}`,
      title: record.memory!.diagnosticTitle!,
      mechanism: record.memory!.diagnosticReason!,
      verification: record.memory!.recommendedCheck!,
      priority: record.memory?.diagnosticPriority ?? index + 1,
      sourceRecordId: record.recordId,
      evidence: memoryEvidence(record, inspection)
    } satisfies EngineeringHypothesis;
  });

  if (memoryHypotheses.length) {
    const titles = memoryHypotheses.map((item) => item.title);
    const recordIds = memoryHypotheses.map((item) => item.sourceRecordId!).filter(Boolean);
    const factIds = [...new Set([...relevant.map((fact) => fact.factId), ...recordIds])];
    const orderedChecks = memoryHypotheses.map((item, index) => `${index + 1}. ${item.verification}`).join(" ");
    return {
      kind: profile.kind,
      summary: `这次不从通用故障清单随机排查。1602 的建筑记忆里有 ${memoryHypotheses.length} 段与${profile.symptomLabel}机理直接相关的施工历史：${titles.join("、")}。它们不是已确认故障，但应先于普通未留痕位置被验证。`,
      confirmedFactIds: factIds,
      confirmedSummary: `已查询到 1602 与${profile.symptomLabel}相关的施工与验收记忆，命中 ${memoryHypotheses.length} 个具有明确现场变更或返工历史的节点。`,
      hypotheses: memoryHypotheses,
      nextStep: `${orderedChecks} 如果这些具有本楼历史依据的节点都正常，再扩大到没有特定施工记忆支撑的一般性原因。`,
      boundary: `这些记录证明的是“1602 当年发生过现场改线/返工，以及当时验收覆盖了什么、没有覆盖什么”，并不能直接证明今天的${profile.symptomLabel}由它们造成。当前优先级来自这栋房子的历史与故障机理相关性；只有新的现场观察或确定性事件引擎验证后，才能升级为本次事件的确认原因。`,
      memoryBased: true,
      memoryRecordIds: recordIds
    };
  }

  if (profile.kind !== "DRAINAGE_ODOR") return null;
  const confirmedSummary = relevant.length > 0
    ? "建筑记忆确认本次查询命中了 1602 卫生间排水系统及其相关构件，但尚未查询到可用于排序的施工偏差或返工记忆。"
    : "当前查询结果还不足以确认臭味与哪一条具体排水路径有关。";
  const hypotheses = odorFallback();
  return {
    kind: "DRAINAGE_ODOR",
    summary: `目前不能仅凭现有建筑记录确定臭味来源。${confirmedSummary}下面只能先给出一般工程机理上的待验证假设。`,
    confirmedFactIds: relevant.map((fact) => fact.factId),
    confirmedSummary,
    hypotheses,
    nextStep: hypotheses.map((item, index) => `${index + 1}. ${item.verification}`).join(" "),
    boundary: "这些是通用工程假设，不是 1602 已确认故障，也不会写回建筑事实；只有现场观察、检查记录或确定性事件引擎验证后，才能升级为本事件的确认结论。",
    memoryBased: false,
    memoryRecordIds: []
  };
}
