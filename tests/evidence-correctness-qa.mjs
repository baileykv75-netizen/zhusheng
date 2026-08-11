import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/exhibit-qa";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/resident`, { waitUntil: "networkidle" });
  await page.locator(".resident-service").waitFor();
  await page.locator(".resident-photo-guide").evaluate((details) => { details.open = true; });
  await page.locator(".resident-photo-guide section > button").click();
  assert.equal(await page.locator(".resident-primary").isDisabled(), true, "selecting the synthetic image must remain unconfirmed");
  assert.ok((await page.locator(".resident-message").innerText()).includes("不代表系统识别到潮湿"));
  await page.screenshot({ path: `${output}/v6-evidence-unconfirmed-1440.png`, fullPage: true });

  await page.getByRole("button", { name: "看见潮湿", exact: true }).click();
  await page.getByRole("button", { name: "有变化", exact: true }).click();
  await page.locator(".resident-primary").click();
  await page.locator(".resident-authorization").waitFor({ timeout: 20_000 });

  const afterResident = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.life-event-lab.v2") || "null"));
  assert.equal(afterResident.schemaVersion, 2, "additive evidence fields must keep the V2 session schema");
  assert.equal(afterResident.residentSubmissions.length, 1);
  assert.equal(afterResident.productEvidenceTimeline.length, 3);
  assert.equal(afterResident.productEvidenceTimeline[0].type, "RESIDENT_TEXT_OBSERVATION");
  assert.equal(afterResident.productEvidenceTimeline[0].domainEvidenceRefs.length, 0, "resident text must not enter domain scoring");
  assert.equal(afterResident.productEvidenceTimeline[1].domainEvidenceRefs.length, 1, "confirmed photo may map to existing domain evidence");

  await page.goto(`${baseUrl}/property`, { waitUntil: "networkidle" });
  await page.locator(".property-task-workspace").waitFor();
  await page.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 20_000 });
  const sourceText = await page.locator(".product-evidence-source").innerText();
  assert.ok(sourceText.includes("住户原始提交 · 只读"));
  assert.ok(sourceText.includes("我家卫生间北侧墙角最近一直很潮"));
  assert.equal(await page.locator('.product-evidence-source select option[value="MOISTURE_VISIBLE"]').count(), 0, "property must not edit the resident photo finding");
  await page.locator(".property-review-form").evaluate((details) => { details.open = true; });
  await page.getByRole("button", { name: "追加物业复核记录" }).click();
  await page.locator(".property-review-history li").waitFor();

  const afterReview = await page.evaluate(() => JSON.parse(sessionStorage.getItem("zhusheng.life-event-lab.v2") || "null"));
  assert.deepEqual(afterReview.residentSubmissions, afterResident.residentSubmissions, "property review must not mutate resident submissions");
  assert.equal(afterReview.propertyReviews.length, 1);
  assert.equal(afterReview.productEvidenceTimeline.length, 4);
  assert.equal(afterReview.productEvidenceTimeline[3].domainEvidenceRefs.length, 0, "property review must remain outside domain scoring");
  await page.screenshot({ path: `${output}/v6-evidence-property-review-1440.png`, fullPage: true });

  await page.goto(`${baseUrl}/case-1602`, { waitUntil: "networkidle" });
  await page.locator(".evidence-time-chain").waitFor();
  assert.equal(await page.locator(".product-evidence-entry").count(), 4, "case timeline must expose product evidence provenance");
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/resident`, { waitUntil: "networkidle" });
  await mobilePage.locator(".resident-photo-guide").evaluate((details) => { details.open = true; });
  await mobilePage.locator(".resident-photo-guide section > button").click();
  assert.equal(await mobilePage.locator(".resident-primary").isDisabled(), true);
  await mobilePage.screenshot({ path: `${output}/v6-evidence-unconfirmed-390.png`, fullPage: true });
  const dimensions = await mobilePage.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `mobile evidence form overflow: ${JSON.stringify(dimensions)}`);
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Evidence correctness QA passed: manual photo finding, immutable resident submission, independent property review, and timeline provenance.");
