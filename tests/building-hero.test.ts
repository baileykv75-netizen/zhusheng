import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const visualRoot = resolve(repoRoot, "bim/visual");
const publicRoot = resolve(repoRoot, "public/assets/v6/building");

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("building hero geometry remains consistent with the IFC-derived specification", () => {
  const validation = json<{
    sourceIfcSha256: string;
    lengthUnit: string;
    toleranceDerivedFromModelScale: number;
    geometry: {
      expectedBodyFootprint: number[];
      expectedBodyHeight: number;
      storeyCount: number;
      storeyHeight: number;
      unit1602BoundingVolume: number[];
      bathroom1602BoundingVolume: number[];
      anchorPositions: Record<string, number[]>;
    };
    checks: Record<string, boolean>;
    performanceBudget: { triangleCount: number; recommendedMaxTriangles: number; glbBytes: number; maxGlbBytes: number };
    visualPriority: string[];
    passed: boolean;
  }>(resolve(visualRoot, "building-hero.validation.json"));

  assert.equal(validation.sourceIfcSha256, sha256(resolve(repoRoot, "bim/output/ZS-DEMO-001.ifc")));
  assert.equal(validation.lengthUnit, "METRE");
  assert.ok(validation.toleranceDerivedFromModelScale > 0);
  assert.deepEqual(validation.geometry.expectedBodyFootprint, [27.2, 14.8]);
  assert.equal(validation.geometry.expectedBodyHeight, 54);
  assert.equal(validation.geometry.storeyCount, 18);
  assert.equal(validation.geometry.storeyHeight, 3);
  assert.equal(validation.geometry.unit1602BoundingVolume.length, 6);
  assert.equal(validation.geometry.bathroom1602BoundingVolume.length, 6);
  assert.deepEqual(Object.keys(validation.geometry.anchorPositions).sort(), ["BATHROOM_1602", "BUILDING_CENTER", "EVENT_1602", "FLOOR_16", "UNIT_1602"]);
  assert.ok(Object.values(validation.checks).every(Boolean));
  assert.ok(validation.performanceBudget.triangleCount <= validation.performanceBudget.recommendedMaxTriangles);
  assert.ok(validation.performanceBudget.glbBytes <= validation.performanceBudget.maxGlbBytes);
  assert.deepEqual(validation.visualPriority.slice(0, 3), ["Visual QA", "Material Quality", "Silhouette"]);
  assert.equal(validation.passed, true);
});

test("building hero anchors drive all four spatial views", () => {
  const anchors = json<{
    anchors: Record<string, { node: string; targetNode: string }>;
    eventAnchorNode: string;
    floorNodes: Record<string, string>;
    focusNodes: Record<string, string>;
  }>(resolve(visualRoot, "building-hero.anchors.json"));

  assert.deepEqual(Object.keys(anchors.anchors), ["building", "floor", "unit", "space"]);
  assert.equal(Object.keys(anchors.floorNodes).length, 18);
  assert.equal(anchors.floorNodes["16"], "LVL-16");
  assert.equal(anchors.focusNodes.unit, "UNIT-1602");
  assert.equal(anchors.focusNodes.space, "SPACE-1602-BATHROOM");
  assert.equal(anchors.eventAnchorNode, "ANCHOR-EVENT_1602");
  for (const descriptor of Object.values(anchors.anchors)) {
    assert.ok(descriptor.node.startsWith("CAM-HERO-"));
    assert.ok(descriptor.targetNode.startsWith("ANCHOR-"));
  }
});

test("published hero assets exactly match their reproducible visual sources", () => {
  for (const filename of ["building-hero.glb", "building-hero.anchors.json", "building-hero.validation.json"]) {
    assert.deepEqual(readFileSync(resolve(publicRoot, filename)), readFileSync(resolve(visualRoot, filename)));
  }

  const runtime = readFileSync(resolve(repoRoot, "components/v6/BuildingHeroTwin.tsx"), "utf8");
  assert.match(runtime, /GLTFLoader/);
  assert.match(runtime, /building-hero\.anchors\.json/);
  assert.match(runtime, /building-hero\.glb/);
  assert.match(runtime, /createFallbackTower/);
});
