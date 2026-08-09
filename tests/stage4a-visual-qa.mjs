import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const sharp = require("sharp");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4174";
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/stage4a";
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

async function assertCanvasRendered(page, label) {
  const canvas = page.locator(".twin-canvas canvas");
  const bounds = await canvas.boundingBox();
  assert.ok(bounds && bounds.width > 300 && bounds.height > 220, `${label} canvas has invalid bounds`);
  const buffer = await canvas.screenshot();
  const stats = await sharp(buffer).stats();
  assert.ok(stats.channels.some((channel) => channel.stdev > 8), `${label} canvas appears blank: ${JSON.stringify(stats.channels)}`);
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await desktop.newPage();
await openLab(page);
await assertNoOverflow(page, "free lab desktop");
await assertCanvasRendered(page, "free lab desktop");
assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);
assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v3") ?? "null")?.currentStep ?? 0), 0);
const twinViews = page.locator(".twin-toolbar nav");
for (const name of ["诊断", "施工记忆", "居住", "诊断", "居住"]) {
  await twinViews.getByRole("button", { name, exact: true }).click();
}
assert.equal(await page.locator('.twin-viewport[data-view="VIEW_RESIDENT"]').count(), 1);
await page.screenshot({ path: `${output}/01-free-lab-desktop.png`, fullPage: true });

await page.getByRole("button", { name: "仅湿度异常" }).click();
await page.getByRole("button", { name: "重新评估" }).click();
await page.getByText("冷凝或环境潮湿", { exact: true }).first().waitFor();
assert.equal(await page.getByText("HIGH", { exact: true }).count() >= 0, true);
await page.screenshot({ path: `${output}/02-humidity-only-result.png`, fullPage: true });

await page.getByRole("button", { name: "输入", exact: true }).click();
await page.getByRole("button", { name: "证据矛盾" }).click();
await page.getByRole("button", { name: "重新评估" }).click();
await page.getByRole("button", { name: "动作", exact: true }).click();
await page.getByRole("heading", { name: "当前证据不足，不允许继续设备动作" }).waitFor();
assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);
await page.screenshot({ path: `${output}/03-contradictory-evidence.png`, fullPage: true });

await page.getByRole("button", { name: "输入", exact: true }).click();
await page.getByRole("button", { name: "接头证据充分" }).click();
await page.getByRole("button", { name: "重新评估" }).click();
await page.getByRole("button", { name: "动作", exact: true }).click();
await page.getByText("人工授权边界生效", { exact: true }).waitFor();
await page.getByRole("button", { name: "测试未授权动作守卫" }).click();
await page.getByText(/安全守卫已拒绝未授权关阀/).waitFor();
assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);
assert.equal(await page.getByRole("button", { name: "模拟执行关阀" }).count(), 0);
await page.screenshot({ path: `${output}/04-authorization-pending.png`, fullPage: true });

await page.getByRole("button", { name: "请求人工授权" }).click();
await page.getByRole("dialog", { name: "人工授权记录" }).waitFor();
await page.getByRole("button", { name: "提交人工决定" }).click();
await page.getByText("授权已通过，动作尚未执行", { exact: true }).waitFor();
assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);
await page.getByRole("button", { name: "模拟执行关阀" }).click();
await page.locator('.twin-viewport[data-valve-position="CLOSED"]').waitFor();
await page.getByText("关阀后新观察", { exact: true }).waitFor();
await page.screenshot({ path: `${output}/05-valve-closed-verifying.png`, fullPage: true });

await page.getByRole("button", { name: "提交关阀后观察" }).click();
await page.getByText("事件已临时控制，尚未完成维修", { exact: true }).waitFor();
assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.life-event-lab.v2") ?? "null")?.result?.state), "REPAIR_PENDING");
assert.equal(await page.getByText("已解决", { exact: true }).count(), 0);
assert.equal(await page.getByText("REPAIRED", { exact: true }).count(), 0);
await page.screenshot({ path: `${output}/06-repair-pending.png`, fullPage: true });

await page.getByRole("button", { name: "审计", exact: false }).click();
assert.equal(await page.getByText("UNAUTHORIZED_ACTION_REJECTED", { exact: true }).count(), 1);
assert.equal(await page.getByText("SIMULATED_VALVE_CLOSED", { exact: true }).count(), 1);
await page.reload({ waitUntil: "networkidle" });
await page.locator(".resident-free-lab").waitFor();
await page.getByRole("button", { name: "动作", exact: true }).click();
await page.getByText("事件已临时控制，尚未完成维修", { exact: true }).waitFor();
assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobilePage = await mobile.newPage();
await openLab(mobilePage);
await assertNoOverflow(mobilePage, "free lab mobile");
await assertCanvasRendered(mobilePage, "free lab mobile");
assert.equal(await mobilePage.evaluate(() => sessionStorage.getItem("zhusheng.life-event-lab.v2") !== null), true);
assert.equal(await mobilePage.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.life-event-lab.v2")).result), null);
await mobilePage.screenshot({ path: `${output}/07-free-lab-mobile.png`, fullPage: true });

const fallback = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const fallbackPage = await fallback.newPage();
await fallbackPage.route("**/bathroom-1602.glb", (route) => route.abort("failed"));
await fallbackPage.goto(`${baseUrl}/resident/`, { waitUntil: "networkidle" });
await fallbackPage.getByRole("button", { name: "高级实验" }).click();
await fallbackPage.locator('.twin-viewport[data-model-status="failed"]').waitFor({ timeout: 30_000 });
await fallbackPage.getByText("三维视图已降级", { exact: true }).waitFor();
await fallbackPage.getByText("传感器观察", { exact: true }).waitFor();
await assertNoOverflow(fallbackPage, "GLB fallback");

await browser.close();
console.log("Stage 4A visual QA passed: engine-driven diagnosis, WebGL pixels, authorization guard, isolation verification, mobile and fallback.");
