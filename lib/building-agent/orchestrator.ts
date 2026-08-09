import { hashPayload } from "../life-event-engine/canonical.ts";
import { MODEL_READ_ONLY_TOOL_NAMES, type DraftFields, type AgentResponse, type AgentSession, type AgentToolCall, type AgentTraceEntry, type BuildingAgentContext, type BuildingAgentProvider, type BuildingAgentToolName, type ModelEnhancementTrace, type ObservationDraft, type ProviderExplanation } from "./types.ts";
import { analyzeWithFallback } from "./providers/safe-provider.ts";
import { confirmObservationDraft, createObservationDraft } from "./evidence-draft.ts";
import { executeBuildingAgentTool, toToolCall } from "./tool-registry.ts";
import { appendAgentTrace } from "./trace-log.ts";
import { composeDecisionResponse, composeDraftResponse, sourceRefsFromCalls } from "./response-composer.ts";

type TurnResult = { draft: ObservationDraft | null; response: AgentResponse; traceLog: AgentTraceEntry[] };

function traceId(sessionId: string, now: string, input: string) {
  return `TRACE-${hashPayload({ sessionId, now, input }).slice(0, 14)}`;
}

const modelTools = new Set<string>(MODEL_READ_ONLY_TOOL_NAMES);

function enhancementTrace(provider: BuildingAgentProvider | undefined, suggestedTools: BuildingAgentToolName[], calls: AgentToolCall[], explanation?: ProviderExplanation): ModelEnhancementTrace | undefined {
  if (!provider) return undefined;
  const executed = new Set(calls.map((call) => call.toolName));
  const locallyApprovedTools = suggestedTools.filter((tool) => modelTools.has(tool) && executed.has(tool));
  return {
    provider: provider.name,
    suggestedTools,
    locallyApprovedTools,
    executedSuggestedTools: locallyApprovedTools,
    rejectedTools: suggestedTools.filter((tool) => !locallyApprovedTools.includes(tool)),
    calls: provider.getCallHistory?.() ?? [],
    explanation
  };
}

function validateExplanationSources(context: BuildingAgentContext, result: import("../life-event-engine/types.ts").LifeEventResult, explanation: ProviderExplanation) {
  const valid = new Set<string>([
    context.memory.buildingId,
    result.eventId,
    ...Object.keys(context.memory.identityIndex),
    ...context.memory.spaces.map((item) => item.businessId),
    ...context.memory.components.map((item) => item.businessId),
    ...result.input.observations.map((item) => item.id),
    ...result.input.evidence.map((item) => item.id)
  ]);
  const invalid = explanation.sourceRefs.filter((reference) => !valid.has(reference));
  if (invalid.length) throw new Error(`模型解释引用无法解析：${invalid.join(", ")}`);
}

export function createInitialAgentSession(sessionId = `BA-SESSION-${Date.now().toString(36).toUpperCase()}`): AgentSession {
  return { schemaVersion: 1, sessionId, mode: "deterministic", input: "", draft: null, draftEdits: null, revisionReason: "用户核对并修正结构化字段", response: null, traceLog: [], selectedExample: false };
}

export class BuildingAgentOrchestrator {
  readonly context: BuildingAgentContext;
  readonly enhancedProvider?: BuildingAgentProvider;

  constructor(context: BuildingAgentContext, enhancedProvider?: BuildingAgentProvider) {
    this.context = context;
    this.enhancedProvider = enhancedProvider;
  }

  private runTool(calls: AgentToolCall[], name: BuildingAgentToolName, args: Record<string, unknown>, now: string) {
    const execution = executeBuildingAgentTool(name, args, this.context, now);
    calls.push(toToolCall(name, execution, `CALL-${String(calls.length + 1).padStart(2, "0")}`, now, args));
    return execution.value;
  }

  async handleInput(input: string, sessionId: string, previousLog: readonly AgentTraceEntry[] = [], now = new Date().toISOString()): Promise<TurnResult> {
    if (!input.trim()) throw new Error("请输入希望总智能体处理的问题");
    const provider = await analyzeWithFallback(input, this.enhancedProvider);
    const id = traceId(sessionId, now, input);
    const calls: AgentToolCall[] = [];
    let draft: ObservationDraft | null = null;
    let response: AgentResponse;

    if (provider.analysis.intent === "DRAFT_OBSERVATION" || provider.analysis.intent === "EVALUATE_EVENT") {
      draft = createObservationDraft(input, provider.analysis, now);
      this.runTool(calls, "draft_observation", { draft }, now);
      response = composeDraftResponse(draft, calls, id, provider.mode, provider.fallbackReason);
    } else if (provider.analysis.intent === "VIEW_GROUP_LEARNING") {
      this.runTool(calls, "verify_event_package", {}, now);
      const card = this.runTool(calls, "read_group_learning_card", {}, now) as { experienceLabel: string; sourceEventCount: number; unprovenClaims: string[] };
      this.runTool(calls, "verify_group_learning_bundle", {}, now);
      response = { mode: provider.mode, intent: provider.analysis.intent, facts: [`当前经验等级：${card.experienceLabel}`, `来源完整事件数量：${card.sourceEventCount}`], inferences: ["单事件只形成待验证经验，是否采纳为试点仍由集团人员决定。"], uncertainties: card.unprovenClaims, missingEvidence: [], toolCalls: calls, sourceRefs: sourceRefsFromCalls(calls), proposedNextAction: { label: "进入集团工作台查看来源与人工评审", route: "/group" }, requiresHumanConfirmation: false, safetyNotice: "总智能体不能自动批准集团经验，也不能把单事件称为集团规律。", specialistAgents: [...new Set(calls.map((call) => call.specialistAgent))], traceId: id, fallbackReason: provider.fallbackReason };
    } else {
      const matches = this.runTool(calls, "query_building_memory", { query: input }, now) as Array<[string, unknown]>;
      const component = this.context.memory.components.find((item) => item.businessId === "J-1602-CW-03") ?? this.context.memory.components.find((item) => item.spaceId === "SPACE-1602-BATHROOM");
      if (component) this.runTool(calls, "locate_component", { businessId: component.businessId }, now);
      response = { mode: provider.mode, intent: provider.analysis.intent, facts: [`建筑记忆命中${matches.length}个身份`, component ? `已定位构件 ${component.businessId} / ${component.displayName}` : "未定位到构件"], inferences: [], uncertainties: matches.length ? [] : ["问题未匹配到当前1602卫生间演示范围内的身份"], missingEvidence: [], toolCalls: calls, sourceRefs: sourceRefsFromCalls(calls), proposedNextAction: { label: "描述1602卫生间的潮湿、湿度或水表现象" }, requiresHumanConfirmation: false, safetyNotice: "当前只编排一栋楼内1602卫生间的脱敏演示能力。", specialistAgents: [...new Set(calls.map((call) => call.specialistAgent))], traceId: id, fallbackReason: provider.fallbackReason };
    }

    response.modelEnhancement = enhancementTrace(this.enhancedProvider, provider.analysis.suggestedTools, calls);
    const traceLog = appendAgentTrace(previousLog, { traceId: id, sessionId, timestamp: now, mode: provider.mode, actionType: "INPUT_ANALYZED", userInputSummary: input.slice(0, 240), intent: response.intent, toolCalls: calls, sourceRefs: response.sourceRefs.map((item) => item.businessId), userConfirmation: false, fallbackReason: provider.fallbackReason, modelEnhancement: response.modelEnhancement, responseSummary: response.facts.join("；").slice(0, 300) });
    return { draft, response, traceLog };
  }

  async confirmAndEvaluate(draft: ObservationDraft, corrections: Partial<DraftFields>, revisionReason: string, sessionId: string, previousLog: readonly AgentTraceEntry[], now = new Date().toISOString()): Promise<TurnResult> {
    this.enhancedProvider?.beginTurn?.();
    const confirmed = confirmObservationDraft(draft, corrections, revisionReason, now);
    const id = traceId(sessionId, now, `${draft.draftId}:confirmed`);
    const calls: AgentToolCall[] = [];
    this.runTool(calls, "query_building_memory", { query: "1602卫生间" }, now);
    const candidate = this.context.memory.components.find((item) => item.spaceId === "SPACE-1602-BATHROOM" && item.ifcClass === "IfcPipeFitting");
    if (!candidate) throw new Error("建筑记忆没有可供事件引擎评估的冷水接头候选");
    this.runTool(calls, "locate_component", { businessId: candidate.businessId }, now);
    this.runTool(calls, "list_required_evidence", { spaceId: confirmed.extractedFields.spaceId }, now);
    const controls = this.runTool(calls, "submit_confirmed_observation", { draft: confirmed }, now);
    const result = this.runTool(calls, "evaluate_life_event", { controls, eventCounter: 601 }, now) as import("../life-event-engine/types.ts").LifeEventResult;
    this.runTool(calls, "explain_decision", { result }, now);
    if (result.authorizationRequests.length) this.runTool(calls, "request_human_authorization", { result }, now);
    this.runTool(calls, "navigate_to_workspace", { route: "/resident" }, now);
    let mode: AgentResponse["mode"] = "deterministic";
    let fallbackReason: string | undefined;
    let explanation: ProviderExplanation | undefined;
    if (this.enhancedProvider?.explainVerifiedResult) {
      try { explanation = await this.enhancedProvider.explainVerifiedResult(result); validateExplanationSources(this.context, result, explanation); mode = "llm-enhanced"; }
      catch (error) { mode = "fallback"; fallbackReason = error instanceof Error ? error.message : "大模型解释失败"; }
    }
    const response = composeDecisionResponse(result, calls, id, mode, fallbackReason);
    response.modelEnhancement = enhancementTrace(this.enhancedProvider, [], calls, explanation);
    const traceLog = appendAgentTrace(previousLog, { traceId: id, sessionId, timestamp: now, mode: response.mode, actionType: "TOOLS_EXECUTED", userInputSummary: draft.originalText.slice(0, 240), intent: "EVALUATE_EVENT", toolCalls: calls, sourceRefs: response.sourceRefs.map((item) => item.businessId), userConfirmation: true, fallbackReason, modelEnhancement: response.modelEnhancement, responseSummary: response.facts.join("；").slice(0, 300) });
    return { draft: confirmed, response, traceLog };
  }
}
