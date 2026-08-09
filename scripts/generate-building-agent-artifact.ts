import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultBuildingAgent } from "../lib/building-agent/adapters/node/index.ts";
import { replayAgentSession, verifyAgentTrace } from "../lib/building-agent/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts", "stage6a");
const sessionId = "BA-SESSION-STAGE6A-001";
const input = "1602卫生间墙脚连续两天发潮，湿度大约78%，微流量0.06 L/min，停水以后水表还在缓慢走，墙面有一张照片。";
const agent = createDefaultBuildingAgent(undefined, () => "2026-07-29T23:59:00.000Z");
const drafted = await agent.handleInput(input, sessionId, [], "2026-07-29T10:00:00.000Z");
const evaluated = await agent.confirmAndEvaluate(drafted.draft!, { humidity: 82 }, "评委核对湿度读数后从78%修正为82%", sessionId, drafted.traceLog, "2026-07-29T10:01:00.000Z");
verifyAgentTrace(evaluated.traceLog);
const replay = replayAgentSession(evaluated.traceLog);
const artifact = {
  schemaVersion: 1,
  sessionId,
  traceId: evaluated.response.traceId,
  originalInput: input,
  confirmedDraft: evaluated.draft,
  response: evaluated.response,
  traceLog: evaluated.traceLog,
  verification: { valid: true, replay, checkedAt: "2026-07-29T10:02:00.000Z" },
  syntheticDemo: true,
  disclaimer: "脱敏合成演示总智能体会话，不是真实诊断、设备控制或大模型调用记录。"
};
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, `${evaluated.response.traceId}.agent-session.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`BUILDING_AGENT_ARTIFACT_OK trace=${evaluated.response.traceId} state=${evaluated.response.decision?.state} root=${replay.rootHash}`);

