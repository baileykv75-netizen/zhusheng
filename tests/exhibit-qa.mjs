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

const launchBrowser = () => chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});

let browser = await launchBrowser();

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const home = await context.newPage();
    const failedHomeAssets = [];
    const homeRuntimeErrors = [];
    home.on("pageerror", (error) => homeRuntimeErrors.push(error.message));
    home.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) homeRuntimeErrors.push(message.text());
    });
    home.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === new URL(baseUrl).origin && response.status() >= 400 && (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/"))) {
        failedHomeAssets.push(`${response.status()} ${url.pathname}`);
      }
    });
    await home.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    try {
      await home.locator(".v6-home").waitFor();
    } catch (error) {
      console.error(`${viewport.name} runtime errors:`, homeRuntimeErrors);
      console.error(`${viewport.name} failed assets:`, failedHomeAssets);
      throw error;
    }
    await home.waitForFunction(() => document.querySelector(".v6-building-twin")?.getAttribute("data-visual-source") === "hero-glb", null, { timeout: 30_000 });
    assert.equal(await home.locator(".v6-enter-building").count(), 1, `${viewport.name}: homepage must have one primary entry`);
    assert.equal(await home.locator(".v6-building-twin canvas").count(), 1, `${viewport.name}: building must be the hero interface`);
    assert.equal(await home.locator(".v6-event-anchor").count(), 1, `${viewport.name}: 1602 must be located by one restrained event pulse`);
    assert.equal(await home.locator("input, textarea").count(), 0, `${viewport.name}: homepage must not become an input console`);
    assert.equal(await home.locator(".v6-story-chapter").count(), 3, `${viewport.name}: homepage must show one continuous three-part lifecycle`);
    assert.equal(await home.locator("img[src*='/assets/v5']").count(), 0, `${viewport.name}: homepage must not use V5 image art`);
    const homeDimensions = await home.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(homeDimensions.html <= homeDimensions.width + 1 && homeDimensions.body <= homeDimensions.width + 1, `${viewport.name}: homepage overflows: ${JSON.stringify(homeDimensions)}`);
    assert.deepEqual(failedHomeAssets, [], `${viewport.name}: homepage asset failures: ${failedHomeAssets.join(", ")}`);
    assert.deepEqual(homeRuntimeErrors, [], `${viewport.name}: homepage runtime errors: ${homeRuntimeErrors.join(" | ")}`);
    await home.screenshot({ path: `${output}/v6-home-${viewport.name}.png`, fullPage: true });

    const casePage = await context.newPage();
    const failedCaseAssets = [];
    const caseRuntimeErrors = [];
    casePage.on("pageerror", (error) => caseRuntimeErrors.push(error.message));
    casePage.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) caseRuntimeErrors.push(message.text());
    });
    casePage.on("response", (response) => {
      const url = new URL(response.url());
      if (url.origin === new URL(baseUrl).origin && response.status() >= 400 && (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/") || url.pathname.endsWith(".glb"))) {
        failedCaseAssets.push(`${response.status()} ${url.pathname}`);
      }
    });
    await casePage.goto(`${baseUrl}/case-1602`, { waitUntil: "domcontentloaded" });
    await casePage.locator(".case-exhibit").waitFor();
    await casePage.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 20_000 });
    assert.equal(await casePage.locator('.twin-viewport[data-visual-source="premium"]').count(), 1, `${viewport.name}: verified premium twin must be the active visual source`);
    assert.equal(await casePage.locator(".twin-canvas canvas").count(), 1, `${viewport.name}: 1602 visual twin must produce a WebGL canvas`);
    assert.equal(await casePage.locator(".case-time-switch button").count(), 2, `${viewport.name}: case must offer one simple now/construction-time switch`);
    assert.equal(await casePage.locator(".case-route article").count(), 5, `${viewport.name}: case must retain all five chapters`);
    assert.equal(await casePage.locator(".case-route article > a").count(), 1, `${viewport.name}: future chapters must remain locked before the event advances`);
    assert.equal(await casePage.locator(".building-ai-empty").count(), 1, `${viewport.name}: building AI must be the default 1602 workspace`);
    assert.equal(await casePage.locator(".building-ai-form button[type='submit']").count(), 1, `${viewport.name}: AI workspace must expose one read-only query action`);
    await casePage.locator(".case-workspace > nav button").filter({ hasText: "事件闭环" }).click();
    assert.equal(await casePage.locator(".case-current-card .case-primary").count(), 1, `${viewport.name}: professional verification must retain one next action`);
    await casePage.locator(".case-workspace > nav button").filter({ hasText: "筑生 AI" }).click();
    assert.equal(await casePage.locator(".evidence-time-chain li").count(), 5, `${viewport.name}: case must show one five-step evidence timeline`);
    assert.equal(await casePage.locator(".evidence-time-chain img[src*='water-meter-observation']").count(), 1, `${viewport.name}: evidence timeline must include a water-meter observation`);
    await casePage.locator(".case-time-switch button").first().click();
    await casePage.locator('.twin-viewport[data-view="VIEW_RESIDENT"]').waitFor();
    await casePage.locator(".case-time-switch button").last().click();
    await casePage.locator('.twin-viewport[data-view="VIEW_CONSTRUCTION_MEMORY"]').waitFor();
    const caseDimensions = await casePage.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(caseDimensions.html <= caseDimensions.width + 1 && caseDimensions.body <= caseDimensions.width + 1, `${viewport.name}: case overflows: ${JSON.stringify(caseDimensions)}`);
    assert.deepEqual(failedCaseAssets, [], `${viewport.name}: case asset failures: ${failedCaseAssets.join(", ")}`);
    assert.deepEqual(caseRuntimeErrors, [], `${viewport.name}: case runtime errors: ${caseRuntimeErrors.join(" | ")}`);
    if (viewport.name === "1440") {
      const visualViews = [
        ["空间", "VIEW_RESIDENT", "resident"],
        ["定位", "VIEW_DIAGNOSTIC", "diagnostic"],
        ["建造时", "VIEW_CONSTRUCTION_MEMORY", "construction-memory"],
        ["维修后", "VIEW_MAINTENANCE", "maintenance"]
      ];
      for (const [label, dataView, filename] of visualViews) {
        await casePage.locator(".twin-toolbar button").filter({ hasText: label }).evaluate((button) => button.click());
        await casePage.locator(`.twin-viewport[data-view="${dataView}"]`).waitFor();
        await casePage.locator(".case-stage").screenshot({ path: `${output}/v6-1602-${filename}.png` });
      }
    }
    await casePage.screenshot({ path: `${output}/case-1602-${viewport.name}.png`, fullPage: true });
    await home.close();
    await casePage.close();
    await context.close();
    // SwiftShader may retain released contexts for the lifetime of one browser
    // process. A fresh process keeps responsive QA representative of a real visit.
    await browser.close();
    browser = await launchBrowser();
  }

  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const drill = await context.newPage();
  await drill.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await drill.waitForFunction(() => document.querySelector(".v6-building-twin")?.getAttribute("data-visual-source") === "hero-glb", null, { timeout: 30_000 });
  await drill.locator(".v6-enter-building").click();
  await drill.locator(".v6-building-twin.phase-floor").waitFor();
  await drill.screenshot({ path: `${output}/v6-hero-16f-focus.png`, fullPage: false });
  await drill.waitForURL(/\/case-1602\/?$/, { timeout: 60_000, waitUntil: "commit" });
  assert.equal(await drill.locator(".case-exhibit").count(), 1, "building drill-down must end at the 1602 event");
  const deepLink = await context.newPage();
  await deepLink.goto(`${baseUrl}/worker`, { waitUntil: "domcontentloaded" });
  await deepLink.locator("a.return-agent").waitFor({ timeout: 20_000 });
  assert.equal(await deepLink.locator("a.return-agent[href^='/case-1602']").count(), 1, "deep workspaces must return to the verification case");
  await context.close();

  for (const viewport of [{ name: "1440", width: 1440, height: 900 }, { name: "390", width: 390, height: 844 }]) {
    const roleContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const eventsPage = await roleContext.newPage();
    await eventsPage.goto(`${baseUrl}/events`, { waitUntil: "domcontentloaded" });
    await eventsPage.locator(".event-center").waitFor();
    assert.equal(await eventsPage.locator(".event-list article").count(), 5, `${viewport.name}: event center must establish building scale with five events`);
    assert.equal(await eventsPage.locator(".event-list article.deep").count(), 1, `${viewport.name}: only 1602 may be a deep event`);
    assert.equal(await eventsPage.locator(".event-list article > a").count(), 1, `${viewport.name}: synthetic shallow events must not pretend to have a full workflow`);

    const residentPage = await roleContext.newPage();
    await residentPage.goto(`${baseUrl}/resident`, { waitUntil: "domcontentloaded" });
    await residentPage.locator(".resident-service").waitFor();
    assert.equal(await residentPage.locator(".twin-viewport").count(), 0, `${viewport.name}: resident service must not expose the engineering twin`);
    assert.equal(await residentPage.locator('input[type="file"][accept*="image/jpeg"][accept*="image/png"][accept*="image/webp"]').count(), 1, `${viewport.name}: resident must accept JPG, PNG and WEBP local evidence`);
    assert.equal(await residentPage.locator(".resident-primary").count(), 1, `${viewport.name}: resident intake must have one primary action`);
    assert.equal(await residentPage.locator(".resident-primary").isDisabled(), true, `${viewport.name}: resident submission must wait for a local or explicitly synthetic image`);
    await residentPage.locator(".resident-photo-guide").evaluate((details) => { details.open = true; });
    assert.equal(await residentPage.locator(".resident-photo-guide img").count(), 2, `${viewport.name}: photo guide must distinguish model locator and synthetic example`);
    await residentPage.locator(".resident-photo-guide section > button").click();
    assert.equal(await residentPage.locator(".resident-primary").isDisabled(), true, `${viewport.name}: selecting a file must not imply moisture was observed`);
    await residentPage.getByRole("button", { name: "看见潮湿", exact: true }).click();
    await residentPage.getByRole("button", { name: "有变化", exact: true }).click();
    assert.equal(await residentPage.locator(".resident-primary").isEnabled(), true, `${viewport.name}: manual photo and meter observations may unlock submission`);

    const propertyPage = await roleContext.newPage();
    await propertyPage.goto(`${baseUrl}/property`, { waitUntil: "domcontentloaded" });
    await propertyPage.locator(".property-task-workspace").waitFor();
    await propertyPage.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 20_000 });
    assert.equal(await propertyPage.locator(".professional-task-pane .active-task").count(), 1, `${viewport.name}: property workspace must show one current task`);
    assert.equal(await propertyPage.locator(".property-event-queue").count(), 1, `${viewport.name}: property workspace must expose its event queue`);
    assert.ok((await propertyPage.locator(".product-evidence-source").innerText()).includes("尚无住户原始提交"), `${viewport.name}: property must not invent resident evidence`);
    assert.equal(await propertyPage.locator(".resident-guided-task .task-primary").isDisabled(), true, `${viewport.name}: property assessment must wait for resident source evidence`);

    const workerPage = await roleContext.newPage();
    await workerPage.goto(`${baseUrl}/worker`, { waitUntil: "domcontentloaded" });
    await workerPage.locator(".field-recorder").waitFor({ timeout: 20_000 });
    assert.equal(await workerPage.locator('input[type="file"][accept*="image/jpeg"][accept*="image/png"][accept*="image/webp"]').count(), 1, `${viewport.name}: worker must support JPG, PNG and WEBP construction evidence`);

    const pages = [eventsPage, residentPage, propertyPage, workerPage];
    for (const page of pages) {
      const dimensions = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `${viewport.name}: role page overflows: ${JSON.stringify(dimensions)}`);
    }
    await eventsPage.screenshot({ path: `${output}/v6-events-${viewport.name}.png`, fullPage: true });
    await residentPage.screenshot({ path: `${output}/v6-resident-${viewport.name}.png`, fullPage: true });
    await propertyPage.screenshot({ path: `${output}/v6-property-${viewport.name}.png`, fullPage: true });
    if (viewport.name === "1440") {
      await eventsPage.locator(".workspace-menu summary").click();
      await eventsPage.locator(".workspace-menu nav button").click();
      await eventsPage.getByRole("dialog", { name: "筑生总智能体" }).waitFor();
      assert.ok((await eventsPage.getByRole("dialog", { name: "筑生总智能体" }).innerText()).includes("问这栋房子"), "Building Agent must remain reachable in ordinary language");
      assert.equal((await eventsPage.getByRole("dialog", { name: "筑生总智能体" }).innerText()).includes("DeepSeek"), false, "ordinary Building Agent view must not lead with provider details");
      await eventsPage.getByRole("button", { name: "关闭", exact: true }).click();
      const groupPage = await roleContext.newPage();
      await groupPage.goto(`${baseUrl}/group`, { waitUntil: "domcontentloaded" });
      await groupPage.locator(".group-constellation-intro").waitFor();
      assert.equal(await groupPage.getByText("AI生成 · 脱敏合成演示", { exact: true }).count(), 1, "group constellation must disclose generated imagery");
      assert.ok((await groupPage.locator("body").innerText()).includes("不能自动写成企业标准"), "group task view must preserve the governance boundary");
      await groupPage.screenshot({ path: `${output}/v6-group-1440.png`, fullPage: true });
    }
    await roleContext.close();
  }
} finally {
  await browser.close();
}

console.log("Exhibit QA passed: V6 building hero, spatial drill-down, 1602 case, deep-link return, and four responsive widths.");
