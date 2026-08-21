import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { BuildingAgentTurnResult } from "../lib/building-intelligence/types.ts";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";
import { deriveObjectHandoffs } from "../lib/product/object-handoff.ts";
import { resolveComponentLifeObjectId } from "../lib/product/component-life-link.ts";

const joint = "J-1602-CW-03";
const valve = "VALVE-1602-CW-01";
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const drawerUrl = new URL("../components/building-agent/BuildingAgentDrawer.tsx", import.meta.url);

function result(state: LifeEventResult["state"], extras: Partial<LifeEventResult> = {}): LifeEventResult {
  return {
    eventId: "EVT-HANDOFF",
    state,
    authorizationRequirement: null,
    proposedActions: [],
    repairRecords: [],
    ...extras
  } as unknown as LifeEventResult;
}

test("object deep links reject systems and spaces rather than treating every same-space entity as a component", () => {
  assert.equal(resolveComponentLifeObjectId(joint), joint);
  assert.equal(resolveComponentLifeObjectId("SYS-1602-CW"), null);
  assert.equal(resolveComponentLifeObjectId("SPACE-1602-BATHROOM"), null);
});

test("Building Memory record hands off its first recorded concrete component", () => {
  const handoffs = deriveObjectHandoffs({
    pathname: "/memory",
    memoryRecordId: "REC-CONSTRUCTION-J03",
    result: null,
    currentCandidateIds: [],
    pendingResidentAssessment: false
  });
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].source, "BUILDING_MEMORY");
  assert.equal(handoffs[0].businessId, joint);
  assert.equal(handoffs[0].href, `/case-1602?object=${joint}`);
});

test("pending assessment and reassessment never expose old property operation or candidate handoffs", () => {
  const oldResult = result("AUTHORIZATION_PENDING", {
    authorizationRequirement: { action: "SIMULATE_CLOSE_VALVE", targetBusinessId: valve, status: "PENDING" },
    repairRecords: [{ targetBusinessId: joint, submittedAt: "2026-08-20T10:00:00+08:00", repairRecordId: "OLD-REPAIR" }] as LifeEventResult["repairRecords"]
  });
  const handoffs = deriveObjectHandoffs({
    pathname: "/property",
    result: oldResult,
    currentCandidateIds: [joint],
    pendingResidentAssessment: true
  });
  assert.deepEqual(handoffs, []);
});

test("current property lifecycle exposes only structurally recorded operation and candidate objects", () => {
  const authorization = deriveObjectHandoffs({
    pathname: "/property",
    result: result("AUTHORIZATION_PENDING", {
      authorizationRequirement: { action: "SIMULATE_CLOSE_VALVE", targetBusinessId: valve, status: "PENDING" }
    }),
    currentCandidateIds: [joint],
    pendingResidentAssessment: false
  });
  assert.ok(authorization.some((item) => item.source === "PROPERTY_OPERATION" && item.businessId === valve));
  assert.ok(authorization.some((item) => item.source === "EVENT_CANDIDATE" && item.businessId === joint));

  const repairPending = deriveObjectHandoffs({
    pathname: "/events",
    result: result("REPAIR_PENDING"),
    currentCandidateIds: [joint],
    pendingResidentAssessment: false
  });
  assert.equal(repairPending.find((item) => item.source === "EVENT_CANDIDATE")?.label, "当前维修目标");
});

test("Building Agent handoff uses structured visual targets and never answer text", () => {
  const agentResult = {
    answer: `请检查 ${joint}`,
    selectedBusinessId: null,
    visualDirective: { mode: "SYSTEM_TRACE", targetBusinessIds: ["SYS-1602-CW"], revealBusinessIds: [joint], sourceTool: "trace_system" }
  } as unknown as BuildingAgentTurnResult;
  const handoffs = deriveObjectHandoffs({
    pathname: "/",
    result: null,
    currentCandidateIds: [],
    pendingResidentAssessment: false,
    agentResult
  });
  assert.equal(handoffs.find((item) => item.source === "BUILDING_AGENT")?.businessId, joint);

  const textOnly = deriveObjectHandoffs({
    pathname: "/",
    result: null,
    currentCandidateIds: [],
    pendingResidentAssessment: false,
    agentResult: { answer: `请检查 ${joint}`, visualDirective: null, selectedBusinessId: null } as unknown as BuildingAgentTurnResult
  });
  assert.equal(textOnly.some((item) => item.source === "BUILDING_AGENT"), false);
});

test("Case owns its own object-life surface and does not duplicate the cross-role bar", () => {
  assert.deepEqual(deriveObjectHandoffs({ pathname: "/case-1602/", result: null, currentCandidateIds: [joint], pendingResidentAssessment: false }), []);
});

test("layout mounts the shared handoff surface and Agent drawer reuses the canonical link protocol", async () => {
  const [layout, drawer] = await Promise.all([readFile(layoutUrl, "utf8"), readFile(drawerUrl, "utf8")]);
  assert.match(layout, /<ObjectHandoffBar \/>/);
  assert.match(drawer, /componentLifeHref/);
  assert.match(drawer, /resolveComponentLifeObjectId/);
  assert.match(drawer, /data-agent-object-handoff/);
  assert.doesNotMatch(drawer, /answer\.match|answer\.includes/);
});
