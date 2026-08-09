import type { RepairMethod } from "../life-event-engine/types.ts";

export type PilotGuidance = {
  targetComponentType: string;
  inspectionProcess: string[];
  requiredEvidence: string[];
  passConditions: string[];
  failureHandling: string[];
};

const methodGuidance: Record<RepairMethod, { action: string; proof: string }> = {
  JOINT_RETIGHTEN: { action: "复核连接件紧固状态与相邻接口", proof: "紧固前后近景及复核记录" },
  SEAL_REPLACEMENT: { action: "核验密封件型号、安装方向与压合状态", proof: "密封件身份、安装近景及更换记录" },
  JOINT_REPLACEMENT: { action: "对更换连接节点及相邻上下游接口进行复核", proof: "更换前后节点近景、连接参数与复核记录" },
  LOCAL_PIPE_REPLACEMENT: { action: "对局部管段替换范围及两端新连接进行复核", proof: "替换范围、两端连接近景及压力复核记录" },
  INSPECTION_ONLY: { action: "保留检查结论并补充可验证的后续处置条件", proof: "检查位置、未维修原因与后续验证计划" }
};

export function derivePilotGuidance(ifcClass: string, repairMethod: RepairMethod): PilotGuidance {
  const componentType = ifcClass === "IfcPipeFitting" ? "给水管道连接件" : ifcClass === "IfcPipeSegment" ? "给水管段" : ifcClass;
  const method = methodGuidance[repairMethod];
  return {
    targetComponentType: componentType,
    inspectionProcess: [
      `MiC卫生间模块封板前定位${componentType}`,
      method.action,
      "闭水或交付验证记录同时关联空间、构件BusinessId与证据ID"
    ],
    requiredEvidence: [
      method.proof,
      "可追溯至空间与构件身份的施工记录",
      "试点模块验证记录及异常处置结果"
    ],
    passConditions: [
      "目标构件及相邻连接可由BusinessId精确查询",
      "施工证据覆盖建议检查工序且来源明确",
      "试点验证结果经人工复核并保留审计记录"
    ],
    failureHandling: [
      "证据缺失时退回补录，不自动判定责任",
      "检查异常时转人工复核并保留原始证据",
      "未完成试点验证前不得升级为企业标准"
    ]
  };
}
