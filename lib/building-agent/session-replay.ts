import { verifyAgentTrace } from "./trace-log.ts";
import type { AgentTraceEntry } from "./types.ts";

export function replayAgentSession(log: readonly AgentTraceEntry[]) {
  verifyAgentTrace(log);
  const last = log.at(-1) ?? null;
  return { sessionId: last?.sessionId ?? null, intent: last?.intent ?? "UNKNOWN", mode: last?.mode ?? "deterministic", toolCalls: log.flatMap((entry) => entry.toolCalls), rootHash: last?.entryHash ?? null, lastResponseSummary: last?.responseSummary ?? "" };
}

