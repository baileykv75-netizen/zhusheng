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
const productContextUrl = new URL("../components/product/BuildingContextProvider.tsx", import.meta.url);

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

test("property surfaces only event observations and requires human confirmation of demo outcome drafts", async () => {
  const [viewModel, workbench] = await Promise.all([
    readFile(propertyUrl, "utf8"),
    readFile(propertyWorkbenchUrl, "utf8")
  ]);

  assert.match(viewModel, /if \(!result\) return \[\]/);
  assert.match(viewModel, /if \(result\) return memories\.slice\(0, 5\)/);
  assert.match(viewModel, /plain chronological sample/);
  assert.match(workbench, /模板或高级验证中的数值草稿不能冒充当前事实/);
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
  assert.match(memorySource, /const hasActiveEvent = Boolean\(session\.result\)/);
  assert.match(memorySource, /const relations = hasActiveEvent/);
  assert.match(memorySource, /: entries\[0\]\?\.recordId \?\? null/);
});

test("building situation uses actual deep-event data instead of fixed evidence counters or preset meter steps", async () => {
  const [model, center] = await Promise.all([
    readFile(eventsUrl, "utf8"),
    readFile(eventCenterUrl, "utf8")
  ]);

  assert.match(model, /deepResult\.input\.evidence\.length \+ deepResult\.input\.observations\.length/);
  assert.match(model, /按当前事实补充下一项必要证据/);
  assert.doesNotMatch(model, /evidenceCount: 6/);
  assert.doesNotMatch(model, /COLLECTING_EVIDENCE: \{[^\n]*确认水表观察/);
  assert.match(center, /buildingLifeEvents\(session\.result\)/);
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

test("route membership and active event truth are separate product concepts", async () => {
  const source = await readFile(productContextUrl, "utf8");

  assert.match(source, /session\.result\?\.eventId/);
  assert.match(source, /route\.currentPath === "\/case-1602" \? route\.canonicalEventId : null/);
  assert.doesNotMatch(source, /session\.result\?\.eventId \?\? route\.canonicalEventId;/);
});
