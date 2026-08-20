import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const packageUrl = new URL("../package.json", import.meta.url);
const policyUrl = new URL("./QA_POLICY.md", import.meta.url);
const guardUrl = new URL("./legacy-qa-guard.mjs", import.meta.url);
const workflowUrl = new URL("../.github/workflows/step4-validation.yml", import.meta.url);

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
  assert.match(current, /test:evidence-correctness/);
  assert.match(current, /test:v6-lifecycle/);
  assert.doesNotMatch(current, /test:exhibit|test:stage4b-visual|test:journey-visual|test:unified-workspace/);

  assert.equal(pkg.scripts["test:css-delivery"], "node tests/css-delivery-qa.mjs");
  assert.equal(pkg.scripts["test:evidence-correctness"], "node tests/evidence-correctness-qa.mjs");
  assert.equal(pkg.scripts["test:v6-lifecycle"], "node tests/v6-lifecycle-qa.mjs");
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
