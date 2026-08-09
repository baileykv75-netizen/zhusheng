import { hashPayload } from "../life-event-engine/canonical.ts";
import type { AgentTraceEntry } from "./types.ts";

export const AGENT_TRACE_GENESIS_HASH = hashPayload("ZHUSHENG_BUILDING_AGENT_TRACE_GENESIS_V1");

export function appendAgentTrace(log: readonly AgentTraceEntry[], input: Omit<AgentTraceEntry, "sequence" | "previousHash" | "entryHash">): AgentTraceEntry[] {
  verifyAgentTrace(log);
  if (log.length && log[0].sessionId !== input.sessionId) throw new Error("总智能体轨迹不能混入其他会话");
  const base: Omit<AgentTraceEntry, "entryHash"> = { ...input, sequence: log.length + 1, previousHash: log.at(-1)?.entryHash ?? AGENT_TRACE_GENESIS_HASH };
  return [...log, Object.freeze({ ...base, entryHash: hashPayload(base) })];
}

export function verifyAgentTrace(log: readonly AgentTraceEntry[]): void {
  let previousHash = AGENT_TRACE_GENESIS_HASH;
  let sessionId: string | null = null;
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index];
    if (entry.sequence !== index + 1) throw new Error(`总智能体轨迹sequence不连续：${entry.sequence}`);
    if (sessionId && entry.sessionId !== sessionId) throw new Error("总智能体轨迹混入其他会话");
    sessionId = entry.sessionId;
    if (entry.previousHash !== previousHash) throw new Error(`总智能体轨迹前序哈希错误：${entry.sequence}`);
    const { entryHash, ...base } = entry;
    if (hashPayload(base) !== entryHash) throw new Error(`总智能体轨迹内容或哈希被修改：${entry.sequence}`);
    previousHash = entryHash;
  }
}
