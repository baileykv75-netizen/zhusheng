import assert from "node:assert/strict";
import test from "node:test";
import { building1602Dataset } from "../lib/building-intelligence/catalog.ts";
import { getConstructionHistory, getInspectionHistory } from "../lib/building-intelligence/queries.ts";
import type { BuildingMemoryTrade, BuildingRecord } from "../lib/building-intelligence/types.ts";

const records: BuildingRecord[] = building1602Dataset.records;

test("1602 full lifecycle memory pack has enough depth without becoming an anomaly scrapbook", () => {
  assert.equal(records.length, 70, `expected 70 records, got ${records.length}`);
  const ids = records.map((record) => record.recordId);
  assert.equal(new Set(ids).size, ids.length, "record IDs must stay unique");

  const normal = records.filter((record) => record.memory?.memoryClass === "NORMAL");
  assert.ok(normal.length / records.length >= 0.7, `normal memory ratio too low: ${normal.length}/${records.length}`);

  const reworkOrChange = records.filter((record) => ["REWORK", "FIELD_CHANGE"].includes(record.memory?.memoryClass ?? ""));
  assert.ok(reworkOrChange.length <= Math.ceil(records.length * 0.12), "demo should contain a few meaningful deviations, not faults everywhere");

  assert.ok(records.every((record) => record.subjectBusinessIds.includes("SPACE-1602-BATHROOM")), "every lifecycle record must remain queryable from the 1602 bathroom");
});

test("memory pack covers the bathroom's major trades and lifecycle stages", () => {
  const trades = new Set<BuildingMemoryTrade>(
    records
      .map((record) => record.memory?.trade)
      .filter((trade): trade is BuildingMemoryTrade => trade !== undefined)
  );
  const requiredTrades: BuildingMemoryTrade[] = ["COLD_WATER", "HOT_WATER", "DRAINAGE", "WATERPROOFING", "ELECTRICAL", "FIXTURES", "ARCHITECTURE", "ENVIRONMENT", "HANDOVER", "OPERATIONS"];
  for (const trade of requiredTrades) {
    assert.ok(trades.has(trade), `missing trade ${trade}`);
  }

  assert.ok(records.some((record) => record.recordType === "CONSTRUCTION"));
  assert.ok(records.some((record) => record.recordType === "INSPECTION"));
  assert.ok(records.some((record) => record.recordType === "OBSERVATION"));
  assert.ok(records.some((record) => record.recordType === "MAINTENANCE"));
  assert.ok(records.some((record) => record.memory?.phase === "HANDOVER"));
  assert.ok(records.some((record) => record.memory?.phase === "EARLY_OPERATION"));
});

test("normal records provide negative evidence instead of making every location suspicious", () => {
  const basinCold = getConstructionHistory("PIPE-1602-CW-BASIN-01");
  assert.equal(basinCold.status, "OK");
  assert.ok(basinCold.facts.some((fact) => String(fact.value).includes("台盆冷水支管安装")));
  assert.ok(!basinCold.facts.some((fact) => String(fact.value).includes("返工")));

  const ceilingLight = getInspectionHistory("LIGHT-1602-CEILING-01");
  assert.equal(ceilingLight.status, "OK");
  assert.ok(ceilingLight.facts.some((fact) => String(fact.value).includes("正常点亮")));
});

test("high-value history facts expose field decisions, worker memory and inspection boundaries to grounded AI", () => {
  const drain = getConstructionHistory("DRAIN-1602-FLOOR-01");
  const offsetFact = drain.facts.find((fact) => fact.factId === "REC-CONST-DRAIN-OFFSET-01");
  assert.ok(offsetFact);
  const text = String(offsetFact.value);
  assert.match(text, /形成原因:/);
  assert.match(text, /现场处理:/);
  assert.match(text, /工友留痕:/);
  assert.match(text, /已检查:/);
  assert.match(text, /未检查:/);
  assert.match(text, /事实边界:/);
});

test("high-value memories preserve what was checked and what remained outside inspection scope", () => {
  const drainOffset = records.find((record) => record.recordId === "REC-CONST-DRAIN-OFFSET-01");
  const drainInspect = records.find((record) => record.recordId === "REC-INSPECT-DRAIN-OFFSET-01");
  const wcRework = records.find((record) => record.recordId === "REC-CONST-WC-REWORK-01");
  const wpRework = records.find((record) => record.recordId === "REC-CONST-WP-DRAIN-01");

  assert.ok(drainOffset?.memory?.workerStatement);
  assert.ok(drainInspect?.memory?.verification?.uncheckedItems.some((item) => item.includes("坡度")));
  assert.ok(wcRework?.memory?.verification?.uncheckedItems.some((item) => item.includes("气密")));
  assert.ok(wpRework?.memory?.verification?.checkedItems.some((item) => item.includes("地漏")));
});

test("synthetic lifecycle memories stay explicitly synthetic while seed/runtime records retain their provenance", () => {
  const synthetic = records.filter((record) => record.provenance.sourceClass === "SYNTHETIC_ENGINEERING_RECORD");
  assert.ok(synthetic.length > 50);
  assert.ok(synthetic.every((record) => record.provenance.synthetic));

  const seed = records.find((record) => record.recordId === "REC-CONSTRUCTION-J03");
  const runtime = records.find((record) => record.recordId === "REC-OBS-HUMIDITY");
  assert.equal(seed?.provenance.sourceClass, "EXISTING_BUILDING_MEMORY");
  assert.equal(runtime?.provenance.sourceClass, "RUNTIME_OBSERVATION");
});
