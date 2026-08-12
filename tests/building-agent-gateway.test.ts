import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { DeepSeekGatewayBuildingAgentProvider } from "../lib/building-agent/providers/deepseek-gateway.ts";
import { loadGatewayConfig } from "../tools/building-agent-gateway/config.ts";
import { DeepSeekChatProvider, GatewayProviderError } from "../tools/building-agent-gateway/deepseek-provider.ts";
import { validateExplainOutput, validateInterpretOutput } from "../tools/building-agent-gateway/schemas.ts";
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
  return { apiKey: "sk-test-redacted-not-real", model: "deepseek-v4-flash", host: "127.0.0.1", port: 4180, allowedOrigins: ["http://127.0.0.1:4174"], timeoutMs: 100, maxInputChars: 4000, maxOutputTokens: 1200, ...overrides };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function deepSeekResponse(output: unknown) {
  return response({ id: "chatcmpl_live_shape_001", model: "deepseek-v4-flash", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }] });
}

function deepSeekToolResponse(name: string, args: Record<string, string>) {
  return response({ id: "chatcmpl_tool_001", model: "deepseek-v4-flash", choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [{ id: "call_001", type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }] });
}

test("gateway config defaults to loopback and is unconfigured without a key", () => {
  const value = loadGatewayConfig({});
  assert.equal(value.host, "127.0.0.1");
  assert.equal(value.port, 4180);
  assert.equal(value.apiKey, "");
  assert.equal(value.model, "deepseek-v4-flash");
});

test("gateway reads only DeepSeek server variables", () => {
  const value = loadGatewayConfig({ DEEPSEEK_API_KEY: "deepseek-test-key", DEEPSEEK_MODEL: "deepseek-v4-pro", OPENAI_API_KEY: "must-not-be-used" });
  assert.equal(value.apiKey, "deepseek-test-key");
  assert.equal(value.model, "deepseek-v4-pro");
});

test("gateway rejects non-loopback binding", () => {
  assert.throws(() => loadGatewayConfig({ BUILDING_AGENT_GATEWAY_HOST: "0.0.0.0" }), /loopback/);
});

test("DeepSeek provider uses JSON Output plus local strict schema and records response metadata", async () => {
  let sent = "";
  let url = "";
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async (requestUrl, init) => { url = String(requestUrl); sent = String(init?.body); return deepSeekResponse(validInterpret); }) as typeof fetch, now: () => "2026-07-30T01:00:00.000Z" });
  const output = await provider.call("INTERPRET_OBSERVATION", { input: "1602卫生间湿度78%" });
  assert.equal(output.metadata.responseId, "chatcmpl_live_shape_001");
  assert.equal(output.metadata.schemaValid, true);
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  assert.match(sent, /"response_format":\{"type":"json_object"\}/);
  assert.match(sent, /禁止额外字段/);
  assert.doesNotMatch(sent, /sk-test-redacted-not-real/);
});

test("DeepSeek empty JSON content receives one bounded retry without relaxing schema", async () => {
  let calls = 0;
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async () => {
    calls += 1;
    return calls === 1
      ? response({ id: "chatcmpl_empty", model: "deepseek-v4-flash", choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }] })
      : deepSeekResponse(validInterpret);
  }) as typeof fetch });
  const output = await provider.call("INTERPRET_OBSERVATION", { input: "1602卫生间湿度78%" });
  assert.equal(output.metadata.schemaValid, true);
  assert.equal(calls, 2);
});

test("building query tool loop executes only deterministic tools and returns fact-backed output", async () => {
  let calls = 0;
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { tools?: Array<{ function: { name: string } }>; messages?: Array<{ role: string }> };
    assert.ok(body.tools?.some((item) => item.function.name === "get_components_behind_surface"));
    return calls === 1
      ? deepSeekToolResponse("get_components_behind_surface", { surfaceBusinessId: "WALL-1602-BATHROOM-NORTH" })
      : response({ id: "chatcmpl_tool_002", model: "deepseek-v4-flash", choices: [{ message: { role: "assistant", content: "done" }, finish_reason: "stop" }] });
  }) as typeof fetch });
  const output = await provider.queryBuilding("北墙后面有什么？", null);
  assert.equal(output.result.mode, "LIVE_AI");
  assert.equal(output.result.toolTrace[0].tool, "get_components_behind_surface");
  assert.ok(output.result.facts.every((fact) => fact.sourceIds.length > 0));
  assert.match(output.result.answer, /北墙后方记录了/);
  assert.equal(output.metadata.toolCalls, 1);
});

test("building query tool loop rejects conduit as an invented functional tool and extra arguments", async () => {
  const unlisted = new DeepSeekChatProvider(config(), { fetcher: (async () => deepSeekToolResponse("connect_conduit_power", { businessId: "CONDUIT-1602-LIGHT-01" })) as typeof fetch });
  await assert.rejects(() => unlisted.queryBuilding("线管是否导电？", null), (error: unknown) => error instanceof GatewayProviderError && error.type === "MODEL_TOOL_REJECTED");
  const extra = new DeepSeekChatProvider(config(), { fetcher: (async () => deepSeekToolResponse("trace_system", { systemId: "SYS-1602-EL-LIGHT", write: "true" })) as typeof fetch });
  await assert.rejects(() => extra.queryBuilding("照明怎么连接？", null), (error: unknown) => error instanceof GatewayProviderError && error.type === "SCHEMA_ERROR");
});

test("input minimization redacts local paths and rejects likely API keys", async () => {
  let sent = "";
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async (_url, init) => { sent = String(init?.body); return deepSeekResponse(validInterpret); }) as typeof fetch });
  await provider.call("INTERPRET_OBSERVATION", { input: "查看 C:\\Users\\Admin\\secret.txt 的1602记录" });
  assert.match(sent, /REDACTED_LOCAL_PATH/);
  assert.doesNotMatch(sent, /Users\\\\Admin/);
  await assert.rejects(() => provider.call("INTERPRET_OBSERVATION", { input: "key sk-abcdefghijklmnop12345" }), (error: unknown) => error instanceof GatewayProviderError && error.type === "SENSITIVE_INPUT");
});

test("overlong input is rejected before an upstream call", async () => {
  let called = false;
  const provider = new DeepSeekChatProvider(config({ maxInputChars: 12 }), { fetcher: (async () => { called = true; return deepSeekResponse(validInterpret); }) as typeof fetch });
  await assert.rejects(() => provider.call("INTERPRET_OBSERVATION", { input: "this input is much too long" }), (error: unknown) => error instanceof GatewayProviderError && error.type === "INPUT_REJECTED");
  assert.equal(called, false);
});

test("provider classifies authentication, model, rate, upstream and network failures", async () => {
  const cases: Array<[number, unknown, string]> = [
    [401, { error: { message: "invalid key" } }, "AUTH_ERROR"],
    [400, { error: { message: "model deepseek-v4-flash does not exist" } }, "MODEL_UNAVAILABLE"],
    [402, { error: { message: "insufficient balance" } }, "INSUFFICIENT_BALANCE"],
    [429, { error: { message: "rate limited" } }, "RATE_LIMITED"],
    [500, { error: { message: "upstream unavailable" } }, "UPSTREAM_ERROR"]
  ];
  for (const [status, body, type] of cases) {
    const provider = new DeepSeekChatProvider(config(), { fetcher: (async () => response(body, status)) as typeof fetch });
    await assert.rejects(() => provider.call("INTERPRET_OBSERVATION", { input: "1602潮湿" }), (error: unknown) => error instanceof GatewayProviderError && error.type === type);
  }
  const network = new DeepSeekChatProvider(config(), { fetcher: (async () => { throw new Error("offline"); }) as typeof fetch });
  await assert.rejects(() => network.call("INTERPRET_OBSERVATION", { input: "1602潮湿" }), (error: unknown) => error instanceof GatewayProviderError && error.type === "NETWORK_ERROR");
});

test("provider aborts timed out requests", async () => {
  const provider = new DeepSeekChatProvider(config({ timeoutMs: 5 }), { fetcher: ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch });
  await assert.rejects(() => provider.call("INTERPRET_OBSERVATION", { input: "1602潮湿" }), (error: unknown) => error instanceof GatewayProviderError && error.type === "TIMEOUT");
});

test("non-JSON and malformed structured outputs are rejected", async () => {
  const nonJson = new DeepSeekChatProvider(config(), { fetcher: (async () => new Response("not json", { status: 200 })) as typeof fetch });
  await assert.rejects(() => nonJson.call("INTERPRET_OBSERVATION", { input: "1602潮湿" }), (error: unknown) => error instanceof GatewayProviderError && error.type === "NON_JSON_RESPONSE");
  for (const output of [{ ...validInterpret, extra: true }, { ...validInterpret, fields: { ...validInterpret.fields, spaceId: "SPACE-FAKE" } }, { ...validInterpret, proposedTools: ["SIMULATE_CLOSE_VALVE"] }]) {
    const provider = new DeepSeekChatProvider(config(), { fetcher: (async () => deepSeekResponse(output)) as typeof fetch });
    await assert.rejects(() => provider.call("INTERPRET_OBSERVATION", { input: "1602潮湿" }), (error: unknown) => error instanceof GatewayProviderError && error.type === "SCHEMA_ERROR");
  }
});

test("explanation output cannot claim authorization, repair, or group-standard outcomes", () => {
  assert.deepEqual(validateExplainOutput(validExplain), validExplain);
  assert.throws(() => validateExplainOutput({ ...validExplain, facts: ["授权已批准"] }), /越权结论/);
  assert.throws(() => validateExplainOutput({ ...validExplain, facts: ["维修已经完成"] }), /越权结论/);
  assert.throws(() => validateExplainOutput({ ...validExplain, facts: ["已成为集团规律"] }), /越权结论/);
});

test("prompt injection remains plain input and cannot add write tools", () => {
  const parsed = validateInterpretOutput(validInterpret);
  assert.equal(parsed.proposedTools.includes("draft_observation"), true);
  assert.equal(parsed.proposedTools.some((tool) => tool.includes("VALVE")), false);
  assert.throws(() => validateInterpretOutput({ ...validInterpret, proposedTools: ["request_human_authorization"] }), /未允许工具/);
});

test("browser provider exposes suggested tools separately from actual execution", async () => {
  const fetcher = (async () => response({ ok: true, result: validInterpret, metadata: { task: "INTERPRET_OBSERVATION", responseId: "chatcmpl_123456789", model: "deepseek-v4-flash", calledAt: "2026-07-30T01:00:00.000Z", requestId: "req-1", inputHash: "abc", schemaValid: true } })) as typeof fetch;
  const provider = new DeepSeekGatewayBuildingAgentProvider(fetcher);
  const analysis = await provider.analyze("1602卫生间潮湿");
  assert.deepEqual(analysis.suggestedTools, validInterpret.proposedTools);
  assert.equal(provider.getCallHistory()[0].responseId, "chatcmpl_123456789");
});

test("health endpoint never exposes the API key and rejects foreign origins", async (t) => {
  const { server } = createGatewayServer({ config: config() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/health`, { headers: { Origin: "http://127.0.0.1:4174" } });
  const text = await health.text();
  assert.equal(health.status, 200);
  assert.doesNotMatch(text, /sk-test-redacted-not-real/);
  assert.deepEqual(JSON.parse(text), { status: "ok", provider: "deepseek", providerConfigured: true, model: "deepseek-v4-flash" });
  const rejected = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(rejected.status, 403);
});

test("gateway only accepts JSON and allowed endpoint tasks", async (t) => {
  const { server } = createGatewayServer({ config: config({ apiKey: "" }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const textRequest = await fetch(`${base}/v1/agent/interpret`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "test" });
  assert.equal(textRequest.status, 415);
  const rejectedTask = await fetch(`${base}/v1/agent/interpret`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "APPROVE_AUTHORIZATION", input: "test" }) });
  assert.equal(rejectedTask.status, 400);
});
