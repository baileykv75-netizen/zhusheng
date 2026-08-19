import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const propertyPage = new URL("../app/property/page.tsx", import.meta.url);
const propertyWorkspace = new URL("../components/property/PropertyEventWorkspace.tsx", import.meta.url);

test("property task mode renders one consolidated event workspace", async () => {
  const source = await readFile(propertyPage, "utf8");

  assert.match(source, /PropertyEventWorkspace/);
  assert.doesNotMatch(source, /GuardedLifecycleAgentPanel/);
  assert.doesNotMatch(source, /<PropertyWorkbench/);
});

test("legacy detailed property work remains available only behind the secondary task layer", async () => {
  const source = await readFile(propertyWorkspace, "utf8");

  assert.match(source, /完整处理记录/);
  assert.match(source, /taskOpen \? <PropertyWorkbench/);
  assert.match(source, /当前判断|CURRENT ASSESSMENT/);
  assert.match(source, /这栋房子记得什么/);
  assert.match(source, /当前还缺什么/);
  assert.match(source, /UNIQUE NEXT ACTION/);
});

test("existing focus deep links still open the detailed domain task when required", async () => {
  const source = await readFile(propertyWorkspace, "utf8");

  assert.match(source, /URLSearchParams\(window\.location\.search\)\.get\("focus"\)/);
  assert.match(source, /setTaskOpen\(true\)/);
  assert.match(source, /\[data-focus=/);
});
