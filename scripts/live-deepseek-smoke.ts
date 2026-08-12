import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeepSeekChatProvider } from "../tools/building-agent-gateway/deepseek-provider.ts";
import { loadGatewayConfig } from "../tools/building-agent-gateway/config.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "artifacts", "stage6b");
const config = loadGatewayConfig();

if (!config.apiKey) {
  console.log("LIVE_DEEPSEEK_SKIPPED reason=DEEPSEEK_API_KEY_NOT_CONFIGURED");
  process.exit(0);
}

const cases = [
  { question: "洗手盆里的冷水在到达龙头以前会经过哪些东西？", selectedBusinessId: null },
  { question: "这个接头被封起来以前做过哪些施工和检查？", selectedBusinessId: "J-1602-CW-03" },
  { question: "如果我要打开北墙维修，墙里面有哪些东西需要注意？", selectedBusinessId: null },
  { question: "镜前灯的电从哪一路过来，线路又是怎么敷设的？", selectedBusinessId: null },
  { question: "J-1602-CW-03 是哪个品牌生产的？", selectedBusinessId: "J-1602-CW-03" }
] as const;

const provider = new DeepSeekChatProvider(config);
const reportCases = [];
for (const [index, item] of cases.entries()) {
  const output = await provider.queryBuilding(item.question, item.selectedBusinessId);
  const result = output.result;
  const normalizedAnswer = result.answer.normalize("NFKC").replace(/[\s。；;？?]/g, "");
  const normalizedQuestion = item.question.normalize("NFKC").replace(/[\s。；;？?]/g, "");
  const passed = result.mode === "LIVE_AI"
    && result.toolTrace.length > 0
    && (result.groundedClaims?.length ?? 0) > 0
    && (result.usedFactIds?.length ?? 0) > 0
    && !/[？?]\s*$/u.test(result.answer)
    && normalizedAnswer !== normalizedQuestion;
  reportCases.push({
    question: item.question,
    model: output.metadata.model,
    toolCalls: result.toolTrace.map((entry) => entry.tool),
    toolArguments: result.toolTrace.map((entry) => entry.arguments),
    factCount: result.facts.length,
    usedFactIds: result.usedFactIds ?? [],
    finalAnswer: result.mode === "LIVE_AI_CLARIFICATION" ? result.clarificationQuestion : result.answer,
    mode: result.mode,
    visualDirective: result.visualDirective,
    result: passed ? "PASS" : "FAIL",
    apiRequests: output.metadata.rounds
  });
  console.log(`LIVE_BUILDING_QUERY_${passed ? "OK" : "FAILED"} case=${index + 1} mode=${result.mode} tools=${result.toolTrace.length} facts=${result.facts.length}`);
}

const smoke = {
  schemaVersion: 2,
  provider: "deepseek",
  liveApiVerified: reportCases.every((item) => item.result === "PASS"),
  model: config.model,
  apiRequestCount: reportCases.reduce((total, item) => total + item.apiRequests, 0),
  cases: reportCases,
  secretIncluded: false,
  syntheticDemo: true,
  disclaimer: "脱敏合成建筑查询演示；SYNTHETIC_ENGINEERING_RECORD 不代表真实项目竣工数据。"
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "live-deepseek-building-grounding-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
if (!smoke.liveApiVerified) throw new Error("五题实时建筑问答未全部通过grounding验收");
console.log(`LIVE_DEEPSEEK_BUILDING_GROUNDING_OK cases=${reportCases.length} model=${config.model}`);
