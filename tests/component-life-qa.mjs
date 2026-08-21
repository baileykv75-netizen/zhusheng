import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

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
const launchOptions = { headless: true, args: ["--enable-unsafe-swiftshader"] };
const executablePath = browserExecutable(chromium);
if (executablePath) launchOptions.executablePath = executablePath;

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`${baseUrl}/case-1602?entry=building`, { waitUntil: "networkidle" });

  assert.equal(await page.getByRole("complementary", { name: "构件生命索引" }).count(), 0, "fresh Case must not open an object life panel before a spatial object is selected");

  const linkage = page.getByRole("region", { name: "空间事实与3D联动" });
  await linkage.waitFor();
  const memory = linkage.locator('button[data-spatial-kind="memory"]:not([disabled])').first();
  const businessId = await memory.getAttribute("data-business-id");
  assert.ok(businessId, "recorded Building Memory must expose a structured businessId");
  await memory.click();
  await page.locator(".component-inspector").waitFor();

  const overlay = page.getByRole("complementary", { name: "构件生命索引" });
  await overlay.waitFor();
  assert.equal(await overlay.getAttribute("data-component-life-id"), businessId, "object life must follow the same shared selectedBusinessId as the 3D twin");
  const text = await overlay.innerText();
  for (const expected of ["这个对象的一生", "当前事件身份", "系统归属", "建造与历史记忆", "已记录证据关联", "维修与事件留痕", "NO LIVE EVENT / 尚无正式事件"]) {
    assert.ok(text.includes(expected), `component life overlay is missing ${expected}`);
  }
  assert.ok(!text.includes("CURRENT CANDIDATE / 当前候选"), "fresh featured Case must not invent a current candidate identity");

  await linkage.getByRole("button", { name: "清除3D联动", exact: true }).click();
  await overlay.waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 844 });
  await memory.click();
  await overlay.waitFor();
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.html <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `390px component life overlay overflow: ${JSON.stringify(sizes)}`);
  assert.deepEqual(errors, [], `component life browser runtime errors: ${errors.join(" | ")}`);

  console.log("Component life QA passed: shared spatial selection opens a truth-bounded object-life index, clears with the shared focus, and remains usable at 390px.");
} finally {
  await browser.close();
}
