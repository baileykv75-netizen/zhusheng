import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/unified-workspace";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function rect(page, selector) {
  const value = await page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  });
  assert.ok(value.width > 0 && value.height > 0, `${selector} has no rendered box`);
  return value;
}

async function assertNoCollision(page, first, second, label) {
  assert.equal(rectsOverlap(await rect(page, first), await rect(page, second)), false, `${label} overlaps`);
}

async function assertViewport(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.html <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1, `${label} overflow: ${JSON.stringify(sizes)}`);
}

async function assertSingleNext(page, label) {
  const primary = page.locator(".professional-task-pane .task-primary:visible");
  assert.equal(await primary.count(), 1, `${label} must expose one primary task action`);
}

async function openFreshResident(page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`${baseUrl}/resident/?mode=task`, { waitUntil: "networkidle" });
  await page.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "运行联合诊断" }).waitFor();
}

try {
  const handoffContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const handoff = await handoffContext.newPage();
  await handoff.addInitScript(() => sessionStorage.clear());
  await handoff.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await handoff.getByRole("button", { name: /体验1602完整闭环/ }).click();
  await handoff.getByRole("button", { name: "理解并编排" }).click();
  await handoff.getByText("待确认结构化事实", { exact: true }).waitFor({ timeout: 30_000 });
  await handoff.getByRole("button", { name: "确认并调用事件引擎" }).click();
  await handoff.locator(".journey-decision-line").waitFor({ timeout: 30_000 });
  const agentEvent = await handoff.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("zhusheng.life-event-lab.v2") ?? "null");
    return { eventId: saved?.result?.eventId, state: saved?.result?.state, auditCount: saved?.result?.auditLog?.length };
  });
  assert.ok(agentEvent.eventId && agentEvent.auditCount > 0, `agent did not seed a real lifecycle session: ${JSON.stringify(agentEvent)}`);
  await handoff.locator(".journey-primary").click();
  await handoff.waitForURL(/\/resident\/?\?mode=task/);
  await handoff.locator(".professional-workspace").waitFor();
  const residentEvent = await handoff.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("zhusheng.life-event-lab.v2") ?? "null");
    return { eventId: saved?.result?.eventId, state: saved?.result?.state, auditCount: saved?.result?.auditLog?.length };
  });
  assert.deepEqual(residentEvent, agentEvent, "total agent and resident task must share one event state and audit chain");
  await handoff.screenshot({ path: `${output}/00-agent-resident-handoff.png`, fullPage: true });
  await handoffContext.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  await openFreshResident(page);
  await assertViewport(page, "resident initial");
  await assertNoCollision(page, ".journey-project-bar", ".professional-workspace", "project bar/workspace");
  await assertNoCollision(page, ".professional-scene", ".professional-task-pane", "scene/task pane");
  await assertSingleNext(page, "observation");
  await page.screenshot({ path: `${output}/01-observation-desktop.png`, fullPage: true });

  await page.locator(".workspace-menu > summary").click();
  await assertNoCollision(page, ".workspace-menu nav", ".professional-task-pane", "professional menu/task pane");
  await page.screenshot({ path: `${output}/02-professional-menu-desktop.png`, fullPage: true });
  await page.locator(".workspace-menu > summary").click();

  await page.getByRole("button", { name: "运行联合诊断" }).click();
  await page.getByRole("button", { name: "提交人工授权" }).waitFor();
  await assertSingleNext(page, "close authorization pending");
  assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1);
  await page.screenshot({ path: `${output}/03-close-authorization-pending.png`, fullPage: true });

  await page.getByRole("button", { name: "提交人工授权" }).click();
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByRole("button", { name: "模拟执行关阀" }).waitFor();
  assert.equal(await page.locator('.twin-viewport[data-valve-position="OPEN"]').count(), 1, "approval must not close the valve");
  await assertSingleNext(page, "close authorized");
  await page.getByRole("button", { name: "模拟执行关阀" }).click();
  await page.locator('.twin-viewport[data-valve-position="CLOSED"]').waitFor();
  await page.getByRole("button", { name: "提交隔离后观察" }).waitFor();
  await assertSingleNext(page, "isolation verification");
  await page.screenshot({ path: `${output}/04-valve-closed-verifying.png`, fullPage: true });

  await page.getByRole("button", { name: "提交隔离后观察" }).click();
  await page.getByRole("button", { name: "提交不可变维修记录" }).waitFor();
  await assertSingleNext(page, "repair pending");
  await page.screenshot({ path: `${output}/05-repair-pending.png`, fullPage: true });

  await page.getByRole("button", { name: "提交不可变维修记录" }).click();
  await page.getByRole("button", { name: "提交人工授权" }).waitFor();
  assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1);
  await page.screenshot({ path: `${output}/06-reopen-authorization-pending.png`, fullPage: true });
  await page.getByRole("button", { name: "提交人工授权" }).click();
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByRole("button", { name: "模拟执行恢复供水" }).waitFor();
  assert.equal(await page.locator('.twin-viewport[data-valve-position="CLOSED"]').count(), 1, "reopen approval must not open the valve");
  await assertSingleNext(page, "reopen authorized");

  await page.getByRole("button", { name: "模拟执行恢复供水" }).click();
  await page.locator('.twin-viewport[data-valve-position="OPEN"]').waitFor();
  await page.getByRole("button", { name: "提交维修后复验" }).waitFor();
  await assertSingleNext(page, "post repair verification");
  await page.screenshot({ path: `${output}/07-post-repair-verifying.png`, fullPage: true });

  await page.getByRole("button", { name: "提交维修后复验" }).click();
  await page.getByRole("heading", { name: "维修闭环完成" }).waitFor();
  await page.locator('.twin-viewport[data-moisture-state="REPAIRED"]').waitFor();
  await assertSingleNext(page, "resolved");
  await page.screenshot({ path: `${output}/08-resolved.png`, fullPage: true });

  await page.getByRole("link", { name: "形成集团经验建议" }).click();
  await page.getByText("来源事件已验证", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "单事件待验证经验" }).first().waitFor();
  await page.screenshot({ path: `${output}/09-group-current-event.png`, fullPage: true });
  await desktop.close();

  for (const viewport of [
    { width: 1024, height: 768, name: "10-resident-1024.png" },
    { width: 768, height: 1024, name: "11-resident-768.png" },
    { width: 390, height: 844, name: "12-resident-390.png" }
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const responsive = await context.newPage();
    await openFreshResident(responsive);
    await assertViewport(responsive, viewport.name);
    await assertSingleNext(responsive, viewport.name);
    if (viewport.width < 900) await assertNoCollision(responsive, ".active-task .task-primary", ".mobile-task-nav", `${viewport.name} primary/nav`);
    await responsive.screenshot({ path: `${output}/${viewport.name}`, fullPage: true });
    await context.close();
  }

  console.log("Unified lifecycle visual QA passed: collision-free shell, one primary action, real authorization/repair lifecycle, current-event group handoff and responsive layouts.");
} finally {
  await browser.close();
}
