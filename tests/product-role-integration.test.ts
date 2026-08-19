import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerUrl = new URL("../app/worker/page.tsx", import.meta.url);
const residentUrl = new URL("../components/ResidentService.tsx", import.meta.url);
const eventsUrl = new URL("../components/BuildingEventCenter.tsx", import.meta.url);
const groupUrl = new URL("../app/group/page.tsx", import.meta.url);

test("worker completion explicitly continues into Building Memory instead of ending as an isolated demo", async () => {
  const source = await readFile(workerUrl, "utf8");

  assert.match(source, /BUILDING MEMORY \/ 建造阶段/);
  assert.match(source, /后续用途/);
  assert.match(source, /隐蔽查询 · 维修定位 · 异常诊断 · 经验治理/);
  assert.match(source, /href="\/memory\?record=EV-2848"/);
  assert.match(source, /查看这条建筑记忆/);
});

test("resident evidence is framed as immutable source evidence inside EVT-1602", async () => {
  const source = await readFile(residentUrl, "utf8");

  assert.match(source, /你的现场观察进入同一事件/);
  assert.match(source, /提交后会形成 EVT-1602 的住户原始证据/);
  assert.match(source, /物业只能追加独立复核，不能覆盖你的原始提交/);
  assert.match(source, /数据与隐私说明/);
});

test("event center shows only actual event locations instead of eighteen mostly empty floors", async () => {
  const source = await readFile(eventsUrl, "utf8");

  assert.doesNotMatch(source, /Array\.from\(\{ length: 18 \}/);
  assert.doesNotMatch(source, /暂无事件/);
  assert.match(source, /当前有事件的空间|只显示当前有事件的楼层与空间/);
  assert.match(source, /完整深度事件/);
  assert.match(source, /专业处置在对应深度事件中展开/);
});

test("group governance no longer uses fabricated scale counters as the primary story", async () => {
  const source = await readFile(groupUrl, "utf8");

  assert.doesNotMatch(source, /learning-constellation/);
  assert.doesNotMatch(source, /相似演示事件/);
  assert.doesNotMatch(source, /演示项目/);
  assert.doesNotMatch(source, /演示建筑/);
  assert.match(source, /EVT-1602/);
  assert.match(source, /单事件经验候选/);
  assert.match(source, /证据覆盖与缺口/);
  assert.match(source, /PILOT_ONLY 或退回/);
  assert.match(source, /单事件 ≠ 企业标准/);
});
