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

test("building hero never hardcodes an active life event and receives current session truth", async () => {
  const [concept, hero] = await Promise.all([
    readFile(conceptUrl, "utf8"),
    readFile(heroUrl, "utf8")
  ]);

  assert.match(concept, /residentEvidenceNeedsAssessment/);
  assert.match(concept, /domainAdapterStatus === "PRODUCT_ONLY"/);
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

test("case page preserves the building-to-space handoff when entered through the drilldown", async () => {
  const source = await readFile(caseUrl, "utf8");

  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("entry"\) === "building"/);
  assert.match(source, /FROM BUILDING \/ 空间下钻完成/);
  assert.match(source, /product\.buildingLabel/);
  assert.match(source, />16F</);
  assert.match(source, />1602</);
  assert.match(source, />卫生间</);
  assert.match(source, /返回整栋建筑/);
});
