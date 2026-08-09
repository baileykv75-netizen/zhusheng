import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/convergence-final";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

async function createContext(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route("http://127.0.0.1:4180/**", (route) => route.abort("connectionrefused"));
  return context;
}

function watchAssets(page, failed) {
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(baseUrl).origin && response.status() >= 400 && (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/"))) {
      failed.push(`${response.status()} ${url.pathname}`);
    }
  });
}

async function assertLayout(page, label, maxVisibleActions = 12) {
  const result = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0;
    };
    return {
      viewport: innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      actions: [...document.querySelectorAll("button,a[href],summary")].filter(visible).length
    };
  });
  assert.ok(result.html <= result.viewport + 1 && result.body <= result.viewport + 1, `${label} overflow: ${JSON.stringify(result)}`);
  assert.ok(result.actions <= maxVisibleActions, `${label} exposes ${result.actions} first-viewport actions`);
}

async function assertSeparated(page, firstSelector, secondSelector, label) {
  const state = await page.evaluate(({ firstSelector, secondSelector }) => {
    const first = document.querySelector(firstSelector)?.getBoundingClientRect();
    const second = document.querySelector(secondSelector)?.getBoundingClientRect();
    if (!first || !second) return null;
    return {
      first: { left: first.left, top: first.top, right: first.right, bottom: first.bottom },
      second: { left: second.left, top: second.top, right: second.right, bottom: second.bottom },
      overlaps: first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    };
  }, { firstSelector, secondSelector });
  assert.ok(state, `${label} selectors missing`);
  assert.equal(state.overlaps, false, `${label} collision: ${JSON.stringify(state)}`);
}

try {
  const failedAssets = [];
  const desktop = await createContext({ width: 1440, height: 900 });
  const home = await desktop.newPage(); watchAssets(home, failedAssets);
  await home.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await home.evaluate(() => sessionStorage.removeItem("zhusheng.building-agent.v1"));
  await home.reload({ waitUntil: "networkidle" });
  await home.locator(".agent-workbench").waitFor();
  assert.equal(await home.locator(".journey-primary").count(), 1);
  await assertLayout(home, "home desktop", 7);
  await home.screenshot({ path: `${output}/01-home-workbench-desktop.png`, fullPage: true });

  await home.getByRole("button", { name: /体验1602完整闭环/ }).click();
  await home.getByRole("button", { name: "理解并编排" }).click();
  await home.getByText("待确认结构化事实", { exact: true }).waitFor({ timeout: 30_000 });
  await home.screenshot({ path: `${output}/02-confirm-facts.png`, fullPage: true });
  await home.getByLabel("当前湿度 %").fill("82");
  await home.getByRole("button", { name: "确认并调用事件引擎" }).click();
  await home.locator(".journey-decision-line").waitFor({ timeout: 30_000 });
  assert.match(await home.locator(".journey-decision-line").innerText(), /不是真实故障概率/);
  assert.equal(await home.locator(".journey-primary").count(), 1);
  await home.screenshot({ path: `${output}/03-agent-decision.png`, fullPage: true });

  const worker = await desktop.newPage(); watchAssets(worker, failedAssets);
  await worker.goto(`${baseUrl}/worker/`, { waitUntil: "networkidle" });
  await worker.getByText("工友现场记录", { exact: false }).first().waitFor();
  await assertLayout(worker, "worker desktop", 12);
  await worker.screenshot({ path: `${output}/04-worker-task.png`, fullPage: true });

  const resident = await desktop.newPage(); watchAssets(resident, failedAssets);
  await resident.goto(`${baseUrl}/resident/?mode=task`, { waitUntil: "networkidle" });
  await resident.getByRole("button", { name: "任务处置" }).waitFor();
  assert.equal(await resident.getByRole("button", { name: "高级实验" }).count(), 1);
  await assertLayout(resident, "resident task", 12);
  await assertSeparated(resident, ".professional-scene", ".professional-task-pane", "resident scene/task");
  await assertSeparated(resident, ".journey-project-bar", ".professional-workspace", "resident header/workspace");
  await resident.locator(".workspace-menu > summary").click();
  await assertSeparated(resident, ".workspace-menu nav", ".professional-task-pane", "professional menu/task");
  await resident.locator(".workspace-menu > summary").click();
  await resident.screenshot({ path: `${output}/05-resident-task.png`, fullPage: true });
  await resident.getByRole("button", { name: "高级实验" }).click();
  await resident.locator(".resident-free-lab").waitFor();
  await resident.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
  await resident.screenshot({ path: `${output}/06-resident-advanced-lab.png`, fullPage: true });

  const group = await desktop.newPage(); watchAssets(group, failedAssets);
  await group.goto(`${baseUrl}/group/?mode=task`, { waitUntil: "networkidle" });
  await group.getByRole("button", { name: "经验决策" }).waitFor();
  assert.equal(await group.locator(".group-learning-workbench.task-mode").count(), 1);
  assert.equal(await group.locator(".group-evidence-chain:visible").count(), 0);
  await group.getByRole("button", { name: "查看验证详情" }).click();
  assert.equal(await group.locator(".group-evidence-chain:visible").count(), 1);
  await group.getByRole("button", { name: "收起验证详情" }).click();
  await group.screenshot({ path: `${output}/07-group-decision.png`, fullPage: true });

  const mobile = await createContext({ width: 390, height: 844 });
  for (const [path, filename, marker] of [
    ["/", "08-home-mobile.png", ".agent-workbench"],
    ["/resident/?mode=task", "09-resident-task-mobile.png", ".professional-workspace"],
    ["/group/?mode=task", "10-group-task-mobile.png", ".group-learning-workbench.task-mode"]
  ]) {
    const page = await mobile.newPage(); watchAssets(page, failedAssets);
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    await page.locator(marker).waitFor();
    await assertLayout(page, `${path} mobile`, path === "/" ? 7 : 12);
    if (path === "/") {
      const primary = await page.locator(".journey-primary").boundingBox();
      assert.ok(primary && primary.y + primary.height <= 786, "mobile primary action is below or behind the navigation dock");
    }
    if (path === "/resident/?mode=task") {
      await assertSeparated(page, ".active-task .task-primary", ".mobile-task-nav", "mobile resident primary/navigation");
    }
    if (path === "/group/?mode=task") {
      await assertSeparated(page, ".group-review-submit", ".mobile-task-nav", "mobile group primary/navigation");
    }
    await page.screenshot({ path: `${output}/${filename}`, fullPage: true });
    await page.close();
  }

  assert.deepEqual(failedAssets, [], `Static asset failures: ${failedAssets.join(", ")}`);
  await desktop.close(); await mobile.close();
  console.log("Journey visual QA passed: single entry, one primary action, task-mode professional routes, advanced GLB lab, desktop/mobile and static assets.");
} finally {
  await browser.close();
}
