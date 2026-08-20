import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultLifeEventEngine } from "../lib/life-event-engine/index.ts";
import type { LabSession } from "../lib/life-event-lab/types.ts";
import { controlsFromTemplate, evaluateControls } from "../lib/life-event-lab/model.ts";
import type { ResidentEvidenceSubmission } from "../lib/product/evidence.ts";
import { deriveBuildingMemoryViewModel } from "../lib/product/building-memory-view-model.ts";
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

function submission(eventId: string, sequence: number, submittedAt: string): ResidentEvidenceSubmission {
  const suffix = sequence === 1 ? "" : `-R${String(sequence).padStart(2, "0")}`;
  return {
    submissionId: `RES-SUB-${eventId}${suffix}`,
    eventId,
    submittedAt,
    submittedBy: "DEMO-RESIDENT-1602",
    evidenceIds: [`TEXT-${sequence}`, `PHOTO-${sequence}`, `METER-${sequence}`],
    descriptionEvidenceId: `TEXT-${sequence}`,
    photoEvidenceId: `PHOTO-${sequence}`,
    meterEvidenceId: `METER-${sequence}`,
    photoFinding: "MOISTURE_VISIBLE",
    meterFinding: "FLOW_CONFIRMED_NO_USE",
    immutable: true
  };
}

const now = Date.parse("2026-08-20T02:40:00.000Z");

function inconclusiveSession() {
  const session = sessionWithoutEvent();
  const engine = createDefaultLifeEventEngine({ clock: { now: () => new Date(now).toISOString() } });
  const result = evaluateControls(engine, controlsFromTemplate("contradictory-evidence"), 1, now);
  assert.equal(result.state, "INCONCLUSIVE");
  session.eventCounter = 1;
  session.result = result;
  session.controls = controlsFromTemplate("joint-supported");
  session.residentSubmissions = [submission(result.eventId, 1, new Date(now - 2 * 60_000).toISOString())];
  return session;
}

test("property first screen waits for event facts instead of presenting template controls as observations", () => {
  const session = sessionWithoutEvent();
  const model = derivePropertyEventViewModel(session);
  const relevance = derive1602MemoryRelevanceInput(session);

  assert.equal(model.eventId, "尚未形成事件");
  assert.equal(model.spaceLabel, "1602卫生间");
  assert.equal(model.projection.phase, "EVIDENCE");
  assert.equal(model.projection.nextAction.id, "COLLECT_RESIDENT_EVIDENCE");
  assert.equal(model.pendingResidentAssessment, false);
  assert.equal(model.residentEvidenceReady, false);
  assert.equal(model.evidenceGaps[0]?.actor, "住户");
  assert.deepEqual(model.observations, []);
  assert.deepEqual(relevance.activeSystemIds, []);
  assert.deepEqual(relevance.observationTags, []);
  assert.equal(relevance.selectedBusinessId, null);
});

test("initial resident submission stays INTAKE-1602 until property confirms system observations", () => {
  const session = sessionWithoutEvent();
  session.residentSubmissions = [submission("EVT-1602-LAB-001", 1, new Date(now - 5_000).toISOString())];
  const model = derivePropertyEventViewModel(session);

  assert.equal(model.eventId, "INTAKE-1602");
  assert.equal(model.pendingResidentAssessment, true);
  assert.equal(model.projection.nextAction.id, "EVALUATE_FACTS");
  assert.equal(model.assessment.confidence, "尚未评估");
  assert.deepEqual(model.assessment.targetBusinessIds, []);
  assert.equal(model.evidenceGaps.length, 1);
  assert.equal(model.evidenceGaps[0].actor, "物业");
  assert.match(model.evidenceGaps[0].label, /本轮系统观测确认/);
  assert.deepEqual(model.observations, []);
});

test("INCONCLUSIVE without fresh resident evidence asks for a genuinely new resident cycle", () => {
  const session = inconclusiveSession();
  const model = derivePropertyEventViewModel(session);

  assert.equal(model.pendingResidentAssessment, false);
  assert.equal(model.projection.nextAction.id, "COLLECT_RESIDENT_EVIDENCE");
  assert.equal(model.evidenceGaps[0].actor, "住户");
  assert.match(model.evidenceGaps[0].label, /本轮新的住户现场证据/);
});

test("fresh INCONCLUSIVE submission neutralizes the previous diagnosis until the same event is reassessed", () => {
  const session = inconclusiveSession();
  const eventId = session.result!.eventId;
  session.residentSubmissions!.push(submission(eventId, 2, new Date(now - 30_000).toISOString()));
  const model = derivePropertyEventViewModel(session);

  assert.equal(model.eventId, eventId);
  assert.equal(model.pendingResidentAssessment, true);
  assert.equal(model.projection.nextAction.id, "EVALUATE_FACTS");
  assert.equal(model.assessment.confidence, "待本轮评估");
  assert.deepEqual(model.assessment.targetBusinessIds, []);
  assert.match(model.assessment.title, /上一轮判断暂不更新/);
  assert.ok(model.observations.length >= 2);
  assert.ok(model.observations.every((item) => item.label.startsWith("上一轮")));
  assert.ok(model.observations.every((item) => item.status === "BASELINE"));
  assert.equal(model.evidenceGaps.length, 1);
  assert.equal(model.evidenceGaps[0].actor, "物业");
  assert.ok(model.relevantMemories.every((item, index, items) => index === 0 || items[index - 1].occurredAt <= item.occurredAt));
});

test("memory view keeps the formal event but suspends previous-cycle relevance while new evidence waits", () => {
  const session = inconclusiveSession();
  session.residentSubmissions!.push(submission(session.result!.eventId, 2, new Date(now - 30_000).toISOString()));
  const model = deriveBuildingMemoryViewModel(session);

  assert.equal(model.hasActiveEvent, true);
  assert.equal(model.eventId, session.result!.eventId);
  assert.equal(model.pendingResidentAssessment, true);
  assert.equal(model.eventRelatedRecords, 0);
  assert.ok(model.entries.every((entry) => entry.eventRelation === null));
  assert.equal(model.defaultRecordId, model.entries[0]?.recordId ?? null);
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