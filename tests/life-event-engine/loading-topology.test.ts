import assert from "node:assert/strict";
import test from "node:test";
import {
  findColdWaterJointCandidates,
  findComponentsInSpace,
  findDownstreamComponents,
  findIsolationValve,
  findRelatedMeters,
  findRelatedSensors,
  findUpstreamComponents,
  loadLifeEventContext,
  parseLifeEventInput,
  traceSpatialHierarchy
} from "../../lib/life-event-engine/index.ts";
import { clone, scenario } from "./helpers.ts";

test("building memory and visual manifest load as one synthetic context", () => {
  const { memory, manifest } = loadLifeEventContext();
  assert.equal(memory.schemaVersion, "2.5.0");
  assert.equal(memory.components.length, 13);
  assert.equal(manifest.sourceBuildingId, memory.buildingId);
  assert.equal(manifest.sourceSpaceId, "SPACE-1602-BATHROOM");
});

test("runtime input validation rejects unknown business IDs", () => {
  const { memory } = loadLifeEventContext();
  const input = clone(scenario("joint-leak-supported").steps[0]);
  input.observations[0].sensorBusinessId = "SENSOR-NOT-IN-MODEL";
  assert.throws(() => parseLifeEventInput(input, memory), /Unknown sensor or meter BusinessId/);
  const evidenceInput = clone(scenario("joint-leak-supported").steps[0]);
  evidenceInput.evidence[0].relatedBusinessIds = ["MISSING-COMPONENT"];
  assert.throws(() => parseLifeEventInput(evidenceInput, memory), /Unknown evidence BusinessId/);
});

test("runtime input validation enforces evidence reliability bounds", () => {
  const { memory } = loadLifeEventContext();
  const input = clone(scenario("joint-leak-supported").steps[0]);
  input.evidence[0].reliability = 1.01;
  assert.throws(() => parseLifeEventInput(input, memory), /between 0 and 1/);
});

test("spatial hierarchy traces component to building without hardcoded query output", () => {
  const { memory } = loadLifeEventContext();
  assert.deepEqual(traceSpatialHierarchy(memory, "J-1602-CW-03"), {
    buildingId: "BLD-ZS-DEMO-001",
    storeyId: "LVL-16",
    unitId: "UNIT-1602",
    spaceId: "SPACE-1602-BATHROOM"
  });
  assert.equal(findComponentsInSpace(memory, "SPACE-1602-BATHROOM").length, 13);
});

test("connection graph supplies upstream and downstream traversal", () => {
  const { memory } = loadLifeEventContext();
  assert.deepEqual(findUpstreamComponents(memory, "J-1602-CW-03").map((item) => item.businessId), [
    "PIPE-1602-CW-01",
    "VALVE-1602-CW-01",
    "METER-1602-FLOW-01"
  ]);
  assert.deepEqual(findDownstreamComponents(memory, "VALVE-1602-CW-01").map((item) => item.businessId), [
    "PIPE-1602-CW-01",
    "J-1602-CW-03",
    "PIPE-1602-CW-02"
  ]);
});

test("isolation valve, meter and sensor are derived from topology and space", () => {
  const { memory } = loadLifeEventContext();
  assert.equal(findIsolationValve(memory, "J-1602-CW-03")?.businessId, "VALVE-1602-CW-01");
  assert.deepEqual(findRelatedMeters(memory, "J-1602-CW-03").map((item) => item.businessId), ["METER-1602-FLOW-01"]);
  assert.deepEqual(findRelatedSensors(memory, "J-1602-CW-03").map((item) => item.businessId), ["SENSOR-1602-HUM-01"]);
});

test("candidate selection follows a changed in-memory connection graph", () => {
  const { memory } = loadLifeEventContext();
  const changed = clone(memory);
  changed.connections = changed.connections.filter((item) => item.businessId !== "CONN-1602-CW-02");
  assert.deepEqual(findColdWaterJointCandidates(memory, "SPACE-1602-BATHROOM").map((item) => item.businessId), ["J-1602-CW-03"]);
  assert.deepEqual(findColdWaterJointCandidates(changed, "SPACE-1602-BATHROOM"), []);
});
