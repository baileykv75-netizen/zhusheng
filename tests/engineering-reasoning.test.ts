import assert from "node:assert/strict";
import test from "node:test";
import { deriveEngineeringReasoning } from "../lib/building-intelligence/engineering-reasoning.ts";
import { getConstructionHistory, getInspectionHistory } from "../lib/building-intelligence/queries.ts";

const drainMemoryFacts = [
  ...getConstructionHistory("SYS-1602-DRAIN").facts,
  ...getInspectionHistory("SYS-1602-DRAIN").facts
];

test("odor question prioritizes this bathroom's queried construction memory", () => {
  const reasoning = deriveEngineeringReasoning("卫生间有臭味可能是什么原因？", drainMemoryFacts);
  assert.ok(reasoning);
  assert.equal(reasoning.kind, "DRAINAGE_ODOR");
  assert.equal(reasoning.memoryBased, true);
  assert.deepEqual(reasoning.memoryRecordIds, ["REC-CONST-DRAIN-OFFSET-01", "REC-CONST-WC-REWORK-01"]);
  assert.equal(reasoning.hypotheses[0].sourceRecordId, "REC-CONST-DRAIN-OFFSET-01");
  assert.equal(reasoning.hypotheses[1].sourceRecordId, "REC-CONST-WC-REWORK-01");
  assert.match(reasoning.hypotheses[0].title, /地漏排水偏置段/);
  assert.match(reasoning.hypotheses[0].evidence ?? "", /90 mm/);
  assert.match(reasoning.hypotheses[0].evidence ?? "", /未单独覆盖/);
  assert.match(reasoning.hypotheses[1].title, /坐便器排水密封接口/);
  assert.match(reasoning.summary, /不从通用原因随机排查/);
  assert.match(reasoning.nextStep, /DRAIN-1602-FLOOR-01/);
  assert.match(reasoning.boundary, /不能直接证明今天的臭味/);
});

test("engineering memory is not added to ordinary fact queries", () => {
  assert.equal(deriveEngineeringReasoning("北墙后面有哪些构件？", drainMemoryFacts), null);
});

test("odor reasoning falls back explicitly when diagnostic memory was not queried", () => {
  const reasoning = deriveEngineeringReasoning("这里返味是怎么回事？", []);
  assert.ok(reasoning);
  assert.equal(reasoning.memoryBased, false);
  assert.equal(reasoning.memoryRecordIds.length, 0);
  assert.match(reasoning.confirmedSummary, /还不足以确认/);
  assert.match(reasoning.summary, /一般工程机理/);
});
