import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/step3-building-intelligence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function setup(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const runtimeErrors = []; const failedAssets = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) runtimeErrors.push(message.text()); });
  page.on("response", (response) => { const url = new URL(response.url()); if (response.status() >= 400 && url.origin === "http://127.0.0.1:4174" && (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/") || url.pathname.endsWith(".glb"))) failedAssets.push(`${response.status()} ${url.pathname}`); });
  await page.goto("http://127.0.0.1:4174/case-1602", { waitUntil: "domcontentloaded" });
  await page.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
  await page.locator(".building-ai-empty").waitFor();
  return { context, page, runtimeErrors, failedAssets };
}

async function ask(page, question) {
  const input = page.locator(".building-ai-form textarea").first();
  await input.fill(question); await page.locator(".building-ai-form button[type='submit']").first().click();
  await page.locator(".building-ai-result").waitFor();
}

const desktop = await setup(1440, 900);
await desktop.page.locator(".case-stage").scrollIntoViewIfNeeded();
await desktop.page.screenshot({ path: `${output}/01-ai-workspace-initial-1440.png`, fullPage: false });
assert.equal(await desktop.page.locator(".building-ai-examples button").count(), 3);
assert.equal(await desktop.page.locator('[data-agent-mode="LOCAL_READ_ONLY"]').count(), 0);

await ask(desktop.page, "冷水从哪里进入，又经过哪些构件？");
assert.equal(await desktop.page.locator('[data-agent-mode="LOCAL_READ_ONLY"]').count(), 1);
assert.equal(await desktop.page.locator(".ai-tool-trace strong").first().textContent(), "trace_system");
assert.match(await desktop.page.locator(".ai-answer h2").textContent(), /冷水/);
await desktop.page.screenshot({ path: `${output}/02-cold-water-system-trace-1440.png`, fullPage: false });

await desktop.page.getByRole("button", { name: "← 新问题" }).click();
await ask(desktop.page, "北墙后面有哪些构件？");
assert.equal(await desktop.page.locator(".ai-tool-trace strong").first().textContent(), "get_components_behind_surface");
assert.match(await desktop.page.locator(".ai-answer h2").textContent(), /北墙后方/);
await desktop.page.screenshot({ path: `${output}/03-north-wall-xray-1440.png`, fullPage: false });

await desktop.page.getByRole("button", { name: "← 新问题" }).click();
await ask(desktop.page, "重点冷水接头留下了哪些施工记录？");
assert.equal(await desktop.page.locator(".ai-tool-trace strong").first().textContent(), "get_construction_history");
assert.match(await desktop.page.locator(".ai-answer h2").textContent(), /施工留痕/);
await desktop.page.screenshot({ path: `${output}/04-construction-memory-query-1440.png`, fullPage: false });

await desktop.page.getByRole("button", { name: "← 新问题" }).click();
await desktop.page.locator(".component-inspector").waitFor();
await desktop.page.locator(".selected-context").click();
await desktop.page.locator(".building-ai-form button[type='submit']").first().click();
await desktop.page.locator(".building-ai-result").waitFor();
assert.match(await desktop.page.locator(".ai-answer h2").textContent(), /重点冷水接头/);
assert.equal(await desktop.page.locator(".ai-tool-trace strong").first().textContent(), "get_component_detail");
await desktop.page.screenshot({ path: `${output}/05-selected-component-follow-up-1440.png`, fullPage: false });
assert.deepEqual(desktop.failedAssets, []); assert.deepEqual(desktop.runtimeErrors, []);
await desktop.context.close();

const mobile = await setup(390, 844);
await mobile.page.locator(".case-stage").scrollIntoViewIfNeeded();
const dimensions = await mobile.page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
assert.ok(dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
await mobile.page.screenshot({ path: `${output}/06-mobile-ai-workspace-390.png`, fullPage: false });
assert.deepEqual(mobile.failedAssets, []); assert.deepEqual(mobile.runtimeErrors, []);
await mobile.context.close(); await browser.close();
console.log("STEP3_BUILDING_INTELLIGENCE_QA_OK screenshots=6");
