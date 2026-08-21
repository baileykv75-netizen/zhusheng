import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageUrl = new URL("../package.json", import.meta.url);
const policyUrl = new URL("./QA_POLICY.md", import.meta.url);
const guardUrl = new URL("./legacy-qa-guard.mjs", import.meta.url);
const workflowUrl = new URL("../.github/workflows/step4-validation.yml", import.meta.url);
const deployWorkflowUrl = new URL("../.github/workflows/deploy-pages.yml", import.meta.url);
const spatialQaUrl = new URL("./spatial-drilldown-qa.mjs", import.meta.url);
const componentLifeQaUrl = new URL("./component-life-qa.mjs", import.meta.url);
const objectHandoffUrl = new URL("../components/product/ObjectHandoffBar.tsx", import.meta.url);
const agentDrawerUrl = new URL("../components/building-agent/BuildingAgentDrawer.tsx", import.meta.url);

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
  assert.match(current, /test:component-life/);
  assert.match(current, /test:evidence-correctness/);
  assert.match(current, /test:v6-lifecycle/);
  assert.doesNotMatch(current, /test:exhibit|test:stage4b-visual|test:journey-visual|test:unified-workspace/);

  assert.equal(pkg.scripts["test:css-delivery"], "node tests/css-delivery-qa.mjs");
  assert.equal(pkg.scripts["test:spatial-drilldown"], "node tests/spatial-drilldown-qa.mjs");
  assert.equal(pkg.scripts["test:component-life"], "node tests/component-life-qa.mjs");
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
  assert.match(source, /\.v6-building-twin\.phase-\$\{phase\}/);
  assert.match(source, /assertPhase\(page, "building", "华章新筑 · 2号楼"\)/);
  assert.match(source, /assertPhase\(page, "floor", "16F"\)/);
  assert.match(source, /assertPhase\(page, "unit", "1602"\)/);
  assert.match(source, /assertPhase\(page, "space", "卫生间"\)/);
  assert.match(source, /waitForTimeout\(2700\)/);
  assert.match(source, /entry.*building/);
  assert.match(source, /从建筑进入1602卫生间的空间路径/);
  assert.match(source, /390/);
  assert.match(source, /scrollWidth/);
  assert.match(policy, /真实 `hero-glb` 加载/);
  assert.match(policy, /程序化 fallback 只用于产品降级/);
});

test("component life QA keeps reverse lookup, deep links and cross-role handoff inside the current truth contract", async () => {
  const [source, policy, handoff, drawer] = await Promise.all([
    readFile(componentLifeQaUrl, "utf8"),
    readFile(policyUrl, "utf8"),
    readFile(objectHandoffUrl, "utf8"),
    readFile(agentDrawerUrl, "utf8")
  ]);

  assert.match(source, /构件生命索引/);
  assert.match(source, /data-component-life-id/);
  assert.match(source, /NO LIVE EVENT \/ 尚无正式事件/);
  assert.match(source, /CURRENT CANDIDATE \/ 当前候选/);
  assert.match(source, /清除3D联动/);
  assert.match(source, /object=/);
  assert.match(source, /data-component-life-link/);
  assert.match(source, /UNKNOWN-1602-OBJECT/);
  assert.match(source, /entry.*building/);
  assert.match(source, /跨角色对象交接/);
  assert.match(source, /BUILDING_MEMORY/);
  assert.match(source, /REC-CONSTRUCTION-J03/);
  assert.match(source, /390/);
  assert.match(handoff, /deriveObjectHandoffs/);
  assert.match(handoff, /data-object-handoff-source/);
  assert.match(drawer, /data-agent-object-handoff/);
  assert.match(drawer, /componentLifeHref/);
  assert.match(policy, /3D → 对象生命索引/);
  assert.match(policy, /历史相关性不能升级成当前故障结论/);
  assert.match(policy, /`building1602Dataset\.components`/);
  assert.match(policy, /不能绕过既有候选遮罩/);
  assert.match(policy, /不得伪造 `entry=building`/);
  assert.match(policy, /Building Memory \/ Property \/ Event \/ Building Agent/);
  assert.match(policy, /不得重新暴露上一轮候选、授权对象或维修目标/);
  assert.match(policy, /禁止从回答自然语言中猜测对象/);
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

test("CI keeps only the latest branch run instead of reporting stale failures", async () => {
  const [validation, deploy] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(deployWorkflowUrl, "utf8")
  ]);

  assert.match(validation, /concurrency:[\s\S]*group: step4-validation[\s\S]*cancel-in-progress: true/);
  assert.match(deploy, /concurrency:[\s\S]*group: github-pages[\s\S]*cancel-in-progress: true/);
});

test("QA policy prefers observable behavior over incidental source shape", async () => {
  const policy = await readFile(policyUrl, "utf8");

  assert.match(policy, /核心真值优先验证函数返回、状态转换、结构化数据和用户可观察行为/);
  assert.match(policy, /不得把“内部变量必须如何赋值、某个三元表达式必须长什么样/);
  assert.match(policy, /源码形状测试只用于安全边界、依赖图、CI wiring、关键入口是否存在/);
  assert.match(policy, /静态 Building Memory、历史 OBSERVATION 或系统拓扑不能冒充当前读数/);
});
