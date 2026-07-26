import assert from "node:assert/strict";
import test from "node:test";
import { evidenceAssets } from "../lib/evidence.ts";
import { defaultSceneByView, sceneAssets, sceneSequence } from "../lib/stage.ts";

test("V5 scene registry is complete and uses versioned optimized assets", () => {
  assert.equal(sceneSequence.length, 10);
  assert.deepEqual(new Set(sceneSequence).size, sceneSequence.length);
  for (const id of sceneSequence) {
    const asset = sceneAssets[id];
    assert.match(asset.desktopAvif, /^\/assets\/v5\/scenes\/.+\.avif$/);
    assert.match(asset.desktopWebp, /^\/assets\/v5\/scenes\/.+\.webp$/);
    assert.match(asset.mobileAvif, /-mobile\.avif$/);
    assert.match(asset.mobileWebp, /-mobile\.webp$/);
    assert.match(asset.placeholder, /^\/assets\/v5\/placeholders\/.+-blur\.webp$/);
    assert.ok(asset.alt.length >= 12);
  }
  assert.equal(defaultSceneByView.building, "buildingWater");
  assert.equal(defaultSceneByView.worker, "bathroomConstruction");
  assert.equal(defaultSceneByView.resident, "bathroomMoisture");
  assert.equal(defaultSceneByView.group, "groupNetwork");
});

test("first-round evidence assets carry usable metadata", () => {
  assert.equal(Object.keys(evidenceAssets).length, 5);
  for (const item of Object.values(evidenceAssets)) {
    assert.match(item.src, /^\/assets\/v5\/evidence\/.+\.webp$/);
    assert.ok(item.type && item.object && item.capturedAt && item.status && item.alt);
  }
});
