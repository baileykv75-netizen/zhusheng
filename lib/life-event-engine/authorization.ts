import type { ActionProposal, AuthorizationRecord, BuildingMemory } from "./types.ts";

export type AuthorizationDecision = {
  status: "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED";
  record: AuthorizationRecord | null;
  reason: string;
};

export function evaluateAuthorization(
  memory: BuildingMemory,
  eventId: string,
  proposal: ActionProposal | null,
  records: AuthorizationRecord[] = []
): AuthorizationDecision {
  if (!proposal) return { status: "NOT_REQUESTED", record: null, reason: "No executable action has been proposed" };
  const policy = memory.safetyPolicies.find((item) => item.componentId === proposal.targetBusinessId && item.actionClass === "LOCAL_WATER_ISOLATION");
  if (!policy || !policy.humanAuthorizationRequired) {
    return { status: "NOT_REQUESTED", record: null, reason: `Missing human authorization policy for ${proposal.targetBusinessId}` };
  }
  const matching = records.filter((record) =>
    record.eventId === eventId
    && record.action === proposal.action
    && record.targetBusinessId === proposal.targetBusinessId
  );
  if (!matching.length) return { status: "PENDING", record: null, reason: "Waiting for a resident or property authorization record" };
  const record = [...matching].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt)).at(-1)!;
  if (!record.actorId || (record.actorType !== "RESIDENT" && record.actorType !== "PROPERTY")) {
    return { status: "REJECTED", record, reason: "System or agent self-authorization is forbidden" };
  }
  if (record.decision === "REJECTED") return { status: "REJECTED", record, reason: record.reason ?? "Human authorization was rejected" };
  return { status: "APPROVED", record, reason: "Matching human authorization was approved" };
}
