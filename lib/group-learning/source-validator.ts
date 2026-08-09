import { hashPayload } from "../life-event-engine/canonical.ts";
import { verifyEventPackage } from "../life-event-engine/event-package.ts";
import type { BuildingMemory, EvidenceItem, VerifiedLifeEventPackage } from "../life-event-engine/types.ts";
import type { GroupSourceVerification } from "./types.ts";

export function collectPackageEvidence(value: VerifiedLifeEventPackage): EvidenceItem[] {
  const found = new Map<string, EvidenceItem>();
  for (const item of Object.values(value.eventArtifact.evidenceSnapshots).flat()) {
    const previous = found.get(item.id);
    if (previous && hashPayload(previous) !== hashPayload(item)) throw new Error(`成果包包含同ID不同内容证据 ${item.id}`);
    if (!previous) found.set(item.id, item);
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function verifyGroupLearningSource(
  value: VerifiedLifeEventPackage,
  memory: BuildingMemory,
  checkedAt = new Date().toISOString()
): GroupSourceVerification {
  const checks: GroupSourceVerification["checks"] = [];
  const check = (id: string, operation: () => void) => {
    try {
      operation();
      checks.push({ id, passed: true, message: "通过" });
    } catch (error) {
      checks.push({ id, passed: false, message: error instanceof Error ? error.message : String(error) });
    }
  };
  const packageVerification = verifyEventPackage(value, checkedAt);
  check("EVENT_PACKAGE_VERIFIED", () => {
    if (!packageVerification.valid) throw new Error(packageVerification.checks.filter((item) => !item.passed).map((item) => item.message).join("；"));
  });
  check("RESOLVED_ONLY", () => {
    if (value.finalState !== "RESOLVED" || value.eventArtifact.currentState !== "RESOLVED") throw new Error(`集团经验仅接受RESOLVED事件，当前为${value.finalState}`);
    if (value.eventMemoryPatch.verificationResult !== "RECOVERED") throw new Error("事件记忆补丁未记录恢复验证");
  });
  check("REPAIR_AND_POST_VERIFICATION", () => {
    const repair = value.repairRecords.at(-1);
    if (!repair || repair.result !== "COMPLETED") throw new Error("缺少已完成且不可变的维修记录");
    if (value.postRepairObservations.length < 2) throw new Error("缺少维修后湿度或微流量复验");
    const reopen = [...value.auditLog].reverse().find((item) => item.actionType === "SIMULATED_VALVE_REOPENED");
    if (!reopen) throw new Error("缺少恢复供水审计记录");
    for (const observation of value.postRepairObservations) {
      if (Date.parse(observation.observedAt) <= Date.parse(repair.completedAt) || Date.parse(observation.observedAt) <= Date.parse(reopen.timestamp)) {
        throw new Error(`维修后观察 ${observation.id} 时间顺序无效`);
      }
    }
    const metrics = new Set(value.postRepairObservations.map((item) => item.metric));
    if (!metrics.has("MICRO_FLOW") || !metrics.has("RELATIVE_HUMIDITY")) throw new Error("维修后复验未同时包含微流量和湿度");
  });
  check("MEMORY_AND_REFERENCE_INTEGRITY", () => {
    const evidence = new Set(collectPackageEvidence(value).map((item) => item.id));
    const identityIds = new Set(Object.keys(memory.identityIndex));
    const requiredBusinessIds = [
      value.repairTask.building.businessId,
      value.repairTask.storey.businessId,
      value.repairTask.unit.businessId,
      value.repairTask.space.businessId,
      value.repairTask.target.businessId,
      value.repairTask.isolationValve.businessId,
      value.eventMemoryPatch.spaceId,
      value.eventMemoryPatch.candidateBusinessId,
      value.eventMemoryPatch.repairedBusinessId
    ];
    for (const id of requiredBusinessIds) if (!identityIds.has(id)) throw new Error(`建筑记忆无法解析 ${id}`);
    for (const id of value.eventMemoryPatch.evidenceRefs) if (!evidence.has(id)) throw new Error(`事件记忆补丁引用不存在证据 ${id}`);
    if (value.eventMemoryPatch.repairedBusinessId !== value.repairRecords.at(-1)?.targetBusinessId) throw new Error("维修目标与事件记忆补丁不一致");
    if (value.repairTask.target.businessId !== value.eventMemoryPatch.candidateBusinessId) throw new Error("第一候选与事件记忆补丁不一致");
  });
  check("SINGLE_EVENT_AND_SYNTHETIC_BOUNDARY", () => {
    if (value.syntheticDemo !== true || memory.modelStatus !== "synthetic_demo") throw new Error("输入未标记为脱敏合成演示数据");
    if (!value.eventId || value.eventMemoryPatch.eventId !== value.eventId) throw new Error("事件引用不一致");
  });
  return {
    valid: checks.every((item) => item.passed),
    checkedAt,
    checks,
    packagePayloadHash: value.hashes.packagePayload
  };
}

export function assertVerifiedGroupLearningSource(value: VerifiedLifeEventPackage, memory: BuildingMemory): GroupSourceVerification {
  const verification = verifyGroupLearningSource(value, memory);
  if (!verification.valid) throw new Error(`集团学习来源验证失败：${verification.checks.filter((item) => !item.passed).map((item) => item.message).join("；")}`);
  return verification;
}
