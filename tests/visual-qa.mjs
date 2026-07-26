import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4174";
const output = "D:/Admin/Desktop/Project/zhusheng-agent/submission/screenshots";

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  assert.ok(result.scrollWidth <= result.width + 1, `${label} document overflow: ${JSON.stringify(result)}`);
  assert.ok(result.bodyWidth <= result.width + 1, `${label} body overflow: ${JSON.stringify(result)}`);
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await desktop.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator(".scene-stage.image-ready").waitFor();
await assertNoOverflow(page, "home desktop");
assert.equal(await page.locator('.rail-nav a[aria-current="page"]').count(), 1);
assert.equal(await page.locator(".building-lens.open").count(), 0);
await page.getByRole("button", { name: "空间", exact: true }).click();
assert.equal(await page.getByRole("button", { name: "空间", exact: true }).getAttribute("aria-pressed"), "true");
await page.getByRole("button", { name: /查看1602 · 空间记忆/ }).click();
assert.equal(await page.locator(".building-lens.open").count(), 1);
await page.getByRole("button", { name: "关闭建筑检查器" }).click();
await page.waitForTimeout(260);
await page.getByRole("button", { name: "给排水", exact: true }).click();
const heroImage = await page.locator(".scene-picture img").evaluate((image) => ({
  complete: image.complete,
  width: image.naturalWidth,
  height: image.naturalHeight
}));
assert.ok(heroImage.complete && heroImage.width >= 1000 && heroImage.height >= 800, `hero image invalid: ${JSON.stringify(heroImage)}`);
await page.screenshot({ path: `${output}/v4-01-home-desktop.png`, fullPage: true });

await page.getByRole("button", { name: /开始2分钟演示/ }).click();
await page.waitForURL("**/worker**");
await page.locator(".scene-stage.image-ready").waitFor();
await page.waitForTimeout(280);
await page.screenshot({ path: `${output}/v4-02-worker-desktop.png`, fullPage: true });
await page.locator(".timeline-next").click();
await page.screenshot({ path: `${output}/v4-03-worker-structured-desktop.png`, fullPage: true });
await page.locator(".timeline-next").click();
await page.screenshot({ path: `${output}/v4-03b-worker-verified-desktop.png`, fullPage: true });
await page.locator(".timeline-next").click();
await page.screenshot({ path: `${output}/v4-03c-worker-memory-desktop.png`, fullPage: true });
await page.locator(".timeline-next").click();
await page.waitForURL("**/resident**");
await page.locator(".scene-stage.image-ready").waitFor();
await page.waitForTimeout(280);
await page.screenshot({ path: `${output}/v4-04-resident-analysis-desktop.png`, fullPage: true });
await page.locator(".timeline-next").click();
await page.locator(".timeline-next").click();
const beforeAuth = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v3")).valve.status);
assert.equal(beforeAuth, "open");
assert.equal(await page.locator(".timeline-next").isDisabled(), true);
await page.screenshot({ path: `${output}/v4-05-resident-authorization-desktop.png`, fullPage: true });
await page.getByRole("button", { name: /确认授权并执行关阀/ }).click();
await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v3")).valve.status === "closed");
const afterAuth = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v3")).valve.status);
assert.equal(afterAuth, "closed");
await page.locator(".timeline-next").click();
await page.waitForURL("**/group**");
await page.locator(".scene-stage.image-ready").waitFor();
await page.waitForTimeout(280);
await assertNoOverflow(page, "group desktop");
await page.screenshot({ path: `${output}/v4-06-group-desktop.png`, fullPage: true });

const isolated = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const isolatedPage = await isolated.newPage();
await isolatedPage.goto(baseUrl, { waitUntil: "networkidle" });
const isolatedStep = await isolatedPage.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v3")).currentStep);
assert.equal(isolatedStep, 0);
await assertNoOverflow(isolatedPage, "tablet isolated");
await isolatedPage.screenshot({ path: `${output}/v4-07-home-tablet.png`, fullPage: true });

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${baseUrl}/worker`, { waitUntil: "networkidle" });
await assertNoOverflow(mobilePage, "worker mobile");
await mobilePage.screenshot({ path: `${output}/v4-08-worker-mobile.png`, fullPage: true });

for (const width of [1366, 768]) {
  const responsive = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 768 } });
  const responsivePage = await responsive.newPage();
  await responsivePage.goto(`${baseUrl}/group`, { waitUntil: "networkidle" });
  await responsivePage.locator('[aria-current="page"]').first().waitFor({ state: "attached" });
  await assertNoOverflow(responsivePage, `group ${width}`);
  assert.equal(await responsivePage.locator('[aria-current="page"]').count() >= 1, true);
  await responsive.close();
}

const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const reducedPage = await reduced.newPage();
await reducedPage.goto(`${baseUrl}/resident`, { waitUntil: "networkidle" });
await assertNoOverflow(reducedPage, "resident reduced motion");

await browser.close();
console.log("Visual QA passed: desktop, tablet, mobile, authorization guard, session isolation.");
