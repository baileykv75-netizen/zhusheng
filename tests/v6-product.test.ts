import assert from "node:assert/strict";
import test from "node:test";
import { buildingLifeEvents } from "../lib/product/building-life-events.ts";
import { syntheticEvidenceCatalog } from "../lib/product/evidence.ts";

test("building event center has five synthetic events and only 1602 is deep", () => {
  const events = buildingLifeEvents("AUTHORIZATION_PENDING");
  assert.equal(events.length, 5);
  assert.equal(events.filter((event) => event.isDeepDemo).length, 1);
  assert.equal(events.find((event) => event.isDeepDemo)?.id, "EVT-1602");
  assert.ok(events.every((event) => event.dataClass === "DEMO_SYNTHETIC"));
  assert.equal(events[0].displayStatus, "等待人工授权");
  assert.equal(events[0].ownerRole, "住户");
});

test("generated evidence is explicitly synthetic and never represented as a model locator", () => {
  assert.equal(syntheticEvidenceCatalog.length, 5);
  for (const evidence of syntheticEvidenceCatalog) {
    assert.equal(evidence.source, "AI_GENERATED");
    assert.equal(evidence.dataClass, "DEMO_SYNTHETIC");
    assert.equal(evidence.disclosure, "AI生成 · 脱敏合成演示");
    assert.notEqual(evidence.type, "MODEL_LOCATOR");
    assert.match(evidence.assetPath ?? "", /^\/assets\/v6\/evidence\//);
  }
});
