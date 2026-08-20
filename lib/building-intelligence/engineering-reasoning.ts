import type { BuildingFact, BuildingRecord } from "./types.ts";
import { building1602Dataset } from "./catalog.ts";
import { resolveBuildingMemoryRelevance } from "./memory-relevance.ts";

export type EngineeringHypothesis = {
  id: string;
  title: string;
  mechanism: string;
  verification: string;
  priority: number;
  sourceRecordId?: string;
  evidence?: string;
};

export type EngineeringReasoningKind = "DRAINAGE_ODOR" | "DAMPNESS" | "LIGHTING_FAULT" | "SLOW_DRAIN";

export type EngineeringReasoning = {
  kind: EngineeringReasoningKind;
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
  kind: EngineeringReasoningKind;
  tags: string[];
  label: string;
  fallback: EngineeringHypothesis[];
};

function factText(fact: BuildingFact) {
  const value = Array.isArray(fact.value) ? fact.value.join(" ") : String(fact.value);
  return `${fact.factId} ${fact.subjectBusinessId} ${fact.predicate} ${value}`;
}

function queriedRecordIds(facts: BuildingFact[]) {
  const knownRecordIds = new Set(building1602Dataset.records.map((record) => record.recordId));
  return new Set(facts.map((fact) => fact.factId).filter((factId) => knownRecordIds.has(factId)));
}

function hasAnyTag(record: BuildingRecord, tags: string[]) {
  const current = new Set(record.memory?.diagnosticTags ?? []);
  return tags.some((tag) => current.has(tag));
}

function memoryCandidates(tags: string[], facts: BuildingFact[]) {
  const queried = queriedRecordIds(facts);
  const recordById = new Map(building1602Dataset.records.map((record) => [record.recordId, record]));
  return resolveBuildingMemoryRelevance({
    spaceId: "SPACE-1602-BATHROOM",
    queryTags: tags
  })
    .filter((match) => queried.has(match.recordId))
    .map((match) => recordById.get(match.recordId))
    .filter((record): record is BuildingRecord => Boolean(record))
    .filter((record) =>
      record.recordType === "CONSTRUCTION"
      && hasAnyTag(record, tags)
      && Boolean(record.memory?.diagnosticTitle)
      && Boolean(record.memory?.diagnosticReason)
      && Boolean(record.memory?.recommendedCheck)
    );
}

function inspectionMatchScore(record: BuildingRecord, candidate: BuildingRecord) {
  const specific = (ids: string[]) => ids.filter((id) => !id.startsWith("SPACE-") && !id.startsWith("SYS-"));
  const candidateSpecific = new Set(specific(candidate.subjectBusinessIds));
  const candidateAll = new Set(candidate.subjectBusinessIds);
  const sharedSpecific = specific(record.subjectBusinessIds).filter((id) => candidateSpecific.has(id)).length;
  const sharedAll = record.subjectBusinessIds.filter((id) => candidateAll.has(id)).length;
  return sharedSpecific * 100 + sharedAll;
}

function matchingInspection(record: BuildingRecord, tags: string[], facts: BuildingFact[]) {
  const queried = queriedRecordIds(facts);
  return building1602Dataset.records
    .filter((candidate) => candidate.recordType === "INSPECTION" && queried.has(candidate.recordId) && hasAnyTag(candidate, tags))
    .map((candidate) => ({ candidate, score: inspectionMatchScore(record, candidate) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.occurredAt.localeCompare(b.candidate.occurredAt))[0]?.candidate;
}

function dateLabel(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}

function memoryEvidence(record: BuildingRecord, inspection?: BuildingRecord) {
  const unchecked = inspection?.memory?.verification?.uncheckedItems ?? record.memory?.verification?.uncheckedItems ?? [];
  const checked = inspection?.memory?.verification?.checkedItems ?? record.memory?.verification?.checkedItems ?? [];
  const worker = record.memory?.workerStatement ? `；工友留痕：${record.memory.workerStatement}` : "";
  const checkedText = checked.length ? `；当时已检查：${checked.join("、")}` : "";
  const uncheckedText = unchecked.length ? `；当时未单独覆盖：${unchecked.join("、")}` : "";
  const inspectionText = inspection ? `；${dateLabel(inspection.occurredAt)} ${inspection.title}：${inspection.summary}` : "";
  return `${dateLabel(record.occurredAt)} ${record.title}：${record.summary}${worker}${inspectionText}${checkedText}${uncheckedText}`;
}

function drainageFacts(facts: BuildingFact[]) {
  return facts.filter((fact) => /SYS-1602-DRAIN|DRAIN-1602|TRAP-1602|排水/u.test(factText(fact)));
}

function dampnessFacts(facts: BuildingFact[]) {
  return facts.filter((fact) => /SYS-1602-CW|J-1602-CW-03|WP-1602-BATHROOM|DRAIN-1602-FLOOR-01|冷水|防水|潮湿|渗/u.test(factText(fact)));
}

function lightingFacts(facts: BuildingFact[]) {
  return facts.filter((fact) => /SYS-1602-EL-LIGHT|LIGHT-1602|CABLE-1602|CONDUIT-1602|照明|镜前灯|顶灯/u.test(factText(fact)));
}

function profileForQuestion(question: string): DiagnosticProfile | null {
  if (/(臭味|异味|返味|反味|臭气|下水道味)/u.test(question)) {
    return {
      kind: "DRAINAGE_ODOR", tags: ["ODOR"], label: "返味",
      fallback: [
        { id: "WATER_SEAL_LOW", title: "地漏或台盆水封不足", mechanism: "水封不足或干涸时，排水管内气体可能通过排水末端进入室内。", verification: "先检查地漏与台盆存水状态；补水后短时间观察气味是否明显减弱。", priority: 1 },
        { id: "DRAIN_INTERFACE_SEAL", title: "排水接口密封异常", mechanism: "器具与排水接口之间如果出现密封失效，可能形成绕过水封的气味通道。", verification: "检查坐便器底部、台盆排水接口和地漏周边是否存在松动、开裂或密封缺口。", priority: 2 },
        { id: "VENT_PRESSURE", title: "排水通气或压力波动", mechanism: "排水时产生的压力波动可能影响水封稳定性，但当前建筑记忆没有记录该故障已经发生。", verification: "观察冲水或集中排水后是否出现咕噜声、水封波动或气味加重；如有再由物业检查通气路径。", priority: 3 }
      ]
    };
  }
  if (/(镜前灯|顶灯|照明|灯具)/u.test(question) && /(不亮|闪烁|跳闸|异常|故障|原因|为什么|排查)/u.test(question)) {
    return {
      kind: "LIGHTING_FAULT", tags: ["LIGHTING", "FLICKER"], label: "照明异常",
      fallback: [
        { id: "LIGHT_TERMINAL", title: "灯具端子或出线盒接触异常", mechanism: "灯具端子或出线盒连接状态异常可能造成间歇性不亮或闪烁。", verification: "先检查对应灯具端子与出线盒，再结合上游回路状态继续排查。", priority: 1 },
        { id: "UPSTREAM_POWER", title: "上游供电或开关异常", mechanism: "若灯具端部正常，应继续核对开关和照明回路供电。", verification: "检查开关动作与同回路其他灯具表现，再决定是否向上游回路排查。", priority: 2 }
      ]
    };
  }
  if (/(排水不畅|排水变慢|下水慢|地漏堵|排水异常)/u.test(question)) {
    return {
      kind: "SLOW_DRAIN", tags: ["SLOW_DRAIN", "LOCAL_DEPOSIT"], label: "排水变慢",
      fallback: [
        { id: "LOCAL_BLOCKAGE", title: "排水末端或支管局部积污", mechanism: "地漏、存水弯或支管内局部积污可能造成排水变慢。", verification: "先从可维护末端清洁与通水观察开始，再决定是否继续检查支管。", priority: 1 },
        { id: "ROUTE_SLOPE", title: "局部坡度或排水路径问题", mechanism: "局部坡度不连续或路径阻力增大也可能造成排水迟缓。", verification: "在末端无明显堵塞后，再结合管线历史与现场通水表现检查支管。", priority: 2 }
      ]
    };
  }
  if (/(潮湿|返潮|湿痕|水印|渗水|漏水|墙脚湿|地面湿|微流量)/u.test(question)) {
    return {
      kind: "DAMPNESS", tags: ["DAMPNESS", "LEAKAGE", "COLD_WATER_LEAK", "MICROFLOW"], label: "潮湿/渗漏",
      fallback: [
        { id: "PRESSURIZED_WATER", title: "给水微漏", mechanism: "墙内给水连接点或管段的微漏可能形成持续湿痕，并与静置微流量相互印证。", verification: "先比较微流量、湿度与空间位置，再通过人工授权后的局部隔离验证缩小范围。", priority: 1 },
        { id: "WATERPROOF_NODE", title: "湿区防水节点异常", mechanism: "地漏根部或墙地交界等防水节点在用水后可能表现为局部潮湿。", verification: "观察潮湿与淋浴用水的时间关系，并先做非破坏性表面含水与下层观察。", priority: 2 }
      ]
    };
  }
  return null;
}

function relevantFacts(profile: DiagnosticProfile, facts: BuildingFact[]) {
  if (profile.kind === "DRAINAGE_ODOR" || profile.kind === "SLOW_DRAIN") return drainageFacts(facts);
  if (profile.kind === "LIGHTING_FAULT") return lightingFacts(facts);
  return dampnessFacts(facts);
}

export function deriveEngineeringReasoning(question: string, facts: BuildingFact[]): EngineeringReasoning | null {
  // A live-state boundary is authoritative. Historical building memory may still
  // exist, but it must not trigger a diagnostic panel that visually overrides
  // the deterministic statement that no real-time observation source is connected.
  if (facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE")) return null;

  const profile = profileForQuestion(question);
  if (!profile) return null;

  const relevant = relevantFacts(profile, facts);
  const candidates = memoryCandidates(profile.tags, facts);
  const memoryHypotheses = candidates.map((record, index) => {
    const inspection = matchingInspection(record, profile.tags, facts);
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
    const recordIds = memoryHypotheses.map((item) => item.sourceRecordId!).filter(Boolean);
    const factIds = [...new Set([...relevant.map((fact) => fact.factId), ...recordIds])];
    const orderedChecks = memoryHypotheses.map((item, index) => `${index + 1}. ${item.verification}`).join(" ");
    return {
      kind: profile.kind,
      summary: `这次不从通用${profile.label}原因随机排查。1602 的建筑记忆里有 ${memoryHypotheses.length} 段与本次现象直接相关的施工历史；它们不是已确认故障，但应先于没有本楼历史依据的位置被验证。`,
      confirmedFactIds: factIds,
      confirmedSummary: `已查询到 1602 与${profile.label}相关的施工、返工或验收记忆，命中 ${memoryHypotheses.length} 个可用于调整排查优先级的节点。`,
      hypotheses: memoryHypotheses,
      nextStep: `${orderedChecks} 如果这些具有本楼历史依据的节点都正常，再扩大到没有特定施工记忆支撑的一般性原因。`,
      boundary: "这些记录证明的是“1602 当年实际发生过什么、当时检查了什么、又没有覆盖什么”，并不能直接证明今天的现象由这些节点造成。当前优先级来自本楼历史与故障机理的相关性；只有新的现场观察或确定性事件引擎验证后，才能升级为本次事件的确认原因。",
      memoryBased: true,
      memoryRecordIds: recordIds
    };
  }

  const confirmedSummary = relevant.length
    ? `当前查询已经命中与${profile.label}有关的系统或构件，但尚未查询到能改变排查顺序的本楼施工偏差或返工记忆。`
    : `当前查询结果还不足以把${profile.label}定位到具体系统或构件。`;
  return {
    kind: profile.kind,
    summary: `目前不能仅凭现有建筑记录确定${profile.label}原因。${confirmedSummary}下面只能先给出一般工程机理上的待验证假设。`,
    confirmedFactIds: relevant.map((fact) => fact.factId),
    confirmedSummary,
    hypotheses: profile.fallback,
    nextStep: profile.fallback.map((item, index) => `${index + 1}. ${item.verification}`).join(" "),
    boundary: "这些是通用工程假设，不是 1602 已确认故障，也不会写回建筑事实；只有现场观察、检查记录或确定性事件引擎验证后，才能升级为本事件的确认结论。",
    memoryBased: false,
    memoryRecordIds: []
  };
}
