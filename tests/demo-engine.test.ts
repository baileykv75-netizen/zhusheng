import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSnapshot, DemoEngine } from "../lib/demo-engine.ts";

test("seven-step lifecycle closes only after authorization and verification", () => {
  let state = DemoEngine.start();
  state = DemoEngine.next(state);
  while (state.currentStep < 7) state = DemoEngine.next(state);
  assert.equal(state.currentStep, 7);
  assert.equal(state.incident?.status, "resolved");
  assert.equal(state.workOrders[0].status, "completed");
  assert.equal(state.feedback.length, 1);
  assert.ok(state.agentTrace.some((item) => item.refs.includes("EV-2845")));
});

test("previous step replays a deterministic isolated snapshot", () => {
  let state = createInitialSnapshot();
  for (let index = 0; index < 6; index += 1) state = DemoEngine.next(state);
  assert.equal(state.valve.status, "closed");
  state = DemoEngine.previous(state);
  assert.equal(state.currentStep, 5);
  assert.equal(state.valve.status, "open");
  assert.equal(state.actions[0].status, "pending");
});

test("approval cannot execute before a proposed action exists", () => {
  const state = createInitialSnapshot();
  const result = DemoEngine.approve(state);
  assert.equal(result.valve.status, "open");
  assert.equal(result.actions.length, 0);
});
