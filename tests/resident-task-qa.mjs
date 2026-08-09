import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/exhibit-qa";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/resident?mode=task`, { waitUntil: "networkidle" });
    await page.locator(".resident-guided-task").waitFor();
    assert.equal(await page.locator(".resident-guided-task .task-primary").count(), 1, `${viewport.name}: task flow needs one primary action`);
    assert.equal(await page.locator(".resident-fact").count(), 4, `${viewport.name}: task flow must summarize four fact groups`);
    assert.equal(await page.locator(".resident-fact-controls[open]").count(), 0, `${viewport.name}: detailed controls must remain collapsed initially`);
    assert.equal(await page.getByRole("link", { name: "返回1602验证舱" }).count(), 1, `${viewport.name}: context return is missing`);
    const dimensions = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `${viewport.name}: task page overflow ${JSON.stringify(dimensions)}`);
    await page.screenshot({ path: `${output}/resident-task-${viewport.name}.png`, fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("Resident task QA passed: one primary task, collapsed controls, context return, desktop and mobile.");
