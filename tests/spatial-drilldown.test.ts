import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const conceptUrl = new URL("../components/ConceptExhibit.tsx", import.meta.url);
const heroUrl = new URL("../components/v6/BuildingHeroTwin.tsx", import.meta.url);
const caseUrl = new URL("../components/Case1602Exhibit.tsx", import.meta.url);

test("home spatial drilldown is user-controlled instead of timer-driven", async () => {
  const source = await readFile(conceptUrl, "utf8");

  assert.match(source, /const phaseOrder: HeroDrillPhase\[\] = \["building", "floor", "unit", "space"\]/);
  assert.match(source, /function advanceSpatialDrill\(\)/);
  assert.match(source, /function retreatSpatialDrill\(\)/);
  assert.match(source, /function selectPhase\(nextPhase: HeroDrillPhase\)/);
  assert.match(source, /setPhase\(phaseOrder\[currentIndex \+ 1\]\)/);
  assert.match(source, /setPhase\(phaseOrder\[currentIndex - 1\]\)/);
  assert.doesNotMatch(source, /setTimeout/);
  assert.doesNotMatch(source, /timers\.current/);
  assert.match(source, /router\.push\("\/case-1602\?entry=building"\)/);
  assert.match(source, /aria-current=\{phase === item \? "location" : undefined\}/);
});

test("home can restore a requested building level for reverse spatial navigation", async () => {
  const source = await readFile(conceptUrl, "utf8");

  assert.match(source, /function drillPhaseFromLocation\(\): HeroDrillPhase \| null/);
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\("drill"\)/);
  assert.match(source, /phaseOrder\.includes\(requested as HeroDrillPhase\)/);
  assert.match(source, /const requested = drillPhaseFromLocation\(\)/);
  assert.match(source, /if \(requested\) setPhase\(requested\)/);
});

test("building hero consumes the shared pending-assessment truth instead of a local product-only exception", async () => {
  const [concept, hero] = await Promise.all([
    readFile(conceptUrl, "utf8"),
    readFile(heroUrl, "utf8")
  ]);

  assert.match(concept, /const pendingResidentAssessment = residentEvidenceNeedsAssessment\(session\.result, session\.residentSubmissions\)/);
  assert.doesNotMatch(concept, /domainAdapterStatus === "PRODUCT_ONLY"/);
  assert.doesNotMatch(concept, /!productOnlySubmission && residentEvidenceNeedsAssessment/);
  assert.match(concept, /FEATURED CASE \/ NOT LIVE/);
  assert.match(concept, /INTAKE \/ NOT YET EVENT/);
  assert.match(concept, /VERIFIED EVENT \/ RESOLVED/);
  assert.match(concept, /statusLabel=\{anchorStatus\}/);
  assert.match(concept, /anchorAriaLabel=\{anchorAriaLabel\}/);
  assert.match(hero, /statusLabel: string/);
  assert.match(hero, /anchorAriaLabel: string/);
  assert.match(hero, /<small>\{statusLabel\}<\/small>/);
  assert.match(hero, /aria-label=\{anchorAriaLabel\}/);
  assert.doesNotMatch(hero, /LIFE EVENT ACTIVE/);
});

test("procedural fallback keeps the unit visible when unit and space share the same node", async () => {
  const hero = await readFile(heroUrl, "utf8");
  assert.match(hero, /if \(space && space !== unit\) space\.visible = phase === "space"/);
});

test("case is a spatial life page with identity, truthful focus reason, and reverse hierarchy", async () => {
  const source = await readFile(caseUrl, "utf8");

  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("entry"\) === "building"/);
  assert.match(source, /FROM BUILDING \/ 空间下钻完成/);
  assert.match(source, /CURRENT SPACE \/ 当前空间身份/);
  assert.match(source, /product\.spaceId/);
  assert.match(source, /product\.spaceLabel/);
  assert.match(source, /product\.floorId/);
  assert.match(source, /product\.unitId/);
  assert.match(source, /\?drill=unit/);
  assert.match(source, /\?drill=floor/);
  assert.match(source, /\?drill=building/);
  assert.match(source, /查看1602整户/);
  assert.match(source, /查看16F/);
  assert.match(source, /返回整栋建筑/);
  assert.match(source, /为什么定位到1602卫生间/);
  assert.match(source, /PRODUCT EVIDENCE \/ NOT EVENT/);
  assert.match(source, /FEATURED CASE \/ NOT LIVE/);
  assert.match(source, /INTAKE \/ NOT YET EVENT/);
  assert.match(source, /NEW FACTS \/ REASSESS/);
  assert.match(source, /VERIFIED EVENT \/ RESOLVED/);
  assert.match(source, /最近一条住户提交只属于 Product Evidence，不进入漏水领域评估/);
  assert.match(source, /筑生 \/ 当前空间生命页/);
  assert.match(source, /1602卫生间/);
  assert.match(source, /从建造记忆走到今天/);
});

test("case spatial linkage uses only recorded relations and deterministic system tracing", async () => {
  const source = await readFile(caseUrl, "utf8");

  assert.match(source, /空间事实与3D联动/);
  assert.match(source, /session\.productEvidenceTimeline/);
  assert.match(source, /evidence\.relatedBusinessIds/);
  assert.match(source, /memory\.relatedBusinessIds/);
  assert.match(source, /model\.assessment\.targetBusinessIds/);
  assert.match(source, /entity\?\.systemId/);
  assert.match(source, /traceSystem\(systemId\)/);
  assert.match(source, /sourceTool: "trace_system"/);
  assert.match(source, /mode: "SYSTEM_TRACE"/);
  assert.match(source, /focusMemory\(memory: RelevantBuildingMemory\)/);
  assert.match(source, /focusEvidence\(evidence: ProductEvidenceRecord\)/);
  assert.match(source, /focusCandidate\(businessId: string\)/);
  assert.match(source, /focusSystem\(systemId: string\)/);
  assert.match(source, /data-spatial-kind="memory"/);
  assert.match(source, /data-spatial-kind="evidence"/);
  assert.match(source, /data-spatial-kind="candidate"/);
  assert.match(source, /data-spatial-kind="system"/);
  assert.match(source, /3D 联动只改变“看哪里”，不改变事件状态、证据身份、候选排序或人工授权/);
  assert.match(source, /不从住户文字自行猜测构件或故障原因/);
  assert.match(source, /待重新评估时不会复用上一轮候选/);
});

test("explicit case focus can inspect current evidence without reviving stale pending candidates", async () => {
  const source = await readFile(caseUrl, "utf8");

  assert.match(source, /const \[spatialSelectionId, setSpatialSelectionId\]/);
  assert.match(source, /const selectedSceneBusinessId = spatialSelectionId/);
  assert.match(source, /model\.pendingResidentAssessment\s+\? null/);
  assert.match(source, /setSpatialSelectionId\(null\)/);
  assert.match(source, /\[model\.latestResidentSubmissionId, result\?\.eventId, result\?\.state\]/);
  assert.match(source, /onSelect=\{handleTwinSelect\}/);
  assert.doesNotMatch(source, /Product Evidence.*trace_system/s);
});
