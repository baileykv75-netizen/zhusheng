import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAuditEvent,
  createDefaultLifeEventEngine,
  fixedClock,
  loadLifeEventContext,
  replayAuditLog
} from "../../lib/life-event-engine/index.ts";
import { clone, scenario } from "./helpers.ts";

test("audit events are append-only immutable records with increasing sequence", () => {
  const log = appendAuditEvent([], {
    eventId: "EVT-AUDIT",
    actorType: "SYSTEM",
    actionType: "TEST",
    previousState: "DETECTED",
    nextState: "COLLECTING_EVIDENCE",
    ruleSetVersion: "ZS-LE-1.1.0",
    memoryVersion: "2.5.0",
    inputSnapshotHash: "input-1",
    evidenceSnapshotHash: "evidence-1",
    decisionOutputHash: "decision-1"
  }, fixedClock());
  const next = appendAuditEvent(log, {
    eventId: "EVT-AUDIT",
    actorType: "SYSTEM",
    actionType: "TEST-2",
    previousState: "COLLECTING_EVIDENCE",
    nextState: "INCONCLUSIVE",
    ruleSetVersion: "ZS-LE-1.1.0",
    memoryVersion: "2.5.0",
    inputSnapshotHash: "input-2",
    evidenceSnapshotHash: "evidence-2",
    decisionOutputHash: "decision-2"
  }, fixedClock());
  assert.equal(log.length, 1);
  assert.deepEqual(next.map((item) => item.sequence), [1, 2]);
  assert.throws(() => Object.assign(next[0], { nextState: "RESOLVED" }));
});

test("audit replay restores the engine current state", () => {
  const result = createDefaultLifeEventEngine().runScenario(scenario("post-isolation-recovery"));
  assert.equal(replayAuditLog(result.auditLog), result.state);
});

test("audit replay rejects tampered hash and sequence", () => {
  const result = createDefaultLifeEventEngine().runScenario(scenario("joint-leak-supported"));
  const hashTampered = clone(result.auditLog);
  hashTampered[0].actionType = "TAMPERED";
  assert.throws(() => replayAuditLog(hashTampered), /hash mismatch/);
  const sequenceTampered = clone(result.auditLog);
  sequenceTampered[1].sequence = 9;
  assert.throws(() => replayAuditLog(sequenceTampered), /sequence gap/);
});

test("visual directives only reference manifest nodes, views, states and anchors", () => {
  const { manifest } = loadLifeEventContext();
  for (const name of ["joint-leak-supported", "humidity-only", "missing-evidence", "contradictory-evidence", "post-isolation-recovery"]) {
    const directive = createDefaultLifeEventEngine().runScenario(scenario(name)).visualDirective;
    assert.ok(manifest.views[directive.view]);
    assert.ok(manifest.visualStates.states.includes(directive.moistureState));
    for (const id of directive.highlightBusinessIds) assert.ok(manifest.nodes[id], id);
    for (const id of directive.evidenceAnchorIds) assert.ok(manifest.nodes[id] && manifest.evidenceAnchors[id], id);
  }
});

test("post-isolation recovery audit contains approval before simulated close", () => {
  const result = createDefaultLifeEventEngine().runScenario(scenario("post-isolation-recovery"));
  const actions = result.auditLog.map((item) => item.actionType);
  assert.ok(actions.indexOf("HUMAN_AUTHORIZATION_APPROVED") < actions.indexOf("SIMULATED_VALVE_CLOSED"));
  assert.ok(actions.indexOf("SIMULATED_VALVE_CLOSED") < actions.indexOf("ISOLATION_CONFIRMED"));
  assert.equal(result.state, "REPAIR_PENDING");
  assert.equal(result.authorizedActions.length, 0);
});
