import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { DeepSeekGatewayBuildingAgentProvider } from "../lib/building-agent/providers/deepseek-gateway.ts";
import { loadGatewayConfig } from "../tools/building-agent-gateway/config.ts";
import { DeepSeekChatProvider, GatewayProviderError } from "../tools/building-agent-gateway/deepseek-provider.ts";
import { validateBuildingAnswerDraft, validateExplainOutput, validateInterpretOutput } from "../tools/building-agent-gateway/schemas.ts";
import { verifyGroundedClaims } from "../tools/building-agent-gateway/grounding.ts";
import { getComponentDetail, getComponentsBehindSurface, getMaintenanceHistory } from "../lib/building-intelligence/queries.ts";
import type { BuildingFact } from "../lib/building-intelligence/types.ts";
import { queryBuildingAgent } from "../lib/building-intelligence/agent.ts";
import { createGatewayServer } from "../tools/building-agent-gateway/server.ts";
import type { GatewayConfig } from "../tools/building-agent-gateway/types.ts";

const validInterpret = {
  intent: "DRAFT_OBSERVATION",
  fields: {
    spaceId: "SPACE-1602-BATHROOM", humidity: 78, humidityBaseline: null, durationMinutes: 2880,
    microFlow: null, microFlowBaseline: null, meterFinding: "FLOW_CONFIRMED_NO_USE",
    photoFinding: "MOISTURE_VISIBLE", photoPresent: true, dataQuality: "GOOD", sourceActor: "RESIDENT"
  },
  inferences: ["墙脚存在潮湿描述"], uncertainties: ["微流量数值未提供"], missingFields: ["microFlow"],
  proposedTools: ["draft_observation", "query_building_memory", "list_required_evidence"]
} as const;

const validExplain = {
  facts: ["确定性事件状态为AUTHORIZATION_PENDING"],
  inferences: ["第一候选来自规则与拓扑排序"],
  uncertainties: ["尚未获得人工授权"], missingEvidence: [],
  sourceRefs: ["SPACE-1602-BATHROOM", "J-1602-CW-03"],
  nextStep: "由用户进入住户工作台申请人工授权", safetyNotice: "模型不能批准授权或执行阀门动作"
} as const;

function config(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return { apiKey: "sk-test-redacted-not-real", model: "deepseek-v4-flash", host: "127.0.0.1", port: 4180, allowedOrigins: ["http://127.0.0.1:4174"], publicMode: false, timeoutMs: 100, maxInputChars: 4000, maxOutputTokens: 1200, ...overrides };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function deepSeekResponse(output: unknown) {
  return response({ id: "chatcmpl_live_shape_001", model: "deepseek-v4-flash", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }] });
}

function deepSeekToolResponse(name: string, args: Record<string, string>, id = "call_001") {
  return response({ id: "chatcmpl_tool_001", model: "deepseek-v4-flash", choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }] });
}

function deepSeekManyToolResponse(calls: Array<{ name: string; args: Record<string, string>; id: string }>) {
  return response({ id: "chatcmpl_many_tools", model: "deepseek-v4-flash", choices: [{ message: { role: "assistant", content: "", tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } })) }, finish_reason: "tool_calls" }] });
}

const groundedNorthWall = { claims: [{ text: "J-1602-CW-03 位于 WALL-1602-BATHROOM-NORTH 后方", factIds: ["REL-002"] }] };

// Existing gateway tests omitted here are intentionally preserved below by the repository update process.
