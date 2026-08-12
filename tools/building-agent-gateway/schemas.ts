import { MODEL_READ_ONLY_TOOLS, type BuildingAnswerDraft, type ExplainOutput, type InterpretOutput, type ModelReadOnlyTool } from "./types.ts";

const readOnlyTools = new Set<string>(MODEL_READ_ONLY_TOOLS);
const intents = ["QUERY_MEMORY", "DRAFT_OBSERVATION", "EXPLAIN_DECISION", "VIEW_GROUP_LEARNING", "NAVIGATE_WORKSPACE", "UNKNOWN"] as const;
const prohibitedClaims = ["授权已批准", "已执行关阀", "已执行开阀", "维修已经完成", "已成为集团规律", "已升级为企业标准"];

const nullableNumber = (minimum: number, maximum: number) => ({ anyOf: [{ type: "number", minimum, maximum }, { type: "null" }] });
const nullableEnum = (values: readonly string[]) => ({ anyOf: [{ type: "string", enum: values }, { type: "null" }] });
const shortStrings = { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, maxItems: 12 };

export const INTERPRET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "fields", "inferences", "uncertainties", "missingFields", "proposedTools"],
  properties: {
    intent: { type: "string", enum: intents },
    fields: {
      type: "object",
      additionalProperties: false,
      required: ["spaceId", "humidity", "humidityBaseline", "durationMinutes", "microFlow", "microFlowBaseline", "meterFinding", "photoFinding", "photoPresent", "dataQuality", "sourceActor"],
      properties: {
        spaceId: nullableEnum(["SPACE-1602-BATHROOM"]),
        humidity: nullableNumber(0, 100),
        humidityBaseline: nullableNumber(0, 100),
        durationMinutes: nullableNumber(0, 10080),
        microFlow: nullableNumber(0, 100),
        microFlowBaseline: nullableNumber(0, 100),
        meterFinding: nullableEnum(["FLOW_CONFIRMED_NO_USE", "NO_CHANGE", "UNREADABLE"]),
        photoFinding: nullableEnum(["MOISTURE_VISIBLE", "NO_VISIBLE_MOISTURE", "UNREADABLE"]),
        photoPresent: { anyOf: [{ type: "boolean" }, { type: "null" }] },
        dataQuality: { type: "string", enum: ["GOOD", "DEGRADED", "UNKNOWN"] },
        sourceActor: { type: "string", enum: ["RESIDENT", "PROPERTY"] }
      }
    },
    inferences: shortStrings,
    uncertainties: shortStrings,
    missingFields: shortStrings,
    proposedTools: { type: "array", items: { type: "string", enum: MODEL_READ_ONLY_TOOLS }, uniqueItems: true, maxItems: 9 }
  }
} as const;

export const EXPLAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facts", "inferences", "uncertainties", "missingEvidence", "sourceRefs", "nextStep", "safetyNotice"],
  properties: {
    facts: shortStrings,
    inferences: shortStrings,
    uncertainties: shortStrings,
    missingEvidence: shortStrings,
    sourceRefs: { type: "array", items: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Z0-9_-]+$" }, uniqueItems: true, maxItems: 20 },
    nextStep: { type: "string", minLength: 1, maxLength: 300 },
    safetyNotice: { type: "string", minLength: 1, maxLength: 300 }
  }
} as const;

export const BUILDING_ANSWER_SCHEMA = {
  oneOf: [
    {
      type: "object", additionalProperties: false, required: ["claims"],
      properties: {
        claims: {
          type: "array", minItems: 1, maxItems: 12,
          items: {
            type: "object", additionalProperties: false, required: ["text", "factIds"],
            properties: {
              text: { type: "string", minLength: 1, maxLength: 360 },
              factIds: { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 180 } }
            }
          }
        }
      }
    },
    {
      type: "object", additionalProperties: false, required: ["clarification"],
      properties: { clarification: { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string", minLength: 1, maxLength: 240 } } } }
    }
  ]
} as const;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}不是对象`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) throw new Error(`${label}字段不完整或含额外字段`);
}

function stringArray(value: unknown, label: string, maximum = 12) {
  if (!Array.isArray(value) || value.length > maximum || !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 240)) throw new Error(`${label}格式无效`);
  return value as string[];
}

function nullableNumberValue(value: unknown, minimum: number, maximum: number, label: string) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label}超出允许范围`);
  return value;
}

export function validateInterpretOutput(value: unknown): InterpretOutput {
  const root = objectValue(value, "模型解释输出");
  exactKeys(root, ["intent", "fields", "inferences", "uncertainties", "missingFields", "proposedTools"], "模型解释输出");
  if (!intents.includes(root.intent as (typeof intents)[number])) throw new Error("模型意图无效");
  const fields = objectValue(root.fields, "模型字段");
  const fieldKeys = ["spaceId", "humidity", "humidityBaseline", "durationMinutes", "microFlow", "microFlowBaseline", "meterFinding", "photoFinding", "photoPresent", "dataQuality", "sourceActor"] as const;
  exactKeys(fields, fieldKeys, "模型字段");
  if (fields.spaceId !== null && fields.spaceId !== "SPACE-1602-BATHROOM") throw new Error("模型返回了虚假空间BusinessId");
  nullableNumberValue(fields.humidity, 0, 100, "湿度");
  nullableNumberValue(fields.humidityBaseline, 0, 100, "湿度基线");
  nullableNumberValue(fields.durationMinutes, 0, 10080, "持续时间");
  nullableNumberValue(fields.microFlow, 0, 100, "微流量");
  nullableNumberValue(fields.microFlowBaseline, 0, 100, "微流量基线");
  if (fields.photoPresent !== null && typeof fields.photoPresent !== "boolean") throw new Error("照片存在字段无效");
  if (!["GOOD", "DEGRADED", "UNKNOWN"].includes(String(fields.dataQuality))) throw new Error("数据质量无效");
  if (!["RESIDENT", "PROPERTY"].includes(String(fields.sourceActor))) throw new Error("观察来源无效");
  if (fields.meterFinding !== null && !["FLOW_CONFIRMED_NO_USE", "NO_CHANGE", "UNREADABLE"].includes(String(fields.meterFinding))) throw new Error("水表观察值无效");
  if (fields.photoFinding !== null && !["MOISTURE_VISIBLE", "NO_VISIBLE_MOISTURE", "UNREADABLE"].includes(String(fields.photoFinding))) throw new Error("照片观察值无效");
  const proposedTools = stringArray(root.proposedTools, "工具建议", 9);
  for (const tool of proposedTools) if (!readOnlyTools.has(tool)) throw new Error(`模型提出未允许工具 ${tool}`);
  return {
    intent: root.intent as InterpretOutput["intent"],
    fields: fields as InterpretOutput["fields"],
    inferences: stringArray(root.inferences, "推断"),
    uncertainties: stringArray(root.uncertainties, "不确定项"),
    missingFields: stringArray(root.missingFields, "缺失字段"),
    proposedTools: proposedTools as ModelReadOnlyTool[]
  };
}

export function validateExplainOutput(value: unknown): ExplainOutput {
  const root = objectValue(value, "模型说明输出");
  exactKeys(root, ["facts", "inferences", "uncertainties", "missingEvidence", "sourceRefs", "nextStep", "safetyNotice"], "模型说明输出");
  const result: ExplainOutput = {
    facts: stringArray(root.facts, "事实"),
    inferences: stringArray(root.inferences, "推断"),
    uncertainties: stringArray(root.uncertainties, "不确定项"),
    missingEvidence: stringArray(root.missingEvidence, "缺失证据"),
    sourceRefs: stringArray(root.sourceRefs, "来源引用", 20),
    nextStep: String(root.nextStep ?? ""),
    safetyNotice: String(root.safetyNotice ?? "")
  };
  if (!result.nextStep || result.nextStep.length > 300 || !result.safetyNotice || result.safetyNotice.length > 300) throw new Error("模型下一步或安全说明无效");
  const combined = JSON.stringify(result);
  const prohibited = prohibitedClaims.find((claim) => combined.includes(claim));
  if (prohibited) throw new Error(`模型输出包含越权结论：${prohibited}`);
  return result;
}

export function validateBuildingAnswerDraft(value: unknown): BuildingAnswerDraft {
  const root = objectValue(value, "建筑回答草稿");
  const keys = Object.keys(root);
  if (keys.length !== 1 || (keys[0] !== "claims" && keys[0] !== "clarification")) throw new Error("建筑回答必须且只能包含claims或clarification");
  if (keys[0] === "clarification") {
    const clarification = objectValue(root.clarification, "澄清请求");
    exactKeys(clarification, ["question"], "澄清请求");
    if (typeof clarification.question !== "string" || !clarification.question.trim() || clarification.question.length > 240) throw new Error("澄清问题无效");
    return { clarification: { question: clarification.question.trim() } };
  }
  if (!Array.isArray(root.claims) || root.claims.length < 1 || root.claims.length > 12) throw new Error("建筑回答claims无效");
  const claims = root.claims.map((item, index) => {
    const claim = objectValue(item, `建筑回答claim[${index}]`);
    exactKeys(claim, ["text", "factIds"], `建筑回答claim[${index}]`);
    if (typeof claim.text !== "string" || !claim.text.trim() || claim.text.length > 360) throw new Error(`建筑回答claim[${index}].text无效`);
    const factIds = stringArray(claim.factIds, `建筑回答claim[${index}].factIds`, 20);
    if (!factIds.length || new Set(factIds).size !== factIds.length || factIds.some((id) => id.length > 180)) throw new Error(`建筑回答claim[${index}].factIds无效`);
    return { text: claim.text.trim(), factIds };
  });
  return { claims };
}
