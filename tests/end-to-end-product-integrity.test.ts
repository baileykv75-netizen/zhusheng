import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { derive1602ResidentFollowUp } from "../lib/product/resident-intake.ts";

const residentUrl = new URL("../components/ResidentService.tsx", import.meta.url);
const lifecycleProviderUrl = new URL("../components/lifecycle-journey-provider.tsx", import.meta.url);
const propertyUrl = new URL("../lib/product/property-event-view-model.ts", import.meta.url);
const propertyWorkbenchUrl = new URL("../components/life-event/ResidentTaskWorkbench.tsx", import.meta.url);
const caseUrl = new URL("../components/Case1602Exhibit.tsx", import.meta.url);
const evidenceTimelineUrl = new URL("../components/EvidenceTimeChain.tsx", import.meta.url);
const memoryUrl = new URL("../lib/product/building-memory-view-model.ts", import.meta.url);
const eventsUrl = new URL("../lib/product/building-life-events.ts", import.meta.url);
const eventCenterUrl = new URL("../components/BuildingEventCenter.tsx", import.meta.url);
const residentAssessmentUrl = new URL("../lib/product/resident-assessment.ts", import.meta.url);
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

test("resident intake is not labelled as a formed event before property assessment", async () => {
  const source = await readFile(residentUrl, "utf8");

  assert.match(source, /const residentHeaderId = result\?\.eventId \?\? "1602现场受理"/);
  assert.match(source, /住户事实已保存 · 等待物业接入/);
  assert.match(source, /先提交你实际看到的现场事实/);
  assert.match(source, /result \? "你的现场观察进入同一事件"/);
  assert.doesNotMatch(source, /<Link href="\/case-1602">EVT-1602<\/Link><span>住户任务<\/span><small>你的现场观察进入同一事件<\/small>/);
});

test("resident evidence intake persists without requiring event-engine assets", async () => {
  const [resident, provider] = await Promise.all([
    readFile(residentUrl, "utf8"),
    readFile(lifecycleProviderUrl, "utf8")
  ]);

  assert.doesNotMatch(resident, /disabled=\{busy \|\| !assets \|\| !meterFinding\}/);
  assert.match(resident, /disabled=\{busy \|\| !meterFinding\}/);
  assert.match(provider, /const submitResidentEvidence = useCallback\(\(draft: ResidentEvidenceDraft\) => \{\s*const reopeningCycle/);
  assert.doesNotMatch(provider, /const submitResidentEvidence = useCallback\(\(draft: ResidentEvidenceDraft\) => \{\s*if \(!engine\)/);
});

test("resident property and event center share one pending-assessment selector", async () => {
  const [resident, propertyWorkbench, center, selector] = await Promise.all([
    readFile(residentUrl, "utf8"),
    readFile(propertyWorkbenchUrl, "utf8"),
    readFile(eventCenterUrl, "utf8"),
    readFile(residentAssessmentUrl, "utf8")
  ]);

  assert.match(selector, /export function residentEvidenceNeedsAssessment/);
  assert.match(selector, /result\.state === "INCONCLUSIVE"/);
  assert.match(selector, /result\.state === "REOPENED"/);
  assert.match(selector, /hasFreshEvidenceAfterReopen/);
  for (const source of [resident, propertyWorkbench, center]) {
    assert.match(source, /residentEvidenceNeedsAssessment/);
  }
  assert.doesNotMatch(center, /!session\.result && Boolean\(session\.residentSubmissions/);
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
  assert.match(workbench, /继续同一事件确定性评估/);
  assert.match(workbench, /上一轮事件观测/);
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

test("evidence timeline renders only records that actually exist in the current lifecycle", async () => {
  const source = await readFile(evidenceTimelineUrl, "utf8");

  assert.match(source, /只显示已经发生的记录/);
  assert.match(source, /session\.productEvidenceTimeline/);
  assert.match(source, /result\.input\.evidence/);
  assert.match(source, /result\?\.input\.observations/);
  assert.match(source, /result\?\.repairRecords/);
  assert.match(source, /建造期历史，不代表当前故障/);
  assert.match(source, /result \? "事件" : "受理关联"/);
  assert.match(source, /预分配关联 ID，用于后续确定性评估对齐；此刻不代表已经形成 Life Event/);
  assert.doesNotMatch(source, /syntheticEvidenceTimelineIds/);
  assert.doesNotMatch(source, /局部接头维修记录/);
  assert.doesNotMatch(source, /恢复供水后的新观察/);
});

test("building situation keeps intake separate from event instances and surfaces pending same-event evidence", async () => {
  const [model, center] = await Promise.all([
    readFile(eventsUrl, "utf8"),
    readFile(eventCenterUrl, "utf8")
  ]);

  assert.match(model, /deepResult\.input\.evidence\.length \+ deepResult\.input\.observations\.length/);
  assert.match(model, /pending1602Evidence = false/);
  assert.match(model, /id: "INTAKE-1602"/);
  assert.match(model, /deepResult\?\.eventId \?\? "EVT-1602"/);
  assert.match(model, /pendingSameEventAssessment/);
  assert.match(model, /新住户事实已提交，等待物业确认本轮系统观测/);
  assert.match(model, /1602卫生间现场事实待评估/);
  assert.match(model, /return deepEvent \? \[deepEvent\] : \[\]/);
  assert.match(model, /buildingLifeEventExamples/);
  assert.match(model, /EXAMPLE-1203/);
  assert.match(model, /按当前事实补充下一项必要证据/);
  assert.doesNotMatch(model, /evidenceCount: 6/);
  assert.doesNotMatch(model, /COLLECTING_EVIDENCE: \{[^\n]*确认水表观察/);
  assert.match(center, /residentEvidenceNeedsAssessment\(session\.result, session\.residentSubmissions\)/);
  assert.match(center, /buildingLifeEvents\(session\.result, pending1602Evidence\)/);
  assert.match(center, /进入物业继续评估/);
  assert.match(center, /没有活动事件时，这里保持为空/);
  assert.match(center, /不参与上方任何统计或任务队列/);
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

test("scripted demo state cannot seed the formal lifecycle", async () => {
  const [demo, provider] = await Promise.all([
    readFile(demoProviderUrl, "utf8"),
    readFile(lifecycleProviderUrl, "utf8")
  ]);

  assert.match(demo, /LEGACY_STORAGE_KEY = "zhusheng\.demo\.v3"/);
  assert.match(demo, /STORAGE_KEY = "zhusheng\.demo\.v4"/);
  assert.match(demo, /sessionStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);
  assert.match(demo, /search\.get\("demo"\) === "1"/);
  assert.doesNotMatch(provider, /useDemo/);
  assert.doesNotMatch(provider, /seedFromAgent/);
  assert.doesNotMatch(provider, /demoState\.currentStep/);
  assert.doesNotMatch(provider, /旧演示已安全迁移到待维修状态/);
});

test("route membership and active event truth are separate product concepts", async () => {
  const source = await readFile(productContextUrl, "utf8");

  assert.match(source, /session\.result\?\.eventId/);
  assert.match(source, /route\.currentPath === "\/case-1602" \? route\.canonicalEventId : null/);
  assert.doesNotMatch(source, /session\.result\?\.eventId \?\? route\.canonicalEventId;/);
});