import assert from "node:assert/strict";
import test from "node:test";
import { buildingLifeEvents } from "../lib/product/building-life-events.ts";
import { syntheticEvidenceCatalog } from "../lib/product/evidence.ts";
import { syntheticEvidenceTimelineIds } from "../lib/product/evidence.ts";
import { buildingTasks } from "../lib/product/building-tasks.ts";

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
  assert.equal(syntheticEvidenceCatalog.length, 6);
  for (const evidence of syntheticEvidenceCatalog) {
    assert.equal(evidence.source, "AI_GENERATED");
    assert.equal(evidence.dataClass, "DEMO_SYNTHETIC");
    assert.equal(evidence.disclosure, "AI生成 · 脱敏合成演示");
    assert.notEqual(evidence.type, "MODEL_LOCATOR");
    assert.match(evidence.assetPath ?? "", /^\/assets\/v6\/evidence\//);
  }
});

test("the five-image evidence timeline includes construction, damp, meter, repair and retest", () => {
  assert.equal(syntheticEvidenceTimelineIds.length, 5);
  const timeline = syntheticEvidenceTimelineIds.map((id) => syntheticEvidenceCatalog.find((item) => item.id === id));
  assert.ok(timeline.every(Boolean));
  assert.deepEqual(timeline.map((item) => item!.type), [
    "CONSTRUCTION_MEMORY",
    "USER_PHOTO",
    "METER_OBSERVATION",
    "REPAIR_RECORD",
    "POST_REPAIR_OBSERVATION"
  ]);
});

test("every building event resolves to an owned next task", () => {
  const events = buildingLifeEvents("AUTHORIZATION_PENDING");
  const tasks = buildingTasks(events);
  assert.equal(tasks.length, events.length);
  assert.ok(tasks.every((task) => task.eventId && task.ownerRole && task.title && task.nextStateHint));
  assert.equal(tasks[0].type, "REQUEST_AUTHORIZATION");
  assert.equal(tasks[0].ownerRole, "住户");
});
