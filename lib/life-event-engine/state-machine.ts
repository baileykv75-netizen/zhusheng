import type { LifeEventState, TransitionResult } from "./types.ts";

export type TransitionContext = {
  assessmentAvailable?: boolean;
  inconclusive?: boolean;
  actionProposed?: boolean;
  authorizationApproved?: boolean;
  actionApplied?: boolean;
  isolationConfirmed?: boolean;
  repairRecorded?: boolean;
  postRepairVerification?: boolean;
  verificationOutcome?: "RECOVERED" | "NOT_RECOVERED" | "INSUFFICIENT";
};

const allowed: Record<LifeEventState, LifeEventState[]> = {
  DETECTED: ["COLLECTING_EVIDENCE"],
  COLLECTING_EVIDENCE: ["ASSESSED", "INCONCLUSIVE"],
  ASSESSED: ["ACTION_PROPOSED", "INCONCLUSIVE"],
  ACTION_PROPOSED: ["AUTHORIZATION_PENDING"],
  AUTHORIZATION_PENDING: ["AUTHORIZED", "INCONCLUSIVE"],
  AUTHORIZED: ["SIMULATED_ACTION_APPLIED"],
  SIMULATED_ACTION_APPLIED: ["VERIFYING", "POST_REPAIR_VERIFYING"],
  VERIFYING: ["ISOLATION_CONFIRMED", "REOPENED", "INCONCLUSIVE"],
  ISOLATION_CONFIRMED: ["REPAIR_PENDING"],
  REPAIR_PENDING: ["REPAIR_RECORDED", "INCONCLUSIVE"],
  REPAIR_RECORDED: ["ACTION_PROPOSED", "INCONCLUSIVE"],
  POST_REPAIR_VERIFYING: ["RESOLVED", "REOPENED", "INCONCLUSIVE"],
  RESOLVED: ["REOPENED"],
  INCONCLUSIVE: ["COLLECTING_EVIDENCE"],
  REOPENED: ["COLLECTING_EVIDENCE"]
};

export function transitionEvent(current: LifeEventState, target: LifeEventState, context: TransitionContext = {}): TransitionResult {
  if (!allowed[current].includes(target)) {
    return { accepted: false, state: current, reason: `Illegal state transition: ${current} -> ${target}` };
  }
  if (target === "ASSESSED" && !context.assessmentAvailable) {
    return { accepted: false, state: current, reason: "Assessment output is required before ASSESSED" };
  }
  if (target === "INCONCLUSIVE" && !context.inconclusive) {
    return { accepted: false, state: current, reason: "Missing or contradictory evidence is required before INCONCLUSIVE" };
  }
  if (target === "ACTION_PROPOSED" && !context.actionProposed) {
    return { accepted: false, state: current, reason: "A validated action proposal is required" };
  }
  if (target === "AUTHORIZED" && !context.authorizationApproved) {
    return { accepted: false, state: current, reason: "A matching human approval is required" };
  }
  if (target === "SIMULATED_ACTION_APPLIED" && !context.actionApplied) {
    return { accepted: false, state: current, reason: "The authorized simulated action must be explicitly requested" };
  }
  if (target === "ISOLATION_CONFIRMED" && !context.isolationConfirmed) {
    return { accepted: false, state: current, reason: "Action-linked post-isolation observations are required" };
  }
  if (target === "REPAIR_RECORDED" && !context.repairRecorded) {
    return { accepted: false, state: current, reason: "A valid property repair result is required" };
  }
  if (target === "POST_REPAIR_VERIFYING" && !context.postRepairVerification) {
    return { accepted: false, state: current, reason: "A separately authorized simulated valve reopen is required" };
  }
  if (target === "RESOLVED" && context.verificationOutcome !== "RECOVERED") {
    return { accepted: false, state: current, reason: "Recovery evidence is required before RESOLVED" };
  }
  if (target === "REOPENED" && context.verificationOutcome !== "NOT_RECOVERED") {
    return { accepted: false, state: current, reason: "Failed verification is required before REOPENED" };
  }
  return { accepted: true, state: target };
}

export function allowedTransitions(state: LifeEventState): LifeEventState[] {
  return [...allowed[state]];
}
