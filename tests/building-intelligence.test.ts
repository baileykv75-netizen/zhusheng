import assert from "node:assert/strict";
import test from "node:test";
import { building1602Dataset, createLocalBuildingAgentTurn, getComponentDetail, getComponentsBehindSurface, getUpstream, resolveQueryVisualDirective, resolveTargetEntity, traceSystem, validateBuildingDataset } from "../lib/building-intelligence/index.ts";

test("1602 building intelligence data is referentially and engineering plausible", () => {
  const report = validateBuildingDataset(building1602Dataset);
  assert.equal(report.valid, true, JSON.stringify(report.errors, null, 2));
});

test("engineering plausibility rejects conduit power paths and reversed drainage", () => {
  const conduitPath = structuredClone(building1602Dataset);
  conduitPath.connections.push({ ...conduitPath.connections.find((item) => item.connectionId === "CONN-EL-01")!, connectionId: "INVALID-CONDUIT-POWER", fromBusinessId: "CONDUIT-1602-LIGHT-01" });
  assert.ok(validateBuildingDataset(conduitPath).errors.some((item) => item.code === "CONDUIT_FUNCTIONAL_PATH"));
  const reversedDrain = structuredClone(building1602Dataset);
  reversedDrain.connections.push({ ...reversedDrain.connections.find((item) => item.connectionId === "CONN-DR-05")!, connectionId: "INVALID-DRAIN-REVERSE", fromBusinessId: "STACK-1602-DRAIN-IF-01", toBusinessId: "DRAIN-1602-FLOOR-01" });
  assert.ok(validateBuildingDataset(reversedDrain).errors.some((item) => item.code === "DRAINAGE_STACK_REVERSED"));
});

test("synthetic engineering records are explicitly classified", () => {
  const synthetic = building1602Dataset.components.filter((item) => item.provenance.sourceClass === "SYNTHETIC_ENGINEERING_RECORD");
  assert.ok(synthetic.length > 8);
  assert.ok(synthetic.every((item) => item.provenance.synthetic && /合成/.test(item.provenance.note)));
});

test("conduit is physical routing and never an electrical functional connection", () => {
  assert.equal(building1602Dataset.connections.some((item) => item.fromBusinessId.startsWith("CONDUIT-") || item.toBusinessId.startsWith("CONDUIT-")), false);
  assert.ok(building1602Dataset.spatialRelations.some((item) => item.predicate === "INSIDE" && item.subjectBusinessId === "CABLE-1602-LIGHT-01" && item.objectBusinessId === "CONDUIT-1602-LIGHT-01"));
});

test("generic behind-surface query works for north and west surfaces", () => {
  const north = getComponentsBehindSurface("WALL-1602-BATHROOM-NORTH");
  const west = getComponentsBehindSurface("WALL-1602-BATHROOM-WEST");
  assert.equal(north.status, "OK");
  assert.ok(north.businessIds.includes("J-1602-CW-03"));
  assert.equal(west.status, "OK");
  assert.ok(west.businessIds.includes("CONDUIT-1602-LIGHT-01"));
});

test("query results expose machine-verifiable fact sources", () => {
  const result = traceSystem("SYS-1602-DRAIN");
  assert.equal(result.status, "OK");
  assert.ok(result.facts.length > 3);
  assert.ok(result.facts.every((fact) => fact.subjectBusinessId && fact.predicate && fact.sourceIds.length && fact.provenance.length));
});

test("local agent answers unseen wording from tool facts and discloses synthetic source", () => {
  const turn = createLocalBuildingAgentTurn("污水离开这个卫生间会经过哪些构件？");
  assert.equal(turn.mode, "LOCAL_READ_ONLY");
  assert.equal(turn.toolTrace[0].tool, "trace_system");
  assert.ok(turn.facts.length > 0);
  assert.ok(turn.sources.some((source) => source.synthetic));
  assert.match(turn.answer, /排水/);
});

test("read-only query can propose but never execute a valve action", () => {
  const turn = createLocalBuildingAgentTurn("把冷水阀关掉");
  assert.deepEqual(turn.proposedAction, { type: "CLOSE_VALVE", authorizationRequired: true });
  assert.equal(JSON.stringify(turn).includes("AUTHORIZED"), false);
});

test("selected component follow-up resolves the component before its parent system", () => {
  const turn = createLocalBuildingAgentTurn("请说明这个构件的已记录信息", "J-1602-CW-03");
  assert.equal(turn.toolTrace[0].tool, "get_component_detail");
  assert.match(turn.answer, /重点冷水接头/);
});

for (const [label, terminalId] of [["Basin", "FIXTURE-1602-BASIN-01"], ["WC", "FIXTURE-1602-WC-01"], ["Shower", "FIXTURE-1602-SHOWER-01"]] as const) {
  test(`${label} cold-water terminal traces through functional connections to the meter`, () => {
    const upstream = getUpstream(terminalId);
    assert.equal(upstream.status, "OK");
    assert.ok(upstream.businessIds.includes("METER-1602-FLOW-01"));
    assert.ok(upstream.businessIds.includes("TEE-1602-CW-01"));
    assert.ok(upstream.facts.some((fact) => fact.predicate === "FLUID_FLOW" && fact.value === terminalId));
  });
}

test("mirror light has independent functional connectivity and physical cable routing facts", () => {
  const lighting = traceSystem("SYS-1602-EL-LIGHT");
  assert.ok(lighting.businessIds.includes("LIGHT-1602-MIRROR-01"));
  assert.ok(lighting.facts.some((fact) => fact.predicate === "ELECTRICAL_POWER" && fact.value === "LIGHT-1602-MIRROR-01"));
  assert.ok(lighting.facts.some((fact) => fact.predicate === "INSIDE" && fact.subjectBusinessId === "CABLE-1602-LIGHT-01" && fact.value === "CONDUIT-1602-LIGHT-01"));
  assert.equal(lighting.facts.some((fact) => fact.predicate === "ELECTRICAL_POWER" && (fact.subjectBusinessId.startsWith("CONDUIT-") || String(fact.value).startsWith("CONDUIT-"))), false);
});

test("target entity resolution distinguishes resolved, missing and ambiguous mentions", () => {
  assert.deepEqual(resolveTargetEntity("镜前灯的电从哪里来？")?.businessIds, ["LIGHT-1602-MIRROR-01"]);
  assert.equal(resolveTargetEntity("浴霸灯的电从哪里来？")?.status, "NOT_FOUND");
  const ambiguous = resolveTargetEntity("灯具的线路怎么走？");
  assert.equal(ambiguous?.status, "AMBIGUOUS");
  assert.deepEqual(new Set(ambiguous?.businessIds), new Set(["LIGHT-1602-CEILING-01", "LIGHT-1602-MIRROR-01"]));
});

test("missing and ambiguous targets clarify without borrowing nearby system facts", () => {
  const missing = createLocalBuildingAgentTurn("浴霸灯的电从哪里来？");
  assert.equal(missing.mode, "LIVE_AI_CLARIFICATION");
  assert.equal(missing.toolTrace.length, 0);
  assert.doesNotMatch(missing.clarificationQuestion ?? "", /顶灯属于|照明回路供电/);
  const ambiguous = createLocalBuildingAgentTurn("灯具的线路怎么走？");
  assert.equal(ambiguous.mode, "LIVE_AI_CLARIFICATION");
  assert.match(ambiguous.clarificationQuestion ?? "", /多个已记录对象/);
});

test("visual intent resolver preserves XRAY and SYSTEM_TRACE over later detail calls", () => {
  const xray = { tool: "get_components_behind_surface" as const, arguments: { surfaceBusinessId: "WALL-1602-BATHROOM-NORTH" }, result: getComponentsBehindSurface("WALL-1602-BATHROOM-NORTH") };
  const detail = { tool: "get_component_detail" as const, arguments: { businessId: "J-1602-CW-03" }, result: getComponentDetail("J-1602-CW-03") };
  const xrayVisual = resolveQueryVisualDirective([xray, detail]);
  assert.equal(xrayVisual?.mode, "XRAY");
  assert.deepEqual(xrayVisual?.targetBusinessIds, ["WALL-1602-BATHROOM-NORTH"]);
  assert.ok(xrayVisual?.revealBusinessIds.includes("J-1602-CW-03"));
  const trace = { tool: "get_upstream" as const, arguments: { businessId: "FIXTURE-1602-BASIN-01" }, result: getUpstream("FIXTURE-1602-BASIN-01") };
  const traceVisual = resolveQueryVisualDirective([trace, detail]);
  assert.equal(traceVisual?.mode, "SYSTEM_TRACE");
  assert.ok(traceVisual?.revealBusinessIds.includes("METER-1602-FLOW-01"));
  assert.ok(traceVisual?.revealBusinessIds.includes("FIXTURE-1602-BASIN-01"));
});
