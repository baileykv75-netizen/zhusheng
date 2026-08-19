import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../components/Case1602Exhibit.tsx", import.meta.url);

test("1602 showcase reads from the same product view model as property operations", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /derivePropertyEventViewModel/);
  assert.match(source, /useBuildingProductContext/);
  assert.match(source, /product\.queryVisual/);
  assert.doesNotMatch(source, /useState<BuildingAgentTurnResult/);
  assert.doesNotMatch(source, /BuildingIntelligenceWorkspace/);
});

test("1602 showcase uses four inspectable time stages instead of five feature-demo chapters", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const stageOrder: StoryStageId\[\] = \["past", "present", "action", "result"\]/);
  assert.match(source, /过去 \/ 建造记忆/);
  assert.match(source, /此刻 \/ 当前事件/);
  assert.match(source, /处置 \/ 人工门禁/);
  assert.match(source, /结果 \/ 验证与留下经验/);
  assert.match(source, /工作流后续阶段/);
});

test("past-stage showcase opens the same building-memory record used by operations", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /打开完整建筑记忆/);
  assert.match(source, /\/memory\?record=REC-CONST-CW-J03-REWORK-01/);
});

test("evidence timeline remains available as proof without dominating the default case narrative", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /<details className=\{styles\.evidenceDetails\}>/);
  assert.match(source, /<EvidenceTimeChain \/>/);
  assert.match(source, /模型不批准授权/);
});
