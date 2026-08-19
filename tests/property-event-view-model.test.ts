import test from "node:test";
import assert from "node:assert/strict";
import type { LabSession } from "../lib/life-event-lab/types.ts";
import { derive1602MemoryRelevanceInput, derivePropertyEventViewModel } from "../lib/product/property-event-view-model.ts";

function sessionWithoutEvent(): LabSession {
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
    selectedView: "VIEW_RESIDENT",
    selectedBusinessId: null,
    activeTab: "input",
    notice: null,
    residentSubmissions: [],
    propertyReviews: [],
    productEvidenceTimeline: [],
    photoObservationConfirmation: "UNCONFIRMED"
  };
}

test("property first screen waits for event facts instead of presenting template controls as observations", () => {
  const session = sessionWithoutEvent();
  const model = derivePropertyEventViewModel(session);
  const relevance = derive1602MemoryRelevanceInput(session);

  assert.equal(model.eventId, "EVT-1602");
  assert.equal(model.spaceLabel, "1602卫生间");
  assert.equal(model.projection.phase, "EVIDENCE");
  assert.equal(model.projection.nextAction.id, "COLLECT_RESIDENT_EVIDENCE");
  assert.equal(model.residentEvidenceReady, false);
  assert.equal(model.evidenceGaps[0]?.actor, "住户");
  assert.deepEqual(model.observations, []);
  assert.deepEqual(relevance.activeSystemIds, []);
  assert.deepEqual(relevance.observationTags, []);
  assert.equal(relevance.selectedBusinessId, null);
});

test("property view model keeps historical relevance separate from confirmed diagnosis", () => {
  const model = derivePropertyEventViewModel(sessionWithoutEvent());
  const normal = model.relevantMemories.find((item) => item.memoryClass === "NORMAL");

  assert.ok(normal);
  assert.equal(normal.historicalSignal, "BACKGROUND");
  assert.match(normal.historicalBoundary, /不能.*当前|不代表当前|不能据此排除|不应.*当前/u);
  assert.equal(model.assessment.confidence, "尚未评估");
});

test("browsing a component cannot change event-level memory relevance before assessment", () => {
  const session = sessionWithoutEvent();
  session.selectedBusinessId = "J-1602-CW-03";

  const relevance = derive1602MemoryRelevanceInput(session);
  assert.equal(relevance.selectedBusinessId, null);
  assert.deepEqual(relevance.topologyBusinessIds, []);
});
