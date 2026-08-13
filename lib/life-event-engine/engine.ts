import { evaluateAuthorization } from "./authorization.ts";
import { hashPayload, mergeImmutableById } from "./canonical.ts";
import { evaluateEvidence } from "./evidence-evaluator.ts";
import { appendAuditEvent, fixedClock, realClock, type AuditAppendInput } from "./event-log.ts";
import { evaluateHypotheses } from "./hypothesis-engine.ts";
import { replayAuditLog } from "./replay.ts";
import { DIAGNOSTIC_THRESHOLDS, RULE_SET_VERSION } from "./rules.ts";
import { parseLifeEventInput } from "./schemas.ts";
import { transitionEvent } from "./state-machine.ts";
import { findIsolationValve } from "./topology-traversal.ts";
import type {
  ActionProposal, AuditEvent, AuthorizationRequest, BuildingMemory, DecisionSnapshot,
  EngineClock, EvidenceItem, LifeEventArtifact, LifeEventInput, LifeEventResult,
  LifeEventState, RepairRecord, ScenarioDocument, SimulatedAction, VisualManifest
} from "./types.ts";
import { createVisualDirective } from "./visual-directive.ts";

export type LifeEventEngineOptions = { memory: BuildingMemory; manifest: VisualManifest; clock?: EngineClock };
type PendingAudit = Omit<AuditAppendInput, "inputSnapshotHash" | "evidenceSnapshotHash" | "decisionOutputHash" | "ruleSetVersion" | "memoryVersion">;

function validateRevisionChain(evidence: readonly EvidenceItem[]) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const successorById = new Map<string, string>();
  for (const item of evidence) {
    if (!item.supersedesId) continue;
    const previous = byId.get(item.supersedesId);
    if (!previous) throw new Error(`Evidence revision ${item.id} references missing predecessor ${item.supersedesId}`);
    if (previous.type !== item.type) throw new Error(`Evidence revision ${item.id} cannot change evidence type`);
    const existingSuccessor = successorById.get(previous.id);
    if (existingSuccessor && existingSuccessor !== item.id) throw new Error(`Evidence ${previous.id} has multiple active revision successors`);
    successorById.set(previous.id, item.id);
    if (previous.capturedAt && item.capturedAt && Date.parse(item.capturedAt) <= Date.parse(previous.capturedAt)) {
      throw new Error(`Evidence revision ${item.id} must be captured after ${previous.id}`);
    }
    const visited = new Set([item.id]);
    let cursor: EvidenceItem | undefined = previous;
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error(`Evidence revision cycle detected at ${cursor.id}`);
      visited.add(cursor.id);
      cursor = cursor.supersedesId ? byId.get(cursor.supersedesId) : undefined;
    }
  }
}

function mergeInput(previous: LifeEventInput, current: LifeEventInput): LifeEventInput {
  if (previous.eventId !== current.eventId) throw new Error("Authorization and audit state cannot be reused across events");
  if (previous.buildingId !== current.buildingId || previous.spaceId !== current.spaceId) throw new Error("A resumed event cannot change building or space");
  if (previous.detectedAt !== current.detectedAt) throw new Error("A resumed event cannot change detectedAt");
  if (Date.parse(current.evaluatedAt) < Date.parse(previous.evaluatedAt)) throw new Error("Event evaluation time must be monotonic");
  const evidence = mergeImmutableById(previous.evidence, current.evidence, (item) => item.id, "EvidenceItem");
  validateRevisionChain(evidence);
  return {
    ...current,
    observations: mergeImmutableById(previous.observations, current.observations, (item) => item.id, "SensorObservation"),
    evidence,
    requestedAction: current.requestedAction,
    authorizationRecords: mergeImmutableById(previous.authorizationRecords ?? [], current.authorizationRecords ?? [], (item) => item.authorizationId, "AuthorizationRecord"),
    repairRecords: mergeImmutableById(previous.repairRecords ?? [], current.repairRecords ?? [], (item) => item.repairRecordId, "RepairRecord")
  };
}

function validateRepairRevisionChain(records: readonly RepairRecord[]) {
  const byId = new Map(records.map((item) => [item.repairRecordId, item]));
  const successorById = new Map<string, string>();
  for (const item of records) {
    if (!item.supersedesId) continue;
    const previous = byId.get(item.supersedesId);
    if (!previous) throw new Error(`Repair revision ${item.repairRecordId} references missing predecessor ${item.supersedesId}`);
    if (!item.revisionReason) throw new Error(`Repair revision ${item.repairRecordId} requires revisionReason`);
    if (previous.eventId !== item.eventId || previous.targetBusinessId !== item.targetBusinessId) throw new Error("Repair revision cannot change event or target component");
    if (Date.parse(item.submittedAt) <= Date.parse(previous.submittedAt)) throw new Error("Repair revision must be submitted after its predecessor");
    if (successorById.has(previous.repairRecordId)) throw new Error(`Repair record ${previous.repairRecordId} already has a revision`);
    successorById.set(previous.repairRecordId, item.repairRecordId);
  }
}

function criticalMissing(result: ReturnType<typeof evaluateEvidence>): boolean {
  return result.missingEvidence.some((item) => ["METER_READING", "RESIDENT_WALL_PHOTO", "PIPE_INSTALLATION_RECORD"].includes(item.evidenceType));
}

function closeValveProposal(memory: BuildingMemory, ranking: ReturnType<typeof evaluateHypotheses>, evidence: ReturnType<typeof evaluateEvidence>): ActionProposal | null {
  const top = ranking[0];
  if (!top || top.hypothesis !== "COLD_WATER_JOINT_LEAK" || top.confidence !== "HIGH") return null;
  if (evidence.contradictions.length || criticalMissing(evidence) || !top.candidateBusinessIds.length) return null;
  const valves = top.candidateBusinessIds.map((id) => findIsolationValve(memory, id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const unique = [...new Map(valves.map((item) => [item.businessId, item])).values()];
  if (unique.length !== 1) return null;
  const valve = unique[0];
  const policy = memory.safetyPolicies.find((item) => item.componentId === valve.businessId && item.actionClass === "LOCAL_WATER_ISOLATION");
  if (!policy?.humanAuthorizationRequired) return null;
  return { action: "SIMULATE_CLOSE_VALVE", targetBusinessId: valve.businessId, reason: "人工授权后模拟局部隔离并采集新的验证观察", authorizationRequired: true };
}

function reopenValveProposal(targetBusinessId: string): ActionProposal {
  return { action: "SIMULATE_REOPEN_VALVE", targetBusinessId, reason: "维修记录完成后需经人工确认模拟恢复供水，再采集维修后观察", authorizationRequired: true };
}

function proposalFromAudit(log: readonly AuditEvent[], fallback: ActionProposal | null): ActionProposal | null {
  const event = [...log].reverse().find((item) => item.actionType === "SIMULATED_ACTION_PROPOSED" || item.actionType === "SIMULATED_REOPEN_PROPOSED");
  if (!event?.actionTargetBusinessId) return fallback;
  return event.actionType === "SIMULATED_REOPEN_PROPOSED" ? reopenValveProposal(event.actionTargetBusinessId) : {
    action: "SIMULATE_CLOSE_VALVE", targetBusinessId: event.actionTargetBusinessId,
    reason: "人工授权后模拟局部隔离并采集新的验证观察", authorizationRequired: true
  };
}

function latestAction(log: readonly AuditEvent[], actionType: string): AuditEvent | undefined {
  return [...log].reverse().find((event) => event.actionType === actionType);
}

function latestAuthorizationRequestTime(log: readonly AuditEvent[], targetBusinessId: string): string | undefined {
  return [...log].reverse().find((item) => item.actionType === "HUMAN_AUTHORIZATION_REQUESTED" && item.actionTargetBusinessId === targetBusinessId)?.timestamp;
}

function observationIsNormal(item: LifeEventInput["observations"][number]): boolean {
  if (item.quality !== "GOOD" || item.baseline === undefined) return false;
  if (item.metric === "MICRO_FLOW") return item.value - item.baseline < DIAGNOSTIC_THRESHOLDS.microFlow.normalDelta;
  return item.value < DIAGNOSTIC_THRESHOLDS.humidity.minimum && item.value - item.baseline < DIAGNOSTIC_THRESHOLDS.humidity.deltaFromBaseline;
}

function validateLinkedIsolationEvidence(current: LifeEventInput, previous: LifeEventResult | undefined): "RECOVERED" | "NOT_RECOVERED" | null {
  const items = current.evidence.filter((item) => item.type === "VALVE_ISOLATION_OBSERVATION");
  if (!items.length) return null;
  const action = previous && latestAction(previous.auditLog, "SIMULATED_VALVE_CLOSED");
  if (!action) throw new Error("Preloaded isolation evidence is forbidden: no prior simulated close audit exists");
  for (const item of items) {
    if (item.actionAuditSequence !== action.sequence) throw new Error(`${item.id} does not reference the current close action audit sequence`);
    if (item.actionTargetBusinessId !== action.actionTargetBusinessId) throw new Error(`${item.id} references the wrong isolation valve`);
    if (!item.capturedAt || Date.parse(item.capturedAt) <= Date.parse(action.timestamp)) throw new Error(`${item.id} must be captured after the simulated close action`);
    const linked = current.observations.filter((observation) => item.relatedObservationIds?.includes(observation.id));
    if (!linked.some((observation) => observation.metric === "MICRO_FLOW") || !linked.some((observation) => observation.metric === "RELATIVE_HUMIDITY")) {
      throw new Error(`${item.id} requires new linked micro-flow and humidity observations`);
    }
    if (linked.some((observation) => Date.parse(observation.observedAt) <= Date.parse(action.timestamp))) throw new Error(`${item.id} links a pre-action observation`);
    return linked.every(observationIsNormal) ? "RECOVERED" : "NOT_RECOVERED";
  }
  return null;
}

function validateRepairResult(current: LifeEventInput, previous: LifeEventResult | undefined, candidates: string[]): EvidenceItem | null {
  const repairs = current.evidence.filter((item) => item.type === "REPAIR_RESULT" && item.status === "PRESENT");
  if (!repairs.length) return null;
  const isolation = previous && latestAction(previous.auditLog, "ISOLATION_CONFIRMED");
  if (!isolation || previous?.state !== "REPAIR_PENDING") throw new Error("Repair result requires a prior isolation confirmation and REPAIR_PENDING state");
  const repair = repairs.at(-1)!;
  if (!repair.capturedAt || Date.parse(repair.capturedAt) <= Date.parse(isolation.timestamp)) throw new Error("Repair result must be captured after isolation confirmation");
  if (!repair.relatedBusinessIds.some((id) => candidates.includes(id))) throw new Error("Repair result must reference the assessed candidate component");
  return repair;
}

function validateStructuredRepairRecord(current: LifeEventInput, merged: LifeEventInput, previous: LifeEventResult | undefined, candidates: string[]) {
  const submitted = current.repairRecords ?? [];
  if (!submitted.length) return null;
  validateRepairRevisionChain(merged.repairRecords ?? []);
  const record = submitted.at(-1)!;
  const isolation = previous && latestAction(previous.auditLog, "ISOLATION_CONFIRMED");
  const isRevision = Boolean(record.supersedesId);
  if (!isolation) throw new Error("Repair record requires a prior isolation confirmation");
  if (!isRevision && previous?.state !== "REPAIR_PENDING") throw new Error("Repair record requires REPAIR_PENDING state");
  if (isRevision && previous?.state !== "AUTHORIZATION_PENDING") throw new Error("Repair revision is only allowed before reopen authorization is completed");
  if (Date.parse(record.startedAt) <= Date.parse(isolation.timestamp)) throw new Error("Repair start must follow isolation confirmation");
  if (!candidates.includes(record.targetBusinessId)) throw new Error("Repair record must target the current assessed candidate component");
  const evidenceById = new Map(merged.evidence.map((item) => [item.id, item]));
  for (const id of [...record.evidenceBeforeIds, ...record.evidenceAfterIds]) {
    if (!evidenceById.has(id)) throw new Error(`Repair record references missing evidence ${id}`);
  }
  const resultEvidence = record.evidenceAfterIds.map((id) => evidenceById.get(id)).find((item) => item?.type === "REPAIR_RESULT" && item.status === "PRESENT");
  if (!resultEvidence || !resultEvidence.relatedBusinessIds.includes(record.targetBusinessId)) {
    throw new Error("Repair record requires a PRESENT REPAIR_RESULT evidence item for the target component");
  }
  if (!resultEvidence.capturedAt || Date.parse(resultEvidence.capturedAt) !== Date.parse(record.completedAt)) {
    throw new Error("Repair result evidence time must equal repair completion time");
  }
  return { record, evidence: resultEvidence, isRevision };
}

function validatePostRepairObservations(current: LifeEventInput, previous: LifeEventResult | undefined, repairCompletedAt: string | undefined): "RECOVERED" | "NOT_RECOVERED" | "INSUFFICIENT" | null {
  if (previous?.state !== "POST_REPAIR_VERIFYING") return null;
  const reopen = latestAction(previous.auditLog, "SIMULATED_VALVE_REOPENED");
  if (!reopen) throw new Error("Post-repair observations require a prior simulated reopen action");
  const observations = current.observations.filter((item) => Date.parse(item.observedAt) > Date.parse(reopen.timestamp));
  if (!observations.length) return null;
  if (!repairCompletedAt || observations.some((item) => Date.parse(item.observedAt) <= Date.parse(repairCompletedAt))) throw new Error("Post-repair observations must follow repair completion");
  if (!observations.some((item) => item.metric === "MICRO_FLOW") || !observations.some((item) => item.metric === "RELATIVE_HUMIDITY")) return "INSUFFICIENT";
  if (observations.some((item) => item.quality !== "GOOD" || item.baseline === undefined || !item.durationMinutes)) return "INSUFFICIENT";
  return observations.every(observationIsNormal) ? "RECOVERED" : "NOT_RECOVERED";
}

function valvePositionFromAudits(log: readonly Pick<AuditEvent, "actionType">[]): "OPEN" | "CLOSED" {
  let position: "OPEN" | "CLOSED" = "OPEN";
  for (const event of log) {
    if (event.actionType === "SIMULATED_VALVE_CLOSED") position = "CLOSED";
    if (event.actionType === "SIMULATED_VALVE_REOPENED") position = "OPEN";
  }
  return position;
}

function completedActions(log: readonly Pick<AuditEvent, "actionType" | "actionTargetBusinessId">[]): ActionProposal[] {
  return log.flatMap((event) => {
    const action = event.actionType === "SIMULATED_VALVE_CLOSED" ? "SIMULATE_CLOSE_VALVE" : event.actionType === "SIMULATED_VALVE_REOPENED" ? "SIMULATE_REOPEN_VALVE" : null;
    return action && event.actionTargetBusinessId ? [{ action, targetBusinessId: event.actionTargetBusinessId, reason: "模拟动作已完成并写入审计链", authorizationRequired: true }] : [];
  });
}

function nextSteps(state: LifeEventState, evidence: ReturnType<typeof evaluateEvidence>, proposal: ActionProposal | null): string[] {
  const steps = [
    ...evidence.contradictions.map((item) => `复测：${item.explanation}`),
    ...evidence.missingEvidence.map((item) => `请${item.requestedFrom}补充${item.evidenceType}：${item.reason}`)
  ];
  if (state === "AUTHORIZATION_PENDING" && proposal) steps.push(`由住户或物业授权${proposal.action}，目标${proposal.targetBusinessId}`);
  if (state === "VERIFYING") steps.push("采集并关联关阀后的新微流量与湿度观察");
  if (state === "REPAIR_PENDING") steps.push("由物业维修候选构件并提交带时间与构件关联的维修结果");
  if (state === "POST_REPAIR_VERIFYING") steps.push("恢复供水后采集新的微流量与湿度观察，验证维修结果");
  if (state === "REOPENED") steps.push("验证仍异常，重新收集证据并评估候选原因");
  if (state === "RESOLVED") steps.push("保存维修后验证结果，事件闭环完成");
  return [...new Set(steps)];
}

export class LifeEventEngine {
  readonly memory: BuildingMemory;
  readonly manifest: VisualManifest;
  readonly clock: EngineClock;

  constructor(options: LifeEventEngineOptions) {
    this.memory = options.memory;
    this.manifest = options.manifest;
    this.clock = options.clock ?? realClock();
  }

  evaluate(rawInput: unknown, previous?: LifeEventResult, runtimeClock: EngineClock = this.clock): LifeEventResult {
    const parsed = parseLifeEventInput(rawInput, this.memory);
    if (Date.parse(parsed.evaluatedAt) > Date.parse(runtimeClock.now())) throw new Error("evaluatedAt cannot be in the future relative to the engine clock");
    const input = previous ? mergeInput(previous.input, parsed) : parsed;
    validateRevisionChain(input.evidence);
    validateRepairRevisionChain(input.repairRecords ?? []);
    if (previous && replayAuditLog(previous.auditLog) !== previous.state) throw new Error("Previous audit log does not reproduce the supplied state");

    const evidence = evaluateEvidence(input, this.memory);
    const ranking = evaluateHypotheses(this.memory, input.spaceId, evidence);
    const top = ranking[0];
    const diagnosticProposal = closeValveProposal(this.memory, ranking, evidence);
    const ruleIds = ranking.flatMap((item) => item.contributions.map((entry) => entry.ruleId));
    const componentRefs = ranking.flatMap((item) => item.candidateBusinessIds);
    const inputRefs = input.observations.map((item) => item.id);
    const evidenceRefs = input.evidence.map((item) => item.id);
    let state: LifeEventState = previous?.state ?? "DETECTED";
    const initialState = state;
    let proposal = proposalFromAudit(previous?.auditLog ?? [], diagnosticProposal);
    const pending: PendingAudit[] = [];

    const move = (target: LifeEventState, actionType: string, context: Parameters<typeof transitionEvent>[2], details: Partial<PendingAudit> = {}) => {
      const result = transitionEvent(state, target, context);
      if (!result.accepted) throw new Error(result.reason);
      pending.push({
        eventId: input.eventId, actorType: details.actorType ?? "SYSTEM", actorId: details.actorId,
        actionType, previousState: state, nextState: result.state, inputRefs, evidenceRefs,
        componentRefs: details.componentRefs ?? componentRefs, ruleIds,
        authorizationRecordIds: details.authorizationRecordIds, actionTargetBusinessId: details.actionTargetBusinessId,
        repairRecordIds: details.repairRecordIds
      });
      state = result.state;
    };

    if (state === "DETECTED") move("COLLECTING_EVIDENCE", "EVENT_DETECTED", {});
    if (state === "INCONCLUSIVE" || state === "REOPENED") move("COLLECTING_EVIDENCE", "EVIDENCE_COLLECTION_RESUMED", {});
    if (state === "COLLECTING_EVIDENCE") {
      const inconclusive = Boolean(evidence.contradictions.length) || top.confidence === "INSUFFICIENT" || (top.hypothesis === "COLD_WATER_JOINT_LEAK" && criticalMissing(evidence));
      if (inconclusive) move("INCONCLUSIVE", "ASSESSMENT_INCONCLUSIVE", { inconclusive: true });
      else move("ASSESSED", "ASSESSMENT_COMPLETED", { assessmentAvailable: true });
    }
    if (state === "ASSESSED" && diagnosticProposal) {
      proposal = diagnosticProposal;
      move("ACTION_PROPOSED", "SIMULATED_ACTION_PROPOSED", { actionProposed: true }, { actionTargetBusinessId: proposal.targetBusinessId });
      move("AUTHORIZATION_PENDING", "HUMAN_AUTHORIZATION_REQUESTED", {}, { actionTargetBusinessId: proposal.targetBusinessId });
    }

    const isolationOutcome = validateLinkedIsolationEvidence(parsed, previous);
    if (initialState === "VERIFYING" && isolationOutcome === "RECOVERED") {
      move("ISOLATION_CONFIRMED", "ISOLATION_CONFIRMED", { isolationConfirmed: true }, { actionTargetBusinessId: latestAction(previous!.auditLog, "SIMULATED_VALVE_CLOSED")?.actionTargetBusinessId });
      move("REPAIR_PENDING", "REPAIR_REQUESTED", {});
    } else if (initialState === "VERIFYING" && isolationOutcome === "NOT_RECOVERED") {
      move("REOPENED", "ISOLATION_VERIFICATION_FAILED", { verificationOutcome: "NOT_RECOVERED" });
    }

    const structuredRepair = validateStructuredRepairRecord(parsed, input, previous, top.candidateBusinessIds);
    const repair = structuredRepair?.evidence ?? validateRepairResult(parsed, previous, top.candidateBusinessIds);
    if (structuredRepair?.isRevision) {
      pending.push({
        eventId: input.eventId, actorType: "PROPERTY", actorId: structuredRepair.record.submittedByActorId,
        actionType: "REPAIR_RECORD_REVISED", previousState: state, nextState: state,
        inputRefs, evidenceRefs, componentRefs: [structuredRepair.record.targetBusinessId], ruleIds,
        repairRecordIds: [structuredRepair.record.repairRecordId]
      });
    }
    if (initialState === "REPAIR_PENDING" && repair) {
      move("REPAIR_RECORDED", "REPAIR_RESULT_RECORDED", { repairRecorded: true }, {
        actorType: "PROPERTY", actorId: structuredRepair?.record.submittedByActorId,
        componentRefs: repair.relatedBusinessIds,
        repairRecordIds: structuredRepair ? [structuredRepair.record.repairRecordId] : []
      });
      if (structuredRepair && (structuredRepair.record.result !== "COMPLETED" || !structuredRepair.record.restoreSupplyVerificationRequired)) {
        move("INCONCLUSIVE", "REPAIR_NOT_READY_FOR_REOPEN", { inconclusive: true }, {
          actorType: "PROPERTY", actorId: structuredRepair.record.submittedByActorId,
          componentRefs: [structuredRepair.record.targetBusinessId], repairRecordIds: [structuredRepair.record.repairRecordId]
        });
      } else {
      const valve = latestAction(previous!.auditLog, "SIMULATED_VALVE_CLOSED")?.actionTargetBusinessId;
      if (!valve) throw new Error("Repair closure cannot find the isolated valve");
      proposal = reopenValveProposal(valve);
      move("ACTION_PROPOSED", "SIMULATED_REOPEN_PROPOSED", { actionProposed: true }, { actionTargetBusinessId: valve });
      move("AUTHORIZATION_PENDING", "HUMAN_AUTHORIZATION_REQUESTED", {}, { actionTargetBusinessId: valve });
      }
    }

    if (state === "AUTHORIZATION_PENDING" && proposal) {
      const request = [...(previous?.auditLog ?? []), ...pending].reverse().find((item) => item.actionType === "HUMAN_AUTHORIZATION_REQUESTED" && item.actionTargetBusinessId === proposal!.targetBusinessId);
      const requestTime = "timestamp" in (request ?? {}) ? (request as AuditEvent).timestamp : input.evaluatedAt;
      const prematurelySubmitted = (parsed.authorizationRecords ?? []).find((record) =>
        record.eventId === input.eventId
        && record.action === proposal!.action
        && record.targetBusinessId === proposal!.targetBusinessId
        && Date.parse(record.decidedAt) < Date.parse(requestTime)
      );
      if (prematurelySubmitted) throw new Error("Authorization time cannot precede the authorization request");
      const authorization = evaluateAuthorization(this.memory, input.eventId, proposal, input.authorizationRecords, requestTime);
      if (authorization.status === "REJECTED") {
        const alreadyLogged = previous?.auditLog.some((item) => item.authorizationRecordIds.includes(authorization.record!.authorizationId));
        if (!alreadyLogged) pending.push({
          eventId: input.eventId, actorType: authorization.record?.actorType ?? "SYSTEM", actorId: authorization.record?.actorId,
          actionType: "HUMAN_AUTHORIZATION_REJECTED", previousState: state, nextState: state, inputRefs, evidenceRefs,
          componentRefs: [proposal.targetBusinessId], ruleIds, authorizationRecordIds: authorization.record ? [authorization.record.authorizationId] : [],
          actionTargetBusinessId: proposal.targetBusinessId
        });
      }
      if (authorization.status === "APPROVED") {
        move("AUTHORIZED", "HUMAN_AUTHORIZATION_APPROVED", { authorizationApproved: true }, {
          actorType: authorization.record!.actorType, actorId: authorization.record!.actorId,
          authorizationRecordIds: [authorization.record!.authorizationId], actionTargetBusinessId: proposal.targetBusinessId
        });
      }
      if (authorization.status !== "APPROVED" && parsed.requestedAction === proposal.action) {
        pending.push({
          eventId: input.eventId, actorType: "RESIDENT", actionType: "UNAUTHORIZED_ACTION_REJECTED",
          previousState: state, nextState: state, inputRefs, evidenceRefs,
          componentRefs: [proposal.targetBusinessId], ruleIds, actionTargetBusinessId: proposal.targetBusinessId
        });
      }
    }

    if (state === "AUTHORIZED" && parsed.requestedAction && proposal?.action === parsed.requestedAction) {
      const actionType = proposal.action === "SIMULATE_CLOSE_VALVE" ? "SIMULATED_VALVE_CLOSED" : "SIMULATED_VALVE_REOPENED";
      move("SIMULATED_ACTION_APPLIED", actionType, { actionApplied: true }, { actionTargetBusinessId: proposal.targetBusinessId });
      if (proposal.action === "SIMULATE_CLOSE_VALVE") move("VERIFYING", "POST_ISOLATION_VERIFICATION_STARTED", {});
      else move("POST_REPAIR_VERIFYING", "POST_REPAIR_VERIFICATION_STARTED", { postRepairVerification: true });
    }

    const repairHistory = [...input.evidence].filter((item) => item.type === "REPAIR_RESULT" && item.status === "PRESENT").sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "")).at(-1);
    const structuredHistory = [...(input.repairRecords ?? [])].sort((a, b) => a.completedAt.localeCompare(b.completedAt)).at(-1);
    const postRepairOutcome = validatePostRepairObservations(parsed, previous, structuredHistory?.completedAt ?? repairHistory?.capturedAt);
    if (initialState === "POST_REPAIR_VERIFYING" && postRepairOutcome === "RECOVERED") move("RESOLVED", "POST_REPAIR_VERIFIED", { verificationOutcome: "RECOVERED" });
    else if (initialState === "POST_REPAIR_VERIFYING" && postRepairOutcome === "NOT_RECOVERED") move("REOPENED", "POST_REPAIR_VERIFICATION_FAILED", { verificationOutcome: "NOT_RECOVERED" });
    else if (initialState === "POST_REPAIR_VERIFYING" && postRepairOutcome === "INSUFFICIENT") pending.push({
      eventId: input.eventId, actorType: "SYSTEM", actionType: "POST_REPAIR_EVIDENCE_INSUFFICIENT",
      previousState: state, nextState: state, inputRefs, evidenceRefs, componentRefs, ruleIds
    });

    const virtualAudits = [...(previous?.auditLog ?? []), ...pending];
    const valvePosition = valvePositionFromAudits(virtualAudits);
    proposal = proposalFromAudit(virtualAudits as AuditEvent[], proposal);
    const completed = completedActions(virtualAudits);
    const proposedActions = state === "ACTION_PROPOSED" && proposal ? [proposal] : [];
    const authorizationRequests: AuthorizationRequest[] = state === "AUTHORIZATION_PENDING" && proposal ? [{ action: "REQUEST_HUMAN_AUTHORIZATION", requestedAction: proposal.action, targetBusinessId: proposal.targetBusinessId }] : [];
    const authorizedActions = state === "AUTHORIZED" && proposal ? [proposal] : [];
    const allowedActions = authorizationRequests.length ? ["REQUEST_HUMAN_AUTHORIZATION"] : authorizedActions.map((item) => item.action);
    const decisionSnapshot: DecisionSnapshot = {
      eventId: input.eventId, evaluatedAt: input.evaluatedAt, decisionConfidence: top.confidence as DecisionSnapshot["decisionConfidence"],
      rankedHypotheses: ranking, supportingEvidence: evidence.supportingEvidence, contradictingEvidence: evidence.contradictingEvidence,
      missingEvidence: evidence.missingEvidence, contradictions: evidence.contradictions,
      proposedActions, authorizationRequests, authorizedActions, completedActions: completed
    };
    const inputSnapshotHash = hashPayload(input);
    const evidenceSnapshotHash = hashPayload(input.evidence);
    const decisionOutputHash = hashPayload(decisionSnapshot);
    let auditLog = previous ? [...previous.auditLog] : [];
    const auditClock = fixedClock(input.evaluatedAt);
    for (const item of pending) auditLog = appendAuditEvent(auditLog, {
      ...item, ruleSetVersion: RULE_SET_VERSION, memoryVersion: this.memory.schemaVersion,
      inputSnapshotHash, evidenceSnapshotHash, decisionOutputHash
    }, auditClock);

    const visualDirective = createVisualDirective(this.memory, this.manifest, top, evidence, state, valvePosition, allowedActions, authorizationRequests.length > 0);
    const currentRequestTime = proposal ? latestAuthorizationRequestTime(auditLog, proposal.targetBusinessId) : undefined;
    const authorization = proposal ? evaluateAuthorization(this.memory, input.eventId, proposal, input.authorizationRecords, currentRequestTime) : null;
    return {
      eventId: input.eventId, state, valvePosition, rankedHypotheses: ranking,
      decisionConfidence: top.confidence as LifeEventResult["decisionConfidence"], supportingEvidence: evidence.supportingEvidence,
      contradictingEvidence: evidence.contradictingEvidence, missingEvidence: evidence.missingEvidence, contradictions: evidence.contradictions,
      nextSteps: nextSteps(state, evidence, proposal), proposedActions, authorizationRequests, authorizedActions, completedActions: completed,
      authorizationRequirement: proposal ? { action: proposal.action, targetBusinessId: proposal.targetBusinessId, status: authorization!.status } : null,
      visualDirective, auditLog, ruleSetVersion: RULE_SET_VERSION, memoryVersion: this.memory.schemaVersion, syntheticDemo: true, input,
      inputSnapshots: { ...(previous?.inputSnapshots ?? {}), [inputSnapshotHash]: input },
      evidenceSnapshots: { ...(previous?.evidenceSnapshots ?? {}), [evidenceSnapshotHash]: input.evidence },
      decisionSnapshots: { ...(previous?.decisionSnapshots ?? {}), [decisionOutputHash]: decisionSnapshot },
      lastDecisionSnapshotHash: decisionOutputHash,
      repairRecords: input.repairRecords ?? []
    };
  }

  runScenario(document: ScenarioDocument): LifeEventResult {
    if (!document.syntheticDemo || !Array.isArray(document.steps) || !document.steps.length) throw new TypeError("Scenario document must contain synthetic demo steps");
    const scenarioClock = fixedClock([...document.steps].map((step) => step.evaluatedAt).sort().at(-1)!);
    let result: LifeEventResult | undefined;
    for (const step of document.steps) result = this.evaluate(step, result, scenarioClock);
    return result!;
  }
}

export function toLifeEventArtifact(result: LifeEventResult): LifeEventArtifact {
  return {
    eventId: result.eventId, inputSnapshots: result.inputSnapshots, evidenceSnapshots: result.evidenceSnapshots,
    decisionSnapshots: result.decisionSnapshots, auditLog: result.auditLog, currentState: result.state,
    currentValvePosition: result.valvePosition, lastDecisionSnapshotHash: result.lastDecisionSnapshotHash,
    repairRecords: result.repairRecords, syntheticDemo: true
  };
}
