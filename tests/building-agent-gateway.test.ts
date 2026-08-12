import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { DeepSeekGatewayBuildingAgentProvider } from "../lib/building-agent/providers/deepseek-gateway.ts";
import { loadGatewayConfig } from "../tools/building-agent-gateway/config.ts";
import { DeepSeekChatProvider, GatewayProviderError } from "../tools/building-agent-gateway/deepseek-provider.ts";
import { validateBuildingAnswerDraft, validateExplainOutput, validateInterpretOutput } from "../tools/building-agent-gateway/schemas.ts";
import { verifyGroundedClaims } from "../tools/building-agent-gateway/grounding.ts";
import { getComponentDetail, getMaintenanceHistory } from "../lib/building-intelligence/queries.ts";
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
  return { apiKey: "sk-test-redacted-not-real", model: "deepseek-v4-flash", host: "127.0.0.1", port: 4180, allowedOrigins: ["http://127.0.0.1:4174"], timeoutMs: 100, maxInputChars: 4000, maxOutputTokens: 1200, ...overrides };
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
    const body = JSON.parse(String(init?.body)) as { tools?: Array<{ function: { name: string } }>; messages?: Array<{ role: string }>; thinking?: { type: string } };
    assert.ok(body.tools?.some((item) => item.function.name === "get_components_behind_surface"));
    assert.equal(body.thinking?.type, "disabled");
    return calls === 1
      ? deepSeekToolResponse("get_components_behind_surface", { surfaceBusinessId: "WALL-1602-BATHROOM-NORTH" })
      : deepSeekResponse(groundedNorthWall);
  }) as typeof fetch });
  const output = await provider.queryBuilding("北墙后面有什么？", null);
  assert.equal(output.result.mode, "LIVE_AI");
  assert.equal(output.result.toolTrace[0].tool, "get_components_behind_surface");
  assert.ok(output.result.facts.every((fact) => fact.sourceIds.length > 0));
  assert.equal(output.result.answer, "J-1602-CW-03 位于 WALL-1602-BATHROOM-NORTH 后方。");
  assert.deepEqual(output.result.usedFactIds, ["REL-002"]);
  assert.equal(output.metadata.toolCalls, 1);
});

test("building answer schema enforces mutually exclusive claims and clarification", () => {
  assert.deepEqual(validateBuildingAnswerDraft(groundedNorthWall), groundedNorthWall);
  assert.deepEqual(validateBuildingAnswerDraft({ clarification: { question: "你指的是哪一个接头？" } }), { clarification: { question: "你指的是哪一个接头？" } });
  assert.throws(() => validateBuildingAnswerDraft({ answer: "绕过claims" }), /只能包含claims或clarification/);
  assert.throws(() => validateBuildingAnswerDraft({ claims: [], clarification: { question: "哪个？" } }), /只能包含claims或clarification/);
  assert.throws(() => validateBuildingAnswerDraft({ claims: [{ text: "缺少factIds" }] }), /字段不完整/);
});

test("grounding rejects forged fact ids and unsupported normalized values", () => {
  const fact: BuildingFact = { factId: "REL-002", subjectBusinessId: "J-1602-CW-03", predicate: "BEHIND", value: "WALL-1602-BATHROOM-NORTH", sourceIds: ["SRC-BUILDING-SPEC-V6"], provenance: ["BUILDING_SPEC_DERIVED"] };
  assert.doesNotThrow(() => verifyGroundedClaims([{ text: "冷水接头位于北墙后方", factIds: ["REL-002"] }], [fact]));
  assert.throws(() => verifyGroundedClaims([{ text: "冷水接头位于北墙后方", factIds: ["REL-FORGED"] }], [fact]), /未产生的Fact ID/);
  assert.throws(() => verifyGroundedClaims([{ text: "J-1602-CW-03 是 DN25 金属接头", factIds: ["REL-002"] }], [fact]), /新事实值/);
  assert.throws(() => verifyGroundedClaims([{ text: "北墙后面有什么？", factIds: ["REL-002"] }], [fact], "北墙后面有什么？"), /疑问句或原问题复述/);
  const dated = { ...fact, factId: "REC-1", predicate: "inspectionRecord", value: "2025-03-19T14:10:00+08:00｜保压检查｜结果合格" };
  assert.doesNotThrow(() => verifyGroundedClaims([{ text: "检查日期为 2025年3月19日", factIds: ["REC-1"] }], [dated]));
  assert.throws(() => verifyGroundedClaims([{ text: "检查日期为 2026年3月19日", factIds: ["REC-1"] }], [dated]), /日期/);
});

test("NOT_RECORDED is a source-backed fact and supports an honest missing answer", () => {
  const detail = getComponentDetail("J-1602-CW-03");
  const brand = detail.facts.find((fact) => fact.factId.includes("component.brand"));
  assert.ok(brand);
  assert.equal(brand.predicate, "NOT_RECORDED");
  assert.deepEqual(brand.sourceIds, ["SRC-BUILDING-MEMORY-SEED"]);
  assert.doesNotThrow(() => verifyGroundedClaims([{ text: "当前建筑记忆未记录 J-1602-CW-03 的品牌", factIds: [brand.factId] }], detail.facts));
  const missingMaintenance = getMaintenanceHistory("J-1602-CW-03");
  assert.equal(missingMaintenance.status, "NOT_RECORDED");
  assert.ok(missingMaintenance.facts[0].sourceIds.length > 0);
});

test("no-tool clarification has its own mode and factual no-tool output is never LIVE_AI", async () => {
  const clarification = new DeepSeekChatProvider(config(), { fetcher: (async () => deepSeekResponse({ clarification: { question: "你指的是哪个构件？" } })) as typeof fetch });
  const clarified = await clarification.queryBuilding("这个怎么样？", null);
  assert.equal(clarified.result.mode, "LIVE_AI_CLARIFICATION");
  assert.equal(clarified.result.answer, "");
  assert.equal(clarified.result.clarificationQuestion, "你指的是哪个构件？");
  let calls = 0;
  const factual = new DeepSeekChatProvider(config(), { fetcher: (async (_url, init) => { calls += 1; const body = JSON.parse(String(init?.body)); if (calls === 2) assert.equal(body.tool_choice, "required"); return deepSeekResponse({ claims: [{ text: "猜测", factIds: ["FAKE"] }] }); }) as typeof fetch });
  await assert.rejects(() => factual.queryBuilding("重点接头是什么品牌？", "J-1602-CW-03"), (error: unknown) => error instanceof GatewayProviderError && error.type === "MODEL_TOOL_REQUIRED");
  assert.equal(calls, 2);
});

test("one bounded repair may rewrite rejected claims using only available facts", async () => {
  let calls = 0;
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async () => {
    calls += 1;
    if (calls === 1) return deepSeekToolResponse("get_components_behind_surface", { surfaceBusinessId: "WALL-1602-BATHROOM-NORTH" });
    if (calls === 2) return deepSeekResponse({ claims: [{ text: "J-1602-CW-03 是 DN25 接头", factIds: ["REL-002"] }] });
    return deepSeekResponse(groundedNorthWall);
  }) as typeof fetch });
  const output = await provider.queryBuilding("北墙后面有什么？", null);
  assert.equal(output.result.mode, "LIVE_AI");
  assert.equal(calls, 3);
});

test("a second grounding failure is rejected and can never become LIVE_AI", async () => {
  let calls = 0;
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async () => {
    calls += 1;
    if (calls === 1) return deepSeekToolResponse("get_components_behind_surface", { surfaceBusinessId: "WALL-1602-BATHROOM-NORTH" });
    return deepSeekResponse({ claims: [{ text: "J-1602-CW-03 是 DN25 接头", factIds: ["REL-002"] }] });
  }) as typeof fetch });
  await assert.rejects(() => provider.queryBuilding("北墙后面有什么？", null), (error: unknown) => error instanceof GatewayProviderError && error.type === "GROUNDING_REJECTED");
  assert.equal(calls, 3);
});

test("gateway failure preserves the deterministic LOCAL_READ_ONLY fallback", async () => {
  const turn = await queryBuildingAgent("北墙后面有哪些构件？", null, (async () => { throw new Error("offline"); }) as typeof fetch);
  assert.equal(turn.mode, "LOCAL_READ_ONLY");
  assert.equal(turn.toolTrace[0].tool, "get_components_behind_surface");
});

test("multi-tool synthesis grounds every claim in facts from actual tools", async () => {
  let calls = 0;
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async () => {
    calls += 1;
    if (calls === 1) return deepSeekToolResponse("get_construction_history", { businessId: "J-1602-CW-03" }, "call_build");
    if (calls === 2) return deepSeekToolResponse("get_inspection_history", { businessId: "J-1602-CW-03" }, "call_check");
    return deepSeekResponse({ claims: [
      { text: "重点冷水接头有施工留痕", factIds: ["REC-CONSTRUCTION-J03"] },
      { text: "施工期检查结果合格", factIds: ["REC-INSPECTION-CW"] }
    ] });
  }) as typeof fetch });
  const output = await provider.queryBuilding("这个接头封闭前做过什么施工和检查？", "J-1602-CW-03");
  assert.equal(output.result.mode, "LIVE_AI");
  assert.equal(output.result.toolTrace.length, 2);
  assert.deepEqual(output.result.usedFactIds, ["REC-CONSTRUCTION-J03", "REC-INSPECTION-CW"]);
});

test("tool calls beyond the eight-call budget receive protocol-safe rejection messages", async () => {
  let calls = 0;
  const provider = new DeepSeekChatProvider(config(), { fetcher: (async (_url, init) => {
    calls += 1;
    if (calls === 1) return deepSeekManyToolResponse(Array.from({ length: 9 }, (_, index) => ({ name: "get_component_detail", args: { businessId: "J-1602-CW-03" }, id: `call_${index}` })));
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; tool_call_id?: string; content?: string }> };
    const rejected = body.messages.find((item) => item.tool_call_id === "call_3");
    assert.match(rejected?.content ?? "", /TOOL_CALL_LIMIT/);
    return deepSeekResponse({ claims: [{ text: "已定位 J-1602-CW-03", factIds: ["J-1602-CW-03:displayName"] }] });
  }) as typeof fetch });
  const output = await provider.queryBuilding("说明重点冷水接头", "J-1602-CW-03");
  assert.equal(output.result.mode, "LIVE_AI");
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
