import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultLifeEventEngine,
  createRepairTask,
  createVerifiedEventPackage,
  fixedClock,
  loadLifeEventContext,
  verifyEventPackage
} from "../lib/life-event-engine/index.ts";
import type { LifeEventInput, LifeEventResult } from "../lib/life-event-engine/types.ts";
import {
  controlsFromTemplate,
  decideAuthorization,
  DEFAULT_ISOLATION_CONTROLS,
  DEFAULT_POST_REPAIR_CONTROLS,
  defaultRepairDraft,
  evaluateControls,
  executeAuthorizedClose,
  executeAuthorizedReopen,
  submitIsolationObservation,
  submitPostRepairObservation,
  submitRepairRecord
} from "../lib/life-event-lab/model.ts";

const now = Date.parse("2026-07-29T14:00:00.000Z");
const engine = () => createDefaultLifeEventEngine({ clock: fixedClock("2026-07-30T00:00:00.000Z") });

function toRepairPending() {
  const local = engine();
  const assessed = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const approved = decideAuthorization(local, assessed, { actorType: "PROPERTY", actorId: "PROPERTY-01", decision: "APPROVED", reason: "批准隔离" }, now);
  const isolated = executeAuthorizedClose(local, approved, now);
  const pending = submitIsolationObservation(local, isolated, DEFAULT_ISOLATION_CONTROLS, now);
  return { local, pending };
}

function validDraft(result: LifeEventResult) {
  const isolation = result.auditLog.find((item) => item.actionType === "ISOLATION_CONFIRMED")!;
  const draft = defaultRepairDraft();
  draft.targetBusinessId = result.rankedHypotheses[0].candidateBusinessIds[0];
  draft.startedAt = new Date(Date.parse(isolation.timestamp) + 100).toISOString();
  draft.completedAt = new Date(Date.parse(isolation.timestamp) + 200).toISOString();
  return draft;
}

function toReopenPending() {
  const { local, pending } = toRepairPending();
  const repaired = submitRepairRecord(local, pending, validDraft(pending), now);
  return { local, pending, repaired };
}

function toPostRepairVerifying() {
  const { local, repaired } = toReopenPending();
  const approved = decideAuthorization(local, repaired, { actorType: "PROPERTY", actorId: "PROPERTY-02", decision: "APPROVED", reason: "批准恢复供水" }, now);
  const verifying = executeAuthorizedReopen(local, approved, now);
  return { local, repaired, approved, verifying };
}

test("repair task is derived from leader, memory hierarchy and topology", () => {
  const { local, pending } = toRepairPending();
  const task = createRepairTask(local.memory, pending);
  assert.equal(task.target.businessId, pending.rankedHypotheses[0].candidateBusinessIds[0]);
  assert.equal(task.space.businessId, "SPACE-1602-BATHROOM");
  assert.equal(task.storey.businessId, "LVL-16");
  assert.equal(task.unit.businessId, "UNIT-1602");
  assert.ok(task.upstreamComponentIds.includes(task.isolationValve.businessId));
  assert.ok(task.relatedMeterIds.includes("METER-1602-FLOW-01"));
});

test("repair task follows a changed leader and is not hardcoded to the joint", () => {
  const { local, pending } = toRepairPending();
  const changed = structuredClone(pending);
  changed.rankedHypotheses[0].candidateBusinessIds = ["PIPE-1602-CW-02"];
  const task = createRepairTask(local.memory, changed);
  assert.equal(task.target.businessId, "PIPE-1602-CW-02");
});

test("repair cannot be submitted before REPAIR_PENDING", () => {
  const local = engine();
  const assessed = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  assert.throws(() => submitRepairRecord(local, assessed, validDraft(toRepairPending().pending), now), /REPAIR_PENDING/);
});

test("repair chronology and target relation are enforced", () => {
  const { local, pending } = toRepairPending();
  const isolation = pending.auditLog.find((item) => item.actionType === "ISOLATION_CONFIRMED")!;
  const early = validDraft(pending);
  early.startedAt = new Date(Date.parse(isolation.timestamp) - 1).toISOString();
  assert.throws(() => submitRepairRecord(local, pending, early, now), /晚于隔离确认/);
  const unrelated = validDraft(pending);
  unrelated.targetBusinessId = "PIPE-1602-HW-01";
  assert.throws(() => submitRepairRecord(local, pending, unrelated, now), /当前拓扑诊断候选/);
});

test("structured repair record enters the immutable engine and proposes separate reopen authorization", () => {
  const { repaired } = toReopenPending();
  assert.equal(repaired.state, "AUTHORIZATION_PENDING");
  assert.equal(repaired.valvePosition, "CLOSED");
  assert.equal(repaired.repairRecords.length, 1);
  assert.equal(repaired.authorizationRequirement?.action, "SIMULATE_REOPEN_VALVE");
  assert.ok(repaired.auditLog.some((item) => item.repairRecordIds.includes(repaired.repairRecords[0].repairRecordId)));
});

test("same repair ID cannot overwrite an accepted record", () => {
  const { local, repaired } = toReopenPending();
  const changed = structuredClone(repaired.repairRecords[0]);
  changed.description = "试图覆盖已提交记录";
  const input: LifeEventInput = {
    eventId: repaired.eventId, buildingId: "BLD-ZS-DEMO-001", spaceId: "SPACE-1602-BATHROOM",
    detectedAt: repaired.input.detectedAt, evaluatedAt: new Date(Date.parse(repaired.input.evaluatedAt) + 1).toISOString(),
    observations: [], evidence: [], repairRecords: [changed], syntheticDemo: true
  };
  assert.throws(() => local.evaluate(input, repaired), /RepairRecord .* immutable/);
});

test("repair revision uses a new ID and preserves the accepted predecessor", () => {
  const { local, repaired } = toReopenPending();
  const previousRecord = repaired.repairRecords[0];
  const previousEvidence = repaired.input.evidence.find((item) => previousRecord.evidenceAfterIds.includes(item.id))!;
  const evaluatedAt = new Date(Date.parse(repaired.input.evaluatedAt) + 5_000).toISOString();
  const completedAt = new Date(Date.parse(previousRecord.completedAt) + 2_000).toISOString();
  const revisedEvidenceId = `${previousEvidence.id}-R2`;
  const input: LifeEventInput = {
    eventId: repaired.eventId, buildingId: "BLD-ZS-DEMO-001", spaceId: "SPACE-1602-BATHROOM",
    detectedAt: repaired.input.detectedAt, evaluatedAt, observations: [],
    evidence: [{ ...structuredClone(previousEvidence), id: revisedEvidenceId, capturedAt: completedAt, supersedesId: previousEvidence.id, revisionReason: "物业复核维修方式" }],
    repairRecords: [{
      ...structuredClone(previousRecord), repairRecordId: `${previousRecord.repairRecordId}-R2`,
      method: "SEAL_REPLACEMENT", completedAt, submittedAt: evaluatedAt,
      evidenceAfterIds: [revisedEvidenceId], supersedesId: previousRecord.repairRecordId, revisionReason: "物业复核维修方式"
    }],
    syntheticDemo: true
  };
  const revised = local.evaluate(input, repaired);
  assert.equal(revised.state, "AUTHORIZATION_PENDING");
  assert.equal(revised.repairRecords.length, 2);
  assert.ok(revised.repairRecords.some((item) => item.repairRecordId === previousRecord.repairRecordId));
  assert.equal(revised.auditLog.at(-1)?.actionType, "REPAIR_RECORD_REVISED");
});

test("close authorization cannot be reused for reopening", () => {
  const { repaired } = toReopenPending();
  const closeApproval = Object.values(repaired.inputSnapshots).flatMap((item) => item.authorizationRecords ?? []).find((item) => item.action === "SIMULATE_CLOSE_VALVE")!;
  assert.equal(repaired.authorizationRequirement?.status, "PENDING");
  assert.notEqual(closeApproval.action, repaired.authorizationRequirement?.action);
  assert.equal(repaired.authorizedActions.length, 0);
});

test("rejected reopen authorization keeps the valve closed", () => {
  const { local, repaired } = toReopenPending();
  const rejected = decideAuthorization(local, repaired, { actorType: "PROPERTY", actorId: "PROPERTY-02", decision: "REJECTED", reason: "暂不恢复" }, now);
  assert.equal(rejected.state, "AUTHORIZATION_PENDING");
  assert.equal(rejected.valvePosition, "CLOSED");
});

test("approval alone does not reopen; explicit simulated action does", () => {
  const { local, repaired } = toReopenPending();
  const approved = decideAuthorization(local, repaired, { actorType: "PROPERTY", actorId: "PROPERTY-02", decision: "APPROVED", reason: "批准恢复" }, now);
  assert.equal(approved.state, "AUTHORIZED");
  assert.equal(approved.valvePosition, "CLOSED");
  const applied = executeAuthorizedReopen(local, approved, now);
  assert.equal(applied.state, "POST_REPAIR_VERIFYING");
  assert.equal(applied.valvePosition, "OPEN");
});

test("normal post-repair observations resolve and are the only path to REPAIRED", () => {
  const { local, verifying } = toPostRepairVerifying();
  assert.notEqual(verifying.visualDirective.moistureState, "REPAIRED");
  const resolved = submitPostRepairObservation(local, verifying, DEFAULT_POST_REPAIR_CONTROLS, now);
  assert.equal(resolved.state, "RESOLVED");
  assert.equal(resolved.visualDirective.moistureState, "REPAIRED");
});

test("abnormal post-repair observations reopen the event", () => {
  const { local, verifying } = toPostRepairVerifying();
  const reopened = submitPostRepairObservation(local, verifying, { ...DEFAULT_POST_REPAIR_CONTROLS, humidity: 83, microFlow: 0.06 }, now);
  assert.equal(reopened.state, "REOPENED");
  assert.notEqual(reopened.visualDirective.moistureState, "REPAIRED");
});

test("low-quality post-repair data remains verifying and cannot close", () => {
  const { local, verifying } = toPostRepairVerifying();
  const insufficient = submitPostRepairObservation(local, verifying, { ...DEFAULT_POST_REPAIR_CONTROLS, humidityQuality: "DEGRADED" }, now);
  assert.equal(insufficient.state, "POST_REPAIR_VERIFYING");
  assert.notEqual(insufficient.visualDirective.moistureState, "REPAIRED");
  assert.equal(insufficient.auditLog.at(-1)?.actionType, "POST_REPAIR_EVIDENCE_INSUFFICIENT");
});

test("verified event package includes repair, authorization, replay and memory patch", () => {
  const { local, verifying } = toPostRepairVerifying();
  const resolved = submitPostRepairObservation(local, verifying, DEFAULT_POST_REPAIR_CONTROLS, now);
  const { memory, manifest } = loadLifeEventContext();
  const packageValue = createVerifiedEventPackage({ result: resolved, memory, manifest, generatedAt: "2026-07-29T14:01:00.000Z" });
  assert.equal(packageValue.finalState, "RESOLVED");
  assert.equal(packageValue.verification.valid, true);
  assert.equal(packageValue.repairRecords.length, 1);
  assert.equal(packageValue.authorizationRecords.filter((item) => item.decision === "APPROVED").length, 2);
  assert.equal(packageValue.eventMemoryPatch.repairedBusinessId, packageValue.repairTask.target.businessId);
  assert.equal(verifyEventPackage(packageValue).valid, true);
});

test("tampered package is detected and cannot be represented as verified", () => {
  const { local, verifying } = toPostRepairVerifying();
  const resolved = submitPostRepairObservation(local, verifying, DEFAULT_POST_REPAIR_CONTROLS, now);
  const { memory, manifest } = loadLifeEventContext();
  const packageValue = createVerifiedEventPackage({ result: resolved, memory, manifest, generatedAt: "2026-07-29T14:01:00.000Z" });
  const tampered = structuredClone(packageValue);
  tampered.repairRecords[0].description = "被篡改";
  const verification = verifyEventPackage(tampered);
  assert.equal(verification.valid, false);
  assert.ok(verification.checks.some((item) => !item.passed));
});
