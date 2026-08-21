import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLocalBuildingAgentTurn, isCurrentObservationQuery } from "../lib/building-intelligence/agent.ts";
import { building1602Dataset } from "../lib/building-intelligence/catalog.ts";
import { deriveEngineeringReasoning } from "../lib/building-intelligence/engineering-reasoning.ts";
import { getCurrentObservations } from "../lib/building-intelligence/queries.ts";
import { DeepSeekChatProvider } from "../tools/building-agent-gateway/deepseek-provider.ts";
import { queryBuildingWithObservationBoundary } from "../tools/building-agent-gateway/server.ts";

test("building memory may contain historical observations but current query exposes no live observation source", () => {
  const subjectId = "SPACE-1602-BATHROOM";
  const historical = building1602Dataset.records.filter(
    (record) => record.recordType === "OBSERVATION" && record.subjectBusinessIds.includes(subjectId)
  );
  assert.ok(historical.length >= 1);

  const current = getCurrentObservations(subjectId);
  assert.equal(current.status, "NOT_RECORDED");
  assert.deepEqual(current.data, {
    historicalObservationCount: historical.length,
    liveObservationConnected: false
  });
  assert.ok(current.facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE"));
  assert.equal(current.facts.some((fact) => fact.predicate === "observationRecord"), false);

  const historicalIds = new Set(historical.map((record) => record.recordId));
  assert.equal(current.facts.some((fact) => historicalIds.has(fact.factId)), false);
  const boundary = current.facts.find((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE");
  assert.ok(boundary);
  assert.match(String(boundary.value), /历史OBSERVATION记录.*不能作为当前读数或当前运行状态/);
});

test("Ask Building cannot answer a current humidity question from historical observation memory", () => {
  const turn = createLocalBuildingAgentTurn("1602卫生间现在湿度多少？");
  assert.equal(turn.toolTrace[0].tool, "get_current_observations");
  assert.equal(turn.toolTrace[0].status, "NOT_RECORDED");
  assert.match(turn.answer, /没有连接实时传感器或 BMS 数据源/);
  assert.match(turn.answer, /历史观察记录.*不能当作当前读数/);
  assert.ok(turn.facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE"));
  assert.equal(turn.facts.some((fact) => fact.factId === "REC-OBS-HUM-BASELINE-01"), false);
});

test("current microflow is also routed to the authoritative no-live-source boundary", () => {
  const turn = createLocalBuildingAgentTurn("1602卫生间当前微流量多少？");
  assert.equal(turn.toolTrace[0].tool, "get_current_observations");
  assert.equal(turn.toolTrace[0].status, "NOT_RECORDED");
  assert.ok(turn.facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE"));
  assert.equal(deriveEngineeringReasoning(turn.question, turn.facts), null);
});

test("current abnormal reading questions cannot append historical diagnostic memory", () => {
  const turn = createLocalBuildingAgentTurn("1602卫生间现在微流量异常吗？");
  assert.deepEqual(turn.toolTrace.map((item) => item.tool), ["get_current_observations"]);
  assert.match(turn.answer, /没有连接实时传感器或 BMS 数据源/);
  assert.equal(
    turn.facts.some((fact) => ["constructionRecord", "inspectionRecord", "maintenanceRecord"].includes(fact.predicate)),
    false
  );
  assert.equal(deriveEngineeringReasoning(turn.question, turn.facts), null);
});

test("current wording does not hijack structural system queries", () => {
  assert.equal(isCurrentObservationQuery("冷水系统当前有哪些构件？"), false);
  const turn = createLocalBuildingAgentTurn("冷水系统当前有哪些构件？");
  assert.equal(turn.toolTrace[0].tool, "trace_system");
});

test("public gateway short-circuits current readings before DeepSeek can choose a static topology tool", async () => {
  let upstreamCalled = false;
  const provider = {
    async queryBuilding() {
      upstreamCalled = true;
      throw new Error("DeepSeek should not be called for authoritative current-observation boundary");
    }
  } as unknown as DeepSeekChatProvider;

  const output = await queryBuildingWithObservationBoundary(provider, "1602卫生间现在湿度多少？", null, randomUUID());
  assert.equal(upstreamCalled, false);
  assert.equal(output.result.mode, "LOCAL_READ_ONLY");
  assert.equal(output.result.toolTrace[0].tool, "get_current_observations");
  assert.equal(output.result.toolTrace[0].status, "NOT_RECORDED");
  assert.ok(output.result.facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE"));
});

test("gateway still delegates ordinary structural questions to DeepSeek", async () => {
  let upstreamCalled = false;
  const provider = {
    async queryBuilding() {
      upstreamCalled = true;
      throw new Error("UPSTREAM_CALLED");
    }
  } as unknown as DeepSeekChatProvider;

  await assert.rejects(
    () => queryBuildingWithObservationBoundary(provider, "冷水系统当前有哪些构件？", null, randomUUID()),
    /UPSTREAM_CALLED/
  );
  assert.equal(upstreamCalled, true);
});
