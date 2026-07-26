import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSnapshot, DemoEngine } from "../lib/demo-engine.ts";

test("seven-step lifecycle closes only after authorization and verification", () => {
  let state = DemoEngine.start();
  assert.equal(state.workerSubstep, 1);
  state = DemoEngine.next(state);
  assert.equal(state.workerSubstep, 2);
  state = DemoEngine.next(state);
  assert.equal(state.workerSubstep, 3);
  while (state.currentStep < 5) state = DemoEngine.next(state);
  const blocked = DemoEngine.next(state);
  assert.equal(blocked.currentStep, 5);
  assert.equal(blocked.valve.status, "open");
  state = DemoEngine.approve(state);
  state = DemoEngine.next(state);
  assert.equal(state.currentStep, 7);
  assert.equal(state.incident?.status, "resolved");
  assert.equal(state.workOrders[0].status, "completed");
  assert.equal(state.feedback.length, 1);
  assert.ok(state.agentTrace.some((item) => item.refs.includes("EV-2845")));
});

test("previous step replays a deterministic isolated snapshot", () => {
  let state = DemoEngine.start();
  while (state.currentStep < 5) state = DemoEngine.next(state);
  state = DemoEngine.approve(state);
  assert.equal(state.valve.status, "closed");
  state = DemoEngine.previous(state);
  assert.equal(state.currentStep, 5);
  assert.equal(state.valve.status, "open");
  assert.equal(state.actions[0].status, "pending");
});

test("completed chapters can be replayed without leaking later state", () => {
  let state = DemoEngine.start();
  while (state.currentStep < 5) state = DemoEngine.next(state);
  state = DemoEngine.replayToChapter(state, 3);
  assert.equal(state.currentStep, 3);
  assert.equal(state.incident?.confidence, 56);
  assert.equal(state.valve.status, "open");
  assert.equal(state.workOrders.length, 0);
});

test("approval cannot execute before a proposed action exists", () => {
  const state = createInitialSnapshot();
  const result = DemoEngine.approve(state);
  assert.equal(result.valve.status, "open");
  assert.equal(result.actions.length, 0);
});
