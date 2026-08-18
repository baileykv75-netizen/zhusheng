import type { BuildingFact } from "./types.ts";
import { entityById } from "./catalog.ts";

export type EngineeringHypothesis = {
  id: string;
  title: string;
  mechanism: string;
  verification: string;
};

export type EngineeringReasoning = {
  kind: "DRAINAGE_ODOR";
  summary: string;
  confirmedFactIds: string[];
  confirmedSummary: string;
  hypotheses: EngineeringHypothesis[];
  nextStep: string;
  boundary: string;
};

function factText(fact: BuildingFact) {
  const value = Array.isArray(fact.value) ? fact.value.join(" ") : String(fact.value);
  return `${fact.factId} ${fact.subjectBusinessId} ${fact.predicate} ${value}`;
}

function drainageFacts(facts: BuildingFact[]) {
  return facts.filter((fact) => /SYS-1602-DRAIN|DRAIN-1602|排水/u.test(factText(fact)));
}

function drainageFixtureNames(facts: BuildingFact[]) {
  const names = facts
    .filter((fact) => fact.predicate === "systemId" && String(fact.value) === "SYS-1602-DRAIN")
    .map((fact) => entityById(fact.subjectBusinessId)?.displayName ?? fact.subjectBusinessId)
    .filter((name) => !/系统/u.test(name));
  return [...new Set(names)];
}

export function deriveEngineeringReasoning(question: string, facts: BuildingFact[]): EngineeringReasoning | null {
  if (!/(臭味|异味|返味|反味|臭气|下水道味)/u.test(question)) return null;

  const relevant = drainageFacts(facts);
  const fixtures = drainageFixtureNames(relevant);
  const hasDrainageEvidence = relevant.length > 0;
  const confirmedSummary = hasDrainageEvidence
    ? fixtures.length
      ? `建筑记忆确认${fixtures.join("、")}接入 1602 卫生间排水系统。`
      : "建筑记忆确认本次查询命中了 1602 卫生间排水系统及其相关构件。"
    : "当前查询结果还不足以确认臭味与哪一条具体排水路径有关。";

  return {
    kind: "DRAINAGE_ODOR",
    summary: `目前不能仅凭现有建筑记录确定臭味来源。${confirmedSummary}下面这些属于工程机理上的待验证假设，不是 1602 已确认故障。`,
    confirmedFactIds: relevant.map((fact) => fact.factId),
    confirmedSummary,
    hypotheses: [
      {
        id: "WATER_SEAL_LOW",
        title: "地漏或台盆水封不足",
        mechanism: "水封不足或干涸时，排水管内气体可能通过排水末端进入室内。",
        verification: "先检查地漏与台盆存水状态；补水后短时间观察气味是否明显减弱。"
      },
      {
        id: "DRAIN_INTERFACE_SEAL",
        title: "排水接口密封异常",
        mechanism: "器具与排水接口之间如果出现密封失效，可能形成绕过水封的气味通道。",
        verification: "检查坐便器底部、台盆排水接口和地漏周边是否存在松动、开裂或密封缺口。"
      },
      {
        id: "VENT_PRESSURE",
        title: "排水通气或压力波动",
        mechanism: "排水时产生的压力波动可能影响水封稳定性，但当前建筑记忆没有记录该故障已经发生。",
        verification: "观察冲水或集中排水后是否出现咕噜声、水封波动或气味加重；如有再由物业检查通气路径。"
      },
      {
        id: "LOCAL_DEPOSIT",
        title: "排水末端局部积污",
        mechanism: "地漏、存水弯或排水末端的有机物积存也可能产生局部异味。",
        verification: "清洁地漏和可维护的存水弯后对比气味变化，避免把清洁结果直接当成结构故障证据。"
      }
    ],
    nextStep: "优先检查地漏和台盆水封状态；如果水封正常，再检查坐便器与排水接口密封，最后根据冲排水时的现象决定是否检查通气路径。",
    boundary: "工程假设来自受控诊断知识，不会写回建筑事实；只有现场观察、检查记录或确定性事件引擎验证后，才能升级为本事件的确认结论。"
  };
}
