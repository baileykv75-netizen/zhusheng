import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/property/page.tsx", "utf8");

test("advanced property mode preserves and restores the formal task session", () => {
  assert.match(source, /LAB_SNAPSHOT_KEY/);
  assert.match(source, /persistTaskTruth\(restored\)/);
  assert.match(source, /退出沙盒并恢复物业任务/);
  assert.match(source, /不写回任务真相/);
});

test("interrupted lab sessions recover before normal task mode is rendered", () => {
  assert.match(source, /requestedMode === "lab"/);
  assert.match(source, /else if \(readLabSnapshot\(\)\)/);
  assert.match(source, /restoreTaskTruth\(\)/);
});

test("stale lab snapshots cannot overwrite a newer session schema", () => {
  assert.match(source, /LAB_SCHEMA_VERSION/);
  assert.match(source, /value\.schemaVersion !== LAB_SCHEMA_VERSION/);
  assert.match(source, /sessionStorage\.removeItem\(LAB_SNAPSHOT_KEY\)/);
});
