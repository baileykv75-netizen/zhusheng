import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSnapshot, DemoEngine, type WorkerEvidenceDraft } from "../lib/demo-engine.ts";

const workerDraft = (overrides: Partial<WorkerEvidenceDraft> = {}): WorkerEvidenceDraft => ({
  transcript: "现场复核完成，保压稳定。",
  room: "SPACE-1602-BATHROOM",
  component: "J-1602-CW-03",
  process: "冷水支管二次复核",
  pressure: "30分钟无掉压",
  photo: { dataClass: "DEMO_SYNTHETIC", assetPath: "/assets/v6/evidence/construction-pipe-install.webp" },
  ...overrides
});

test("seven-step scripted lifecycle cannot skip worker evidence confirmation", () => {
  let state = DemoEngine.start();
  assert.equal(state.workerSubstep, 1);
  state = DemoEngine.next(state);
  assert.equal(state.workerSubstep, 2);

  const blocked = DemoEngine.next(state);
  assert.equal(blocked.workerSubstep, 2);
  assert.equal(blocked.evidence.find((item) => item.id === "EV-2848")?.status, "needs_review");

  state = DemoEngine.confirmWorkerEvidence(state, workerDraft());
  assert.equal(state.workerSubstep, 3);
  state = DemoEngine.next(state);
  assert.equal(state.evidence.find((item) => item.id === "EV-2848")?.status, "verified");

  while (state.currentStep < 5) state = DemoEngine.next(state);
  const authorizationBlocked = DemoEngine.next(state);
  assert.equal(authorizationBlocked.currentStep, 5);
  assert.equal(authorizationBlocked.valve.status, "open");
  state = DemoEngine.approve(state);
  state = DemoEngine.next(state);
  assert.equal(state.currentStep, 7);
  assert.equal(state.incident?.status, "resolved");
  assert.equal(state.workOrders[0].status, "completed");
  assert.equal(state.feedback.length, 1);
  assert.ok(state.agentTrace.some((item) => item.refs.includes("EV-2845")));
});

test("worker-confirmed AI fields and image identity become the actual EV-2848 evidence", () => {
  let state = DemoEngine.start();
  state = DemoEngine.next(state);
  assert.equal(state.workerSubstep, 2);

  state = DemoEngine.confirmWorkerEvidence(state, workerDraft({
    transcript: "现场复核完成，保压稳定。",
    process: "冷水支管二次复核",
    pressure: "30分钟无掉压",
    photo: { dataClass: "BROWSER_LOCAL", fileName: "joint.jpg", mediaType: "image/jpeg", size: 2048 }
  }));
  const draft = state.evidence.find((item) => item.id === "EV-2848");
  assert.equal(state.workerSubstep, 3);
  assert.equal(draft?.type, "冷水支管二次复核");
  assert.deepEqual(draft?.refs, ["SPACE-1602-BATHROOM", "SYS-1602-CW", "J-1602-CW-03"]);
  assert.match(draft?.note ?? "", /30分钟无掉压/);
  assert.match(draft?.note ?? "", /现场复核完成/);
  assert.deepEqual(draft?.attachment, { dataClass: "BROWSER_LOCAL", fileName: "joint.jpg", mediaType: "image/jpeg", size: 2048 });

  state = DemoEngine.next(state);
  assert.equal(state.evidence.find((item) => item.id === "EV-2848")?.status, "verified");
});

test("worker evidence cannot replace BIM-bound identity with arbitrary text", () => {
  let state = DemoEngine.start();
  state = DemoEngine.next(state);
  assert.throws(() => DemoEngine.confirmWorkerEvidence(state, workerDraft({ component: "W-1602-B7-CUSTOM" })), /scanned\/BIM-bound/);
  assert.throws(() => DemoEngine.confirmWorkerEvidence(state, workerDraft({ room: "1602卫生间" })), /scanned\/BIM-bound/);
});

test("worker quality cannot be confirmed without a valid image identity", () => {
  let state = DemoEngine.start();
  state = DemoEngine.next(state);
  assert.throws(() => DemoEngine.confirmWorkerEvidence(state, workerDraft({ photo: { dataClass: "BROWSER_LOCAL", fileName: "", mediaType: "image/jpeg", size: 0 } })), /valid local or synthetic image identity/);
});

test("previous step replays a deterministic isolated snapshot", () => {
  let state = DemoEngine.start();
  state = DemoEngine.next(state);
  state = DemoEngine.confirmWorkerEvidence(state, workerDraft());
  state = DemoEngine.next(state);
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
  state = DemoEngine.next(state);
  state = DemoEngine.confirmWorkerEvidence(state, workerDraft());
  state = DemoEngine.next(state);
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
