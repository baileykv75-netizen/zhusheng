import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4174";
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/product-flow/branch-captures";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

async function openLab(page) {
  await page.goto(`${baseUrl}/resident/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "自由实验" }).click();
  await page.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "重新评估" }).waitFor();
}

async function reachAuthorization(page) {
  await openLab(page);
  await page.getByRole("button", { name: "接头证据充分" }).click();
  await page.getByRole("button", { name: "重新评估" }).click();
  await page.getByRole("button", { name: "动作", exact: true }).click();
  await page.getByText("人工授权边界生效", { exact: true }).waitFor();
}

async function approveAndClose(page) {
  await page.getByRole("button", { name: "请求人工授权" }).click();
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByRole("button", { name: "模拟执行关阀" }).click();
  await page.locator('.twin-viewport[data-valve-position="CLOSED"]').waitFor();
}

async function reachPostRepair(page) {
  await reachAuthorization(page);
  await approveAndClose(page);
  await page.getByRole("button", { name: "提交关阀后观察" }).click();
  await page.getByText("精准维修任务", { exact: true }).waitFor();
  await page.getByRole("button", { name: "提交不可变维修记录" }).click();
  await page.getByRole("button", { name: "请求人工授权" }).click();
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByRole("button", { name: "模拟执行恢复供水" }).click();
  await page.getByText("维修后新观察", { exact: true }).waitFor();
}

async function shot(name, action) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await action(page);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await context.close();
}

await shot("01-missing-evidence", async (page) => {
  await openLab(page);
  await page.getByRole("button", { name: "关键证据缺失" }).click();
  await page.getByRole("button", { name: "重新评估" }).click();
  await page.getByText("证据不足 / 矛盾", { exact: true }).waitFor();
});

await shot("02-close-authorization-rejected", async (page) => {
  await reachAuthorization(page);
  await page.getByRole("button", { name: "请求人工授权" }).click();
  await page.getByLabel("决定").selectOption("REJECTED");
  await page.getByLabel("原因或备注").fill("住户暂不同意模拟关阀，先补充现场观察。");
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByText(/本次授权已拒绝/).waitFor();
});

await shot("03-isolation-not-recovered", async (page) => {
  await reachAuthorization(page);
  await approveAndClose(page);
  await page.locator('.isolation-editor input[aria-label="微流量数值"]').fill("0.06");
  await page.locator('.isolation-editor input[aria-label="湿度数值"]').fill("83");
  await page.getByRole("button", { name: "提交关阀后观察" }).click();
  await page.getByText("异常未恢复，重新评估", { exact: true }).waitFor();
});

await shot("04-reopen-authorization-rejected", async (page) => {
  await reachAuthorization(page);
  await approveAndClose(page);
  await page.getByRole("button", { name: "提交关阀后观察" }).click();
  await page.getByRole("button", { name: "提交不可变维修记录" }).click();
  await page.getByRole("button", { name: "请求人工授权" }).click();
  await page.getByLabel("决定").selectOption("REJECTED");
  await page.getByLabel("原因或备注").fill("物业暂不批准恢复供水，继续保持隔离。");
  await page.getByRole("button", { name: "提交人工决定" }).click();
  await page.getByText(/本次授权已拒绝/).waitFor();
});

await shot("05-post-repair-insufficient", async (page) => {
  await reachPostRepair(page);
  await page.locator('.post-repair-editor select').nth(0).selectOption("UNKNOWN");
  await page.locator('.post-repair-editor select').nth(1).selectOption("UNKNOWN");
  await page.getByRole("button", { name: "提交维修后复验" }).click();
  await page.waitForTimeout(600);
});

await shot("06-group-held", async (page) => {
  await page.goto(`${baseUrl}/group/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "建筑生命经验回流", exact: true }).waitFor();
  await page.getByRole("button", { name: "暂不采纳", exact: true }).click();
  await page.getByLabel("评审意见").fill("当前只有单事件，暂不采纳，保留为待验证经验。");
  await page.getByRole("button", { name: "提交人工评审" }).click();
  await page.getByRole("heading", { name: "暂不采纳", exact: true }).waitFor();
});

await shot("07-group-resubmission", async (page) => {
  await page.goto(`${baseUrl}/group/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "建筑生命经验回流", exact: true }).waitFor();
  await page.getByRole("button", { name: "退回补证", exact: true }).click();
  await page.getByLabel("评审意见").fill("退回补充下一批试点的节点影像与复核记录。");
  await page.getByRole("button", { name: "提交人工评审" }).click();
  await page.getByText(/补证后重新提交/).waitFor();
});

await browser.close();
console.log(`Captured missing click-flow branches in ${output}`);
