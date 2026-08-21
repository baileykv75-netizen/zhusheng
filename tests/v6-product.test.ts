import assert from "node:assert/strict";
import test from "node:test";
import { buildingLifeEventExamples, buildingLifeEvents } from "../lib/product/building-life-events.ts";
import { syntheticEvidenceCatalog } from "../lib/product/evidence.ts";
import { syntheticEvidenceTimelineIds } from "../lib/product/evidence.ts";
import { buildingTasks } from "../lib/product/building-tasks.ts";
import { groupDecisionTask } from "../lib/product/group-decision-tasks.ts";
import type { GroupLearningCard, GroupReviewReplay } from "../lib/group-learning/types.ts";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";

test("active event collection contains only the current deep lifecycle event", () => {
  const events = buildingLifeEvents("AUTHORIZATION_PENDING");
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "EVT-1602");
  assert.equal(events[0].isDeepDemo, true);
  assert.equal(events[0].dataClass, "DEMO_SYNTHETIC");
  assert.equal(events[0].displayStatus, "等待人工授权");
  assert.equal(events[0].ownerRole, "住户");

  assert.equal(buildingLifeEventExamples.length, 4);
  assert.ok(buildingLifeEventExamples.every((event) => event.id.startsWith("EXAMPLE-")));
  assert.ok(buildingLifeEventExamples.every((event) => event.dataClass === "DEMO_SYNTHETIC"));
});

test("generated evidence is explicitly synthetic and never represented as a model locator", () => {
  assert.equal(syntheticEvidenceCatalog.length, 6);
  for (const evidence of syntheticEvidenceCatalog) {
    assert.equal(evidence.source, "AI_GENERATED");
    assert.equal(evidence.dataClass, "DEMO_SYNTHETIC");
    assert.equal(evidence.disclosure, "AI生成 · 脱敏合成演示");
    assert.notEqual(evidence.type, "MODEL_LOCATOR");
    assert.ok(evidence.eventId && evidence.spaceId && evidence.submittedBy && evidence.source && evidence.dataClass);
    assert.ok(Number.isFinite(Date.parse(evidence.capturedAt)));
  }
});

test("the five-image synthetic catalog remains available as demo media but is not itself the live evidence timeline", () => {
  assert.equal(syntheticEvidenceTimelineIds.length, 5);
  const timeline = syntheticEvidenceTimelineIds.map((id) => syntheticEvidenceCatalog.find((item) => item.id === id));
  assert.ok(timeline.every(Boolean));
  assert.ok(timeline.every((item) => /^\/assets\/demo-evidence\//.test(item!.assetPath ?? "")));
  assert.deepEqual(timeline.map((item) => item!.type), [
    "CONSTRUCTION_MEMORY",
    "USER_PHOTO",
    "METER_OBSERVATION",
    "REPAIR_RECORD",
    "POST_REPAIR_OBSERVATION"
  ]);
});

test("every active building event resolves to an owned next task", () => {
  const events = buildingLifeEvents("AUTHORIZATION_PENDING");
  const tasks = buildingTasks(events);
  assert.equal(tasks.length, events.length);
  assert.ok(tasks.every((task) => task.eventId && task.ownerRole && task.title && task.nextStateHint));
  assert.equal(tasks[0].type, "REQUEST_AUTHORIZATION");
  assert.equal(tasks[0].ownerRole, "住户");
});

test("REOPENED creates a second inspection task without losing first repair history", () => {
  const events = buildingLifeEvents("REOPENED");
  const result = {
    state: "REOPENED",
    repairRecords: [{ repairRecordId: "REPAIR-FIRST-01" }],
    auditLog: [{ repairRecordIds: ["REPAIR-FIRST-01"], evidenceRefs: ["POST-REPAIR-OBS-01"] }]
  } as unknown as LifeEventResult;
  const task = buildingTasks(events, result)[0];
  assert.equal(task.type, "REINSPECTION");
  assert.match(task.blockingReason ?? "", /仍观察到异常/);
  assert.match(task.nextStateHint, /保留第一次维修与复验记录/);
  assert.deepEqual(task.historyRefs, ["REPAIR-FIRST-01", "POST-REPAIR-OBS-01"]);
  assert.ok(task.requiredEvidence.includes("新的现场描述"));
  assert.ok(task.requiredEvidence.includes("新的现场观察"));
  assert.ok(task.requiredEvidence.includes("第一次维修记录"));
  assert.ok(task.requiredEvidence.includes("第一次复验结果"));
});

test("every group decision produces an actionable bounded task", () => {
  const card = { cardId: "CARD-1602-01" } as GroupLearningCard;
  const approved = groupDecisionTask(card, { state: "APPROVED_AS_PILOT", lastDecision: { reviewComment: "批准试点" } } as GroupReviewReplay)!;
  const returned = groupDecisionTask(card, { state: "RETURNED_FOR_EVIDENCE", lastDecision: { reviewComment: "需要补证" } } as GroupReviewReplay)!;
  const held = groupDecisionTask(card, { state: "HELD_WITHOUT_ADOPTION", lastDecision: { reviewComment: "暂缓" } } as GroupReviewReplay)!;
  assert.equal(approved.type, "PILOT_TASK");
  assert.ok(approved.owner && approved.scope && approved.sample && approved.dueAt && approved.successCriteria.length);
  assert.equal(returned.type, "EVIDENCE_TASK");
  assert.ok(returned.owner && returned.requiredEvidence.length && returned.dueAt);
  assert.equal(held.type, "HOLD_CONDITION");
  assert.ok(held.reason && held.reopenCondition);
  assert.equal(groupDecisionTask(card, { state: "PENDING_REVIEW", lastDecision: null }), null);
});