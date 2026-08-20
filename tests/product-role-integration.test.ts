import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerUrl = new URL("../app/worker/page.tsx", import.meta.url);
const residentUrl = new URL("../components/ResidentService.tsx", import.meta.url);
const journeyUrl = new URL("../components/lifecycle-journey-provider.tsx", import.meta.url);
const eventsUrl = new URL("../components/BuildingEventCenter.tsx", import.meta.url);
const eventModelUrl = new URL("../lib/product/building-life-events.ts", import.meta.url);
const groupUrl = new URL("../app/group/page.tsx", import.meta.url);

test("worker completion explicitly continues into Building Memory instead of ending as an isolated demo", async () => {
  const source = await readFile(workerUrl, "utf8");

  assert.match(source, /BUILDING MEMORY \/ 建造阶段/);
  assert.match(source, /后续用途/);
  assert.match(source, /隐蔽查询 · 维修定位 · 异常诊断 · 经验治理/);
  assert.match(source, /href="\/memory\?record=EV-2848"/);
  assert.match(source, /查看这条建筑记忆/);
});

test("resident evidence is immutable source evidence and does not auto-run diagnosis", async () => {
  const [resident, journey] = await Promise.all([readFile(residentUrl, "utf8"), readFile(journeyUrl, "utf8")]);

  assert.match(resident, /你的现场观察进入同一事件/);
  assert.match(resident, /提交后先形成住户原始证据，不会立刻产生故障判断/);
  assert.match(resident, /物业只能追加独立复核，不能覆盖你的原始提交/);
  assert.match(resident, /等待物业确认本轮系统观测/);
  assert.match(resident, /数据与隐私说明/);
  assert.match(journey, /尚未运行故障判断。下一步由物业确认本轮系统观测/);
  assert.match(journey, /const eventId = session\.result\?\.eventId \?\? pendingEventId\(session\.eventCounter\)/);
});

test("resident evidence collection does not expose water-meter questioning as a preset first-screen step", async () => {
  const source = await readFile(residentUrl, "utf8");

  assert.match(source, /提交初步情况，让筑生决定还缺什么/);
  assert.match(source, /intakeStage === "OBSERVATION"/);
  assert.match(source, /intakeStage === "FOLLOW_UP"/);
  assert.match(source, /derive1602ResidentFollowUp/);
  assert.match(source, /不是预设故障答案/);
  assert.match(source, /不继续要求水表观察/);
  assert.match(source, /不会因为处于卫生间就自动假定为漏水/);
});

test("event center shows only current-session event locations and keeps examples out of active metrics", async () => {
  const source = await readFile(eventsUrl, "utf8");

  assert.doesNotMatch(source, /Array\.from\(\{ length: 18 \}/);
  assert.doesNotMatch(source, /暂无事件/);
  assert.match(source, /只显示当前会话已经存在的事件或待接入事实/);
  assert.match(source, /不含结构示例/);
  assert.match(source, /没有活动事件时，这里保持为空/);
  assert.match(source, /buildingLifeEventExamples/);
  assert.match(source, /不参与上方任何统计或任务队列/);
  assert.match(source, /pending1602Evidence/);
});

test("1602 is not manufactured as an active event before resident evidence exists", async () => {
  const source = await readFile(eventModelUrl, "utf8");

  assert.match(source, /pending1602Evidence = false/);
  assert.match(source, /: pending1602Evidence/);
  assert.match(source, /1602卫生间现场事实待评估/);
  assert.match(source, /return deepEvent \? \[deepEvent\] : \[\]/);
  assert.match(source, /buildingLifeEventExamples/);
  assert.match(source, /ID 统一使用 EXAMPLE|EXAMPLE-1203/);
  assert.match(source, /按当前事实补充下一项必要证据/);
  assert.doesNotMatch(source, /state \? displayState\[state\] : displayState\.DETECTED/);
  assert.doesNotMatch(source, /DETECTED: \{[^\n]*北侧墙角/);
  assert.doesNotMatch(source, /COLLECTING_EVIDENCE: \{[^\n]*确认水表观察/);
});

test("group governance no longer uses fabricated scale counters as the primary story", async () => {
  const source = await readFile(groupUrl, "utf8");

  assert.doesNotMatch(source, /learning-constellation/);
  assert.doesNotMatch(source, /相似演示事件/);
  assert.doesNotMatch(source, /演示项目/);
  assert.doesNotMatch(source, /演示建筑/);
  assert.match(source, /单事件经验候选/);
  assert.match(source, /证据覆盖与缺口/);
  assert.match(source, /PILOT_ONLY 或退回/);
  assert.match(source, /单事件 ≠ 企业标准/);
});

test("group task mode cannot manufacture a resolved source when the current event is unfinished", async () => {
  const source = await readFile(groupUrl, "utf8");

  assert.match(source, /currentResolved = currentPackage\?\.finalState === "RESOLVED"/);
  assert.match(source, /当前事件还没有资格进入经验治理/);
  assert.match(source, /这里不会用预制结果替代真实闭环/);
  assert.match(source, /mode === "task" && !currentResolved \? null : <GroupLearningWorkbench/);
  assert.match(source, /示例 ≠ 当前事件/);
});
