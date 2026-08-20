import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const registry = {
  exhibit: {
    script: "./exhibit-qa.mjs",
    note: "旧版首页自动下钻、五章节 Case 与旧 AI workspace 验收"
  },
  "resident-task": {
    script: "./resident-task-qa.mjs",
    note: "早期 resident task 视觉快照，不作为当前受理/证据真值"
  },
  stage4a: {
    script: "./stage4a-visual-qa.mjs",
    note: "阶段4A自由实验历史验收，可用于回看旧交互"
  },
  stage4b: {
    script: "./stage4b-visual-qa.mjs",
    note: "阶段4B历史闭环，缺少当前维修证据身份与人工确认门槛"
  },
  stage5: {
    script: "./stage5-visual-qa.mjs",
    note: "阶段5集团学习历史视觉验收"
  },
  journey: {
    script: "./journey-visual-qa.mjs",
    note: "旧 product journey 验收，包含已废弃的首页/智能体交互假设"
  },
  unified: {
    script: "./unified-lifecycle-visual-qa.mjs",
    note: "旧 unified workspace 验收，包含 scripted demo 可 seed formal lifecycle 的已废弃假设"
  }
};

const args = process.argv.slice(2);
const explicitRun = args[0] === "--run";
const key = explicitRun ? args[1] : args[0];
const entry = registry[key];

if (!entry) {
  console.error(`Unknown legacy QA key: ${key ?? "<missing>"}`);
  console.error(`Known keys: ${Object.keys(registry).join(", ")}`);
  process.exit(2);
}

if (!explicitRun) {
  console.error(`[LEGACY QA BLOCKED] ${key}: ${entry.note}`);
  console.error("This script is retained as historical evidence and does not define the current product contract.");
  console.error(`Run it explicitly with: pnpm run test:legacy:${key}`);
  console.error("Current browser acceptance: pnpm run test:qa:current");
  process.exit(2);
}

console.warn(`[LEGACY QA] ${key}: ${entry.note}`);
console.warn("Results from this run must not be used as current product acceptance without reconciling the script with tests/QA_POLICY.md.");

const scriptPath = fileURLToPath(new URL(entry.script, import.meta.url));
const child = spawnSync(process.execPath, [scriptPath], {
  stdio: "inherit",
  env: process.env
});

if (child.error) {
  console.error(child.error);
  process.exit(1);
}

process.exit(child.status ?? 1);
