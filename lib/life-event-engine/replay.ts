import { hashPayload } from "./canonical.ts";
import { GENESIS_HASH, hashAuditEvent } from "./event-log.ts";
import { transitionEvent, type TransitionContext } from "./state-machine.ts";
import type { AuditEvent, DecisionSnapshot, LifeEventArtifact, LifeEventState } from "./types.ts";

function transitionContext(event: AuditEvent): TransitionContext {
  if (event.nextState === "ASSESSED") return { assessmentAvailable: true };
  if (event.nextState === "INCONCLUSIVE") return { inconclusive: true };
  if (event.nextState === "ACTION_PROPOSED") return { actionProposed: true };
  if (event.nextState === "AUTHORIZED") return { authorizationApproved: true };
  if (event.nextState === "SIMULATED_ACTION_APPLIED") return { actionApplied: true };
  if (event.nextState === "ISOLATION_CONFIRMED") return { isolationConfirmed: true };
  if (event.nextState === "REPAIR_RECORDED") return { repairRecorded: true };
  if (event.nextState === "POST_REPAIR_VERIFYING") return { postRepairVerification: true };
  if (event.nextState === "RESOLVED") return { verificationOutcome: "RECOVERED" };
  if (event.nextState === "REOPENED") return { verificationOutcome: "NOT_RECOVERED" };
  return {};
}

export function replayAuditLog(log: readonly AuditEvent[]): LifeEventState {
  if (!log.length) return "DETECTED";
  let current: LifeEventState = log[0].previousState;
  let previousHash = GENESIS_HASH;
  const eventId = log[0].eventId;
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    if (event.sequence !== index + 1) throw new Error(`Audit sequence gap at ${event.sequence}`);
    if (event.eventId !== eventId) throw new Error(`Audit eventId mismatch at sequence ${event.sequence}`);
    if (event.previousState !== current) throw new Error(`Audit state discontinuity at sequence ${event.sequence}`);
    if (event.previousHash !== previousHash) throw new Error(`Audit previous hash mismatch at sequence ${event.sequence}`);
    const { entryHash, ...base } = event;
    if (hashAuditEvent(base) !== entryHash) throw new Error(`Audit hash mismatch at sequence ${event.sequence}`);
    if (event.previousState !== event.nextState) {
      const transition = transitionEvent(event.previousState, event.nextState, transitionContext(event));
      if (!transition.accepted) throw new Error(`Illegal replay transition at sequence ${event.sequence}: ${transition.reason}`);
    } else if (!new Set(["HUMAN_AUTHORIZATION_REJECTED", "UNAUTHORIZED_ACTION_REJECTED", "REPAIR_RECORD_REVISED", "POST_REPAIR_EVIDENCE_INSUFFICIENT"]).has(event.actionType)) {
      throw new Error(`Unsupported self-state audit event at sequence ${event.sequence}`);
    }
    if (index > 0) {
      const previous = log[index - 1];
      if ((event.ruleSetVersion !== previous.ruleSetVersion || event.memoryVersion !== previous.memoryVersion) && event.actionType !== "VERSION_CHANGE_RECORDED") {
        throw new Error(`Unrecorded version change at sequence ${event.sequence}`);
      }
    }
    current = event.nextState;
    previousHash = event.entryHash;
  }
  return current;
}

export type ReplayedLifeEvent = {
  state: LifeEventState;
  valvePosition: "OPEN" | "CLOSED";
  lastDecision: DecisionSnapshot;
};

export function verifyLifeEventArtifact(artifact: LifeEventArtifact): true {
  if (!artifact.syntheticDemo) throw new Error("Artifact must be marked syntheticDemo");
  for (const [hash, snapshot] of Object.entries(artifact.inputSnapshots)) if (hashPayload(snapshot) !== hash) throw new Error(`Input snapshot hash mismatch: ${hash}`);
  for (const [hash, snapshot] of Object.entries(artifact.evidenceSnapshots)) if (hashPayload(snapshot) !== hash) throw new Error(`Evidence snapshot hash mismatch: ${hash}`);
  for (const [hash, snapshot] of Object.entries(artifact.decisionSnapshots)) if (hashPayload(snapshot) !== hash) throw new Error(`Decision snapshot hash mismatch: ${hash}`);
  replayAuditLog(artifact.auditLog);
  const authorizations = new Map(Object.values(artifact.inputSnapshots).flatMap((input) => input.authorizationRecords ?? []).map((record) => [record.authorizationId, record]));
  const repairRecords = new Map(Object.values(artifact.inputSnapshots).flatMap((input) => input.repairRecords ?? []).map((record) => [record.repairRecordId, record]));
  if (hashPayload([...repairRecords.values()].sort((a, b) => a.repairRecordId.localeCompare(b.repairRecordId))) !== hashPayload([...artifact.repairRecords].sort((a, b) => a.repairRecordId.localeCompare(b.repairRecordId)))) {
    throw new Error("Artifact repair records do not match immutable input snapshots");
  }
  for (const event of artifact.auditLog) {
    if (!artifact.inputSnapshots[event.inputSnapshotHash]) throw new Error(`Missing input snapshot for audit sequence ${event.sequence}`);
    if (!artifact.evidenceSnapshots[event.evidenceSnapshotHash]) throw new Error(`Missing evidence snapshot for audit sequence ${event.sequence}`);
    if (!artifact.decisionSnapshots[event.decisionOutputHash]) throw new Error(`Missing decision snapshot for audit sequence ${event.sequence}`);
    if (event.actionType === "HUMAN_AUTHORIZATION_APPROVED" || event.actionType === "HUMAN_AUTHORIZATION_REJECTED") {
      if (!event.actorId || event.authorizationRecordIds.length !== 1 || !event.actionTargetBusinessId) throw new Error(`Incomplete authorization audit at sequence ${event.sequence}`);
      const record = authorizations.get(event.authorizationRecordIds[0]);
      if (!record || record.eventId !== event.eventId || record.actorId !== event.actorId || record.targetBusinessId !== event.actionTargetBusinessId) throw new Error(`Authorization audit mismatch at sequence ${event.sequence}`);
    }
    for (const repairRecordId of event.repairRecordIds) {
      const record = repairRecords.get(repairRecordId);
      if (!record || record.eventId !== event.eventId || !event.componentRefs.includes(record.targetBusinessId)) {
        throw new Error(`Repair audit mismatch at sequence ${event.sequence}`);
      }
    }
  }
  const replayed = replayLifeEventArtifact(artifact, false);
  if (replayed.state !== artifact.currentState) throw new Error("Artifact currentState does not match replay");
  if (replayed.valvePosition !== artifact.currentValvePosition) throw new Error("Artifact valve position does not match replay");
  if (hashPayload(replayed.lastDecision) !== artifact.lastDecisionSnapshotHash) throw new Error("Artifact last decision does not match replay");
  return true;
}

export function replayLifeEventArtifact(artifact: LifeEventArtifact, validate = true): ReplayedLifeEvent {
  if (validate) verifyLifeEventArtifact(artifact);
  const state = replayAuditLog(artifact.auditLog);
  let valvePosition: "OPEN" | "CLOSED" = "OPEN";
  for (const event of artifact.auditLog) {
    if (event.actionType === "SIMULATED_VALVE_CLOSED") valvePosition = "CLOSED";
    if (event.actionType === "SIMULATED_VALVE_REOPENED") valvePosition = "OPEN";
  }
  const lastDecision = artifact.decisionSnapshots[artifact.lastDecisionSnapshotHash];
  if (!lastDecision) throw new Error("Artifact last decision snapshot is missing");
  return { state, valvePosition, lastDecision };
}
