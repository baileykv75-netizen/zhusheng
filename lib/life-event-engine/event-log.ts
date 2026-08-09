import { hashPayload } from "./canonical.ts";
import type { AuditEvent, EngineClock, LifeEventState } from "./types.ts";

export const GENESIS_HASH = hashPayload("ZHUSHENG_LIFE_EVENT_AUDIT_GENESIS_V1");

export type AuditAppendInput = {
  eventId: string;
  actorType: string;
  actorId?: string;
  actionType: string;
  previousState: LifeEventState;
  nextState: LifeEventState;
  inputRefs?: string[];
  evidenceRefs?: string[];
  componentRefs?: string[];
  ruleIds?: string[];
  ruleSetVersion: string;
  memoryVersion: string;
  inputSnapshotHash: string;
  evidenceSnapshotHash: string;
  decisionOutputHash: string;
  authorizationRecordIds?: string[];
  repairRecordIds?: string[];
  actionTargetBusinessId?: string;
};

export function hashAuditEvent(event: Omit<AuditEvent, "entryHash">): string {
  return hashPayload(event);
}

export function appendAuditEvent(log: readonly AuditEvent[], input: AuditAppendInput, clock: EngineClock): AuditEvent[] {
  const previousHash = log.at(-1)?.entryHash ?? GENESIS_HASH;
  const base: Omit<AuditEvent, "entryHash"> = {
    sequence: log.length + 1,
    eventId: input.eventId,
    timestamp: clock.now(),
    actorType: input.actorType,
    actorId: input.actorId,
    actionType: input.actionType,
    previousState: input.previousState,
    nextState: input.nextState,
    inputRefs: [...new Set(input.inputRefs ?? [])].sort(),
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    componentRefs: [...new Set(input.componentRefs ?? [])].sort(),
    ruleIds: [...new Set(input.ruleIds ?? [])].sort(),
    ruleSetVersion: input.ruleSetVersion,
    memoryVersion: input.memoryVersion,
    previousHash,
    inputSnapshotHash: input.inputSnapshotHash,
    evidenceSnapshotHash: input.evidenceSnapshotHash,
    authorizationRecordIds: [...new Set(input.authorizationRecordIds ?? [])].sort(),
    repairRecordIds: [...new Set(input.repairRecordIds ?? [])].sort(),
    decisionOutputHash: input.decisionOutputHash,
    actionTargetBusinessId: input.actionTargetBusinessId
  };
  const event = Object.freeze({ ...base, entryHash: hashAuditEvent(base) });
  return [...log, event];
}

export const realClock = (): EngineClock => ({ now: () => new Date().toISOString() });
export const fixedClock = (timestamp = "2026-07-29T00:00:00.000Z"): EngineClock => ({ now: () => timestamp });
