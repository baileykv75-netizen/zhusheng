import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createDefaultBuildingAgent } from "../lib/building-agent/adapters/node/index.ts";
import { DeepSeekGatewayBuildingAgentProvider } from "../lib/building-agent/providers/deepseek-gateway.ts";
import { replayAgentSession, verifyAgentTrace } from "../lib/building-agent/index.ts";
import { loadGatewayConfig } from "../tools/building-agent-gateway/config.ts";
import { createGatewayServer } from "../tools/building-agent-gateway/server.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "artifacts", "stage6b");
const input = "1602卫生间墙脚这两天一直有潮气，湿度大约78%，停水以后水表好像仍在缓慢变化，我拍了一张墙面照片。";
const inputHash = createHash("sha256").update(input).digest("hex");
const config = loadGatewayConfig();

if (!config.apiKey) {
  console.log("LIVE_DEEPSEEK_SKIPPED reason=DEEPSEEK_API_KEY_NOT_CONFIGURED");
  process.exit(0);
}

const { server } = createGatewayServer({ config });
server.listen(0, config.host);
await once(server, "listening");

let smokeFailure: unknown = null;
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法确定本地网关端口");
  const provider = new DeepSeekGatewayBuildingAgentProvider(fetch, `http://${config.host}:${address.port}`);
  const agent = createDefaultBuildingAgent(provider, () => "2026-07-30T23:59:00.000Z");
  const sessionId = "BA-SESSION-STAGE6B-DEEPSEEK-001";
  const drafted = await agent.handleInput(input, sessionId, [], "2026-07-30T10:00:00.000Z");
  if (!drafted.draft) throw new Error("DeepSeek未形成可确认观察草稿");
  const evaluated = await agent.confirmAndEvaluate(drafted.draft, { humidity: 79 }, "用户将DeepSeek提取的湿度从78%修正为79%", sessionId, drafted.traceLog, "2026-07-30T10:01:00.000Z");
  if (!evaluated.response.decision) throw new Error("用户确认后未调用确定性事件引擎");
  if (evaluated.response.decision.valvePosition !== "OPEN") throw new Error("DeepSeek路径越权改变了阀门状态");
  if (!["ASSESSED", "ACTION_PROPOSED", "AUTHORIZATION_PENDING", "INCONCLUSIVE"].includes(evaluated.response.decision.state)) throw new Error(`DeepSeek路径越过阶段6B边界：${evaluated.response.decision.state}`);
  verifyAgentTrace(evaluated.traceLog);
  const replay = replayAgentSession(evaluated.traceLog);
  const modelCalls = [...(drafted.response.modelEnhancement?.calls ?? []), ...(evaluated.response.modelEnhancement?.calls ?? [])];
  if (evaluated.response.mode !== "llm-enhanced") throw new Error(`DeepSeek解释未通过本地复核：${evaluated.response.fallbackReason ?? "unknown"}`);
  if (modelCalls.filter((call) => call.status === "SUCCEEDED" && call.responseId).length < 2) throw new Error("观察解释与确定性结果解释未同时获得真实DeepSeek响应ID");
  mkdirSync(outputDirectory, { recursive: true });
  const smoke = {
    schemaVersion: 1,
    provider: "deepseek",
    liveApiVerified: true,
    inputHash,
    calls: modelCalls,
    structuredDraft: drafted.draft.extractedFields,
    userCorrection: { humidity: { modelValue: drafted.draft.extractedFields.humidity, confirmedValue: 79 } },
    deterministicResult: {
      eventId: evaluated.response.decision.eventId,
      state: evaluated.response.decision.state,
      valvePosition: evaluated.response.decision.valvePosition,
      leader: evaluated.response.decision.rankedHypotheses[0],
      decisionConfidence: evaluated.response.decision.decisionConfidence
    },
    fallback: false,
    traceRootHash: replay.rootHash,
    syntheticDemo: true,
    disclaimer: "脱敏合成DeepSeek演示调用，不是真实工程诊断或设备控制。"
  };
  writeFileSync(path.join(outputDirectory, "live-deepseek-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  const sanitizedTrace = evaluated.traceLog.map((entry) => ({
    sequence: entry.sequence,
    traceId: entry.traceId,
    sessionId: entry.sessionId,
    timestamp: entry.timestamp,
    mode: entry.mode,
    actionType: entry.actionType,
    intent: entry.intent,
    toolCalls: entry.toolCalls,
    sourceRefs: entry.sourceRefs,
    userConfirmation: entry.userConfirmation,
    modelEnhancement: entry.modelEnhancement,
    inputHash,
    previousHash: entry.previousHash,
    verifiedEntryHash: entry.entryHash
  }));
  writeFileSync(path.join(outputDirectory, "live-deepseek-trace.jsonl"), `${sanitizedTrace.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  console.log(`LIVE_DEEPSEEK_OK responses=${modelCalls.map((call) => call.responseId).filter(Boolean).join(",")} model=${modelCalls.find((call) => call.model)?.model} state=${evaluated.response.decision.state}`);
} catch (error) {
  smokeFailure = error;
  console.error(`LIVE_DEEPSEEK_FAILED reason=${error instanceof Error ? error.message.slice(0, 300) : "unknown"}`);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
if (smokeFailure) process.exitCode = 1;
