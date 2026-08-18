import assert from "node:assert/strict";
import test from "node:test";
import { deriveEngineeringReasoning } from "../lib/building-intelligence/engineering-reasoning.ts";
import type { BuildingFact } from "../lib/building-intelligence/types.ts";

const drainFacts: BuildingFact[] = [
  {
    factId: "FIXTURE-1602-BASIN-01:systemId",
    subjectBusinessId: "FIXTURE-1602-BASIN-01",
    predicate: "systemId",
    value: "SYS-1602-DRAIN",
    sourceIds: ["SRC-BUILDING-MEMORY-SEED"],
    provenance: ["EXISTING_BUILDING_MEMORY"]
  },
  {
    factId: "DRAIN-1602-FLOOR-01:systemId",
    subjectBusinessId: "DRAIN-1602-FLOOR-01",
    predicate: "systemId",
    value: "SYS-1602-DRAIN",
    sourceIds: ["SRC-BUILDING-MEMORY-SEED"],
    provenance: ["EXISTING_BUILDING_MEMORY"]
  }
];

test("odor question separates confirmed building facts from engineering hypotheses", () => {
  const reasoning = deriveEngineeringReasoning("卫生间有臭味可能是什么原因？", drainFacts);
  assert.ok(reasoning);
  assert.equal(reasoning.kind, "DRAINAGE_ODOR");
  assert.equal(reasoning.confirmedFactIds.length, 2);
  assert.ok(reasoning.hypotheses.length >= 3);
  assert.match(reasoning.summary, /不能仅凭现有建筑记录确定臭味来源/);
  assert.match(reasoning.summary, /待验证假设/);
  assert.match(reasoning.boundary, /不会写回建筑事实/);
  assert.match(reasoning.nextStep, /水封/);
});

test("engineering hypotheses are not added to ordinary fact queries", () => {
  assert.equal(deriveEngineeringReasoning("北墙后面有哪些构件？", drainFacts), null);
});

test("odor reasoning remains explicit when drainage facts are still insufficient", () => {
  const reasoning = deriveEngineeringReasoning("这里返味是怎么回事？", []);
  assert.ok(reasoning);
  assert.equal(reasoning.confirmedFactIds.length, 0);
  assert.match(reasoning.confirmedSummary, /还不足以确认/);
  assert.match(reasoning.summary, /不是 1602 已确认故障/);
});
