import assert from "node:assert/strict";
import test from "node:test";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";
import type { BuildingLifeEventSummary } from "../lib/product/building-life-events.ts";
import { buildingTasks } from "../lib/product/building-tasks.ts";

function event(overrides: Partial<BuildingLifeEventSummary> = {}): BuildingLifeEventSummary {
  return {
    id: "EVT-1602-LAB-001",
    title: "1602卫生间现场异常",
    floor: 16,
    unitId: "1602",
    space: "主卫",
    category: "待确定",
    severity: "重要",
    displayStatus: "维修后仍有异常",
    technicalState: "REOPENED",
    ownerRole: "物业值班",
    nextAction: "重新收集新一轮现场事实",
    updatedAt: "刚刚",
    evidenceCount: 8,
    memoryReferenceCount: 3,
    isDeepDemo: true,
    dataClass: "DEMO_SYNTHETIC",
    ...overrides
  };
}

const deepResult = {
  eventId: "EVT-1602-LAB-001",
  repairRecords: [{ repairRecordId: "REPAIR-EVT-1602-LAB-001-001" }],
  auditLog: [{ repairRecordIds: ["REPAIR-EVT-1602-LAB-001-001"], evidenceRefs: ["EVD-POST-001"] }]
} as unknown as LifeEventResult;

test("plain REOPENED task still asks for genuinely new resident evidence", () => {
  const [task] = buildingTasks([event()], deepResult);

  assert.equal(task.type, "REINSPECTION");
  assert.ok(task.requiredEvidence.includes("新的现场描述"));
  assert.ok(task.requiredEvidence.includes("新的现场观察"));
  assert.ok(task.historyRefs.includes("REPAIR-EVT-1602-LAB-001-001"));
});

test("fresh resident evidence changes REOPENED operational work to property assessment without changing technical state", () => {
  const pending = event({
    displayStatus: "新住户事实已提交，等待物业确认本轮系统观测",
    nextAction: "确认本轮系统观测并在同一事件上继续确定性评估"
  });
  const [task] = buildingTasks([pending], deepResult);

  assert.equal(pending.technicalState, "REOPENED");
  assert.equal(task.type, "PROFESSIONAL_ASSESSMENT");
  assert.equal(task.ownerRole, "物业值班");
  assert.equal(task.status, "WAITING");
  assert.deepEqual(task.requiredEvidence, ["本轮住户新证据", "物业确认的本轮系统观测"]);
  assert.equal(task.requiredEvidence.includes("新的现场描述"), false);
  assert.match(task.nextStateHint, /原事件ID上继续确定性评估/);
  assert.ok(task.historyRefs.includes("REPAIR-EVT-1602-LAB-001-001"));
  assert.ok(task.historyRefs.includes("EVD-POST-001"));
});

test("fresh INCONCLUSIVE evidence is also property assessment rather than another collection task", () => {
  const pending = event({
    technicalState: "INCONCLUSIVE",
    displayStatus: "新住户事实已提交，等待物业确认本轮系统观测",
    nextAction: "确认本轮系统观测并在同一事件上继续确定性评估"
  });
  const [task] = buildingTasks([pending], null);

  assert.equal(task.type, "PROFESSIONAL_ASSESSMENT");
  assert.deepEqual(task.requiredEvidence, ["本轮住户新证据", "物业确认的本轮系统观测"]);
  assert.deepEqual(task.historyRefs, []);
});
