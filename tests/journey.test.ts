import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSnapshot } from "../lib/demo-engine.ts";
import { deriveJourneyView } from "../lib/journey/index.ts";

test("journey presents one primary action and at most two secondary actions", () => {
  const view = deriveJourneyView({ source: "AGENT", phase: "IDLE" });
  assert.equal(view.primaryAction.label, "理解并编排");
  assert.ok(view.secondaryActions.length <= 2);
  assert.equal(view.stage, "REPORT");
});

test("missing and contradictory outcomes never expose an authorization action", () => {
  for (const state of ["INCONCLUSIVE", "REOPENED"] as const) {
    const view = deriveJourneyView({ source: "LIFE_EVENT", state });
    assert.doesNotMatch(view.primaryAction.actionType, /AUTHORIZATION|ISOLATION/);
  }
});

test("authorization and repair states keep distinct user actions", () => {
  const closeApproval = deriveJourneyView({ source: "LIFE_EVENT", state: "AUTHORIZATION_PENDING" }).primaryAction;
  const closeExecution = deriveJourneyView({ source: "LIFE_EVENT", state: "AUTHORIZED" }).primaryAction;
  const repair = deriveJourneyView({ source: "LIFE_EVENT", state: "REPAIR_PENDING" }).primaryAction;
  const reopenApproval = deriveJourneyView({ source: "LIFE_EVENT", state: "REPAIR_RECORDED" }).primaryAction;
  assert.equal(closeApproval.label, "提交人工授权");
  assert.equal(closeApproval.route, "/resident?focus=authorization");
  assert.equal(closeExecution.label, "模拟执行关阀");
  assert.equal(closeExecution.route, "/property");
  assert.equal(repair.label, "填写维修记录");
  assert.equal(repair.route, "/property");
  assert.equal(reopenApproval.label, "确认恢复供水授权");
  assert.equal(reopenApproval.route, "/resident?focus=authorization");
});

test("resolved state leads to group feedback without calling it an enterprise standard", () => {
  const view = deriveJourneyView({ source: "LIFE_EVENT", state: "RESOLVED" });
  assert.equal(view.stage, "GROUP_FEEDBACK");
  assert.equal(view.primaryAction.route, "/group?mode=task");
  assert.doesNotMatch(`${view.headline}${view.summary}`, /企业标准/);
});

test("demo state maps to the same seven-stage journey", () => {
  const snapshot = createInitialSnapshot();
  assert.equal(deriveJourneyView({ source: "DEMO", snapshot }).stage, "REPORT");
  snapshot.currentStep = 5;
  snapshot.incident = {
    id: "INC-TEST",
    status: "awaiting_authorization",
    confidence: 80,
    diagnosis: "test",
    missing: [],
    timeline: []
  };
  assert.equal(deriveJourneyView({ source: "DEMO", snapshot }).stage, "AUTHORIZATION");
});

test("group review never upgrades a single event to an enterprise standard", () => {
  const view = deriveJourneyView({ source: "GROUP", reviewState: "APPROVED_AS_PILOT" });
  assert.equal(view.stateLabel, "已批准为试点");
  assert.match(view.summary, /不是企业标准/);
});
