import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { derive1602ResidentFollowUp } from "../lib/product/resident-intake.ts";

const residentUrl = new URL("../components/ResidentService.tsx", import.meta.url);
const propertyUrl = new URL("../lib/product/property-event-view-model.ts", import.meta.url);
const propertyWorkbenchUrl = new URL("../components/life-event/ResidentTaskWorkbench.tsx", import.meta.url);
const caseUrl = new URL("../components/Case1602Exhibit.tsx", import.meta.url);
const memoryUrl = new URL("../lib/product/building-memory-view-model.ts", import.meta.url);
const eventsUrl = new URL("../lib/product/building-life-events.ts", import.meta.url);
const eventCenterUrl = new URL("../components/BuildingEventCenter.tsx", import.meta.url);
const groupUrl = new URL("../app/group/page.tsx", import.meta.url);
const workerUrl = new URL("../app/worker/page.tsx", import.meta.url);
const demoEngineUrl = new URL("../lib/demo-engine.ts", import.meta.url);
const demoProviderUrl = new URL("../components/demo-provider.tsx", import.meta.url);
const productContextUrl = new URL("../components/product/BuildingContextProvider.tsx", import.meta.url);
const homeUrl = new URL("../components/ConceptExhibit.tsx", import.meta.url);

test("resident journey starts from observed facts and does not force unrelated symptoms into leak triage", async () => {
  const source = await readFile(residentUrl, "utf8");
  const unrelated = derive1602ResidentFollowUp({ description: "卫生间镜前灯一直闪", photoFinding: "UNREADABLE" });

  assert.equal(unrelated, null);
  assert.match(source, /useState\(""\)/);
  assert.match(source, /提交初步情况，让筑生决定还缺什么/);
  assert.match(source, /不继续要求水表观察/);
  assert.match(source, /不会因为处于卫生间就自动假定为漏水/);
  assert.doesNotMatch(source, /已通知物业创建后续检查任务/);
  assert.match(source, /当前 RESOLVED 不会因为一个反馈按钮被直接改写/);
});

test("property surfaces only event observations and requires human confirmation of every demo draft", async () => {
  const [viewModel, workbench] = await Promise.all([
    readFile(propertyUrl, "utf8"),
    readFile(propertyWorkbenchUrl, "utf8")
  ]);

  assert.match(viewModel, /if \(!result\) return \[\]/);
  assert.match(viewModel, /if \(result\) return memories\.slice\(0, 5\)/);
  assert.match(viewModel, /plain chronological sample/);
  assert.match(workbench, /模板或高级验证中的数值草稿不能冒充当前事实/);
  assert.match(workbench, /initialObservationConfirmed/);
  assert.match(workbench, /不是直接采用预置演示答案/);
  assert.match(workbench, /isolationObservationConfirmed/);
  assert.match(workbench, /repairRecordConfirmed/);
  assert.match(workbench, /postRepairObservationConfirmed/);
});

test("case and memory stay visually neutral before an event produces a candidate", async () => {
  const [caseSource, memorySource] = await Promise.all([
    readFile(caseUrl, "utf8"),
    readFile(memoryUrl, "utf8")
  ]);

  assert.match(caseSource, /highlightBusinessIds: \[\]/);
  assert.match(caseSource, /result \? directive\.highlightBusinessIds\[0\]/);
  assert.match(caseSource, /结果不会被提前写好/);
  assert.match(memorySource, /const hasActiveEvent = Boolean\(session\.result\)/);
  assert.match(memorySource, /const relations = hasActiveEvent/);
  assert.match(memorySource, /: entries\[0\]\?\.recordId \?\? null/);
});

test("building situation does not create EVT-1602 before evidence and uses actual event counts after assessment", async () => {
  const [model, center] = await Promise.all([
    readFile(eventsUrl, "utf8"),
    readFile(eventCenterUrl, "utf8")
  ]);

  assert.match(model, /deepResult\.input\.evidence\.length \+ deepResult\.input\.observations\.length/);
  assert.match(model, /pending1602Evidence = false/);
  assert.match(model, /1602卫生间现场事实待评估/);
  assert.match(model, /: null;/);
  assert.match(model, /按当前事实补充下一项必要证据/);
  assert.doesNotMatch(model, /evidenceCount: 6/);
  assert.doesNotMatch(model, /COLLECTING_EVIDENCE: \{[^\n]*确认水表观察/);
  assert.match(center, /const pending1602Evidence = !session\.result && Boolean\(session\.residentSubmissions\?\.length\)/);
  assert.match(center, /buildingLifeEvents\(session\.result, pending1602Evidence\)/);
  assert.match(center, /尚未进入事件/);
});

test("homepage presents 1602 as a featured case instead of pretending an event is live", async () => {
  const source = await readFile(homeUrl, "utf8");

  assert.match(source, /FEATURED LIFE EVENT \/ 1602案例/);
  assert.match(source, /是否形成事件与最终判断仍由当前会话事实决定/);
  assert.doesNotMatch(source, /BUILDING PULSE \/ 此刻/);
  assert.doesNotMatch(source, /住户发现持续潮湿，建筑智能体正在重新调用/);
});

test("group governance cannot borrow a pre-resolved example as the current event result", async () => {
  const source = await readFile(groupUrl, "utf8");

  assert.match(source, /currentResolved = currentPackage\?\.finalState === "RESOLVED"/);
  assert.match(source, /当前事件还没有资格进入经验治理/);
  assert.match(source, /这里不会用预制结果替代真实闭环/);
  assert.match(source, /示例 ≠ 当前事件/);
});

test("worker confirmation becomes the actual evidence and no longer certifies unrelated trades", async () => {
  const [worker, engine] = await Promise.all([
    readFile(workerUrl, "utf8"),
    readFile(demoEngineUrl, "utf8")
  ]);

  assert.match(worker, /confirmWorkerEvidence\(\{ transcript, \.\.\.fields \}\)/);
  assert.doesNotMatch(worker, /markWorkerEvidenceReady/);
  assert.match(worker, /不替防水或闭水试验记录背书/);
  assert.match(engine, /confirmWorkerEvidence\(state: DemoSnapshot, draft: WorkerEvidenceDraft\)/);
  assert.match(engine, /record\.type = process/);
  assert.match(engine, /record\.refs = \[room, "MIC-BATH-1602", component\]/);
});

test("stale scripted demo storage cannot silently become current lifecycle truth", async () => {
  const source = await readFile(demoProviderUrl, "utf8");

  assert.match(source, /LEGACY_STORAGE_KEY = "zhusheng\.demo\.v3"/);
  assert.match(source, /STORAGE_KEY = "zhusheng\.demo\.v4"/);
  assert.match(source, /sessionStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);
  assert.match(source, /search\.get\("demo"\) === "1"/);
});

test("route membership and active event truth are separate product concepts", async () => {
  const source = await readFile(productContextUrl, "utf8");

  assert.match(source, /session\.result\?\.eventId/);
  assert.match(source, /route\.currentPath === "\/case-1602" \? route\.canonicalEventId : null/);
  assert.doesNotMatch(source, /session\.result\?\.eventId \?\? route\.canonicalEventId;/);
});
