import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { building1602Dataset } from "../lib/building-intelligence/catalog.ts";
import type { EvidenceRecord } from "../lib/demo-engine.ts";
import type { LabSession } from "../lib/life-event-lab/types.ts";
import {
  deriveBuildingMemoryViewModel,
  filterBuildingMemoryEntries,
  groupBuildingMemoryEntries
} from "../lib/product/building-memory-view-model.ts";

const workspaceSource = readFileSync(new URL("../components/memory/BuildingMemoryWorkspace.tsx", import.meta.url), "utf8");

function baseSession(selectedBusinessId: string | null = null): LabSession {
  return {
    schemaVersion: 2,
    controls: {
      humidity: { value: 78, baseline: 55, durationMinutes: 45, quality: "GOOD" },
      microFlow: { value: 0.03, baseline: 0, durationMinutes: 30, quality: "GOOD" },
      pipeInstallation: "PRESENT",
      waterproofing: "PRESENT",
      closedWaterTest: "PRESENT",
      residentPhoto: "UNVERIFIED",
      photoFinding: "UNREADABLE",
      meterReading: "UNVERIFIED",
      meterFinding: "UNREADABLE"
    },
    isolation: { humidity: 55, humidityBaseline: 55, microFlow: 0, microFlowBaseline: 0, durationMinutes: 20 },
    repairDraft: {
      targetBusinessId: "",
      method: "INSPECTION_ONLY",
      startedAt: "2026-08-19T00:00:00.000Z",
      completedAt: "2026-08-19T00:01:00.000Z",
      crewId: "PROPERTY-DEMO-01",
      description: "",
      result: "INSPECTION_ONLY",
      restoreSupplyVerificationRequired: true
    },
    postRepair: {
      humidity: 55,
      humidityBaseline: 55,
      humidityQuality: "GOOD",
      microFlow: 0,
      microFlowBaseline: 0,
      microFlowQuality: "GOOD",
      durationMinutes: 20,
      observationNote: ""
    },
    eventCounter: 0,
    result: null,
    selectedView: "VIEW_CONSTRUCTION_MEMORY",
    selectedBusinessId,
    activeTab: "input",
    notice: null,
    residentSubmissions: [],
    propertyReviews: [],
    productEvidenceTimeline: [],
    photoObservationConfirmation: "UNCONFIRMED"
  };
}

test("memory view exposes the full structured lifecycle memory instead of a hand-written showcase list", () => {
  const model = deriveBuildingMemoryViewModel(baseSession());
  const structuredCount = building1602Dataset.records.filter((record) => Boolean(record.memory)).length;

  assert.equal(model.totalRecords, structuredCount);
  assert.ok(model.totalRecords >= 60, "the product view must expose the full lifecycle memory dataset");
  assert.ok(model.specialRecords > 0);
  assert.ok(model.tradeCount >= 8);
  assert.equal(model.defaultRecordId, "REC-CONST-CW-J03-REWORK-01");
  assert.equal(model.hasActiveEvent, false);
  assert.equal(model.eventId, "尚未进入事件");
  assert.equal(model.eventRelatedRecords, 0);
  assert.equal(model.entries.some((entry) => entry.eventRelation !== null), false);
});

test("verified worker evidence is projected into the same Building Memory timeline", () => {
  const workerEvidence: EvidenceRecord[] = [{
    id: "EV-2848",
    type: "管线接头复核",
    source: "安装班组口述 + 现场照片",
    status: "verified",
    note: "1602卫生间北侧墙冷热水接头已完成，照片与房间码已同步。",
    capturedAt: "2025-03-18 14:26",
    refs: ["1602卫生间", "MIC-BATH-1602", "W-1602-B7"]
  }];
  const model = deriveBuildingMemoryViewModel(baseSession(), workerEvidence);
  const record = model.entries.find((entry) => entry.recordId === "EV-2848");

  assert.ok(record);
  assert.equal(record?.stage, "INSTALLATION");
  assert.equal(record?.trade, "COLD_WATER");
  assert.equal(record?.memory.workerStatement, "安装班组口述 + 现场照片");
  assert.ok(record?.memory.verification?.checkedItems.includes("现场影像"));
  assert.match(workspaceSource, /useDemo/);
  assert.match(workspaceSource, /demoState\.evidence/);
});

test("unverified worker draft evidence does not enter Building Memory", () => {
  const workerEvidence: EvidenceRecord[] = [{
    id: "EV-2848",
    type: "管线接头复核",
    source: "安装班组口述 + 现场照片",
    status: "needs_review",
    note: "尚待品质核验。",
    capturedAt: "2025-03-18 14:26",
    refs: ["1602卫生间", "MIC-BATH-1602", "W-1602-B7"]
  }];
  const model = deriveBuildingMemoryViewModel(baseSession(), workerEvidence);

  assert.equal(model.entries.some((entry) => entry.recordId === "EV-2848"), false);
});

test("browsing a component does not artificially inflate its current-event memory relevance", () => {
  const baseline = deriveBuildingMemoryViewModel(baseSession());
  const browsing = deriveBuildingMemoryViewModel(baseSession("PIPE-1602-CW-BASIN-01"));

  const baselineJ03 = baseline.entries.find((entry) => entry.recordId === "REC-CONST-CW-J03-REWORK-01")?.eventRelation;
  const browsingJ03 = browsing.entries.find((entry) => entry.recordId === "REC-CONST-CW-J03-REWORK-01")?.eventRelation;
  const baselineBasin = baseline.entries.find((entry) => entry.recordId === "REC-CONST-CW-BASIN-01")?.eventRelation;
  const browsingBasin = browsing.entries.find((entry) => entry.recordId === "REC-CONST-CW-BASIN-01")?.eventRelation;

  assert.deepEqual(browsingJ03, baselineJ03);
  assert.deepEqual(browsingBasin, baselineBasin);
});

test("field-change filter contains only actual field changes or rework", () => {
  const model = deriveBuildingMemoryViewModel(baseSession());
  const entries = filterBuildingMemoryEntries(model.entries, "FIELD_CHANGE");

  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry.memoryClass === "FIELD_CHANGE" || entry.memoryClass === "REWORK"));
});

test("lifecycle grouping keeps records in product stages rather than rendering dozens of unrelated cards", () => {
  const model = deriveBuildingMemoryViewModel(baseSession());
  const groups = groupBuildingMemoryEntries(model.entries);

  assert.ok(groups.length >= 5);
  assert.equal(groups.reduce((sum, group) => sum + group.entries.length, 0), model.totalRecords);
  assert.ok(groups.some((group) => group.id === "HANDOVER"));
  assert.ok(groups.some((group) => group.id === "INSPECTION"));
});

test("memory UI exposes verification scope and current-event relation without calling historical records proof of a current fault", () => {
  assert.match(workspaceSource, /当时检查了/);
  assert.match(workspaceSource, /当时没有单独覆盖/);
  assert.match(workspaceSource, /与 \{model\.eventId\} 的当前关系/);
  assert.match(workspaceSource, /当前没有活动事件/);
  assert.match(workspaceSource, /不参与任何诊断排序/);
  assert.doesNotMatch(workspaceSource, /排除证据|确认故障点/);
});
