import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageUrl = new URL("../package.json", import.meta.url);
const policyUrl = new URL("./QA_POLICY.md", import.meta.url);
const guardUrl = new URL("./legacy-qa-guard.mjs", import.meta.url);
const workflowUrl = new URL("../.github/workflows/step4-validation.yml", import.meta.url);
const spatialQaUrl = new URL("./spatial-drilldown-qa.mjs", import.meta.url);

const legacyScripts = [
  ["test:exhibit", "exhibit"],
  ["test:resident-task", "resident-task"],
  ["test:stage4a-visual", "stage4a"],
  ["test:stage4b-visual", "stage4b"],
  ["test:stage5-visual", "stage5"],
  ["test:journey-visual", "journey"],
  ["test:unified-workspace", "unified"]
] as const;

test("current browser QA has one explicit source-of-truth entrypoint", async () => {
  const pkg = JSON.parse(await readFile(packageUrl, "utf8"));
  const current = pkg.scripts["test:qa:current"] as string;

  assert.match(current, /test:css-delivery/);
  assert.match(current, /test:spatial-drilldown/);
  assert.match(current, /test:evidence-correctness/);
  assert.match(current, /test:v6-lifecycle/);
  assert.doesNotMatch(current, /test:exhibit|test:stage4b-visual|test:journey-visual|test:unified-workspace/);

  assert.equal(pkg.scripts["test:css-delivery"], "node tests/css-delivery-qa.mjs");
  assert.equal(pkg.scripts["test:spatial-drilldown"], "node tests/spatial-drilldown-qa.mjs");
  assert.equal(pkg.scripts["test:evidence-correctness"], "node tests/evidence-correctness-qa.mjs");
  assert.equal(pkg.scripts["test:v6-lifecycle"], "node tests/v6-lifecycle-qa.mjs");
});

test("current spatial QA validates real user-controlled building continuity", async () => {
  const [source, policy] = await Promise.all([
    readFile(spatialQaUrl, "utf8"),
    readFile(policyUrl, "utf8")
  ]);

  assert.match(source, /data-visual-source/);
  assert.match(source, /hero-glb/);
  assert.match(source, /phase-building/);
  assert.match(source, /phase-floor/);
  assert.match(source, /phase-unit/);
  assert.match(source, /phase-space/);
  assert.match(source, /waitForTimeout\(2700\)/);
  assert.match(source, /entry.*building/);
  assert.match(source, /从建筑进入1602卫生间的空间路径/);
  assert.match(source, /390/);
  assert.match(source, /scrollWidth/);
  assert.match(policy, /真实 `hero-glb` 加载/);
  assert.match(policy, /程序化 fallback 只用于产品降级/);
});

test("spatial QA is portable across trailing-slash routes and headless CI", async () => {
  const [source, policy] = await Promise.all([
    readFile(spatialQaUrl, "utf8"),
    readFile(policyUrl, "utf8")
  ]);

  assert.match(source, /createRequire/);
  assert.match(source, /CODEX_PLAYWRIGHT_MODULE/);
  assert.match(source, /browserExecutable/);
  assert.match(source, /normalizePathname/);
  assert.match(source, /trailingSlash: true/);
  assert.match(source, /enable-unsafe-swiftshader/);
  assert.doesNotMatch(source, /import \{ chromium \} from "playwright"/);

  assert.match(policy, /trailingSlash: true/);
  assert.match(policy, /CODEX_PLAYWRIGHT_MODULE/);
  assert.match(policy, /SwiftShader 软件 WebGL/);
  assert.match(policy, /必须加载真实 `hero-glb`/);
});

test("historical QA cannot silently masquerade as current acceptance", async () => {
  const [pkg, guard, policy] = await Promise.all([
    readFile(packageUrl, "utf8").then(JSON.parse),
    readFile(guardUrl, "utf8"),
    readFile(policyUrl, "utf8")
  ]);

  for (const [scriptName, key] of legacyScripts) {
    assert.equal(pkg.scripts[scriptName], `node tests/legacy-qa-guard.mjs ${key}`);
    assert.equal(pkg.scripts[`test:legacy:${key}`], `node tests/legacy-qa-guard.mjs --run ${key}`);
  }

  assert.match(guard, /LEGACY QA BLOCKED/);
  assert.match(guard, /test:qa:current/);
  assert.match(guard, /process\.exit\(2\)/);
  assert.match(policy, /不代表当前产品验收/);
  assert.match(policy, /Scripted demo 不能 seed formal lifecycle/);
  assert.match(policy, /Building → 16F → 1602 → 卫生间是用户控制的空间下钻/);
});

test("STEP 4 CI consumes the same current browser QA entrypoint", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /pnpm run test:qa:current/);
  assert.doesNotMatch(workflow, /pnpm run test:exhibit/);
  assert.doesNotMatch(workflow, /pnpm run test:stage4b-visual/);
  assert.doesNotMatch(workflow, /pnpm run test:journey-visual/);
  assert.doesNotMatch(workflow, /pnpm run test:unified-workspace/);
  assert.doesNotMatch(workflow, /sed -i .*evidence-correctness-qa\.mjs/);
});
