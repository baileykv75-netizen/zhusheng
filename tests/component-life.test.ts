import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deriveComponentLifeView } from "../lib/product/component-life.ts";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";
import type { ProductEvidenceRecord } from "../lib/product/evidence.ts";

const overlayUrl = new URL("../components/product/ComponentLifeOverlay.tsx", import.meta.url);
const caseUrl = new URL("../components/Case1602Exhibit.tsx", import.meta.url);
const twinUrl = new URL("../components/life-event/BathroomTwinViewport.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);

const joint = "J-1602-CW-03";

function minimalResult(): LifeEventResult {
  return {
    eventId: "EVT-COMPONENT-LIFE",
    state: "ASSESSED",
    input: {
      evidence: [{
        id: "DOMAIN-JOINT",
        type: "RESIDENT_WALL_PHOTO",
        status: "PRESENT",
        sourceActor: "RESIDENT",
        relatedBusinessIds: [joint],
        capturedAt: "2026-08-21T09:00:00+08:00",
        reliability: 1,
        provenance: "test",
        syntheticDemo: true
      }],
      observations: [{
        id: "OBS-JOINT",
        sensorBusinessId: joint,
        observedAt: "2026-08-21T09:05:00+08:00",
        metric: "MICRO_FLOW",
        value: 0.03,
        unit: "L/min",
        quality: "GOOD",
        syntheticDemo: true
      }]
    },
    repairRecords: [{
      repairRecordId: "REPAIR-JOINT",
      eventId: "EVT-COMPONENT-LIFE",
      targetBusinessId: joint,
      method: "JOINT_RETIGHTEN",
      startedAt: "2026-08-21T09:30:00+08:00",
      completedAt: "2026-08-21T09:40:00+08:00",
      submittedAt: "2026-08-21T09:45:00+08:00",
      crewId: "CREW-01",
      description: "test",
      evidenceBeforeIds: [],
      evidenceAfterIds: [],
      result: "COMPLETED",
      restoreSupplyVerificationRequired: true,
      submittedByActorType: "PROPERTY",
      submittedByActorId: "PROPERTY-01",
      syntheticDemo: true
    }],
    auditLog: [{
      sequence: 7,
      eventId: "EVT-COMPONENT-LIFE",
      timestamp: "2026-08-21T09:46:00+08:00",
      actorType: "PROPERTY",
      actionType: "REPAIR_RESULT_RECORDED",
      previousState: "REPAIR_PENDING",
      nextState: "REPAIR_RECORDED",
      inputRefs: [],
      evidenceRefs: [],
      componentRefs: [joint],
      ruleIds: [],
      ruleSetVersion: "test",
      memoryVersion: "test"
    }]
  } as unknown as LifeEventResult;
}

test("component life aggregates only records structurally linked to the selected object", () => {
  const productEvidence: ProductEvidenceRecord = {
    id: "PROD-JOINT",
    eventId: "EVT-COMPONENT-LIFE",
    spaceId: "SPACE-1602-BATHROOM",
    relatedBusinessIds: [joint],
    relatedEvidenceIds: [],
    type: "PROPERTY_FIELD_OBSERVATION",
    sourceActor: "PROPERTY",
    capturedAt: "2026-08-21T08:55:00+08:00",
    dataClass: "BROWSER_LOCAL",
    status: "PRESENT",
    observedValue: "test",
    disclosure: "test",
    domainEvidenceRefs: [],
    immutable: true
  };

  const life = deriveComponentLifeView(joint, {
    productEvidence: [productEvidence],
    result: minimalResult(),
    currentCandidateIds: [joint],
    pendingResidentAssessment: false
  });

  assert.ok(life);
  assert.equal(life.entity.businessId, joint);
  assert.ok(life.systems.some((system) => system.businessId === "SYS-1602-CW"));
  assert.ok(life.records.some((record) => record.subjectBusinessIds.includes(joint)));
  assert.deepEqual(life.productEvidence.map((item) => item.id), ["PROD-JOINT"]);
  assert.deepEqual(life.domainEvidence.map((item) => item.id), ["DOMAIN-JOINT"]);
  assert.deepEqual(life.observations.map((item) => item.id), ["OBS-JOINT"]);
  assert.deepEqual(life.repairs.map((item) => item.repairRecordId), ["REPAIR-JOINT"]);
  assert.deepEqual(life.auditEntries.map((item) => item.sequence), [7]);
  assert.equal(life.candidateStatus, "CURRENT_CANDIDATE");
});

test("pending reassessment masks previous candidate identity without erasing object history", () => {
  const life = deriveComponentLifeView(joint, {
    result: minimalResult(),
    currentCandidateIds: [joint],
    pendingResidentAssessment: true
  });

  assert.ok(life);
  assert.equal(life.candidateStatus, "PENDING_REASSESSMENT");
  assert.ok(life.records.length > 0);
  assert.match(life.boundary, /不复用上一轮候选身份/);
});

test("first intake pending assessment does not imply a previous candidate or formal event", () => {
  const life = deriveComponentLifeView(joint, {
    result: null,
    currentCandidateIds: [],
    pendingResidentAssessment: true
  });

  assert.ok(life);
  assert.equal(life.candidateStatus, "PENDING_ASSESSMENT");
  assert.equal(life.eventId, null);
  assert.match(life.boundary, /尚未形成正式事件/);
});

test("fresh component life never invents a live event", () => {
  const life = deriveComponentLifeView(joint, {
    result: null,
    currentCandidateIds: [],
    pendingResidentAssessment: false
  });

  assert.ok(life);
  assert.equal(life.candidateStatus, "NO_LIVE_EVENT");
  assert.equal(life.eventId, null);
  assert.equal(life.domainEvidence.length, 0);
  assert.equal(life.repairs.length, 0);
});

test("case 3D selection and shared provider drive the component life overlay", async () => {
  const [overlay, caseSource, twin, layout] = await Promise.all([
    readFile(overlayUrl, "utf8"),
    readFile(caseUrl, "utf8"),
    readFile(twinUrl, "utf8"),
    readFile(layoutUrl, "utf8")
  ]);

  assert.match(layout, /<ComponentLifeOverlay \/>/);
  assert.match(overlay, /product\.selectedBusinessId/);
  assert.match(overlay, /deriveComponentLifeView/);
  assert.match(overlay, /构件生命索引/);
  assert.match(overlay, /这个对象的一生/);
  assert.match(overlay, /历史记录、证据关联和维修经历/);
  assert.match(caseSource, /function handleTwinSelect\(businessId: string \| null\)/);
  assert.match(caseSource, /product\.setSelectedBusinessId\(businessId\)/);
  assert.match(twin, /raycaster\.intersectObjects/);
  assert.match(twin, /onSelect\(hit \? semanticBusinessId\(hit\.object\) : null\)/);
});
