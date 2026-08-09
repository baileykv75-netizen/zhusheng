import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultLifeEventEngine, toLifeEventArtifact } from "../lib/life-event-engine/index.ts";
import type { LifeEventInput, ScenarioDocument } from "../lib/life-event-engine/index.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const scenarioRoot = resolve(repoRoot, "data/life-event-scenarios");
const artifactRoot = resolve(repoRoot, "artifacts/life-events");

type CliOptions = {
  scenario?: string;
  input?: string;
  json: boolean;
  sets: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const result: CliOptions = { json: false, sets: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--json") result.json = true;
    else if (argument === "--scenario") result.scenario = argv[++index];
    else if (argument === "--input") result.input = argv[++index];
    else if (argument === "--set") result.sets.push(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (Boolean(result.scenario) === Boolean(result.input)) throw new Error("Provide exactly one of --scenario or --input");
  return result;
}

function parsePrimitive(value: string): string | number | boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : value;
}

function normalizeDocument(value: unknown): ScenarioDocument {
  if (!value || typeof value !== "object") throw new TypeError("Input JSON must be an object");
  const item = value as Record<string, unknown>;
  if (Array.isArray(item.steps)) return value as ScenarioDocument;
  return { steps: [value as LifeEventInput], syntheticDemo: true };
}

function applyOverride(document: ScenarioDocument, expression: string) {
  const separator = expression.indexOf("=");
  if (separator <= 0) throw new Error(`Invalid --set expression: ${expression}`);
  const path = expression.slice(0, separator);
  const value = parsePrimitive(expression.slice(separator + 1));
  if (path === "observations.humidity.value" || path === "observations.microflow.value") {
    const metric = path.includes("humidity") ? "RELATIVE_HUMIDITY" : "MICRO_FLOW";
    let changed = 0;
    for (const step of document.steps) {
      for (const observation of step.observations) {
        if (observation.metric === metric) {
          observation.value = Number(value);
          changed += 1;
        }
      }
    }
    if (!changed || !Number.isFinite(Number(value))) throw new Error(`Override did not match a numeric ${metric} observation`);
    return;
  }
  const segments = path.split(".");
  let cursor: unknown = document;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) throw new Error(`Unknown override path: ${path}`);
    cursor = (cursor as Record<string, unknown>)[key];
  }
  const leaf = segments.at(-1)!;
  if (!cursor || typeof cursor !== "object" || !(leaf in cursor)) throw new Error(`Unknown override path: ${path}`);
  (cursor as Record<string, unknown>)[leaf] = value;
}

function loadDocument(options: CliOptions): ScenarioDocument {
  const path = options.scenario
    ? resolve(scenarioRoot, `${basename(options.scenario)}.json`)
    : resolve(repoRoot, options.input!);
  const document = normalizeDocument(JSON.parse(readFileSync(path, "utf8")));
  for (const expression of options.sets) applyOverride(document, expression);
  return document;
}

function writeArtifacts(result: ReturnType<ReturnType<typeof createDefaultLifeEventEngine>["runScenario"]>) {
  mkdirSync(artifactRoot, { recursive: true });
  const safeEventId = result.eventId.replace(/[^A-Za-z0-9_-]/g, "_");
  const resultPath = resolve(artifactRoot, `${safeEventId}.json`);
  const decisionPath = resolve(artifactRoot, `${safeEventId}.result.json`);
  const auditPath = resolve(artifactRoot, `${safeEventId}.audit.jsonl`);
  writeFileSync(resultPath, `${JSON.stringify({ disclaimer: "脱敏合成演示事件，不作为真实诊断或设备控制依据", ...toLifeEventArtifact(result) }, null, 2)}\n`, "utf8");
  writeFileSync(decisionPath, `${JSON.stringify({ disclaimer: "脱敏合成演示事件，不作为真实诊断或设备控制依据", ...result }, null, 2)}\n`, "utf8");
  writeFileSync(auditPath, `${result.auditLog.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  return { resultPath, decisionPath, auditPath };
}

function printText(result: ReturnType<ReturnType<typeof createDefaultLifeEventEngine>["runScenario"]>, paths: ReturnType<typeof writeArtifacts>) {
  const top = result.rankedHypotheses[0];
  console.log(`事件: ${result.eventId}`);
  console.log(`状态: ${result.state}`);
  console.log(`第一候选: ${top.hypothesis} | 分值 ${top.rawScore} | 覆盖率 ${top.evidenceCoverage} | 决策可信等级 ${result.decisionConfidence}`);
  console.log(`候选排序: ${result.rankedHypotheses.map((item) => `${item.hypothesis}:${item.rawScore}`).join(" > ")}`);
  console.log(`支持证据: ${result.supportingEvidence.join(", ") || "无"}`);
  console.log(`反驳证据: ${result.contradictingEvidence.join(", ") || "无"}`);
  console.log(`缺失证据: ${result.missingEvidence.map((item) => item.evidenceType).join(", ") || "无"}`);
  console.log(`矛盾项: ${result.contradictions.map((item) => item.explanation).join("；") || "无"}`);
  console.log(`下一步: ${result.nextSteps.join("；") || "保持观察"}`);
  console.log(`提议动作: ${result.proposedActions.map((item) => `${item.action}:${item.targetBusinessId}`).join(", ") || "无"}`);
  console.log(`授权请求: ${result.authorizationRequests.map((item) => `${item.requestedAction}:${item.targetBusinessId}`).join(", ") || "无"}`);
  console.log(`已授权动作: ${result.authorizedActions.map((item) => `${item.action}:${item.targetBusinessId}`).join(", ") || "无"}`);
  console.log(`已完成动作: ${result.completedActions.map((item) => `${item.action}:${item.targetBusinessId}`).join(", ") || "无"}`);
  console.log(`授权: ${result.authorizationRequirement?.status ?? "NOT_REQUIRED"}`);
  console.log(`视觉指令: ${JSON.stringify(result.visualDirective)}`);
  console.log(`审计日志: ${paths.auditPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const engine = createDefaultLifeEventEngine();
  const result = engine.runScenario(loadDocument(options));
  const artifactPaths = writeArtifacts(result);
  if (options.json) console.log(JSON.stringify({ ...result, artifactPaths }, null, 2));
  else printText(result, artifactPaths);
}

try {
  main();
} catch (error) {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
