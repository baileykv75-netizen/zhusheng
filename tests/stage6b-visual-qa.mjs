import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const output = "D:/Admin/Desktop/Project/zhusheng-agent/artifacts/stage6b";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const cors = { "Access-Control-Allow-Origin": baseUrl };
const assertNoOverflow = async (page, label) => {
  const value = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(value.html <= value.viewport + 1 && value.body <= value.viewport + 1, `${label} overflow ${JSON.stringify(value)}`);
};

async function openWorkbench(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => sessionStorage.removeItem("zhusheng.building-agent.v1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".agent-workbench").waitFor();
}

async function health(context, providerConfigured, model = "deepseek-v4-flash") {
  await context.route("http://127.0.0.1:4180/health*", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ status: "ok", provider: "deepseek", providerConfigured, model }) }));
}

try {
  const deterministicContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await health(deterministicContext, false);
  const deterministic = await deterministicContext.newPage();
  await openWorkbench(deterministic);
  await deterministic.getByText("确定性演示", { exact: true }).waitFor();
  await deterministic.getByText(/确定性模式可用/).waitFor();
  await deterministic.screenshot({ path: `${output}/01-gateway-unconfigured-deterministic.png`, fullPage: true });

  const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await health(fallbackContext, true);
  await fallbackContext.route("http://127.0.0.1:4180/v1/agent/interpret", (route) => route.fulfill({ status: 503, contentType: "application/json", headers: cors, body: JSON.stringify({ ok: false, error: { type: "UPSTREAM_ERROR", message: "演示的上游不可用", requestId: "req-safe-fallback" } }) }));
  const fallback = await fallbackContext.newPage();
  await openWorkbench(fallback);
  await fallback.getByRole("button", { name: /体验1602完整闭环/ }).click();
  await fallback.getByRole("button", { name: "理解并编排" }).click();
  await fallback.getByText("待确认结构化事实", { exact: true }).waitFor();
  await fallback.getByText("安全回退", { exact: true }).waitFor();
  await fallback.locator(".journey-validation-vault summary").click();
  await fallback.getByText("DeepSeek增强调用", { exact: true }).waitFor();
  assert.equal(await fallback.getByRole("button", { name: /关阀|批准授权/ }).count(), 0);
  await fallback.screenshot({ path: `${output}/02-api-failure-safe-fallback.png`, fullPage: true });

  const contractContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await health(contractContext, true, "mock-deepseek-json-provider");
  await contractContext.route("http://127.0.0.1:4180/v1/agent/interpret", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ ok: true, result: { intent: "DRAFT_OBSERVATION", fields: { spaceId: "SPACE-1602-BATHROOM", humidity: 78, humidityBaseline: 55, durationMinutes: 2880, microFlow: 0.06, microFlowBaseline: 0, meterFinding: "FLOW_CONFIRMED_NO_USE", photoFinding: "MOISTURE_VISIBLE", photoPresent: true, dataQuality: "GOOD", sourceActor: "RESIDENT" }, inferences: ["墙脚存在潮湿描述"], uncertainties: [], missingFields: [], proposedTools: ["draft_observation", "query_building_memory"] }, metadata: { task: "INTERPRET_OBSERVATION", responseId: "chatcmpl_mock_contract_001", model: "mock-deepseek-json-provider", calledAt: "2026-07-30T10:00:00.000Z", requestId: "req-mock-1", inputHash: "mock", schemaValid: true } }) }));
  await contractContext.route("http://127.0.0.1:4180/v1/agent/explain", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ ok: true, result: { facts: ["确定性事件引擎已经完成评估"], inferences: ["第一候选来自规则与拓扑排序"], uncertainties: ["设备动作仍需人工授权"], missingEvidence: [], sourceRefs: ["SPACE-1602-BATHROOM", "J-1602-CW-03"], nextStep: "进入住户工作台完成独立人工授权", safetyNotice: "模型不能批准授权或执行阀门动作" }, metadata: { task: "EXPLAIN_VERIFIED_RESULT", responseId: "chatcmpl_mock_contract_002", model: "mock-deepseek-json-provider", calledAt: "2026-07-30T10:01:00.000Z", requestId: "req-mock-2", inputHash: "mock", schemaValid: true } }) }));
  const contract = await contractContext.newPage();
  await openWorkbench(contract);
  await contract.getByRole("button", { name: /体验1602完整闭环/ }).click();
  await contract.getByRole("button", { name: "理解并编排" }).click();
  await contract.getByText("待确认结构化事实", { exact: true }).waitFor();
  await contract.getByText("DeepSeek增强", { exact: true }).waitFor();
  await contract.locator(".journey-validation-vault summary").click();
  await contract.getByText(/Schema通过/).first().waitFor();
  await contract.getByLabel("当前湿度 %").fill("79");
  await contract.getByRole("button", { name: "确认并调用事件引擎" }).click();
  await contract.locator(".journey-decision-line").waitFor();
  assert.match(await contract.locator(".journey-decision-line").innerText(), /不是真实故障概率/);
  assert.equal(await contract.getByRole("button", { name: /关阀|批准授权/ }).count(), 0);
  await contract.screenshot({ path: `${output}/03-mock-provider-contract.png`, fullPage: true });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await health(mobileContext, false);
  const mobile = await mobileContext.newPage();
  await openWorkbench(mobile); await assertNoOverflow(mobile, "stage6b mobile");
  await mobile.screenshot({ path: `${output}/04-mobile-deterministic.png`, fullPage: true });

  const resident = await deterministicContext.newPage();
  await resident.goto(`${baseUrl}/resident/?mode=lab`, { waitUntil: "networkidle" });
  await resident.locator('.twin-viewport[data-model-status="ready"]').waitFor({ timeout: 30_000 });
  await resident.screenshot({ path: `${output}/05-existing-twin-regression.png`, fullPage: true });

  await deterministicContext.close(); await fallbackContext.close(); await contractContext.close(); await mobileContext.close();
  console.log("Stage 6B readiness visual QA passed: deterministic mode, safe provider fallback, strict mocked DeepSeek contract, human-action boundary, mobile and twin regression.");
} finally {
  await browser.close();
}
