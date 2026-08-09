import { evaluateControls } from "../life-event-lab/model.ts";
import type { LabControls } from "../life-event-lab/types.ts";
import { createRepairTask } from "../life-event-engine/repair-task.ts";
import { findColdWaterJointCandidates, findComponentsInSpace, findIsolationValve, findRelatedMeters, findRelatedSensors, traceSpatialHierarchy } from "../life-event-engine/topology-traversal.ts";
import type { LifeEventEngine } from "../life-event-engine/engine.ts";
import type { LifeEventResult } from "../life-event-engine/types.ts";
import { assertRegisteredTool } from "./schemas.ts";
import type { AgentToolCall, BuildingAgentContext, BuildingAgentToolName, DraftFields, ObservationDraft, SpecialistAgent } from "./types.ts";

const specialists: Record<BuildingAgentToolName, SpecialistAgent> = {
  query_building_memory: "建筑记忆智能体", locate_component: "建筑记忆智能体", list_required_evidence: "品质智能体",
  draft_observation: "居住服务智能体", submit_confirmed_observation: "居住服务智能体", evaluate_life_event: "建筑健康智能体",
  explain_decision: "居住服务智能体", request_human_authorization: "设备动作智能体", generate_repair_task: "居住服务智能体",
  verify_event_package: "建筑健康智能体", read_group_learning_card: "集团学习智能体", verify_group_learning_bundle: "集团学习智能体",
  navigate_to_workspace: "居住服务智能体"
};

export const BUILDING_AGENT_TOOL_REGISTRY = Object.freeze(Object.fromEntries(Object.entries(specialists).map(([name, specialistAgent]) => [name, { name, specialistAgent, safetyClass: name === "request_human_authorization" ? "PROPOSAL_ONLY" : name === "submit_confirmed_observation" ? "CONFIRMED_INPUT" : "READ_ONLY" }]))) as Readonly<Record<BuildingAgentToolName, { name: BuildingAgentToolName; specialistAgent: SpecialistAgent; safetyClass: "READ_ONLY" | "PROPOSAL_ONLY" | "CONFIRMED_INPUT" }>>;

export type ToolExecution = { value: unknown; summary: string; sourceRefs: string[] };

function controlsFromFields(fields: DraftFields): LabControls {
  return {
    humidity: { value: fields.humidity ?? fields.humidityBaseline ?? 55, baseline: fields.humidityBaseline, durationMinutes: fields.durationMinutes ?? 0, quality: fields.dataQuality },
    microFlow: { value: fields.microFlow ?? 0, baseline: fields.microFlowBaseline, durationMinutes: fields.durationMinutes ?? 0, quality: fields.dataQuality },
    pipeInstallation: "PRESENT", waterproofing: "PRESENT", closedWaterTest: "PRESENT",
    residentPhoto: fields.photoPresent === true ? "PRESENT" : fields.photoPresent === false ? "MISSING" : "UNVERIFIED",
    photoFinding: fields.photoFinding ?? "UNREADABLE",
    meterReading: fields.meterFinding ? "PRESENT" : "MISSING",
    meterFinding: fields.meterFinding ?? "UNREADABLE"
  };
}

export function executeBuildingAgentTool(name: string, args: Record<string, unknown>, context: BuildingAgentContext, now = new Date().toISOString()): ToolExecution {
  assertRegisteredTool(name);
  const memory = context.memory;
  if (name === "query_building_memory") {
    const query = String(args.query ?? "1602").toLowerCase();
    const identities = Object.entries(memory.identityIndex).filter(([id, value]) => `${id} ${value.displayName}`.toLowerCase().includes(query) || (query.includes("1602") && `${id} ${value.displayName}`.includes("1602"))).slice(0, 40);
    return { value: identities, summary: `建筑记忆返回${identities.length}个匹配身份`, sourceRefs: identities.map(([id]) => id) };
  }
  if (name === "locate_component") {
    const businessId = String(args.businessId ?? "");
    const component = memory.components.find((item) => item.businessId === businessId);
    if (!component) throw new Error(`建筑记忆中不存在构件 ${businessId}`);
    const hierarchy = traceSpatialHierarchy(memory, businessId);
    return { value: { component, hierarchy }, summary: `${businessId}位于${hierarchy.storeyId}/${hierarchy.unitId}/${hierarchy.spaceId}`, sourceRefs: [businessId, ...Object.values(hierarchy)] };
  }
  if (name === "list_required_evidence") {
    const spaceId = String(args.spaceId ?? "SPACE-1602-BATHROOM");
    const candidates = findColdWaterJointCandidates(memory, spaceId);
    const requirements = candidates.flatMap((candidate) => memory.evidenceRequirements.filter((item) => item.componentId === candidate.businessId));
    const types = [...new Set([...requirements.flatMap((item) => item.evidenceTypes), "RESIDENT_WALL_PHOTO", "METER_READING"])];
    return { value: types, summary: `当前候选需要${types.length}类证据`, sourceRefs: candidates.map((item) => item.businessId) };
  }
  if (name === "draft_observation") {
    const draft = args.draft as ObservationDraft;
    if (!draft || draft.status !== "DRAFT") throw new Error("draft_observation只接受待确认草稿");
    return { value: draft, summary: "已形成待确认观察草稿，尚未进入正式事件", sourceRefs: [draft.extractedFields.spaceId] };
  }
  if (name === "submit_confirmed_observation") {
    const draft = args.draft as ObservationDraft;
    if (!draft || draft.status !== "CONFIRMED" || !draft.confirmedAt) throw new Error("未经用户确认的草稿不能进入正式事件");
    const controls = controlsFromFields(draft.extractedFields);
    return { value: controls, summary: "用户确认字段已转换为事件引擎输入", sourceRefs: [draft.extractedFields.spaceId, draft.draftId] };
  }
  if (name === "evaluate_life_event") {
    const controls = args.controls as LabControls;
    if (!controls) throw new Error("evaluate_life_event缺少确认后的结构化输入");
    const result = evaluateControls(context.engine as LifeEventEngine, controls, Number(args.eventCounter ?? 601), Date.parse(now));
    const leader = result.rankedHypotheses[0];
    return { value: result, summary: `事件引擎输出${leader.hypothesis}，分值${leader.rawScore}，可信等级${result.decisionConfidence}`, sourceRefs: [...leader.candidateBusinessIds, ...result.supportingEvidence] };
  }
  if (name === "explain_decision") {
    const result = args.result as LifeEventResult;
    if (!result) throw new Error("没有可解释的领域决策");
    const leader = result.rankedHypotheses[0];
    return { value: { leader, missingEvidence: result.missingEvidence, contradictions: result.contradictions }, summary: `${leader.hypothesis}按透明规则排序第一；分值不是故障概率`, sourceRefs: [...leader.candidateBusinessIds, ...result.supportingEvidence] };
  }
  if (name === "request_human_authorization") {
    const result = args.result as LifeEventResult;
    if (!result?.authorizationRequests.length) throw new Error("当前事件没有可创建的人工授权请求");
    return { value: result.authorizationRequests, summary: "仅创建人工授权请求，不批准也不执行设备动作", sourceRefs: result.authorizationRequests.map((item) => item.targetBusinessId) };
  }
  if (name === "generate_repair_task") {
    const result = args.result as LifeEventResult;
    if (result?.state !== "REPAIR_PENDING") throw new Error("只有REPAIR_PENDING事件才能生成维修任务");
    const task = createRepairTask(memory, result);
    return { value: task, summary: `生成面向${task.target.businessId}的脱敏演示维修任务`, sourceRefs: [task.taskId, task.target.businessId, task.isolationValve.businessId] };
  }
  if (name === "verify_event_package") {
    if (!context.groupSource) throw new Error("没有可验证的阶段4B事件成果包");
    const verification = context.groupSource.sourceVerification;
    if (!verification.valid) throw new Error("事件成果包验证未通过");
    return { value: verification, summary: `事件成果包${context.groupSource.packageValue.eventId}验证通过`, sourceRefs: [context.groupSource.packageValue.eventId, context.groupSource.packageValue.eventMemoryPatch.patchId] };
  }
  if (name === "read_group_learning_card") {
    if (!context.groupSource) throw new Error("集团经验来源尚未加载");
    return { value: context.groupSource.card, summary: `${context.groupSource.card.experienceLabel}，来源事件${context.groupSource.card.sourceEventCount}个`, sourceRefs: [context.groupSource.card.cardId, ...context.groupSource.card.sourceEventIds] };
  }
  if (name === "verify_group_learning_bundle") {
    if (!context.groupSource?.sourceVerification.valid) throw new Error("集团经验来源事件验证失败");
    return { value: context.groupSource.sourceVerification, summary: "集团经验来源验证通过；人工评审仍需在集团工作台完成", sourceRefs: [context.groupSource.card.cardId] };
  }
  if (name === "navigate_to_workspace") {
    const route = String(args.route ?? "");
    if (!["/worker", "/resident", "/group"].includes(route)) throw new Error(`不允许跳转到 ${route}`);
    return { value: route, summary: `建议由用户进入${route}专业工作台`, sourceRefs: [] };
  }
  throw new Error(`工具 ${name} 未实现`);
}

export function toToolCall(name: BuildingAgentToolName, execution: ToolExecution, callId: string, occurredAt: string, args: unknown): AgentToolCall {
  return { callId, toolName: name, specialistAgent: specialists[name], inputSummary: JSON.stringify(args).slice(0, 180), outputSummary: execution.summary, sourceRefs: execution.sourceRefs, status: "SUCCEEDED", occurredAt };
}

export function componentsForSpace(context: BuildingAgentContext) {
  return findComponentsInSpace(context.memory, "SPACE-1602-BATHROOM").map((component) => ({ component, valve: component.ifcClass === "IfcPipeFitting" ? findIsolationValve(context.memory, component.businessId) : null, meters: component.ifcClass === "IfcPipeFitting" ? findRelatedMeters(context.memory, component.businessId) : [], sensors: component.ifcClass === "IfcPipeFitting" ? findRelatedSensors(context.memory, component.businessId) : [] }));
}
