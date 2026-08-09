import type { DiagnosticRule, Hypothesis } from "./types.ts";

export const RULE_SET_VERSION = "ZS-LE-1.1.0";

export const DIAGNOSTIC_THRESHOLDS = {
  humidity: { minimum: 65, deltaFromBaseline: 10, durationMinutes: 30 },
  microFlow: { deltaFromBaseline: 0.02, normalDelta: 0.01, durationMinutes: 15 },
  confidence: {
    high: { score: 65, coverage: 0.7, gap: 20 },
    medium: { score: 35, coverage: 0.45, gap: 10 },
    low: { score: 10 }
  }
} as const;

export const EXPECTED_FACTS: Record<Hypothesis, string[]> = {
  COLD_WATER_JOINT_LEAK: [
    "HUMIDITY_ANOMALY",
    "MICRO_FLOW_ANOMALY",
    "METER_SUPPORTS_FLOW",
    "WALL_PHOTO_PRESENT",
    "PIPE_MEMORY_PRESENT"
  ],
  WATERPROOFING_FAILURE: [
    "HUMIDITY_ANOMALY",
    "WALL_PHOTO_PRESENT",
    "WATERPROOFING_MEMORY_PRESENT",
    "CLOSED_WATER_TEST_PASS"
  ],
  CONDENSATION_OR_AMBIENT_HUMIDITY: [
    "HUMIDITY_ANOMALY",
    "MICRO_FLOW_NORMAL",
    "WALL_PHOTO_PRESENT"
  ],
  UNRESOLVED: ["CRITICAL_EVIDENCE_MISSING", "EVIDENCE_CONTRADICTION"]
};

export const DIAGNOSTIC_RULES: DiagnosticRule[] = [
  { ruleId: "RULE-HUM-001", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["HUMIDITY_ANOMALY"], contribution: 10, explanation: "持续湿度异常支持存在潮湿现象，但不能单独确定供水接头泄漏" },
  { ruleId: "RULE-HUM-002", version: RULE_SET_VERSION, hypothesis: "WATERPROOFING_FAILURE", requiredFacts: ["HUMIDITY_ANOMALY"], contribution: 8, explanation: "持续潮湿与防水失效相容，但不是特异证据" },
  { ruleId: "RULE-HUM-003", version: RULE_SET_VERSION, hypothesis: "CONDENSATION_OR_AMBIENT_HUMIDITY", requiredFacts: ["HUMIDITY_ANOMALY"], contribution: 25, explanation: "湿度异常首先证明环境潮湿，需要流量证据区分原因" },
  { ruleId: "RULE-CW-001", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["MICRO_FLOW_ANOMALY"], contribution: 32, explanation: "无人用水条件下持续微流量支持供水系统存在泄漏" },
  { ruleId: "RULE-CW-002", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["METER_SUPPORTS_FLOW"], contribution: 22, explanation: "人工水表观察与微流量传感器相互印证" },
  { ruleId: "RULE-CW-003", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["WALL_PHOTO_PRESENT"], contribution: 10, explanation: "墙面影像支持潮湿位置与供水构件空间关系" },
  { ruleId: "RULE-CW-004", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["PIPE_MEMORY_PRESENT"], contribution: 8, explanation: "施工记忆使冷水构件链和重点接头可追溯" },
  { ruleId: "RULE-CW-005", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["MICRO_FLOW_NORMAL"], contribution: -18, explanation: "未观察到持续微流量，削弱供水接头泄漏假设", contradicts: ["MICRO_FLOW_ANOMALY"] },
  { ruleId: "RULE-CW-006", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["METER_REPORTS_NO_CHANGE"], contribution: -24, explanation: "人工水表无变化与供水微流量异常不一致" },
  { ruleId: "RULE-CW-007", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["EVIDENCE_CONTRADICTION"], contribution: -18, explanation: "传感器与人工观察矛盾，必须先复测" },
  { ruleId: "RULE-CW-008", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["POST_ISOLATION_RECOVERY"], contribution: 35, explanation: "授权隔离后微流量与湿度回落，加强供水链泄漏假设" },
  { ruleId: "RULE-CW-009", version: RULE_SET_VERSION, hypothesis: "COLD_WATER_JOINT_LEAK", requiredFacts: ["POST_ISOLATION_NO_RECOVERY"], contribution: -28, explanation: "隔离后异常未恢复，原供水链假设需要重新评估" },
  { ruleId: "RULE-WP-001", version: RULE_SET_VERSION, hypothesis: "WATERPROOFING_FAILURE", requiredFacts: ["WALL_PHOTO_PRESENT"], contribution: 12, explanation: "墙面潮湿影像与防水路径异常相容" },
  { ruleId: "RULE-WP-002", version: RULE_SET_VERSION, hypothesis: "WATERPROOFING_FAILURE", requiredFacts: ["WATERPROOFING_MEMORY_PRESENT"], contribution: 10, explanation: "防水施工记忆提供可核查对象和范围" },
  { ruleId: "RULE-WP-003", version: RULE_SET_VERSION, hypothesis: "WATERPROOFING_FAILURE", requiredFacts: ["CLOSED_WATER_TEST_PASS"], contribution: -12, explanation: "历史闭水试验合格降低施工期防水缺陷的相对支持度，但不能完全排除后期失效" },
  { ruleId: "RULE-WP-004", version: RULE_SET_VERSION, hypothesis: "WATERPROOFING_FAILURE", requiredFacts: ["POST_ISOLATION_NO_RECOVERY"], contribution: 8, explanation: "供水隔离后异常未恢复，应重新考虑非供水路径" },
  { ruleId: "RULE-ENV-001", version: RULE_SET_VERSION, hypothesis: "CONDENSATION_OR_AMBIENT_HUMIDITY", requiredFacts: ["MICRO_FLOW_NORMAL"], contribution: 20, explanation: "湿度异常但微流量正常，更支持环境潮湿或冷凝" },
  { ruleId: "RULE-ENV-002", version: RULE_SET_VERSION, hypothesis: "CONDENSATION_OR_AMBIENT_HUMIDITY", requiredFacts: ["MICRO_FLOW_ANOMALY"], contribution: -15, explanation: "持续微流量削弱单纯环境潮湿解释" },
  { ruleId: "RULE-UNR-001", version: RULE_SET_VERSION, hypothesis: "UNRESOLVED", requiredFacts: ["CRITICAL_EVIDENCE_MISSING"], contribution: 25, explanation: "关键证据缺失，当前应保持未决并继续补证" },
  { ruleId: "RULE-UNR-002", version: RULE_SET_VERSION, hypothesis: "UNRESOLVED", requiredFacts: ["EVIDENCE_CONTRADICTION"], contribution: 35, explanation: "证据相互矛盾，当前不能安全收敛原因" }
];
