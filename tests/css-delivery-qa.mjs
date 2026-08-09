import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/css-recovery";
const routes = [
  { path: "/", name: "concept", root: ".exhibit-shell" },
  { path: "/case-1602/", name: "case-1602", root: ".exhibit-shell" },
  { path: "/worker/", name: "worker", root: ".app-shell" },
  { path: "/resident/", name: "resident", root: ".app-shell" },
  { path: "/group/", name: "group", root: ".app-shell" }
];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });

    for (const route of routes) {
      const page = await context.newPage();
      const failedAssets = [];

      page.on("response", (response) => {
        const url = new URL(response.url());
        const isAppAsset =
          url.origin === new URL(baseUrl).origin &&
          (url.pathname.startsWith("/_next/") ||
            url.pathname.startsWith("/assets/") ||
            url.pathname.startsWith("/fonts/") ||
            url.pathname === "/icon.svg");
        if (isAppAsset && response.status() >= 400) {
          failedAssets.push(`${response.status()} ${url.pathname}`);
        }
      });

      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
      await page.locator(route.root).waitFor();

      const styleState = await page.evaluate(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        return {
          graphite: rootStyle.getPropertyValue("--graphite").trim(),
          bodyBackground: bodyStyle.backgroundColor,
          bodyMargin: bodyStyle.margin,
          stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
          viewportWidth: window.innerWidth,
          htmlWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth
        };
      });

      assert.equal(styleState.graphite, "#0c0d0e", `${route.path} missing global CSS variables`);
      assert.equal(styleState.bodyBackground, "rgb(12, 13, 14)", `${route.path} body background is unstyled`);
      assert.equal(styleState.bodyMargin, "0px", `${route.path} browser default body margin is still active`);
      assert.ok(styleState.stylesheets.length > 0, `${route.path} has no stylesheet link`);
      assert.ok(styleState.htmlWidth <= styleState.viewportWidth + 1, `${route.path} html overflows at ${viewport.name}`);
      assert.ok(styleState.bodyWidth <= styleState.viewportWidth + 1, `${route.path} body overflows at ${viewport.name}`);

      for (const stylesheet of styleState.stylesheets) {
        const response = await context.request.get(stylesheet);
        const contentType = response.headers()["content-type"] || "";
        const body = await response.body();
        assert.equal(response.status(), 200, `${stylesheet} returned ${response.status()}`);
        assert.match(contentType, /^text\/css\b/i, `${stylesheet} returned ${contentType}`);
        assert.ok(body.length > 1_000, `${stylesheet} is unexpectedly small (${body.length} bytes)`);
      }

      assert.deepEqual(failedAssets, [], `${route.path} failed static assets: ${failedAssets.join(", ")}`);
      await page.screenshot({ path: `${output}/${route.name}-${viewport.name}.png`, fullPage: true });
      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

console.log("CSS delivery QA passed: five routes, desktop/mobile, stylesheet HTTP and computed styles.");
