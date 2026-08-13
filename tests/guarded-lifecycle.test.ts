import assert from "node:assert/strict";
import test from "node:test";
import { deriveGuardedLifecycleProjection, deriveGuardedProposalGate, type GuardedLifecycleSource } from "../lib/life-event-engine/guarded-lifecycle.ts";
import type { LifeEventState } from "../lib/life-event-engine/types.ts";
import { hasFreshEvidenceAfterReopen, resumeReopenedAssessment } from "../lib/life-event-lab/reopened-cycle.ts";

function source(state: LifeEventState, patch: Partial<GuardedLifecycleSource> = {}): GuardedLifecycleSource {
  return {
    state,
    valvePosition: "OPEN",
    authorizationRequirement: null,
    proposedActions: [],
    authorizedActions: [],
    auditLog: [],
    ...patch
  };
}

test("guarded lifecycle starts with resident evidence instead of inventing property evidence", () => {
  const view = deriveGuardedLifecycleProjection(null, { hasResidentEvidence: false });
  assert.equal(view.nextAction.id, "COLLECT_RESIDENT_EVIDENCE");
  assert.deepEqual(view.nextAction.destination, { kind: "ROUTE", href: "/resident?focus=evidence" });
  assert.equal(view.physicalTruth.valvePosition, "OPEN");
});

test("existing resident evidence advances only to deterministic fact evaluation", () => {
  const view = deriveGuardedLifecycleProjection(source("COLLECTING_EVIDENCE"), { hasResidentEvidence: true });
  assert.equal(view.nextAction.id, "EVALUATE_FACTS");
  assert.deepEqual(view.nextAction.destination, { kind: "FOCUS", focus: "evidence" });
});

test("authorization pending never becomes an executable action in the agent projection", () => {
  const input = source("AUTHORIZATION_PENDING", {
    authorizationRequirement: {
      action: "SIMULATE_CLOSE_VALVE",
      targetBusinessId: "VALVE-1602-CW-01",
      status: "PENDING"
    }
  });
  const before = structuredClone(input);
  const view = deriveGuardedLifecycleProjection(input, { hasResidentEvidence: true });
  assert.equal(view.nextAction.id, "REQUEST_HUMAN_AUTHORIZATION");
  assert.equal(view.nextAction.actor, "RESIDENT");
  assert.equal(view.physicalTruth.valvePosition, "OPEN");
  assert.deepEqual(input, before);
});

test("approved close remains a separate explicit execution step", () => {
  const view = deriveGuardedLifecycleProjection(source("AUTHORIZED", {
    authorizationRequirement: {
      action: "SIMULATE_CLOSE_VALVE",
      targetBusinessId: "VALVE-1602-CW-01",
      status: "APPROVED"
    },
    authorizedActions: [{
      action: "SIMULATE_CLOSE_VALVE",
      targetBusinessId: "VALVE-1602-CW-01",
      reason: "隔离验证",
      authorizationRequired: true
    }]
  }), { hasResidentEvidence: true });
  assert.equal(view.nextAction.id, "EXECUTE_AUTHORIZED_VALVE");
  assert.match(view.nextAction.label, /关阀/);
  assert.equal(view.physicalTruth.valvePosition, "OPEN");
});

test("repair record requires a fresh reopen authorization", () => {
  const view = deriveGuardedLifecycleProjection(source("REPAIR_RECORDED", { valvePosition: "CLOSED" }), { hasResidentEvidence: true });
  assert.equal(view.nextAction.id, "REQUEST_REOPEN_AUTHORIZATION");
  assert.deepEqual(view.nextAction.destination, { kind: "ROUTE", href: "/resident?focus=authorization" });
  assert.equal(view.physicalTruth.valvePosition, "CLOSED");
});

test("post repair verification is distinct from repair completion", () => {
  const view = deriveGuardedLifecycleProjection(source("POST_REPAIR_VERIFYING"), { hasResidentEvidence: true });
  assert.equal(view.phase, "VERIFICATION");
  assert.equal(view.nextAction.id, "RECORD_POST_REPAIR_OBSERVATION");
  assert.deepEqual(view.nextAction.destination, { kind: "FOCUS", focus: "post-repair" });
});

test("resolved event exposes experience sharing only after closed loop", () => {
  const view = deriveGuardedLifecycleProjection(source("RESOLVED"), { hasResidentEvidence: true });
  assert.equal(view.phase, "COMPLETE");
  assert.equal(view.nextAction.id, "SHARE_RESOLVED_EXPERIENCE");
  assert.deepEqual(view.nextAction.destination, { kind: "ROUTE", href: "/group?mode=task" });
});

test("reopened event returns to evidence without erasing history", () => {
  const view = deriveGuardedLifecycleProjection(source("REOPENED", {
    valvePosition: "OPEN",
    auditLog: [{} as never]
  }), { hasResidentEvidence: false });
  assert.equal(view.phase, "EVIDENCE");
  assert.equal(view.nextAction.id, "COLLECT_RESIDENT_EVIDENCE");
  assert.equal(view.physicalTruth.auditCount, 1);
});

test("AI close proposal cannot enter authorization before deterministic validation", () => {
  const gate = deriveGuardedProposalGate("CLOSE_VALVE", source("COLLECTING_EVIDENCE"));
  assert.equal(gate.status, "AWAITING_DOMAIN_VALIDATION");
  assert.equal(gate.expectedAction, "SIMULATE_CLOSE_VALVE");
  assert.equal(gate.humanGateReady, false);
});

test("AI close proposal is verified only when deterministic engine independently produces the same current action", () => {
  const gate = deriveGuardedProposalGate("CLOSE_VALVE", source("AUTHORIZATION_PENDING", {
    proposedActions: [{ action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", reason: "隔离验证", authorizationRequired: true }],
    authorizationRequirement: { action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", status: "PENDING" }
  }));
  assert.equal(gate.status, "VERIFIED");
  assert.equal(gate.matchedTargetBusinessId, "VALVE-1602-CW-01");
  assert.equal(gate.humanGateReady, true);
});

test("AI reopen proposal is rejected when current deterministic result only supports close", () => {
  const gate = deriveGuardedProposalGate("OPEN_VALVE", source("AUTHORIZATION_PENDING", {
    proposedActions: [{ action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", reason: "隔离验证", authorizationRequired: true }],
    authorizationRequirement: { action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", status: "PENDING" }
  }));
  assert.equal(gate.status, "REJECTED");
  assert.equal(gate.humanGateReady, false);
});

test("historical authorization does not validate a new AI device proposal after resolution", () => {
  const gate = deriveGuardedProposalGate("OPEN_VALVE", source("RESOLVED", {
    authorizationRequirement: { action: "SIMULATE_REOPEN_VALVE", targetBusinessId: "VALVE-1602-CW-01", status: "APPROVED" }
  }));
  assert.equal(gate.status, "REJECTED");
  assert.equal(gate.humanGateReady, false);
});

test("inspection-task suggestion remains proposal-only and never becomes a device authorization", () => {
  const gate = deriveGuardedProposalGate("CREATE_INSPECTION_TASK", source("AUTHORIZATION_PENDING"));
  assert.equal(gate.status, "PROPOSAL_ONLY");
  assert.equal(gate.expectedAction, null);
  assert.equal(gate.humanGateReady, false);
});

test("reopened cycle ignores resident submissions captured before the reopen audit", () => {
  const result = {
    state: "REOPENED",
    auditLog: [{ nextState: "REOPENED", timestamp: "2026-08-13T10:00:00.000Z" }]
  } as never;
  assert.equal(hasFreshEvidenceAfterReopen(result, ["2026-08-13T09:59:59.000Z"]), false);
  assert.equal(hasFreshEvidenceAfterReopen(result, ["2026-08-13T10:00:01.000Z"]), true);
});

test("reopened assessment appends fresh evidence to the same event and supersedes stale resident observations", () => {
  let capturedInput: Record<string, unknown> | null = null;
  let capturedPrevious: unknown = null;
  const previous = {
    state: "REOPENED",
    eventId: "EVT-1602-LAB-001",
    input: {
      detectedAt: "2026-08-13T09:00:00.000Z",
      evaluatedAt: "2026-08-13T10:00:00.000Z",
      evidence: [
        { id: "OLD-PHOTO", type: "RESIDENT_WALL_PHOTO", sourceActor: "RESIDENT", capturedAt: "2026-08-13T09:10:00.000Z" },
        { id: "OLD-METER", type: "METER_READING", sourceActor: "RESIDENT", capturedAt: "2026-08-13T09:11:00.000Z" }
      ]
    },
    auditLog: [
      { nextState: "REOPENED", timestamp: "2026-08-13T10:00:00.000Z" }
    ]
  } as never;
  const engine = {
    evaluate(input: Record<string, unknown>, prior: unknown) {
      capturedInput = input;
      capturedPrevious = prior;
      return previous;
    }
  } as never;
  const controls = {
    humidity: { value: 82, baseline: 55, durationMinutes: 45, quality: "GOOD" },
    microFlow: { value: 0.06, baseline: 0, durationMinutes: 30, quality: "GOOD" },
    pipeInstallation: "PRESENT",
    waterproofing: "PRESENT",
    closedWaterTest: "PRESENT",
    residentPhoto: "PRESENT",
    photoFinding: "MOISTURE_VISIBLE",
    meterReading: "PRESENT",
    meterFinding: "FLOW_CONFIRMED_NO_USE"
  } as never;

  const returned = resumeReopenedAssessment(engine, previous, controls, Date.parse("2026-08-13T10:00:05.000Z"));
  assert.equal(returned, previous);
  assert.equal(capturedPrevious, previous);
  assert.equal(capturedInput?.eventId, "EVT-1602-LAB-001");
  const evidence = capturedInput?.evidence as Array<{ id: string; supersedesId?: string }>;
  assert.equal(evidence.every((item) => item.id.includes("REOPEN")), true);
  assert.deepEqual(evidence.map((item) => item.supersedesId), ["OLD-PHOTO", "OLD-METER"]);
  assert.equal((capturedInput?.observations as Array<{ observedAt: string }>).every((item) => item.observedAt > "2026-08-13T10:00:00.000Z"), true);
});