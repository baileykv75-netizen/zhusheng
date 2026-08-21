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
const output = process.env.QA_OUTPUT || path.resolve(process.cwd(), "artifacts/spatial-drilldown");
await mkdir(output, { recursive: true });

async function assertNoHorizontalOverflow(page, label) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  assert.ok(sizes.html <= sizes.viewport + 1, `${label}: html overflow ${JSON.stringify(sizes)}`);
  assert.ok(sizes.body <= sizes.viewport + 1, `${label}: body overflow ${JSON.stringify(sizes)}`);
}

async function waitForRealHero(page) {
  await page.locator(".v6-building-twin").waitFor();
  await page.waitForFunction(() => {
    const source = document.querySelector(".v6-building-twin")?.getAttribute("data-visual-source");
    return source === "hero-glb" || source === "procedural-fallback";
  }, null, { timeout: 30_000 });

  const source = await page.locator(".v6-building-twin").getAttribute("data-visual-source");
  assert.equal(source, "hero-glb", "current spatial acceptance requires the published hero GLB, not the procedural fallback");
  assert.equal(await page.locator(".v6-building-twin canvas").count(), 1, "hero GLB must render through one WebGL canvas");
}

async function assertPhase(page, phase, currentLabel) {
  await page.locator(`.v6-building-twin.phase-${phase}`).waitFor();
  const current = page.locator('.v6-drill-breadcrumb button[aria-current="location"]');
  assert.equal(await current.count(), 1, `${phase}: exactly one breadcrumb must be current`);
  assert.equal((await current.innerText()).trim(), currentLabel, `${phase}: breadcrumb current location mismatch`);
}

function normalizePathname(pathname) {
  // next.config.ts uses trailingSlash: true; dev/static URLs must share one assertion.
  return pathname.replace(/\/+$/, "") || "/";
}

function isCaseUrl(url) {
  return normalizePathname(url.pathname).endsWith("/case-1602")
    && url.searchParams.get("entry") === "building";
}

async function openFreshHome(page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await waitForRealHero(page);
  await assertPhase(page, "building", "华章新筑 · 2号楼");
}

async function assertCaseSpatialIdentity(page) {
  const handoff = page.getByRole("navigation", { name: "从建筑进入1602卫生间的空间路径" });
  await handoff.waitFor();
  const handoffText = await handoff.innerText();
  for (const expected of ["华章新筑 · 2号楼", "16F", "1602", "卫生间", "SPACE-1602-BATHROOM", "查看1602整户", "查看16F", "返回整栋建筑"]) {
    assert.ok(handoffText.includes(expected), `Case spatial identity is missing ${expected}`);
  }
  assert.equal(await handoff.getByRole("link", { name: "查看1602整户", exact: true }).getAttribute("href"), "/?drill=unit");
  assert.equal(await handoff.getByRole("link", { name: "查看16F", exact: true }).getAttribute("href"), "/?drill=floor");
  assert.equal(await handoff.getByRole("link", { name: "返回整栋建筑", exact: true }).getAttribute("href"), "/?drill=building");

  const reason = page.getByRole("region", { name: "为什么定位到1602卫生间" });
  await reason.waitFor();
  const reasonText = await reason.innerText();
  assert.ok(reasonText.includes("FEATURED CASE / NOT LIVE"), "fresh Case must explain that the featured space is not a live event");
  assert.ok(reasonText.includes("不代表此刻已经发生故障"), "fresh Case must not turn featured spatial context into a current fault claim");
  assert.ok(reasonText.includes("未形成正式事件"), "fresh Case must expose actual event absence");
}

async function assertCaseSpatialLinkage(page) {
  const linkage = page.getByRole("region", { name: "空间事实与3D联动" });
  await linkage.waitFor();

  const text = await linkage.innerText();
  for (const expected of ["当前候选", "建筑记忆", "Product Evidence", "可追溯系统", "3D 联动只改变“看哪里”"]) {
    assert.ok(text.includes(expected), `Case spatial linkage is missing ${expected}`);
  }
  assert.ok(text.includes("当前没有可安全展示的领域候选"), "fresh Case must not invent a current diagnostic candidate");
  assert.ok(text.includes("当前会话还没有 Product Evidence"), "fresh Case must not invent Product Evidence");

  const memoryButtons = linkage.locator('button[data-spatial-kind="memory"]:not([disabled])');
  assert.ok(await memoryButtons.count() > 0, "fresh featured Case should expose at least one recorded Building Memory target");
  await memoryButtons.first().click();
  await page.locator(".component-inspector").waitFor();
  const memoryFocus = await linkage.locator("[data-spatial-focus]").innerText();
  assert.ok(memoryFocus.startsWith("建筑记忆 · "), `memory click did not drive shared 3D focus: ${memoryFocus}`);

  const systemButtons = linkage.locator('button[data-spatial-kind="system"]');
  assert.ok(await systemButtons.count() > 0, "recorded memory relations should expose at least one traceable system");
  await systemButtons.first().click();
  await page.waitForFunction(() => document.querySelector("[data-spatial-focus]")?.textContent?.startsWith("系统追踪 · "));
  const systemFocus = await linkage.locator("[data-spatial-focus]").innerText();
  assert.ok(systemFocus.startsWith("系统追踪 · "), `system trace did not become the active spatial focus: ${systemFocus}`);
  const statusStrip = await page.locator(".twin-status-strip").innerText();
  assert.ok(statusStrip.includes("已定位"), "system trace must drive the existing twin visual targeting");

  await linkage.getByRole("button", { name: "清除3D联动", exact: true }).click();
  assert.ok((await linkage.locator("[data-spatial-focus]").innerText()).includes("选择一条已有事实"), "clear action must restore neutral spatial linkage state");
}

async function assertEvidenceTimelineSpatialEntry(page) {
  const linkage = page.getByRole("region", { name: "空间事实与3D联动" });
  const systemButtons = linkage.locator('button[data-spatial-kind="system"]');
  assert.ok(await systemButtons.count() > 0, "timeline override check needs one recorded system focus first");
  await systemButtons.first().click();
  await page.waitForFunction(() => document.querySelector("[data-spatial-focus]")?.textContent?.startsWith("系统追踪 · "));

  await page.getByText("展开证据时间链", { exact: true }).click();
  const timeline = page.locator(".evidence-time-chain");
  await timeline.waitFor();
  const action = timeline.locator('button[data-evidence-spatial-kind="CONSTRUCTION_MEMORY"]');
  assert.equal(await action.count(), 1, "fresh timeline should expose exactly one construction-memory spatial entry");
  const businessId = await action.getAttribute("data-business-id");
  assert.ok(businessId, "construction-memory timeline entry must carry its recorded business id");

  await action.click();
  await page.waitForFunction((expected) => document.querySelector("[data-spatial-focus]")?.textContent?.startsWith("证据时间线 · ") && document.querySelector(`[data-evidence-spatial-source][data-business-id="${expected}"]`)?.getAttribute("aria-pressed") === "true", businessId);
  const timelineFocus = await linkage.locator("[data-spatial-focus]").innerText();
  assert.ok(timelineFocus.startsWith("证据时间线 · "), `timeline entry did not replace the previous system focus: ${timelineFocus}`);
  const inspectorText = await page.locator(".component-inspector").innerText();
  assert.ok(inspectorText.includes(businessId), `timeline entry did not drive the shared 3D inspector to ${businessId}`);

  await linkage.getByRole("button", { name: "清除3D联动", exact: true }).click();
  assert.equal(await action.getAttribute("aria-pressed"), "false", "clearing shared 3D focus must clear the timeline active state too");
}

const launchOptions = {
  headless: true,
  // CI runners may not expose a hardware GPU. Software WebGL is acceptable for
  // verifying the published GLB + anchor behavior and avoids a false product fallback.
  args: ["--enable-unsafe-swiftshader"]
};
const executablePath = browserExecutable(chromium);
if (executablePath) launchOptions.executablePath = executablePath;

const browser = await chromium.launch(launchOptions);
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  const desktopErrors = [];
  page.on("pageerror", (error) => desktopErrors.push(error.message));

  await openFreshHome(page);
  await assertNoHorizontalOverflow(page, "desktop building");
  await page.screenshot({ path: path.join(output, "01-building.png"), fullPage: true });

  const primary = page.locator(".v6-enter-building");
  await primary.click();
  await assertPhase(page, "floor", "16F");
  await page.waitForTimeout(2700);
  await assertPhase(page, "floor", "16F");
  assert.equal(isCaseUrl(new URL(page.url())), false, "one click must not auto-play the remaining drilldown or navigate to Case");
  await page.screenshot({ path: path.join(output, "02-floor-stable.png"), fullPage: true });

  await page.getByRole("button", { name: "返回上一级", exact: true }).click();
  await assertPhase(page, "building", "华章新筑 · 2号楼");

  await page.getByRole("button", { name: "1602", exact: true }).click();
  await assertPhase(page, "unit", "1602");
  await page.getByRole("button", { name: "16F", exact: true }).click();
  await assertPhase(page, "floor", "16F");

  await primary.click();
  await assertPhase(page, "unit", "1602");
  await assertNoHorizontalOverflow(page, "desktop unit");
  await page.screenshot({ path: path.join(output, "03-unit.png"), fullPage: true });

  await primary.click();
  await assertPhase(page, "space", "卫生间");
  await page.waitForTimeout(2700);
  await assertPhase(page, "space", "卫生间");
  assert.equal(isCaseUrl(new URL(page.url())), false, "space phase must remain under user control until the final explicit action");
  await assertNoHorizontalOverflow(page, "desktop space");
  await page.screenshot({ path: path.join(output, "04-space-stable.png"), fullPage: true });

  await primary.click();
  await page.waitForURL((url) => isCaseUrl(url), { timeout: 20_000 });
  await assertCaseSpatialIdentity(page);
  await assertCaseSpatialLinkage(page);
  await assertEvidenceTimelineSpatialEntry(page);
  await assertNoHorizontalOverflow(page, "desktop Case spatial life page");
  await page.screenshot({ path: path.join(output, "05-case-timeline-spatial-entry.png"), fullPage: true });

  await page.getByRole("link", { name: "查看1602整户", exact: true }).click();
  await waitForRealHero(page);
  await assertPhase(page, "unit", "1602");
  await assertNoHorizontalOverflow(page, "desktop reverse to unit");

  await page.goto(`${baseUrl}/case-1602?entry=building`, { waitUntil: "networkidle" });
  await assertCaseSpatialIdentity(page);
  await page.getByRole("link", { name: "查看16F", exact: true }).click();
  await waitForRealHero(page);
  await assertPhase(page, "floor", "16F");
  await assertNoHorizontalOverflow(page, "desktop reverse to floor");

  assert.deepEqual(desktopErrors, [], `desktop spatial runtime errors: ${desktopErrors.join(" | ")}`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));

  await openFreshHome(mobilePage);
  await assertNoHorizontalOverflow(mobilePage, "mobile building 390");
  const mobilePrimary = mobilePage.locator(".v6-enter-building");
  for (const [phase, label] of [["floor", "16F"], ["unit", "1602"], ["space", "卫生间"]]) {
    await mobilePrimary.click();
    await assertPhase(mobilePage, phase, label);
    await assertNoHorizontalOverflow(mobilePage, `mobile ${phase} 390`);
  }
  await mobilePage.screenshot({ path: path.join(output, "06-mobile-space-390.png"), fullPage: true });

  await mobilePrimary.click();
  await mobilePage.waitForURL((url) => isCaseUrl(url), { timeout: 20_000 });
  await assertCaseSpatialIdentity(mobilePage);
  await mobilePage.getByRole("region", { name: "空间事实与3D联动" }).waitFor();
  await mobilePage.getByText("展开证据时间链", { exact: true }).click();
  await mobilePage.locator(".evidence-time-chain").waitFor();
  await assertNoHorizontalOverflow(mobilePage, "mobile Case timeline spatial entry 390");
  await mobilePage.screenshot({ path: path.join(output, "07-mobile-case-timeline-390.png"), fullPage: true });
  assert.deepEqual(mobileErrors, [], `mobile spatial runtime errors: ${mobileErrors.join(" | ")}`);
  await mobile.close();

  console.log("Spatial drilldown QA passed: published hero GLB, explicit four-step navigation, truthful Case spatial identity, recorded-fact-to-3D linkage, evidence-timeline spatial entry, deterministic system trace, reverse hierarchy restoration and 390px continuity.");
} finally {
  await browser.close();
}
