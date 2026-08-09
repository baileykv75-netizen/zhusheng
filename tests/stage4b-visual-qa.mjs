import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4174";
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/stage4b";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

async function assertNoOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.html <= sizes.viewport + 1, `${label} html overflow: ${JSON.stringify(sizes)}`);
  assert.ok(sizes.body <= sizes.viewport + 1, `${label} body overflow: ${JSON.stringify(sizes)}`);
}

async function openLab(page) {
  await page.goto(`${baseUrl}/resident/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "高级实验" }).click();
  await page.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "重新评估" }).waitFor();
}

async function reachRepairPending(page) {
  await page.getByRole("button", { name: "重新评估" }).click();
  await page.getByRole("button", { name: "动作", exact: true }).click();
  await page.getByText("人工授权边界生效", { exact: true }).waitFor();
  await page.getByRole("button", { name: "请求人工授权" }).click();
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByRole("button", { name: "模拟执行关阀" }).click();
  await page.locator('.twin-viewport[data-valve-position="CLOSED"]').waitFor();
  await page.getByRole("button", { name: "提交关阀后观察" }).click();
  await page.getByText("精准维修任务", { exact: true }).waitFor();
  await page.getByText("事件已临时控制，尚未完成维修", { exact: false }).waitFor();
}

async function submitRepairAndAuthorizeReopen(page) {
  await page.getByRole("button", { name: "提交不可变维修记录" }).click();
  await page.getByText("维修记录已进入事件链", { exact: true }).waitFor();
  assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
  await page.getByRole("button", { name: "请求人工授权" }).click();
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByRole("button", { name: "模拟执行恢复供水" }).waitFor();
  assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
}

async function reachPostRepair(page) {
  await page.getByRole("button", { name: "模拟执行恢复供水" }).click();
  await page.getByText("维修后新观察", { exact: true }).waitFor();
  await page.locator('.twin-viewport[data-valve-position="OPEN"]').waitFor();
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await desktop.newPage();
await openLab(page);
await reachRepairPending(page);
await assertNoOverflow(page, "repair pending desktop");
await page.screenshot({ path: `${output}/01-repair-pending-task.png`, fullPage: true });

await page.getByRole("button", { name: "提交不可变维修记录" }).click();
await page.getByText("维修记录已进入事件链", { exact: true }).waitFor();
await page.screenshot({ path: `${output}/02-repair-recorded.png`, fullPage: true });
assert.equal(await page.getByText("恢复供水需要独立授权", { exact: true }).count(), 1);
assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
await page.screenshot({ path: `${output}/03-reopen-authorization-pending.png`, fullPage: true });

await page.getByRole("button", { name: "请求人工授权" }).click();
await page.getByRole("button", { name: "提交人工决定" }).click();
await page.getByRole("button", { name: "模拟执行恢复供水" }).waitFor();
assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
await page.screenshot({ path: `${output}/04-reopen-approved-valve-closed.png`, fullPage: true });

await reachPostRepair(page);
await page.screenshot({ path: `${output}/05-post-repair-verifying.png`, fullPage: true });
await page.getByRole("button", { name: "提交维修后复验" }).click();
await page.getByRole("heading", { name: "维修闭环完成" }).waitFor();
assert.equal(await page.getByText("RESOLVED", { exact: true }).count() > 0, true);
assert.equal(await page.locator('.twin-viewport[data-moisture-state="REPAIRED"]').count(), 1);
await page.screenshot({ path: `${output}/06-resolved-repaired.png`, fullPage: true });

await page.getByRole("button", { name: /审计/ }).click();
await page.getByText("1602建筑生命事件包", { exact: true }).waitFor();
const packageDownload = page.waitForEvent("download");
await page.getByRole("button", { name: "下载验证成果包" }).click();
const downloadedPackage = await packageDownload;
await downloadedPackage.saveAs(`${output}/EVT-1602-LAB-001.package.json`);
const auditDownload = page.waitForEvent("download");
await page.getByRole("button", { name: "审计JSONL" }).click();
await (await auditDownload).saveAs(`${output}/EVT-1602-LAB-001.audit.jsonl`);
await page.getByText(/事件成果包已通过/).waitFor();
await page.screenshot({ path: `${output}/08-event-package-download.png`, fullPage: true });

await page.emulateMedia({ media: "print" });
await page.pdf({ path: `${output}/EVT-1602-LAB-001.report.pdf`, format: "A4", printBackground: true });
await page.locator(".life-event-print-report").screenshot({ path: `${output}/09-chinese-print-report.png` });
await page.emulateMedia({ media: "screen" });

const abnormalContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const abnormal = await abnormalContext.newPage();
await openLab(abnormal);
await reachRepairPending(abnormal);
await submitRepairAndAuthorizeReopen(abnormal);
await reachPostRepair(abnormal);
await abnormal.locator('.post-repair-editor input[aria-label="微流量数值"]').fill("0.06");
await abnormal.locator('.post-repair-editor input[aria-label="湿度数值"]').fill("83");
await abnormal.getByRole("button", { name: "提交维修后复验" }).click();
await abnormal.getByText("维修后仍有异常，事件已重新打开", { exact: true }).waitFor();
assert.equal(await abnormal.getByText("REOPENED", { exact: true }).count() > 0, true);
assert.equal(await abnormal.locator('.twin-viewport[data-moisture-state="REPAIRED"]').count(), 0);
await abnormal.screenshot({ path: `${output}/07-reopened-abnormal.png`, fullPage: true });

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobile = await mobileContext.newPage();
await openLab(mobile);
await reachRepairPending(mobile);
await assertNoOverflow(mobile, "stage4B mobile");
await mobile.screenshot({ path: `${output}/10-mobile-repair-task.png`, fullPage: true });

const guidedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const guided = await guidedContext.newPage();
await guided.goto(`${baseUrl}/resident/`, { waitUntil: "networkidle" });
await guided.locator(".workspace-mode-switch").getByRole("button", { name: "任务处置" }).waitFor();
assert.equal(await guided.locator(".professional-workspace").count(), 1);
await guided.screenshot({ path: `${output}/11-guided-demo-normal.png`, fullPage: true });

for (const [route, name] of [["/", "12-home-unaffected"], ["/worker/", "13-worker-unaffected"], ["/group/", "14-group-unaffected"]]) {
  const routePage = await guidedContext.newPage();
  await routePage.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await assertNoOverflow(routePage, route);
  const css = await routePage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(css, "rgba(0, 0, 0, 0)");
  await routePage.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await routePage.close();
}

const fallbackContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const fallback = await fallbackContext.newPage();
await fallback.route("**/bathroom-1602.glb", (route) => route.abort("failed"));
await fallback.goto(`${baseUrl}/resident/`, { waitUntil: "networkidle" });
await fallback.getByRole("button", { name: "高级实验" }).click();
await fallback.getByText("三维视图已降级", { exact: true }).waitFor({ timeout: 30_000 });
await fallback.getByText("传感器观察", { exact: true }).waitFor();

await browser.close();
console.log("Stage 4B visual QA passed: repair task, immutable record, separate reopen authorization, post-repair resolve/reopen, verified package, print, mobile, guided and route regressions.");
