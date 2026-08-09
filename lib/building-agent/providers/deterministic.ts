import { extractDeterministicFields } from "../evidence-draft.ts";
import { routeIntent } from "../intent-router.ts";
import type { BuildingAgentProvider, ProviderAnalysis } from "../types.ts";

export class DeterministicBuildingAgentProvider implements BuildingAgentProvider {
  readonly name = "zhusheng-deterministic-router";
  readonly mode = "deterministic" as const;
  async analyze(input: string): Promise<ProviderAnalysis> {
    const fields = extractDeterministicFields(input);
    const injection = /忽略.*(?:规则|指令)|直接关阀|标记维修完成|绕过授权/.test(input);
    return {
      intent: routeIntent(input), fields,
      inferences: fields.meterFinding === "FLOW_CONFIRMED_NO_USE" ? ["文本可能描述了无人用水时仍有水表变化，需用户确认后才能作为证据"] : [],
      uncertainties: injection ? ["输入包含改变安全规则或直接执行动作的文字，已作为不可信文本忽略"] : [],
      suggestedTools: ["draft_observation"]
    };
  }
}

