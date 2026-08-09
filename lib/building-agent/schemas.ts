import { BUILDING_AGENT_TOOL_NAMES, type DraftFields, type ObservationDraft, type ProviderAnalysis } from "./types.ts";

const intents = new Set(["QUERY_MEMORY", "DRAFT_OBSERVATION", "EVALUATE_EVENT", "EXPLAIN_DECISION", "VIEW_GROUP_LEARNING", "NAVIGATE_WORKSPACE", "UNKNOWN"]);
const toolNames = new Set<string>(BUILDING_AGENT_TOOL_NAMES);

export function validateDraftFields(fields: DraftFields): DraftFields {
  if (fields.spaceId !== "SPACE-1602-BATHROOM") throw new Error("阶段6A只允许1602卫生间空间");
  if (fields.humidity !== null && (fields.humidity < 0 || fields.humidity > 100)) throw new Error("湿度必须在0至100之间");
  if (fields.humidityBaseline !== null && (fields.humidityBaseline < 0 || fields.humidityBaseline > 100)) throw new Error("湿度基线必须在0至100之间");
  if (fields.microFlow !== null && fields.microFlow < 0) throw new Error("微流量不得为负数");
  if (fields.microFlowBaseline !== null && fields.microFlowBaseline < 0) throw new Error("微流量基线不得为负数");
  if (fields.durationMinutes !== null && fields.durationMinutes < 0) throw new Error("持续时间不得为负数");
  return fields;
}

export function validateObservationDraft(value: ObservationDraft): ObservationDraft {
  if (!value.draftId || !value.originalText.trim() || value.syntheticDemo !== true) throw new Error("观察草稿结构无效");
  validateDraftFields(value.extractedFields);
  return value;
}

export function validateProviderAnalysis(value: unknown): ProviderAnalysis {
  if (!value || typeof value !== "object") throw new Error("Provider输出不是对象");
  const candidate = value as ProviderAnalysis;
  if (!intents.has(candidate.intent)) throw new Error("Provider意图不在允许范围");
  if (!Array.isArray(candidate.inferences) || !candidate.inferences.every((item) => typeof item === "string")) throw new Error("Provider推断格式无效");
  if (!Array.isArray(candidate.uncertainties) || !candidate.uncertainties.every((item) => typeof item === "string")) throw new Error("Provider不确定项格式无效");
  if (!Array.isArray(candidate.suggestedTools)) throw new Error("Provider工具建议格式无效");
  for (const tool of candidate.suggestedTools) if (!toolNames.has(tool)) throw new Error(`Provider提出未注册工具 ${tool}`);
  if (candidate.fields && typeof candidate.fields !== "object") throw new Error("Provider字段格式无效");
  return candidate;
}

export function assertRegisteredTool(name: string): asserts name is (typeof BUILDING_AGENT_TOOL_NAMES)[number] {
  if (!toolNames.has(name)) throw new Error(`拒绝白名单外工具 ${name}`);
}

