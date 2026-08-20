import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "artifacts/exhibit-qa";
const sessionKey = "zhusheng.life-event-lab.v2";
await mkdir(output, { recursive: true });

async function openSyntheticObservation(page, description) {
  await page.goto(`${baseUrl}/resident`, { waitUntil: "networkidle" });
  await page.locator(".resident-service").waitFor();
  await page.getByLabel("问题描述").fill(description);
  await page.locator(".resident-photo-guide").evaluate((details) => { details.open = true; });
  await page.getByRole("button", { name: "使用这张脱敏图继续演示" }).click();
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openSyntheticObservation(page, "我家卫生间北侧墙角最近一直很潮。");
  const initialSubmit = page.getByRole("button", { name: /提交初步情况，让筑生决定还缺什么/ });
  assert.equal(await initialSubmit.isDisabled(), true, "synthetic image selection alone must remain unconfirmed");
  await page.screenshot({ path: `${output}/v6-evidence-unconfirmed-1440.png`, fullPage: true });

  await page.getByRole("button", { name: "看见潮湿", exact: true }).click();
  await initialSubmit.click();
  assert.equal(await page.getByRole("button", { name: "有变化", exact: true }).count(), 1, "meter follow-up should appear only after photo-confirmed moisture");
  await page.getByRole("button", { name: "有变化", exact: true }).click();
  await page.getByRole("button", { name: /提交这项补充并交给物业核对/ }).click();
  await page.locator(".resident-progress").waitFor();

  const afterResident = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || "null"), sessionKey);
  assert.equal(afterResident.schemaVersion, 2);
  assert.equal(afterResident.result, null, "resident submission must not run diagnosis by itself");
  assert.equal(afterResident.residentSubmissions.length, 1);
  assert.equal(afterResident.productEvidenceTimeline.length, 3);
  assert.equal(afterResident.productEvidenceTimeline[0].type, "RESIDENT_TEXT_OBSERVATION");
  assert.equal(afterResident.productEvidenceTimeline[0].dataClass, "BROWSER_LOCAL", "typed resident text must not inherit synthetic photo provenance");
  assert.equal(afterResident.productEvidenceTimeline[0].domainEvidenceRefs.length, 0);
  assert.equal(afterResident.productEvidenceTimeline[2].dataClass, "BROWSER_LOCAL", "manual meter observation is browser-local even when the example photo is synthetic");

  await page.goto(`${baseUrl}/property`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "展开处理任务" }).click();
  await page.locator(".property-task-workspace").waitFor();
  const sourceText = await page.locator(".product-evidence-source").innerText();
  assert.match(sourceText, /住户本轮新提交 · 只读/);
  assert.match(sourceText, /我家卫生间北侧墙角最近一直很潮/);
  assert.equal(await page.locator('.product-evidence-source select option[value="MOISTURE_VISIBLE"]').count(), 0, "property must not edit resident photo finding");
  await page.locator(".property-review-form").evaluate((details) => { details.open = true; });
  await page.getByRole("button", { name: "追加物业复核记录" }).click();
  await page.locator(".property-review-history li").waitFor();

  const afterReview = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || "null"), sessionKey);
  assert.deepEqual(afterReview.residentSubmissions, afterResident.residentSubmissions, "property review must not mutate resident submissions");
  assert.equal(afterReview.propertyReviews.length, 1);
  assert.equal(afterReview.productEvidenceTimeline.length, 4);
  assert.equal(afterReview.productEvidenceTimeline[3].dataClass, "BROWSER_LOCAL");
  assert.equal(afterReview.productEvidenceTimeline[3].domainEvidenceRefs.length, 0);
  await page.screenshot({ path: `${output}/v6-evidence-property-review-1440.png`, fullPage: true });

  await page.goto(`${baseUrl}/case-1602`, { waitUntil: "networkidle" });
  await page.locator(".evidence-time-chain").waitFor();
  assert.equal(await page.locator(".product-evidence-entry").count(), 4, "pre-assessment timeline should expose only the four actual product records");
  assert.deepEqual(pageErrors, []);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await openSyntheticObservation(mobilePage, "卫生间镜前灯一直闪烁。");
  const mobileInitial = mobilePage.getByRole("button", { name: /提交初步情况，让筑生决定还缺什么/ });
  assert.equal(await mobileInitial.isDisabled(), true);
  await mobilePage.getByRole("button", { name: "未见潮湿", exact: true }).click();
  await mobileInitial.click();
  assert.equal(await mobilePage.getByRole("button", { name: "有变化", exact: true }).count(), 0, "non-moisture observation must not force a meter branch");
  const saveOnly = mobilePage.getByRole("button", { name: /保存这次现场事实，不进入漏水补证/ });
  await saveOnly.click();
  await mobilePage.locator(".resident-progress").waitFor();

  const productOnly = await mobilePage.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || "null"), sessionKey);
  assert.equal(productOnly.residentSubmissions.length, 1);
  assert.equal(productOnly.residentSubmissions[0].meterObservationStatus, "NOT_REQUESTED");
  assert.equal(productOnly.residentSubmissions[0].meterFinding, "UNREADABLE");
  assert.equal(productOnly.residentSubmissions[0].domainAdapterStatus, "PRODUCT_ONLY");
  assert.equal(productOnly.productEvidenceTimeline.length, 2, "a skipped meter question must not create a meter evidence row");
  assert.equal(productOnly.productEvidenceTimeline.some((item) => item.type === "RESIDENT_METER_OBSERVATION"), false);
  await mobilePage.screenshot({ path: `${output}/v6-evidence-product-only-390.png`, fullPage: true });
  const dimensions = await mobilePage.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.html <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `mobile evidence form overflow: ${JSON.stringify(dimensions)}`);
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Evidence correctness QA v2 passed: facts persist without invented follow-up, provenance stays truthful, property review remains independent, and mobile intake stays bounded.");
