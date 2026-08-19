import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const drawerUrl = new URL("../components/building-agent/BuildingAgentDrawer.tsx", import.meta.url);
const contextUrl = new URL("../components/product/BuildingContextProvider.tsx", import.meta.url);

test("Ask Building result lives in shared building product context", async () => {
  const [drawer, context] = await Promise.all([
    readFile(drawerUrl, "utf8"),
    readFile(contextUrl, "utf8")
  ]);

  assert.match(context, /agentResult: BuildingAgentTurnResult \| null/);
  assert.match(context, /queryVisual: QueryVisualDirective \| null/);
  assert.match(drawer, /result=\{product\.agentResult\}/);
  assert.match(drawer, /onResult=\{product\.setAgentResult\}/);
  assert.doesNotMatch(drawer, /useState<BuildingAgentTurnResult/);
});
