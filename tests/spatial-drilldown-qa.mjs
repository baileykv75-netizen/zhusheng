import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

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

function isCaseUrl(url) {
  return url.pathname.endsWith("/case-1602") && url.searchParams.get("entry") === "building";
}

async function openFreshHome(page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await waitForRealHero(page);
  await assertPhase(page, "building", "华章新筑 · 2号楼");
}

const browser = await chromium.launch({ headless: true });
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
  const handoff = page.getByRole("navigation", { name: "从建筑进入1602卫生间的空间路径" });
  await handoff.waitFor();
  const handoffText = await handoff.innerText();
  for (const expected of ["华章新筑 · 2号楼", "16F", "1602", "卫生间", "返回整栋建筑"]) {
    assert.ok(handoffText.includes(expected), `Case handoff is missing ${expected}`);
  }
  assert.equal(await handoff.getByRole("link", { name: "返回整栋建筑", exact: true }).getAttribute("href"), "/");
  await assertNoHorizontalOverflow(page, "desktop Case handoff");
  await page.screenshot({ path: path.join(output, "05-case-handoff.png"), fullPage: true });
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
  await mobilePage.getByRole("navigation", { name: "从建筑进入1602卫生间的空间路径" }).waitFor();
  await assertNoHorizontalOverflow(mobilePage, "mobile Case handoff 390");
  await mobilePage.screenshot({ path: path.join(output, "07-mobile-case-handoff-390.png"), fullPage: true });
  assert.deepEqual(mobileErrors, [], `mobile spatial runtime errors: ${mobileErrors.join(" | ")}`);
  await mobile.close();

  console.log("Spatial drilldown QA passed: published hero GLB, explicit four-step navigation, back/breadcrumb control, no autoplay, Case handoff and 390px continuity.");
} finally {
  await browser.close();
}