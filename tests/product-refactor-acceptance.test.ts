import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const shellUrl = new URL("../components/shell.tsx", import.meta.url);
const memoryPageUrl = new URL("../app/memory/page.tsx", import.meta.url);
const propertyUrl = new URL("../components/property/PropertyEventWorkspace.tsx", import.meta.url);
const residentUrl = new URL("../components/ResidentService.tsx", import.meta.url);
const workerUrl = new URL("../app/worker/page.tsx", import.meta.url);
const eventsUrl = new URL("../components/BuildingEventCenter.tsx", import.meta.url);
const groupUrl = new URL("../app/group/page.tsx", import.meta.url);
const deployUrl = new URL("../.github/workflows/deploy-pages.yml", import.meta.url);
const refactorCheckUrl = new URL("../.github/workflows/product-refactor-check.yml", import.meta.url);

test("core work routes read as one building product instead of independent demo applications", async () => {
  const [shell, memory, property, resident, worker] = await Promise.all([
    readFile(shellUrl, "utf8"),
    readFile(memoryPageUrl, "utf8"),
    readFile(propertyUrl, "utf8"),
    readFile(residentUrl, "utf8"),
    readFile(workerUrl, "utf8")
  ]);

  assert.match(shell, /问这栋房子/);
  assert.match(shell, /productNavigation/);
  assert.match(memory, /BuildingMemoryWorkspace/);
  assert.match(property, /这栋房子记得什么/);
  assert.match(resident, /EVT-1602/);
  assert.match(worker, /BUILDING MEMORY/);
});

test("primary product metadata no longer presents the experience as a prototype", async () => {
  const layout = await readFile(layoutUrl, "utf8");

  assert.match(layout, /连续记忆、可追溯事件与可验证的AI判断/);
  assert.doesNotMatch(layout, /交互样机|原型系统/);
});

test("mobile primary navigation never labels a link as building overview while sending it to the 1602 case", async () => {
  const shell = await readFile(shellUrl, "utf8");

  assert.match(shell, /const mobilePrimaryHref = product\.eventId \? "\/case-1602" : "\/"/);
  assert.match(shell, /const mobilePrimaryLabel = product\.eventId \? "1602生命事件" : "建筑总览"/);
  assert.match(shell, /<Link href=\{mobilePrimaryHref\}>/);
  assert.doesNotMatch(shell, /<Link href="\/case-1602"><Building2[^>]*><span>\{product\.eventId \? "1602生命事件" : "建筑总览"\}/);
});

test("the product keeps one deep event without manufacturing building or enterprise scale", async () => {
  const [events, group] = await Promise.all([readFile(eventsUrl, "utf8"), readFile(groupUrl, "utf8")]);

  assert.match(events, /EVT-1602/);
  assert.match(events, /完整深度事件/);
  assert.doesNotMatch(events, /Array\.from\(\{ length: 18 \}/);
  assert.doesNotMatch(group, /相似演示事件|演示项目|演示建筑|learning-constellation/);
  assert.match(group, /单事件 ≠ 企业标准/);
});

test("proof and operational safety remain present but secondary to the primary work surface", async () => {
  const [property, resident] = await Promise.all([readFile(propertyUrl, "utf8"), readFile(residentUrl, "utf8")]);

  assert.match(property, /<summary>数据与技术详情<\/summary>/);
  assert.match(property, /授权记录本身不会执行阀门动作/);
  assert.match(resident, /授权本身不会改变设备/);
  assert.match(resident, /数据与隐私说明/);
});

test("refactor branch can never replace production through a normal push and must run browser regression QA", async () => {
  const [deploy, check] = await Promise.all([readFile(deployUrl, "utf8"), readFile(refactorCheckUrl, "utf8")]);

  assert.match(deploy, /branches: \[main, gpt\/step4-guarded-lifecycle\]/);
  assert.doesNotMatch(deploy, /branches: \[[^\]]*product-shell-consolidation/);
  assert.match(check, /gpt\/product-shell-consolidation/);
  assert.match(check, /pnpm run test:css-delivery/);
  assert.doesNotMatch(check, /deploy-pages|upload-pages-artifact/);
});
