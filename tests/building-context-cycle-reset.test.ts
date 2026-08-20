import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const contextUrl = new URL("../components/product/BuildingContextProvider.tsx", import.meta.url);

test("new resident evidence cycle clears only stale visual and AI query context", async () => {
  const source = await readFile(contextUrl, "utf8");

  assert.match(source, /residentEvidenceNeedsAssessment\(session\.result, session\.residentSubmissions\)/);
  assert.match(source, /if \(!pendingResidentAssessment\) return;/);
  assert.match(source, /setAgentResultState\(null\)/);
  assert.match(source, /selectedBusinessId: null/);
  assert.match(source, /selectedView: "VIEW_RESIDENT"/);
  assert.doesNotMatch(source, /result: null/);
  assert.doesNotMatch(source, /residentSubmissions: \[\]/);
  assert.doesNotMatch(source, /productEvidenceTimeline: \[\]/);
});

test("visual reset is edge-triggered by pending assessment rather than every selection change", async () => {
  const source = await readFile(contextUrl, "utf8");

  assert.match(source, /\}, \[pendingResidentAssessment, setSession\]\);/);
  assert.doesNotMatch(source, /\[pendingResidentAssessment, session\.selectedBusinessId/);
});
