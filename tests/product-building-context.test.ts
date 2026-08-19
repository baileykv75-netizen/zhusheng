import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILDING_PRODUCT_ID,
  DEEP_DEMO_EVENT_ID,
  DEEP_DEMO_SPACE_ID,
  deriveBuildingRouteContext,
  normalizeProductPath
} from "../lib/product/building-context.ts";

test("product routes share one stable building identity", () => {
  assert.equal(BUILDING_PRODUCT_ID, "BLD-HZZ-02");
  for (const pathname of ["/case-1602", "/events", "/memory", "/worker", "/resident", "/property", "/group"]) {
    const context = deriveBuildingRouteContext(pathname);
    assert.equal(context.currentPath, pathname);
  }
});

test("1602 work routes preserve the same spatial context", () => {
  for (const pathname of ["/case-1602", "/resident", "/property", "/memory"]) {
    const context = deriveBuildingRouteContext(pathname);
    assert.equal(context.floorId, "16F");
    assert.equal(context.unitId, "1602");
    assert.equal(context.spaceId, DEEP_DEMO_SPACE_ID);
    assert.equal(context.canonicalEventId, DEEP_DEMO_EVENT_ID);
  }
});

test("presentation mode changes without creating a second product identity", () => {
  assert.equal(deriveBuildingRouteContext("/").presentationMode, "CINEMATIC");
  assert.equal(deriveBuildingRouteContext("/case-1602").presentationMode, "CINEMATIC");
  assert.equal(deriveBuildingRouteContext("/events").presentationMode, "WORK");
  assert.equal(deriveBuildingRouteContext("/property").presentationMode, "WORK");
  assert.equal(deriveBuildingRouteContext("/memory").presentationMode, "WORK");
});

test("worker remains a building-memory collaboration route rather than inheriting a fake event id", () => {
  const context = deriveBuildingRouteContext("/worker");
  assert.equal(context.area, "COLLABORATION");
  assert.equal(context.spaceId, DEEP_DEMO_SPACE_ID);
  assert.equal(context.canonicalEventId, null);
});

test("path normalization keeps route context deterministic", () => {
  assert.equal(normalizeProductPath("/property/"), "/property");
  assert.equal(deriveBuildingRouteContext("/property/").workspaceLabel, "物业运行");
  assert.equal(deriveBuildingRouteContext("/unknown").workspaceLabel, "专业工作台");
});
