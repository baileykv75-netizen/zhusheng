import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const propertyPage = new URL("../app/property/page.tsx", import.meta.url);
const propertyWorkspace = new URL("../components/property/PropertyEventWorkspace.tsx", import.meta.url);
const detailedWorkbench = new URL("../components/life-event/ResidentTaskWorkbench.tsx", import.meta.url);

test("property task mode renders one consolidated event workspace", async () => {
  const source = await readFile(propertyPage, "utf8");

  assert.match(source, /PropertyEventWorkspace/);
  assert.doesNotMatch(source, /GuardedLifecycleAgentPanel/);
  assert.doesNotMatch(source, /<PropertyWorkbench/);
});

test("advanced verification is a transaction-like sandbox and restores task truth on exit or refresh", async () => {
  const source = await readFile(propertyPage, "utf8");

  assert.match(source, /LAB_SNAPSHOT_KEY/);
  assert.match(source, /LAB_SESSION_KEY/);
  assert.match(source, /rememberTaskTruth/);
  assert.match(source, /restoreTaskTruth/);
  assert.match(source, /persistTaskTruth/);
  assert.match(source, /sessionStorage\.setItem\(LAB_SESSION_KEY/);
  assert.match(source, /structuredClone\(session\)/);
  assert.match(source, /if \(modeRef\.current !== "lab"\) return/);
  assert.match(source, /退出沙盒并恢复物业任务/);
  assert.match(source, /退出、刷新或离开页面后都恢复进入前的物业会话/);
});

test("legacy detailed property work remains available only behind the secondary task layer", async () => {
  const source = await readFile(propertyWorkspace, "utf8");

  assert.match(source, /完整处理记录/);
  assert.match(source, /taskOpen \? <PropertyWorkbench/);
  assert.match(source, /当前判断|CURRENT ASSESSMENT/);
  assert.match(source, /这栋房子记得什么/);
  assert.match(source, /当前还缺什么/);
  assert.match(source, /UNIQUE NEXT ACTION/);
  assert.match(source, /href="\/memory"/);
});

test("existing focus deep links still open the detailed domain task when required", async () => {
  const source = await readFile(propertyWorkspace, "utf8");

  assert.match(source, /URLSearchParams\(window\.location\.search\)\.get\("focus"\)/);
  assert.match(source, /setTaskOpen\(true\)/);
  assert.match(source, /\[data-focus=/);
});

test("detailed property work cannot present template inputs as facts or one-click a prewritten success", async () => {
  const source = await readFile(detailedWorkbench, "utf8");

  assert.match(source, /没有事件级湿度观测/);
  assert.match(source, /模板或高级验证中的数值草稿不能冒充当前事实/);
  assert.match(source, /initialObservationConfirmed/);
  assert.match(source, /住户提交不会自动触发诊断/);
  assert.match(source, /运行第一次确定性评估/);
  assert.match(source, /isolationObservationConfirmed/);
  assert.match(source, /repairRecordConfirmed/);
  assert.match(source, /postRepairObservationConfirmed/);
  assert.match(source, /不代表系统已经观测到恢复/);
  assert.match(source, /不是已经发生的维修事实/);
  assert.match(source, /不代表维修已经成功/);
});
