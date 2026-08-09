import type { LifeEventResult } from "../life-event-engine/types.ts";
import type { AgentResponse, AgentToolCall, ObservationDraft, SourceRef } from "./types.ts";

export function sourceRefsFromCalls(calls: AgentToolCall[]): SourceRef[] {
  const refs = new Map<string, SourceRef>();
  for (const id of calls.flatMap((call) => call.sourceRefs)) refs.set(id, { businessId: id, label: id, sourceType: id.startsWith("GLC-") ? "GROUP_LEARNING" : id.startsWith("EVT-") || id.startsWith("EVD-") ? "LIFE_EVENT" : "BUILDING_MEMORY" });
  return [...refs.values()];
}

export function composeDraftResponse(draft: ObservationDraft, calls: AgentToolCall[], traceId: string, mode: AgentResponse["mode"], fallbackReason?: string): AgentResponse {
  return { mode, intent: "DRAFT_OBSERVATION", facts: ["已识别空间候选：1602卫生间", "当前内容仍是待确认草稿，尚未进入正式证据链"], inferences: draft.inferences, uncertainties: draft.uncertainties, missingEvidence: draft.uncertainties, toolCalls: calls, sourceRefs: sourceRefsFromCalls(calls), proposedNextAction: { label: "核对字段并确认提交" }, requiresHumanConfirmation: true, safetyNotice: "语言层只整理草稿，不能批准授权、执行阀门动作、写入事件状态或声明维修完成。", specialistAgents: [...new Set(calls.map((call) => call.specialistAgent))], traceId, fallbackReason };
}

export function composeDecisionResponse(result: LifeEventResult, calls: AgentToolCall[], traceId: string, mode: AgentResponse["mode"], fallbackReason?: string): AgentResponse {
  const leader = result.rankedHypotheses[0];
  const missing = result.missingEvidence.map((item) => `${item.evidenceType}：${item.reason}`);
  return { mode, intent: "EVALUATE_EVENT", facts: [`事件引擎状态：${result.state}`, `第一候选：${leader.hypothesis}`, `规则原始分值：${leader.rawScore}，可信等级：${result.decisionConfidence}`, ...result.supportingEvidence.map((item) => `支持证据：${item}`)], inferences: ["第一候选来自确定性规则与构件拓扑排序，原始分值不是故障概率。"], uncertainties: [...missing, ...result.contradictions.map((item) => item.explanation)], missingEvidence: missing, toolCalls: calls, sourceRefs: sourceRefsFromCalls(calls), proposedNextAction: { label: "进入住户自由实验继续补证与人工授权", route: "/resident" }, requiresHumanConfirmation: Boolean(result.authorizationRequests.length), safetyNotice: "关键设备动作必须在住户工作台由人工独立授权并明确执行；总智能体不能代为批准或关阀。", specialistAgents: [...new Set(calls.map((call) => call.specialistAgent))], traceId, decision: result, fallbackReason };
}
