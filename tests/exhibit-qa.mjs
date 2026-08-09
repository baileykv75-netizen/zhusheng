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
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 900 },
  { name: "390", width: 390, height: 844 }
];

await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const home = await context.newPage();
    const failedHomeAssets = [];
    home.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === new URL(baseUrl).origin && response.status() >= 400 && (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/"))) {
        failedHomeAssets.push(`${response.status()} ${url.pathname}`);
      }
    });
    await home.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await home.locator(".concept-exhibit").waitFor();
    assert.equal(await home.getByRole("link", { name: /进入1602验证舱/ }).count(), 1, `${viewport.name}: homepage must have one primary entry`);
    assert.equal(await home.locator("input, textarea").count(), 0, `${viewport.name}: homepage must not become an input console`);
    assert.equal(await home.locator(".concept-promise article").count(), 3, `${viewport.name}: homepage must show the three outcomes`);
    assert.equal(await home.locator("img[src*='/assets/v5']").count(), 0, `${viewport.name}: homepage must not use V5 image art`);
    const homeDimensions = await home.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(homeDimensions.html <= homeDimensions.width + 1 && homeDimensions.body <= homeDimensions.width + 1, `${viewport.name}: homepage overflows: ${JSON.stringify(homeDimensions)}`);
    assert.deepEqual(failedHomeAssets, [], `${viewport.name}: homepage asset failures: ${failedHomeAssets.join(", ")}`);
    await home.screenshot({ path: `${output}/concept-${viewport.name}.png`, fullPage: true });

    const casePage = await context.newPage();
    await casePage.goto(`${baseUrl}/case-1602`, { waitUntil: "networkidle" });
    await casePage.locator(".case-exhibit").waitFor();
    assert.equal(await casePage.locator(".case-route article").count(), 5, `${viewport.name}: case must retain all five chapters`);
    assert.equal(await casePage.locator(".case-current-card .case-primary").count(), 1, `${viewport.name}: case must have one next action`);
    const caseDimensions = await casePage.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(caseDimensions.html <= caseDimensions.width + 1 && caseDimensions.body <= caseDimensions.width + 1, `${viewport.name}: case overflows: ${JSON.stringify(caseDimensions)}`);
    await casePage.screenshot({ path: `${output}/case-1602-${viewport.name}.png`, fullPage: true });
    await home.close();
    await casePage.close();
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const deepLink = await context.newPage();
  await deepLink.goto(`${baseUrl}/worker`, { waitUntil: "networkidle" });
  assert.equal(await deepLink.locator("a.return-agent[href^='/case-1602']").count(), 1, "deep workspaces must return to the verification case");
  await context.close();
} finally {
  await browser.close();
}

console.log("Exhibit QA passed: concept, 1602 case, deep-link return, and four responsive widths.");
