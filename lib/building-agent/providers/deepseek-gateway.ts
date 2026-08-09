import { MODEL_READ_ONLY_TOOL_NAMES, type BuildingAgentProvider, type ModelProviderCall, type ProviderAnalysis, type ProviderExplanation } from "../types.ts";
import type { LifeEventResult } from "../../life-event-engine/types.ts";

export const DEFAULT_BUILDING_AGENT_GATEWAY_URL = "http://127.0.0.1:4180";

export type GatewayHealth = { status: "ok"; provider: "deepseek"; providerConfigured: boolean; model: string };
type GatewayMetadata = { task: ModelProviderCall["task"]; responseId: string; model: string; calledAt: string; requestId: string; schemaValid: true };
type GatewayErrorBody = { ok: false; error: { type: string; message: string; requestId: string } };

const realModelTools = new Set<string>(MODEL_READ_ONLY_TOOL_NAMES);

export class DeepSeekGatewayClientError extends Error {
  readonly type: string;
  readonly requestId?: string;
  constructor(type: string, message: string, requestId?: string) { super(message); this.type = type; this.requestId = requestId; }
}

async function jsonRequest<T>(url: string, init: RequestInit, fetcher: typeof fetch): Promise<{ result: T; metadata: GatewayMetadata }> {
  let response: Response;
  try { response = await fetcher(url, init); } catch { throw new DeepSeekGatewayClientError("GATEWAY_UNREACHABLE", "本地DeepSeek网关不可用"); }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new DeepSeekGatewayClientError("GATEWAY_INVALID_RESPONSE", "本地DeepSeek网关返回了无效响应"); }
  if (!response.ok) {
    const failure = payload as GatewayErrorBody;
    throw new DeepSeekGatewayClientError(failure.error?.type ?? "GATEWAY_ERROR", failure.error?.message ?? `网关HTTP ${response.status}`, failure.error?.requestId);
  }
  const success = payload as { ok: true; result: T; metadata: GatewayMetadata };
  if (success.ok !== true || !success.metadata?.responseId || success.metadata.schemaValid !== true) throw new DeepSeekGatewayClientError("GATEWAY_SCHEMA_ERROR", "网关成功响应缺少验证元数据");
  return success;
}

export async function probeBuildingAgentGateway(fetcher: typeof fetch = fetch, baseUrl = DEFAULT_BUILDING_AGENT_GATEWAY_URL): Promise<GatewayHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetcher(`${baseUrl}/health`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json() as GatewayHealth;
    if (value.status !== "ok" || value.provider !== "deepseek" || typeof value.providerConfigured !== "boolean" || typeof value.model !== "string") throw new Error("health schema invalid");
    return value;
  } finally { clearTimeout(timer); }
}

export class DeepSeekGatewayBuildingAgentProvider implements BuildingAgentProvider {
  readonly name = "DeepSeek Chat Completions via local gateway";
  readonly mode = "llm-enhanced" as const;
  private calls: ModelProviderCall[] = [];
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(fetcher: typeof fetch = fetch, baseUrl = DEFAULT_BUILDING_AGENT_GATEWAY_URL) { this.fetcher = fetcher; this.baseUrl = baseUrl; }

  beginTurn() { this.calls = []; }
  getCallHistory() { return [...this.calls]; }

  private recordSuccess(metadata: GatewayMetadata) {
    this.calls.push({ task: metadata.task, status: "SUCCEEDED", model: metadata.model, responseId: metadata.responseId, requestId: metadata.requestId, calledAt: metadata.calledAt, schemaValid: true });
  }

  private recordFailure(task: ModelProviderCall["task"], error: unknown) {
    const value = error instanceof DeepSeekGatewayClientError ? error : new DeepSeekGatewayClientError("GATEWAY_ERROR", error instanceof Error ? error.message : "网关调用失败");
    this.calls.push({ task, status: "FAILED", requestId: value.requestId, calledAt: new Date().toISOString(), schemaValid: false, errorType: value.type, errorSummary: value.message.slice(0, 240) });
  }

  async analyze(input: string): Promise<ProviderAnalysis> {
    try {
      const response = await jsonRequest<{
        intent: ProviderAnalysis["intent"];
        fields: ProviderAnalysis["fields"];
        inferences: string[];
        uncertainties: string[];
        missingFields: string[];
        proposedTools: string[];
      }>(`${this.baseUrl}/v1/agent/interpret`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "INTERPRET_OBSERVATION", input }) }, this.fetcher);
      for (const tool of response.result.proposedTools) if (!realModelTools.has(tool)) throw new DeepSeekGatewayClientError("MODEL_TOOL_REJECTED", `模型提出未允许工具 ${tool}`);
      this.recordSuccess(response.metadata);
      return {
        intent: response.result.intent,
        fields: response.result.fields,
        inferences: response.result.inferences,
        uncertainties: [...response.result.uncertainties, ...response.result.missingFields.map((item) => `缺少字段：${item}`)],
        suggestedTools: response.result.proposedTools as ProviderAnalysis["suggestedTools"]
      };
    } catch (error) { this.recordFailure("INTERPRET_OBSERVATION", error); throw error; }
  }

  async explainVerifiedResult(result: LifeEventResult): Promise<ProviderExplanation> {
    const leader = result.rankedHypotheses[0];
    const verifiedResult = {
      eventId: result.eventId,
      state: result.state,
      valvePosition: result.valvePosition,
      leader: { hypothesis: leader.hypothesis, rawScore: leader.rawScore, evidenceCoverage: leader.evidenceCoverage },
      decisionConfidence: result.decisionConfidence,
      supportingEvidence: result.supportingEvidence,
      contradictingEvidence: result.contradictions.map((item) => item.evidenceIds).flat(),
      missingEvidence: result.missingEvidence.map((item) => item.evidenceType),
      ruleSetVersion: result.ruleSetVersion,
      memoryVersion: result.memoryVersion
    };
    try {
      const response = await jsonRequest<ProviderExplanation>(`${this.baseUrl}/v1/agent/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifiedResult }) }, this.fetcher);
      this.recordSuccess(response.metadata);
      return response.result;
    } catch (error) { this.recordFailure("EXPLAIN_VERIFIED_RESULT", error); throw error; }
  }
}
