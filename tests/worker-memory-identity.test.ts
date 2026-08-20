import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInitialSnapshot, type EvidenceRecord } from "../lib/demo-engine.ts";
import { deriveBuildingMemoryViewModel } from "../lib/product/building-memory-view-model.ts";

function labSession() {
  return {
    schemaVersion: 1,
    controls: {} as never,
    isolation: {} as never,
    repairDraft: {} as never,
    postRepair: {} as never,
    eventCounter: 0,
    result: null,
    selectedView: "VIEW_RESIDENT",
    selectedBusinessId: null,
    activeTab: "input",
    notice: null,
    residentSubmissions: [],
    propertyReviews: [],
    productEvidenceTimeline: [],
    photoObservationConfirmation: "UNCONFIRMED"
  } as never;
}

test("worker task binds space and component identity to canonical BusinessIds", () => {
  const source = readFileSync("app/worker/page.tsx", "utf8");
  assert.match(source, /SPACE-1602-BATHROOM/);
  assert.match(source, /J-1602-CW-03/);
  assert.match(source, /扫码\/BIM绑定/);
  assert.match(source, /readOnly/);
  assert.doesNotMatch(source, /W-1602-B7/);
});

test("verified legacy EV-2848 refs are normalized before entering Building Memory", () => {
  const legacy: EvidenceRecord = {
    id: "EV-2848",
    type: "冷水支管接头复核",
    source: "安装班组口述 + 现场照片 · 人工确认",
    status: "verified",
    note: "1602卫生间 · W-1602-B7 · 冷水支管接头复核 · 保压结果：无掉压。原始口述：现场复核完成。",
    capturedAt: "2025-03-18 14:26",
    refs: ["1602卫生间", "MIC-BATH-1602", "W-1602-B7"]
  };
  const model = deriveBuildingMemoryViewModel(labSession(), [legacy]);
  const record = model.entries.find((item) => item.recordId === "EV-2848");
  assert.ok(record);
  assert.deepEqual(record.subjectBusinessIds, ["SPACE-1602-BATHROOM", "SYS-1602-CW", "J-1602-CW-03"]);
  assert.equal(record.visualTargetBusinessId, "J-1602-CW-03");
  assert.equal(record.memory.workerStatement, "现场复核完成。");
});

test("unverified worker drafts never enter Building Memory", () => {
  const draft = createInitialSnapshot().evidence.concat({
    id: "EV-2848",
    type: "冷水支管接头复核",
    source: "安装班组口述 + 现场照片",
    status: "needs_review",
    note: "待核验",
    capturedAt: "2025-03-18 14:26",
    refs: ["SPACE-1602-BATHROOM", "SYS-1602-CW", "J-1602-CW-03"]
  } satisfies EvidenceRecord);
  const model = deriveBuildingMemoryViewModel(labSession(), draft);
  assert.equal(model.entries.some((item) => item.recordId === "EV-2848"), false);
});
