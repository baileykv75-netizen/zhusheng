import { building1602Dataset } from "../building-intelligence/catalog.ts";
import type { BuildingAgentTurnResult, BuildingIntelligenceDataset } from "../building-intelligence/types.ts";
import type { LifeEventResult } from "../life-event-engine/types.ts";
import { componentLifeHref, isCase1602Path, resolveComponentLifeObjectId } from "./component-life-link.ts";

export type ObjectHandoffSource =
  | "BUILDING_MEMORY"
  | "PROPERTY_OPERATION"
  | "EVENT_CANDIDATE"
  | "BUILDING_AGENT";

export type ObjectHandoff = {
  source: ObjectHandoffSource;
  label: string;
  businessId: string;
  displayName: string;
  href: string;
  boundary: string;
};

export type ObjectHandoffContext = {
  pathname: string | null | undefined;
  memoryRecordId?: string | null;
  selectedBusinessId?: string | null;
  result: LifeEventResult | null;
  currentCandidateIds: readonly string[];
  pendingResidentAssessment: boolean;
  agentResult?: BuildingAgentTurnResult | null;
};

function normalizedPath(pathname: string | null | undefined) {
  return (pathname ?? "").replace(/\/+$/, "");
}

function onRoute(pathname: string | null | undefined, suffix: string) {
  return normalizedPath(pathname).endsWith(suffix);
}

function firstComponentId(ids: readonly (string | null | undefined)[], dataset: BuildingIntelligenceDataset) {
  for (const id of ids) {
    const resolved = resolveComponentLifeObjectId(id, dataset);
    if (resolved) return resolved;
  }
  return null;
}

function makeHandoff(
  source: ObjectHandoffSource,
  label: string,
  businessId: string | null,
  boundary: string,
  dataset: BuildingIntelligenceDataset
): ObjectHandoff | null {
  if (!businessId) return null;
  const resolved = resolveComponentLifeObjectId(businessId, dataset);
  const href = resolved ? componentLifeHref(resolved, dataset) : null;
  const entity = resolved ? dataset.components.find((item) => item.businessId === resolved) ?? null : null;
  if (!resolved || !href || !entity) return null;
  return { source, label, businessId: resolved, displayName: entity.displayName, href, boundary };
}

function currentOperationTarget(result: LifeEventResult | null, dataset: BuildingIntelligenceDataset) {
  if (!result) return null;
  const authorizationStates = new Set([
    "AUTHORIZATION_PENDING",
    "AUTHORIZED",
    "SIMULATED_ACTION_APPLIED",
    "VERIFYING",
    "ISOLATION_CONFIRMED"
  ]);
  if (result.state === "ACTION_PROPOSED") {
    const target = firstComponentId(result.proposedActions.map((item) => item.targetBusinessId), dataset);
    return target ? { businessId: target, label: "建议受控操作对象" } : null;
  }
  if (authorizationStates.has(result.state)) {
    const requirement = result.authorizationRequirement;
    if (requirement && ["PENDING", "APPROVED"].includes(requirement.status)) {
      const target = firstComponentId([requirement.targetBusinessId], dataset);
      if (target) return { businessId: target, label: "当前受控操作对象" };
    }
  }
  const repairStates = new Set(["REPAIR_RECORDED", "POST_REPAIR_VERIFYING", "RESOLVED", "REOPENED"]);
  if (repairStates.has(result.state)) {
    const latestRepair = [...result.repairRecords]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.repairRecordId.localeCompare(b.repairRecordId))
      .at(-1);
    const target = firstComponentId([latestRepair?.targetBusinessId], dataset);
    if (target) {
      return {
        businessId: target,
        label: result.state === "REOPENED" ? "上一轮维修对象" : result.state === "RESOLVED" ? "已验证维修对象" : "当前维修对象"
      };
    }
  }
  return null;
}

export function deriveObjectHandoffs(
  context: ObjectHandoffContext,
  dataset: BuildingIntelligenceDataset = building1602Dataset
): ObjectHandoff[] {
  if (isCase1602Path(context.pathname)) return [];
  const handoffs: ObjectHandoff[] = [];

  if (onRoute(context.pathname, "/memory")) {
    const record = context.memoryRecordId
      ? dataset.records.find((item) => item.recordId === context.memoryRecordId) ?? null
      : null;
    const target = record
      ? firstComponentId(record.subjectBusinessIds, dataset)
      : firstComponentId([context.selectedBusinessId], dataset);
    const memoryHandoff = makeHandoff(
      "BUILDING_MEMORY",
      record ? `当前记忆 · ${record.title}` : "当前记忆对象",
      target,
      "只交接 Building Memory 已记录的对象身份；历史相关性不等于当前故障结论。",
      dataset
    );
    if (memoryHandoff) handoffs.push(memoryHandoff);
  }

  const onPropertyOrEvents = onRoute(context.pathname, "/property") || onRoute(context.pathname, "/events");
  if (onPropertyOrEvents && !context.pendingResidentAssessment) {
    const operation = currentOperationTarget(context.result, dataset);
    const operationHandoff = operation
      ? makeHandoff(
          "PROPERTY_OPERATION",
          operation.label,
          operation.businessId,
          "对象来自当前受控生命周期状态；链接只打开对象生命，不执行授权、设备动作或维修。",
          dataset
        )
      : null;
    if (operationHandoff) handoffs.push(operationHandoff);

    const candidateId = firstComponentId(context.currentCandidateIds, dataset);
    const candidateHandoff = makeHandoff(
      "EVENT_CANDIDATE",
      context.result?.state === "REPAIR_PENDING" ? "当前维修目标" : "当前确定性候选",
      candidateId,
      "候选身份来自当前确定性评估；对象链接本身不会提升置信度或改变事件状态。",
      dataset
    );
    if (candidateHandoff) handoffs.push(candidateHandoff);
  }

  if (context.agentResult) {
    const visual = context.agentResult.visualDirective;
    const agentTarget = firstComponentId([
      ...(visual?.targetBusinessIds ?? []),
      ...(visual?.revealBusinessIds ?? []),
      context.agentResult.selectedBusinessId
    ], dataset);
    const agentHandoff = makeHandoff(
      "BUILDING_AGENT",
      "建筑智能体查询对象",
      agentTarget,
      "只接受智能体结构化 visualDirective / selectedBusinessId；不从回答文本猜测构件。",
      dataset
    );
    if (agentHandoff) handoffs.push(agentHandoff);
  }

  const seen = new Set<string>();
  return handoffs.filter((item) => {
    const key = `${item.source}:${item.businessId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
