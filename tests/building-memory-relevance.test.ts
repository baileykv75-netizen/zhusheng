import test from "node:test";
import assert from "node:assert/strict";
import { resolveBuildingMemoryRelevance } from "../lib/building-intelligence/memory-relevance.ts";

const SPACE_ID = "SPACE-1602-BATHROOM";

test("dampness and microflow deterministically prioritize the reworked cold-water joint", () => {
  const matches = resolveBuildingMemoryRelevance({
    spaceId: SPACE_ID,
    activeSystemIds: ["SYS-1602-CW"],
    observationTags: ["DAMPNESS", "MICROFLOW"],
    topologyBusinessIds: ["PIPE-1602-CW-01", "J-1602-CW-03", "PIPE-1602-CW-02"]
  });

  assert.equal(matches[0]?.recordId, "REC-CONST-CW-J03-REWORK-01");
  assert.equal(matches[0]?.relevance, "HIGH");
  assert.equal(matches[0]?.historicalSignal, "ELEVATED_HISTORY");
  assert.ok(matches[0]?.reasons.some((item) => item.code === "ACTIVE_SYSTEM"));
  assert.ok(matches[0]?.reasons.some((item) => item.code === "DIAGNOSTIC_TAG" && item.detail === "MICROFLOW"));

  const basin = matches.find((item) => item.recordId === "REC-CONST-CW-BASIN-01");
  assert.ok(basin);
  assert.equal(basin.historicalSignal, "BACKGROUND");
});

test("odor ranking puts the documented drain offset before the WC seal rework", () => {
  const matches = resolveBuildingMemoryRelevance({
    spaceId: SPACE_ID,
    activeSystemIds: ["SYS-1602-DRAIN"],
    queryTags: ["ODOR"]
  });

  const offsetIndex = matches.findIndex((item) => item.recordId === "REC-CONST-DRAIN-OFFSET-01");
  const wcIndex = matches.findIndex((item) => item.recordId === "REC-CONST-WC-REWORK-01");
  assert.ok(offsetIndex >= 0);
  assert.ok(wcIndex >= 0);
  assert.ok(offsetIndex < wcIndex);
  assert.equal(matches[offsetIndex]?.historicalSignal, "ELEVATED_HISTORY");
});

test("slow-drain tags prioritize the field-changed floor-drain route", () => {
  const matches = resolveBuildingMemoryRelevance({
    spaceId: SPACE_ID,
    activeSystemIds: ["SYS-1602-DRAIN"],
    observationTags: ["SLOW_DRAIN", "LOCAL_DEPOSIT"]
  });

  assert.equal(matches[0]?.recordId, "REC-CONST-DRAIN-OFFSET-01");
  assert.equal(matches[0]?.memoryClass, "FIELD_CHANGE");
  assert.equal(matches[0]?.historicalSignal, "ELEVATED_HISTORY");
});

test("mirror-light context prioritizes the actual field adjustment without inventing a hidden splice", () => {
  const matches = resolveBuildingMemoryRelevance({
    spaceId: SPACE_ID,
    selectedBusinessId: "LIGHT-1602-MIRROR-01",
    activeSystemIds: ["SYS-1602-EL-LIGHT"],
    queryTags: ["LIGHTING", "FLICKER"]
  });

  assert.equal(matches[0]?.recordId, "REC-CONST-EL-MIRROR-BOX-01");
  assert.equal(matches[0]?.relevance, "HIGH");
  assert.match(matches[0]?.historicalBoundary ?? "", /出线盒|端子|线管|接头/u);
});

test("a highly relevant normal record remains background context rather than becoming a suspected defect", () => {
  const matches = resolveBuildingMemoryRelevance({
    spaceId: SPACE_ID,
    selectedBusinessId: "PIPE-1602-CW-BASIN-01",
    activeSystemIds: ["SYS-1602-CW"]
  });

  const basin = matches.find((item) => item.recordId === "REC-CONST-CW-BASIN-01");
  assert.ok(basin);
  assert.equal(basin.relevance, "HIGH");
  assert.equal(basin.memoryClass, "NORMAL");
  assert.equal(basin.historicalSignal, "BACKGROUND");
  assert.match(basin.historicalBoundary, /不能据此排除当前运行期异常|不能证明当前运行状态|不能.*当前/u);
});

test("inspection limits expose what historical verification did not cover", () => {
  const matches = resolveBuildingMemoryRelevance({
    spaceId: SPACE_ID,
    activeSystemIds: ["SYS-1602-DRAIN"],
    queryTags: ["ODOR", "SLOW_DRAIN"]
  });

  const inspection = matches.find((item) => item.recordId === "REC-INSPECT-DRAIN-OFFSET-01");
  assert.ok(inspection);
  assert.equal(inspection.historicalSignal, "SCOPE_LIMIT");
  assert.ok(inspection.uncheckedItems.some((item) => item.includes("坡度") || item.includes("水封") || item.includes("积污")));
});

test("the resolver is deterministic for identical inputs", () => {
  const input = {
    spaceId: SPACE_ID,
    activeSystemIds: ["SYS-1602-CW"],
    observationTags: ["DAMPNESS", "MICROFLOW"],
    topologyBusinessIds: ["J-1602-CW-03"]
  };

  assert.deepEqual(resolveBuildingMemoryRelevance(input), resolveBuildingMemoryRelevance(input));
});
