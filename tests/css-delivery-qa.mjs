import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const fallback = process.env.CODEX_PLAYWRIGHT_MODULE
      || "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
    return require(fallback);
  }
}

function browserExecutable(chromium) {
  if (process.env.CHROME_EXECUTABLE) return process.env.CHROME_EXECUTABLE;
  const candidates = process.platform === "win32"
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => existsSync(candidate)) || chromium.executablePath();
}

const { chromium } = loadPlaywright();
const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = process.env.QA_OUTPUT || path.resolve(process.cwd(), "artifacts/product-regression");
const routes = [
  { path: "/", name: "concept", root: ".exhibit-shell" },
  { path: "/case-1602/", name: "case-1602", root: ".exhibit-shell" },
  { path: "/events/", name: "events", root: ".app-shell" },
  { path: "/memory/", name: "memory", root: ".app-shell" },
  { path: "/property/", name: "property", root: ".app-shell" },
  { path: "/worker/", name: "worker", root: ".app-shell" },
  { path: "/resident/", name: "resident", root: ".app-shell" },
  { path: "/group/", name: "group", root: ".app-shell" }
];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 820 },
  { name: "mobile", width: 390, height: 844 }
];

await mkdir(output, { recursive: true });

const launchOptions = { headless: true };
const executablePath = browserExecutable(chromium);
if (executablePath) launchOptions.executablePath = executablePath;
const browser = await chromium.launch(launchOptions);

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
        const workShell = document.querySelector('.product-shell[data-product-mode="work"]');
        const mobileNav = document.querySelector(".mobile-task-nav");
        return {
          graphite: rootStyle.getPropertyValue("--graphite").trim(),
          bodyBackground: bodyStyle.backgroundColor,
          bodyMargin: bodyStyle.margin,
          stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
          viewportWidth: window.innerWidth,
          htmlWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          workRail: workShell ? getComputedStyle(workShell).getPropertyValue("--rail").trim() : null,
          mobileNavDisplay: mobileNav ? getComputedStyle(mobileNav).display : null
        };
      });

      assert.equal(styleState.graphite, "#0c0d0e", `${route.path} missing global CSS variables`);
      assert.equal(styleState.bodyBackground, "rgb(12, 13, 14)", `${route.path} body background is unstyled`);
      assert.equal(styleState.bodyMargin, "0px", `${route.path} browser default body margin is still active`);
      assert.ok(styleState.stylesheets.length > 0, `${route.path} has no stylesheet link`);
      assert.ok(styleState.htmlWidth <= styleState.viewportWidth + 1, `${route.path} html overflows at ${viewport.name}`);
      assert.ok(styleState.bodyWidth <= styleState.viewportWidth + 1, `${route.path} body overflows at ${viewport.name}`);
      if (route.root === ".app-shell") assert.equal(styleState.workRail, "0px", `${route.path} still inherits the legacy rail width`);
      if (viewport.width <= 820 && route.root === ".app-shell") assert.equal(styleState.mobileNavDisplay, "grid", `${route.path} lost the shared mobile product navigation`);

      for (const stylesheet of styleState.stylesheets) {
        const response = await context.request.get(stylesheet);
        const contentType = response.headers()["content-type"] || "";
        const body = await response.body();
        assert.equal(response.status(), 200, `${stylesheet} returned ${response.status()}`);
        assert.match(contentType, /^text\/css\b/i, `${stylesheet} returned ${contentType}`);
        assert.ok(body.length > 1_000, `${stylesheet} is unexpectedly small (${body.length} bytes)`);
      }

      assert.deepEqual(failedAssets, [], `${route.path} failed static assets: ${failedAssets.join(", ")}`);
      await page.screenshot({ path: path.join(output, `${route.name}-${viewport.name}.png`), fullPage: true });
      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

console.log("Product regression QA passed: eight routes, desktop/tablet/mobile, stylesheet delivery, rail reset, navigation and overflow checks.");
