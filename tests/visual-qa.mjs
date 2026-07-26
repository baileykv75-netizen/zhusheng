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
await assertNoOverflow(page, "home desktop");
await page.screenshot({ path: `${output}/v3-01-home-desktop.png`, fullPage: true });

await page.getByRole("button", { name: "开始演示" }).click();
await page.waitForURL("**/worker**");
await page.screenshot({ path: `${output}/v3-02-worker-desktop.png`, fullPage: true });
await page.locator(".demo-next").click();
await page.screenshot({ path: `${output}/v3-03-worker-structured-desktop.png`, fullPage: true });
await page.locator(".demo-next").click();
await page.screenshot({ path: `${output}/v3-03b-worker-verified-desktop.png`, fullPage: true });
await page.locator(".demo-next").click();
await page.waitForURL("**/resident**");
await page.screenshot({ path: `${output}/v3-04-resident-analysis-desktop.png`, fullPage: true });
await page.locator(".demo-next").click();
await page.locator(".demo-next").click();
const beforeAuth = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v2")).valve.status);
assert.equal(beforeAuth, "open");
await page.screenshot({ path: `${output}/v3-05-resident-authorization-desktop.png`, fullPage: true });
await page.getByRole("button", { name: /确认授权并执行关阀/ }).click();
const afterAuth = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v2")).valve.status);
assert.equal(afterAuth, "closed");
await page.locator(".demo-next").click();
await page.waitForURL("**/group**");
await assertNoOverflow(page, "group desktop");
await page.screenshot({ path: `${output}/v3-06-group-desktop.png`, fullPage: true });

const isolated = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const isolatedPage = await isolated.newPage();
await isolatedPage.goto(baseUrl, { waitUntil: "networkidle" });
const isolatedStep = await isolatedPage.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.demo.v2")).currentStep);
assert.equal(isolatedStep, 0);
await assertNoOverflow(isolatedPage, "tablet isolated");
await isolatedPage.screenshot({ path: `${output}/v3-07-home-tablet.png`, fullPage: true });

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${baseUrl}/worker`, { waitUntil: "networkidle" });
await assertNoOverflow(mobilePage, "worker mobile");
await mobilePage.screenshot({ path: `${output}/v3-08-worker-mobile.png`, fullPage: true });

await browser.close();
console.log("Visual QA passed: desktop, tablet, mobile, authorization guard, session isolation.");
