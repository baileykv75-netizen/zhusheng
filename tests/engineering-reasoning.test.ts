import assert from "node:assert/strict";
import test from "node:test";
import { deriveEngineeringReasoning } from "../lib/building-intelligence/engineering-reasoning.ts";
import { getConstructionHistory, getInspectionHistory } from "../lib/building-intelligence/queries.ts";

function memoryFacts(...businessIds: string[]) {
  return businessIds.flatMap((businessId) => [
    ...getConstructionHistory(businessId).facts,
    ...getInspectionHistory(businessId).facts
  ]);
}

const drainMemoryFacts = memoryFacts("SYS-1602-DRAIN");
const dampMemoryFacts = memoryFacts("SYS-1602-CW", "WP-1602-BATHROOM");
const lightingMemoryFacts = memoryFacts("SYS-1602-EL-LIGHT");

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
  assert.match(reasoning.hypotheses[0].evidence ?? "", /排水偏置段通水复核/);
  assert.match(reasoning.hypotheses[0].evidence ?? "", /未单独覆盖/);
  assert.match(reasoning.hypotheses[1].title, /坐便器排水密封接口/);
  assert.match(reasoning.hypotheses[1].evidence ?? "", /坐便器返工后冲水验收/);
  assert.match(reasoning.hypotheses[1].evidence ?? "", /气密/);
  assert.doesNotMatch(reasoning.hypotheses[1].evidence ?? "", /排水偏置段通水复核/);
  assert.match(reasoning.summary, /不从通用返味原因随机排查/);
  assert.match(reasoning.nextStep, /DRAIN-1602-FLOOR-01/);
  assert.match(reasoning.boundary, /不能直接证明今天的现象/);
});

test("dampness question ranks the reworked cold-water joint and waterproof node from 1602 history", () => {
  const reasoning = deriveEngineeringReasoning("卫生间墙脚潮湿可能是什么原因？", dampMemoryFacts);
  assert.ok(reasoning);
  assert.equal(reasoning.kind, "DAMPNESS");
  assert.equal(reasoning.memoryBased, true);
  assert.deepEqual(reasoning.memoryRecordIds, ["REC-CONST-CW-J03-REWORK-01", "REC-CONST-WP-DRAIN-01"]);
  assert.match(reasoning.hypotheses[0].title, /重点冷水接头/);
  assert.match(reasoning.hypotheses[0].evidence ?? "", /剪除重做/);
  assert.match(reasoning.hypotheses[0].evidence ?? "", /冷水支路保压检查/);
  assert.match(reasoning.hypotheses[1].title, /地漏防水收口/);
  assert.match(reasoning.hypotheses[1].evidence ?? "", /二次蓄水复核/);
  assert.match(reasoning.nextStep, /微流量/);
});

test("lighting question uses the mirror-light outlet relocation memory without inventing a hidden splice", () => {
  const reasoning = deriveEngineeringReasoning("镜前灯偶尔闪烁可能是什么原因？", lightingMemoryFacts);
  assert.ok(reasoning);
  assert.equal(reasoning.kind, "LIGHTING_FAULT");
  assert.equal(reasoning.memoryBased, true);
  assert.deepEqual(reasoning.memoryRecordIds, ["REC-CONST-EL-MIRROR-BOX-01"]);
  assert.match(reasoning.hypotheses[0].evidence ?? "", /上移约60 mm/);
  assert.match(reasoning.hypotheses[0].mechanism, /电缆连续无隐蔽中间接头/);
  assert.match(reasoning.nextStep, /端子/);
});

test("slow-drain question prefers the known floor-drain offset before generic blockage guesses", () => {
  const reasoning = deriveEngineeringReasoning("淋浴区最近下水慢，先查哪里？", drainMemoryFacts);
  assert.ok(reasoning);
  assert.equal(reasoning.kind, "SLOW_DRAIN");
  assert.equal(reasoning.memoryBased, true);
  assert.equal(reasoning.hypotheses[0].sourceRecordId, "REC-CONST-DRAIN-OFFSET-01");
  assert.match(reasoning.hypotheses[0].evidence ?? "", /两只45°弯头/);
  assert.match(reasoning.nextStep, /偏置段/);
});

test("engineering memory is not added to ordinary fact queries", () => {
  assert.equal(deriveEngineeringReasoning("北墙后面有哪些构件？", drainMemoryFacts), null);
});

test("diagnostic reasoning falls back explicitly when building memory was not queried", () => {
  const reasoning = deriveEngineeringReasoning("这里返味是怎么回事？", []);
  assert.ok(reasoning);
  assert.equal(reasoning.memoryBased, false);
  assert.equal(reasoning.memoryRecordIds.length, 0);
  assert.match(reasoning.confirmedSummary, /还不足以把返味定位/);
  assert.match(reasoning.summary, /一般工程机理/);
});
