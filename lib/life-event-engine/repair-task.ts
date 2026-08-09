import {
  findDownstreamComponents,
  findIsolationValve,
  findRelatedMeters,
  findRelatedSensors,
  findUpstreamComponents,
  traceSpatialHierarchy
} from "./topology-traversal.ts";
import type { BuildingMemory, LifeEventResult, RepairTask } from "./types.ts";

function identity(memory: BuildingMemory, businessId: string) {
  const item = memory.identityIndex[businessId];
  if (!item) throw new RangeError(`Unknown BusinessId while creating repair task: ${businessId}`);
  return item;
}

export function createRepairTask(memory: BuildingMemory, result: LifeEventResult): RepairTask {
  if (!["REPAIR_PENDING", "REPAIR_RECORDED", "ACTION_PROPOSED", "AUTHORIZATION_PENDING", "AUTHORIZED", "SIMULATED_ACTION_APPLIED", "POST_REPAIR_VERIFYING", "RESOLVED", "REOPENED"].includes(result.state)) {
    throw new Error(`Repair task requires an isolated event; current state is ${result.state}`);
  }
  const leader = result.rankedHypotheses[0];
  const targetId = leader?.candidateBusinessIds[0];
  if (!leader || leader.hypothesis !== "COLD_WATER_JOINT_LEAK" || !targetId) {
    throw new Error("Repair task requires a topology-derived cold-water candidate");
  }
  const target = memory.components.find((item) => item.businessId === targetId);
  if (!target) throw new RangeError(`Repair task candidate does not exist in memory: ${targetId}`);
  const hierarchy = traceSpatialHierarchy(memory, targetId);
  const valve = findIsolationValve(memory, targetId);
  if (!valve) throw new Error(`No isolation valve is reachable upstream of ${targetId}`);
  const targetIdentity = identity(memory, targetId);
  const relatedMeters = findRelatedMeters(memory, targetId);
  const relatedSensors = findRelatedSensors(memory, targetId);
  const upstream = findUpstreamComponents(memory, targetId);
  const downstream = findDownstreamComponents(memory, targetId);
  const evidenceIds = [...new Set([
    ...result.supportingEvidence,
    ...result.input.evidence.filter((item) => item.status === "PRESENT" && item.relatedBusinessIds.some((id) => id === targetId || id === valve.businessId || relatedMeters.some((meter) => meter.businessId === id))).map((item) => item.id)
  ])].sort();
  return {
    taskId: `TASK-${result.eventId}-${targetId}`,
    eventId: result.eventId,
    building: { businessId: hierarchy.buildingId, displayName: identity(memory, hierarchy.buildingId).displayName },
    storey: { businessId: hierarchy.storeyId, displayName: identity(memory, hierarchy.storeyId).displayName },
    unit: { businessId: hierarchy.unitId, displayName: identity(memory, hierarchy.unitId).displayName },
    space: { businessId: hierarchy.spaceId, displayName: identity(memory, hierarchy.spaceId).displayName },
    target: { businessId: targetId, displayName: targetIdentity.displayName, ifcClass: targetIdentity.ifcClass, ifcGlobalId: targetIdentity.ifcGlobalId },
    isolationValve: { businessId: valve.businessId, displayName: identity(memory, valve.businessId).displayName },
    relatedMeterIds: relatedMeters.map((item) => item.businessId),
    relatedSensorIds: relatedSensors.map((item) => item.businessId),
    upstreamComponentIds: upstream.map((item) => item.businessId),
    downstreamComponentIds: downstream.map((item) => item.businessId),
    inspectionLocation: `${identity(memory, hierarchy.unitId).displayName} / ${identity(memory, hierarchy.spaceId).displayName} / ${targetIdentity.displayName}`,
    recommendedScope: [
      `保持${identity(memory, valve.businessId).displayName}隔离状态`,
      `检查${targetIdentity.displayName}及相邻上、下游连接`,
      "记录维修前后构件状态并在恢复供水后复验微流量与湿度"
    ],
    rawScore: leader.rawScore,
    decisionConfidence: result.decisionConfidence,
    scoreDisclaimer: "规则分值用于透明排序，不是真实故障概率。",
    evidenceIds,
    safetyRequirements: ["维修前确认局部供水处于隔离状态", "恢复供水必须取得独立人工授权", "恢复供水后必须提交新的传感器观察"],
    humanAuthorizationRequired: true,
    currentState: result.state,
    syntheticDemo: true,
    disclaimer: "脱敏模拟数据/演示任务，不是真实物业派单。"
  };
}
