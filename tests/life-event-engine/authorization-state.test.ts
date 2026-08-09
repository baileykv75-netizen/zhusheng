import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultLifeEventEngine,
  evaluateAuthorization,
  LIFE_EVENT_STATES,
  loadLifeEventContext,
  parseLifeEventInput,
  transitionEvent
} from "../../lib/life-event-engine/index.ts";
import type { AuthorizationRecord } from "../../lib/life-event-engine/index.ts";
import { clone, scenario } from "./helpers.ts";

test("supported joint event waits with valve open until authorization", () => {
  const result = createDefaultLifeEventEngine().runScenario(scenario("joint-leak-supported"));
  assert.equal(result.state, "AUTHORIZATION_PENDING");
  assert.equal(result.valvePosition, "OPEN");
  assert.equal(result.authorizationRequirement?.status, "PENDING");
});

test("system actor cannot self-authorize", () => {
  const { memory } = loadLifeEventContext();
  const input = clone(scenario("joint-leak-supported").steps[0]) as unknown as Record<string, unknown>;
  input.authorizationRecords = [{ authorizationId: "AUTH-BAD", eventId: "EVT-1602-JOINT-001", action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", decision: "APPROVED", actorType: "SYSTEM", actorId: "AGENT", decidedAt: "2026-07-29T00:00:00.000Z" }];
  assert.throws(() => parseLifeEventInput(input, memory), /RESIDENT or PROPERTY/);
  const decision = evaluateAuthorization(memory, "EVT-1602-JOINT-001", { action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", reason: "test", authorizationRequired: true }, input.authorizationRecords as AuthorizationRecord[]);
  assert.equal(decision.status, "REJECTED");
});

test("rejected authorization keeps valve open", () => {
  const document = clone(scenario("joint-leak-supported"));
  const input = document.steps[0];
  input.requestedAction = "SIMULATE_CLOSE_VALVE";
  input.authorizationRecords = [{ authorizationId: "AUTH-REJECT", eventId: input.eventId, action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", decision: "REJECTED", actorType: "RESIDENT", actorId: "SYNTHETIC-RESIDENT", decidedAt: input.evaluatedAt, reason: "暂不同意" }];
  const result = createDefaultLifeEventEngine().runScenario(document);
  assert.equal(result.state, "AUTHORIZATION_PENDING");
  assert.equal(result.valvePosition, "OPEN");
  assert.equal(result.authorizationRequirement?.status, "REJECTED");
});

test("authorization cannot be reused across events", () => {
  const document = clone(scenario("joint-leak-supported"));
  const input = document.steps[0];
  input.requestedAction = "SIMULATE_CLOSE_VALVE";
  input.authorizationRecords = [{ authorizationId: "AUTH-OTHER", eventId: "EVT-OTHER", action: "SIMULATE_CLOSE_VALVE", targetBusinessId: "VALVE-1602-CW-01", decision: "APPROVED", actorType: "PROPERTY", actorId: "SYNTHETIC-PROPERTY", decidedAt: input.evaluatedAt }];
  const result = createDefaultLifeEventEngine().runScenario(document);
  assert.equal(result.state, "AUTHORIZATION_PENDING");
  assert.equal(result.valvePosition, "OPEN");
});

test("state machine rejects forbidden jumps", () => {
  assert.equal(LIFE_EVENT_STATES.length, 15);
  assert.equal(new Set(LIFE_EVENT_STATES).size, 15);
  const directAuthorization = transitionEvent("DETECTED", "AUTHORIZED");
  assert.equal(directAuthorization.accepted, false);
  if (!directAuthorization.accepted) assert.match(directAuthorization.reason, /Illegal/);
  assert.equal(transitionEvent("ASSESSED", "SIMULATED_ACTION_APPLIED").accepted, false);
  assert.equal(transitionEvent("AUTHORIZATION_PENDING", "SIMULATED_ACTION_APPLIED").accepted, false);
});

test("failed post-isolation verification reopens the event", () => {
  const document = clone(scenario("post-isolation-recovery"));
  document.steps[1].observations.find((item) => item.metric === "MICRO_FLOW")!.value = 0.05;
  const result = createDefaultLifeEventEngine().runScenario(document);
  assert.equal(result.state, "REOPENED");
  assert.equal(result.valvePosition, "CLOSED");
  assert.ok(result.nextSteps.some((item) => item.includes("重新收集证据")));
});
