import { validateProviderAnalysis } from "../schemas.ts";
import type { AgentMode, BuildingAgentProvider, ProviderAnalysis } from "../types.ts";
import { DeterministicBuildingAgentProvider } from "./deterministic.ts";

export async function analyzeWithFallback(input: string, enhanced?: BuildingAgentProvider, timeoutMs = 14000): Promise<{ analysis: ProviderAnalysis; mode: AgentMode; fallbackReason?: string }> {
  const fallback = new DeterministicBuildingAgentProvider();
  if (!enhanced) return { analysis: validateProviderAnalysis(await fallback.analyze(input)), mode: "deterministic" };
  enhanced.beginTurn?.();
  try {
    const result = await Promise.race([
      enhanced.analyze(input),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Provider调用超时")), timeoutMs))
    ]);
    return { analysis: validateProviderAnalysis(result), mode: enhanced.mode };
  } catch (error) {
    return { analysis: validateProviderAnalysis(await fallback.analyze(input)), mode: "fallback", fallbackReason: error instanceof Error ? error.message : "Provider不可用" };
  }
}
