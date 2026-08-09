import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4174";
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/stage5";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

async function assertNoOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.html <= sizes.viewport + 1, `${label} html overflow: ${JSON.stringify(sizes)}`);
  assert.ok(sizes.body <= sizes.viewport + 1, `${label} body overflow: ${JSON.stringify(sizes)}`);
}

async function openLearning(page) {
  await page.goto(`${baseUrl}/group/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "建筑生命经验回流", exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText("来源事件已验证", { exact: true }).waitFor();
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await desktop.newPage();
await openLearning(page);
await assertNoOverflow(page, "stage5 desktop");
await page.screenshot({ path: `${output}/01-group-learning-entry.png`, fullPage: true });
await page.getByRole("button", { name: "查看验证详情" }).click();
await page.locator(".group-evidence-chain").screenshot({ path: `${output}/02-complete-evidence-chain.png` });
await page.locator(".group-learning-card").screenshot({ path: `${output}/03-single-case-card.png` });
await page.locator(".known-unknown-grid").screenshot({ path: `${output}/04-known-and-unproven.png` });
await page.locator(".worker-contribution").screenshot({ path: `${output}/05-worker-evidence-contribution.png` });
await page.locator(".group-governance").screenshot({ path: `${output}/06-human-review-options.png` });

const returnedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const returned = await returnedContext.newPage();
await openLearning(returned);
await returned.getByRole("button", { name: "退回补证", exact: true }).click();
await returned.getByLabel("评审意见").fill("当前仅有单事件，退回补充下一批试点的连接节点影像与复核记录。");
await returned.getByRole("button", { name: "提交人工评审" }).click();
await returned.getByRole("heading", { name: "已退回补充证据" }).waitFor();
assert.equal(await returned.locator(".pilot-checklist").count(), 0);
await returned.screenshot({ path: `${output}/07-return-for-evidence.png`, fullPage: true });

const approvedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
const approved = await approvedContext.newPage();
await openLearning(approved);
await approved.getByRole("button", { name: "采纳为试点", exact: true }).click();
await approved.getByLabel("评审意见").fill("采纳为下一批MiC卫生间模块试点检查项，待多项目验证后再议，不升级为企业标准。");
await approved.getByRole("button", { name: "提交人工评审" }).click();
await approved.getByRole("heading", { name: "已采纳为试点检查项" }).waitFor();
await approved.screenshot({ path: `${output}/08-approved-as-pilot.png`, fullPage: true });
await approved.locator(".pilot-checklist").screenshot({ path: `${output}/09-pilot-only-checklist.png` });
await approved.getByRole("button", { name: "查看验证详情" }).click();
await approved.locator(".group-review-audit").screenshot({ path: `${output}/10-review-audit.png` });

const downloads = [
  ["经验卡 JSON", "GLC-EVT-1602-LAB-001.browser.json"],
  ["工友贡献 JSON", "GLC-EVT-1602-LAB-001.worker-contributions.browser.json"],
  ["评审审计 JSONL", "GLC-EVT-1602-LAB-001.review-audit.browser.jsonl"],
  ["试点检查项 JSON", "PILOT-GLC-EVT-1602-LAB-001.browser.json"],
  ["完整经验回流包", "GLC-EVT-1602-LAB-001.group-learning-bundle.browser.json"]
];
for (const [buttonName, filename] of downloads) {
  const event = approved.waitForEvent("download");
  await approved.getByRole("button", { name: buttonName, exact: true }).click();
  await (await event).saveAs(`${output}/${filename}`);
}
await approved.getByText(/下载前验证已通过/).waitFor();
await approved.locator(".group-downloads").screenshot({ path: `${output}/11-downloads.png` });
await approved.emulateMedia({ media: "print" });
await approved.pdf({ path: `${output}/GLC-EVT-1602-LAB-001.report.pdf`, format: "A4", printBackground: true });
await approved.locator(".group-learning-print-report").screenshot({ path: `${output}/GLC-EVT-1602-LAB-001.report.png` });
await approved.emulateMedia({ media: "screen" });

await approved.reload({ waitUntil: "networkidle" });
await approved.getByRole("heading", { name: "已采纳为试点检查项" }).waitFor();
const isolatedTab = await approvedContext.newPage();
await openLearning(isolatedTab);
await isolatedTab.getByRole("heading", { name: "等待集团人员评审" }).waitFor();
assert.equal(await isolatedTab.locator(".pilot-checklist").count(), 0);

const staleContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const stalePage = await staleContext.newPage();
await stalePage.addInitScript(() => {
  sessionStorage.setItem("zhusheng.group-learning.v2", JSON.stringify({
    schemaVersion: 3,
    cardId: "GLC-STALE-SOURCE",
    reviewAudit: [{ cardId: "GLC-STALE-SOURCE" }]
  }));
});
await openLearning(stalePage);
await stalePage.getByText("来源事件已经切换；上一张经验卡的评审记录已与当前会话隔离。").waitFor();
await stalePage.getByRole("heading", { name: "等待集团人员评审" }).waitFor();
await stalePage.waitForFunction(() => {
  const saved = JSON.parse(sessionStorage.getItem("zhusheng.group-learning.v2") ?? "null");
  return saved?.schemaVersion === 3 && Array.isArray(saved.reviewAudit) && saved.reviewAudit.length === 0;
});
const nextOverlayText = await stalePage.locator("nextjs-portal").allTextContents();
assert.ok(!nextOverlayText.join(" ").includes("Runtime Error"));
assert.ok(!nextOverlayText.join(" ").includes("评审审计引用了其他经验卡"));
await staleContext.close();

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const mobile = await mobileContext.newPage();
await openLearning(mobile);
await assertNoOverflow(mobile, "stage5 mobile");
await mobile.screenshot({ path: `${output}/12-mobile-390.png`, fullPage: true });

const regressions = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const resident = await regressions.newPage();
await resident.goto(`${baseUrl}/resident/`, { waitUntil: "networkidle" });
await resident.getByRole("button", { name: "高级实验" }).click();
await resident.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
await resident.screenshot({ path: `${output}/13-resident-free-lab.png`, fullPage: true });

const guided = await regressions.newPage();
await guided.goto(`${baseUrl}/group/`, { waitUntil: "networkidle" });
await guided.getByRole("button", { name: "经验决策" }).waitFor();
await guided.locator(".group-learning-workbench.task-mode").waitFor();
await guided.screenshot({ path: `${output}/14-guided-group-normal.png`, fullPage: true });

for (const [route, name] of [["/", "15-home-unaffected"], ["/worker/", "16-worker-unaffected"]]) {
  const routePage = await regressions.newPage();
  await routePage.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await assertNoOverflow(routePage, route);
  const style = await routePage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(style, "rgba(0, 0, 0, 0)");
  await routePage.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await routePage.close();
}

await browser.close();
console.log("Stage 5 visual QA passed: verified source, single-case boundary, worker contribution, human review, PILOT_ONLY checklist, downloads, print, session isolation, mobile and route regressions.");
