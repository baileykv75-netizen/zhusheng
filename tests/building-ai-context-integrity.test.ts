import test from "node:test";
import assert from "node:assert/strict";
import { createLocalBuildingAgentTurn, queryBuildingAgent } from "../lib/building-intelligence/agent.ts";

test("generic construction history query stays at space scope instead of silently defaulting to J03", () => {
  const turn = createLocalBuildingAgentTurn("查一下这个卫生间的施工记录", "J-1602-CW-03");
  const history = turn.toolTrace.find((item) => item.tool === "get_construction_history");

  assert.ok(history);
  assert.equal(history.arguments.businessId, "SPACE-1602-BATHROOM");
});

test("explicit selected-component pronoun still resolves the selected component", () => {
  const turn = createLocalBuildingAgentTurn("这个构件以前怎么施工的？", "J-1602-CW-03");
  const history = turn.toolTrace.find((item) => item.tool === "get_construction_history");

  assert.ok(history);
  assert.equal(history.arguments.businessId, "J-1602-CW-03");
});

test("live gateway request omits stale selected component for a generic diagnostic question", async () => {
  let requestBody: { question?: string; selectedBusinessId?: string | null } | null = null;
  const offlineFetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    throw new Error("offline");
  }) as typeof fetch;

  await queryBuildingAgent("卫生间潮湿可能是什么原因？", "J-1602-CW-03", offlineFetcher);
  assert.equal(requestBody?.selectedBusinessId, null);
});
