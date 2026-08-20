import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "artifacts/v6-lifecycle";
const sessionKey = "zhusheng.life-event-lab.v2";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));

async function open(route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
}

async function state() {
  return page.evaluate((key) => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null")?.result?.state ?? null; }
    catch { return null; }
  }, sessionKey);
}

async function waitState(expected) {
  try {
    await page.waitForFunction(([key, target]) => {
      try { return JSON.parse(sessionStorage.getItem(key) ?? "null")?.result?.state === target; }
      catch { return false; }
    }, [sessionKey, expected], { timeout: 20_000 });
  } catch (error) {
    const actual = await state();
    const notices = await page.locator('[role="status"], .task-notice').allTextContents();
    throw new Error(`Expected state ${expected}, received ${actual}; notices=${notices.join(" | ")}`, { cause: error });
  }
}

async function openPropertyTask() {
  await open("/property");
  const toggle = page.getByRole("button", { name: "展开处理任务" });
  if (await toggle.count()) await toggle.click();
  await page.locator(".property-task-workspace").waitFor();
}

async function chooseCurrentSyntheticEvidence() {
  const details = page.locator(".active-task .local-evidence-upload details");
  await details.evaluate((node) => { node.open = true; });
  await page.locator(".active-task .local-evidence-upload").getByRole("button", { name: "使用此脱敏图继续演示" }).click();
}

await open("/resident");
await page.getByLabel("问题描述").fill("我家卫生间北侧墙角最近一直很潮。");
await page.locator(".resident-photo-guide").evaluate((details) => { details.open = true; });
await page.getByRole("button", { name: "使用这张脱敏图继续演示" }).click();
assert.equal(await page.getByRole("button", { name: /提交初步情况，让筑生决定还缺什么/ }).isDisabled(), true);
await page.getByRole("button", { name: "看见潮湿", exact: true }).click();
await page.getByRole("button", { name: /提交初步情况，让筑生决定还缺什么/ }).click();
await page.getByRole("button", { name: "有变化", exact: true }).click();
await page.getByRole("button", { name: /提交这项补充并交给物业核对/ }).click();
await page.locator(".resident-progress").waitFor();
assert.equal(await state(), null, "resident evidence must be stored before the first formal assessment");

await openPropertyTask();
const initialConfirm = page.locator('label.task-control-note').filter({ hasText: "我确认湿度与微流量是本轮需要进入事件的系统 / 现场观测" }).locator("input");
await initialConfirm.check();
await page.getByRole("button", { name: "运行第一次确定性评估" }).click();
await waitState("AUTHORIZATION_PENDING");

await open("/resident");
for (const required of ["为什么做", "影响范围", "预计持续", "是否可恢复", "谁执行"]) {
  assert.equal(await page.getByText(required, { exact: true }).count(), 1, `resident authorization is missing ${required}`);
}
assert.match(await page.locator(".resident-authorization").innerText(), /授权本身不会改变设备/);
await page.screenshot({ path: `${output}/01-resident-authorization.png`, fullPage: true });
await page.getByRole("button", { name: "同意本次操作" }).click();
await waitState("AUTHORIZED");

await openPropertyTask();
assert.match(await page.locator(".active-task").innerText(), /授权已记录，动作尚未执行/);
await page.getByRole("button", { name: "模拟执行关阀" }).click();
await waitState("VERIFYING");
assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
const isolationConfirm = page.locator('label.task-control-note').filter({ hasText: "我确认这些是本次隔离后的观测值" }).locator("input");
await isolationConfirm.check();
await page.getByRole("button", { name: "提交隔离后观察" }).click();
await waitState("REPAIR_PENDING");
await page.screenshot({ path: `${output}/02-property-repair-task.png`, fullPage: true });

const submitRepair = page.getByRole("button", { name: "提交不可变维修记录" });
assert.equal(await submitRepair.isDisabled(), true, "repair cannot be submitted without image identity and explicit confirmation");
await chooseCurrentSyntheticEvidence();
const repairConfirm = page.locator('label.task-control-note').filter({ hasText: "我确认维修方式、人员、说明与照片代表本次提交记录" }).locator("input");
await repairConfirm.check();
assert.equal(await submitRepair.isEnabled(), true);
await submitRepair.click();
await waitState("AUTHORIZATION_PENDING");
assert.match((await page.locator('[role="status"], .task-notice').first().innerText()), /恢复供水需要新的人工授权/);

await open("/resident");
await page.getByRole("button", { name: "同意本次操作" }).click();
await waitState("AUTHORIZED");

await openPropertyTask();
assert.match(await page.locator(".active-task").innerText(), /授权已记录，动作尚未执行/);
await page.getByRole("button", { name: "模拟执行恢复供水" }).click();
await waitState("POST_REPAIR_VERIFYING");
assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);

const submitPostRepair = page.getByRole("button", { name: "提交维修后复验" });
assert.equal(await submitPostRepair.isDisabled(), true, "post-repair verification requires a fresh image identity and explicit confirmation");
await chooseCurrentSyntheticEvidence();
const postRepairConfirm = page.locator('label.task-control-note').filter({ hasText: "我确认这些是恢复供水后的新观测" }).locator("input");
await postRepairConfirm.check();
assert.equal(await submitPostRepair.isEnabled(), true);
await submitPostRepair.click();
await waitState("RESOLVED");
assert.equal(await page.getByRole("heading", { name: "维修闭环完成" }).count(), 1);
await page.screenshot({ path: `${output}/03-property-resolved.png`, fullPage: true });

await open("/resident");
assert.match(await page.locator(".resident-result").innerText(), /恢复供水后未再次观察到异常/);
await page.screenshot({ path: `${output}/04-resident-result.png`, fullPage: true });

await open("/case-1602");
assert.equal(await page.locator(".case-route article").count(), 4, "case story should expose the current four-stage product narrative");
assert.equal(await state(), "RESOLVED");

await open("/group");
await page.locator(".group-learning-workbench").waitFor({ timeout: 30_000 });
await page.getByRole("button", { name: "采纳为试点", exact: true }).click();
await page.getByRole("button", { name: "提交人工评审", exact: true }).click();
await page.locator(".group-decision-task.pilot_task").waitFor();
const pilotText = await page.locator(".group-decision-task").innerText();
for (const required of ["负责人", "范围", "样本", "时间", "完成标准", "PILOT"]) assert.match(pilotText, new RegExp(required));
assert.match(await page.locator(".group-governance").innerText(), /不是企业标准/);
await page.screenshot({ path: `${output}/05-group-pilot-task.png`, fullPage: true });

assert.deepEqual(runtimeErrors, []);
await context.close();
await browser.close();
console.log("V6 lifecycle QA v2 passed: resident facts stay product-only until property confirmation, human authorization gates actions, repair/reopen require explicit evidence, and verified experience stays PILOT_ONLY.");
