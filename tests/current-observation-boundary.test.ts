import assert from "node:assert/strict";
import test from "node:test";
import { createLocalBuildingAgentTurn } from "../lib/building-intelligence/agent.ts";
import { building1602Dataset } from "../lib/building-intelligence/catalog.ts";
import { getCurrentObservations } from "../lib/building-intelligence/queries.ts";

test("static lifecycle memory contains historical observations but no live observation source", () => {
  const historical = building1602Dataset.records.filter((record) => record.recordType === "OBSERVATION");
  assert.ok(historical.length >= 3);
  assert.ok(historical.every((record) => Date.parse(record.occurredAt) < Date.parse("2026-01-01T00:00:00Z")));
  assert.ok(historical.every((record) => record.provenance.sourceClass === "SYNTHETIC_ENGINEERING_RECORD"));

  const current = getCurrentObservations("SPACE-1602-BATHROOM");
  assert.equal(current.status, "NOT_RECORDED");
  assert.ok(current.facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE"));
  assert.equal(current.facts.some((fact) => fact.predicate === "observationRecord"), false);
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
