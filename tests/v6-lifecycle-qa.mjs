import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/v6-lifecycle";
const sessionKey = "zhusheng.life-event-lab.v2";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));

async function waitState(expected) {
  try {
    await page.waitForFunction(([key, state]) => {
      try { return JSON.parse(sessionStorage.getItem(key) ?? "null")?.result?.state === state; }
      catch { return false; }
    }, [sessionKey, expected], { timeout: 15_000 });
  } catch (error) {
    const actual = await state();
    const notices = await page.locator('[role="status"], .task-notice').allTextContents();
    throw new Error(`Expected state ${expected}, received ${actual}; notices=${notices.join(" | ")}`, { cause: error });
  }
}

async function state() {
  return page.evaluate((key) => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null")?.result?.state ?? null; }
    catch { return null; }
  }, sessionKey);
}

async function open(route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
}

await open("/resident");
await page.getByText("查看拍摄位置", { exact: true }).click();
await page.getByRole("button", { name: "使用这张脱敏图继续演示" }).click();
await page.getByRole("button", { name: "有变化", exact: true }).click();
await page.getByRole("button", { name: "确认现场情况" }).click();
await waitState("AUTHORIZATION_PENDING");
for (const required of ["为什么做", "影响范围", "预计持续", "是否可恢复", "谁执行"]) assert.equal(await page.getByText(required, { exact: true }).count(), 1, `resident authorization is missing ${required}`);
assert.match(await page.locator(".resident-authorization").innerText(), /授权本身不会改变设备/);
await page.screenshot({ path: `${output}/01-resident-authorization.png`, fullPage: true });
await page.getByRole("button", { name: "同意本次操作" }).click();
await waitState("AUTHORIZED");

await open("/property");
await page.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
assert.equal(await page.locator(".property-event-queue").count(), 1);
assert.match(await page.locator(".active-task").innerText(), /授权已记录，动作尚未执行/);
await page.getByRole("button", { name: "模拟执行关阀" }).click();
await waitState("VERIFYING");
assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
await page.getByRole("button", { name: "提交隔离后观察" }).click();
await waitState("REPAIR_PENDING");
await page.screenshot({ path: `${output}/02-property-repair-task.png`, fullPage: true });

const submitRepair = page.getByRole("button", { name: "提交不可变维修记录" });
assert.equal(await submitRepair.isDisabled(), true, "repair cannot be submitted without a photo");
await page.getByText("查看脱敏演示示例", { exact: true }).click();
await page.getByRole("button", { name: "使用此脱敏图继续演示" }).click();
assert.equal(await submitRepair.isEnabled(), true);
await submitRepair.click();
await waitState("AUTHORIZATION_PENDING");
assert.match((await page.locator('[role="status"]').innerText()), /恢复供水需要新的人工授权/);

await open("/resident");
await page.getByRole("button", { name: "同意本次操作" }).click();
await waitState("AUTHORIZED");
await open("/property");
assert.match(await page.locator(".active-task").innerText(), /授权已记录，动作尚未执行/);
await page.getByRole("button", { name: "模拟执行恢复供水" }).click();
await waitState("POST_REPAIR_VERIFYING");
assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);

const submitPostRepair = page.getByRole("button", { name: "提交维修后复验" });
assert.equal(await submitPostRepair.isDisabled(), true, "post-repair verification cannot be submitted without a new photo");
await page.getByText("查看脱敏演示示例", { exact: true }).click();
await page.getByRole("button", { name: "使用此脱敏图继续演示" }).click();
assert.equal(await submitPostRepair.isEnabled(), true);
await submitPostRepair.click();
await waitState("RESOLVED");
assert.equal(await page.getByRole("heading", { name: "维修闭环完成" }).count(), 1);
await page.screenshot({ path: `${output}/03-property-resolved.png`, fullPage: true });

await open("/resident");
assert.match(await page.locator(".resident-result").innerText(), /恢复供水后未再次观察到异常/);
await page.screenshot({ path: `${output}/04-resident-result.png`, fullPage: true });

await open("/case-1602");
assert.equal(await page.locator(".case-route article > a").count(), 5, "all five chapters should unlock only after RESOLVED");
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

async function verifyAlternateGroupDecision({ choiceIndex, taskClass, requiredText, screenshot }) {
  const decisionContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const decisionPage = await decisionContext.newPage();
  const decisionErrors = [];
  decisionPage.on("pageerror", (error) => decisionErrors.push(error.message));
  await decisionPage.goto(`${baseUrl}/group`, { waitUntil: "networkidle" });
  await decisionPage.locator(".group-learning-workbench").waitFor({ timeout: 30_000 });
  await decisionPage.locator(".review-choice button").nth(choiceIndex).click();
  await decisionPage.locator(".group-review-submit").click();
  const task = decisionPage.locator(`.group-decision-task.${taskClass}`);
  await task.waitFor();
  const taskText = await task.innerText();
  for (const expected of requiredText) assert.match(taskText, new RegExp(expected));
  await decisionPage.screenshot({ path: `${output}/${screenshot}`, fullPage: true });
  assert.deepEqual(decisionErrors, []);
  await decisionContext.close();
}

await verifyAlternateGroupDecision({
  choiceIndex: 1,
  taskClass: "evidence_task",
  requiredText: ["EVIDENCE_REQUIRED", "负责人", "时间", "补证", "照片", "保压"],
  screenshot: "06-group-return-for-evidence-task.png"
});
await verifyAlternateGroupDecision({
  choiceIndex: 2,
  taskClass: "hold_condition",
  requiredText: ["HELD", "暂不采纳", "重新开启条件", "关键新增证据", "条件满足"],
  screenshot: "07-group-hold-condition.png"
});

await browser.close();
console.log("V6 lifecycle QA passed: resident evidence and authorization, property execution/repair/retest, RESOLVED chapter unlock, and all three bounded group decision tasks.");
