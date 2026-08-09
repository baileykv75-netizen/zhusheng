import { hashPayload } from "../life-event-engine/canonical.ts";
import type { BuildingMemory, EvidenceItem, VerifiedLifeEventPackage } from "../life-event-engine/types.ts";
import { collectPackageEvidence, assertVerifiedGroupLearningSource } from "./source-validator.ts";
import { derivePilotGuidance } from "./rules.ts";
import { GROUP_LEARNING_RULE_VERSION, GROUP_LEARNING_SCHEMA_VERSION, type EvidenceChainStage, type GroupLearningCard, type WorkerEvidenceContribution } from "./types.ts";

const processLabels: Record<string, string> = {
  PIPE_INSTALLATION_RECORD: "给水管线安装记录",
  WATERPROOFING_RECORD: "卫生间防水施工记录",
  CLOSED_WATER_TEST: "闭水试验"
};

function latestRepair(value: VerifiedLifeEventPackage) {
  const repair = [...value.repairRecords].sort((a, b) => a.completedAt.localeCompare(b.completedAt)).at(-1);
  if (!repair) throw new Error("成果包缺少维修记录");
  return repair;
}

function earliestObservation(value: VerifiedLifeEventPackage, metric: string) {
  return Object.values(value.eventArtifact.inputSnapshots)
    .flatMap((item) => item.observations)
    .filter((item) => item.metric === metric)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))[0];
}

export function createEvidenceChain(value: VerifiedLifeEventPackage): EvidenceChainStage[] {
  const evidence = collectPackageEvidence(value);
  const construction = evidence.filter((item) => item.sourceActor === "WORKER" && item.status === "PRESENT");
  const repair = latestRepair(value);
  const first = value.auditLog[0];
  const assessment = value.auditLog.find((item) => item.actionType === "ASSESSMENT_COMPLETED") ?? first;
  const authorization = value.auditLog.find((item) => item.actionType === "HUMAN_AUTHORIZATION_APPROVED") ?? first;
  const verified = value.auditLog.find((item) => item.actionType === "POST_REPAIR_VERIFIED") ?? value.auditLog.at(-1)!;
  return [
    { stageId: "CONSTRUCTION", label: "1602施工证据", occurredAt: construction.map((item) => item.capturedAt ?? first.timestamp).sort()[0] ?? first.timestamp, summary: `${construction.length}项工友施工记录进入建筑记忆`, referenceIds: construction.map((item) => item.id), businessIds: [...new Set(construction.flatMap((item) => item.relatedBusinessIds))] },
    { stageId: "EVENT", label: "入住异常事件", occurredAt: first.timestamp, summary: "湿度与微流量观察触发生命事件", referenceIds: first.inputRefs, businessIds: first.componentRefs },
    { stageId: "DIAGNOSIS", label: "构件级诊断", occurredAt: assessment.timestamp, summary: `${value.repairTask.target.displayName}成为第一候选`, referenceIds: assessment.evidenceRefs, businessIds: [value.repairTask.target.businessId] },
    { stageId: "AUTHORIZATION", label: "人工授权", occurredAt: authorization.timestamp, summary: `${value.authorizationRecords.length}条设备动作人工决定`, referenceIds: value.authorizationRecords.map((item) => item.authorizationId), businessIds: [value.repairTask.isolationValve.businessId] },
    { stageId: "REPAIR", label: "维修记录", occurredAt: repair.completedAt, summary: `${repair.method}已记录且不可覆盖`, referenceIds: [repair.repairRecordId, ...repair.evidenceAfterIds], businessIds: [repair.targetBusinessId] },
    { stageId: "POST_REPAIR", label: "维修后复验", occurredAt: verified.timestamp, summary: "恢复供水后重新采集微流量和湿度，事件进入RESOLVED", referenceIds: value.postRepairObservations.map((item) => item.id), businessIds: value.postRepairObservations.map((item) => item.sensorBusinessId) },
    { stageId: "MEMORY_PATCH", label: "建筑记忆回写", occurredAt: value.generatedAt, summary: "生成追加式event-memory-patch，不改写基础事实源", referenceIds: [value.eventMemoryPatch.patchId], businessIds: [value.eventMemoryPatch.spaceId, value.eventMemoryPatch.repairedBusinessId] }
  ];
}

function evidenceWasUsed(value: VerifiedLifeEventPackage, evidence: EvidenceItem): boolean {
  return value.repairTask.evidenceIds.includes(evidence.id)
    && value.eventMemoryPatch.evidenceRefs.includes(evidence.id)
    && value.auditLog.some((item) => item.actionType === "ASSESSMENT_COMPLETED" && item.evidenceRefs.includes(evidence.id));
}

export function createWorkerContributions(value: VerifiedLifeEventPackage, memory: BuildingMemory): WorkerEvidenceContribution[] {
  assertVerifiedGroupLearningSource(value, memory);
  return collectPackageEvidence(value)
    .filter((item) => item.sourceActor === "WORKER" && item.status === "PRESENT" && evidenceWasUsed(value, item))
    .map((evidence) => {
      const relatedSpaceIds = evidence.relatedBusinessIds.filter((id) => memory.spaces.some((space) => space.businessId === id));
      if (!relatedSpaceIds.includes(value.repairTask.space.businessId)) relatedSpaceIds.push(value.repairTask.space.businessId);
      const relatedComponentIds = evidence.relatedBusinessIds.filter((id) => memory.components.some((component) => component.businessId === id));
      const contribution: Omit<WorkerEvidenceContribution, "contentHash"> = {
        contributionId: `CONTRIB-${value.eventId}-${evidence.id}`,
        evidenceId: evidence.id,
        evidenceType: evidence.type,
        constructionProcess: processLabels[evidence.type] ?? evidence.type,
        relatedSpaceIds: [...new Set(relatedSpaceIds)].sort(),
        relatedComponentIds: [...new Set(relatedComponentIds)].sort(),
        contributorId: "WORKER-DEMO-ID-NOT-RECORDED",
        contributorIdentityStatus: "DEMO_ID_NOT_RECORDED",
        usedBy: [
          { useType: "DIAGNOSIS", referenceId: value.eventId, usedAt: value.auditLog.find((item) => item.actionType === "ASSESSMENT_COMPLETED")!.timestamp },
          { useType: "REPAIR_TASK", referenceId: value.repairTask.taskId, usedAt: value.auditLog.find((item) => item.actionType === "REPAIR_REQUESTED")!.timestamp },
          { useType: "MEMORY_PATCH", referenceId: value.eventMemoryPatch.patchId, usedAt: value.generatedAt }
        ],
        locatingContribution: evidence.type === "PIPE_INSTALLATION_RECORD"
          ? "将入住异常缩小到冷水连接链及相邻构件，而非盲目拆检整个卫生间。"
          : "提供防水施工基线，帮助比较供水连接与防水失效两个候选方向。",
        responsibilityInference: "PROHIBITED",
        syntheticDemo: true
      };
      return { ...contribution, contentHash: hashPayload(contribution) };
    });
}

export function createGroupLearningCard(value: VerifiedLifeEventPackage, memory: BuildingMemory): GroupLearningCard {
  const verification = assertVerifiedGroupLearningSource(value, memory);
  const repair = latestRepair(value);
  const guidance = derivePilotGuidance(value.repairTask.target.ifcClass, repair.method);
  const evidence = collectPackageEvidence(value);
  const workerRecords = evidence.filter((item) => item.sourceActor === "WORKER" && item.status === "PRESENT" && evidenceWasUsed(value, item));
  const humidity = earliestObservation(value, "RELATIVE_HUMIDITY");
  const flow = earliestObservation(value, "MICRO_FLOW");
  const draft: Omit<GroupLearningCard, "contentHash"> = {
    schemaVersion: GROUP_LEARNING_SCHEMA_VERSION,
    cardId: `GLC-${value.eventId}`,
    sourceEventIds: [value.eventId],
    sourceEventCount: 1,
    sourcePackageId: value.packageId,
    sourcePackageHash: verification.packagePayloadHash,
    location: { building: value.repairTask.building, storey: value.repairTask.storey, unit: value.repairTask.unit, space: value.repairTask.space },
    targetComponent: value.repairTask.target,
    originalSymptoms: [
      humidity ? `相对湿度 ${humidity.value}${humidity.unit}，持续${humidity.durationMinutes ?? 0}分钟` : "湿度观察缺失",
      flow ? `无人用水微流量 ${flow.value}${flow.unit}，持续${flow.durationMinutes ?? 0}分钟` : "微流量观察缺失"
    ],
    firstDiagnosis: {
      hypothesis: "COLD_WATER_JOINT_LEAK",
      targetBusinessId: value.repairTask.target.businessId,
      rawScore: value.repairTask.rawScore,
      decisionConfidence: value.repairTask.decisionConfidence,
      scoreDisclaimer: value.repairTask.scoreDisclaimer
    },
    actualRepair: { repairRecordId: repair.repairRecordId, targetBusinessId: repair.targetBusinessId, method: repair.method, result: repair.result, crewId: repair.crewId, completedAt: repair.completedAt },
    postRepairVerification: value.postRepairObservations.map((item) => ({ observationId: item.id, metric: item.metric, value: item.value, unit: item.unit, quality: item.quality, observedAt: item.observedAt })),
    constructionEvidenceIds: workerRecords.map((item) => item.id),
    workerRecordIds: workerRecords.map((item) => item.id),
    recommendedChecks: guidance.inspectionProcess,
    applicableScope: ["下一批MiC卫生间模块试点", guidance.targetComponentType, `与${repair.method}相同的维修验证情形`],
    excludedScope: ["其他建筑系统或故障类型", "未采用MiC的项目直接套用", "未经过人工评审的企业标准"],
    unprovenClaims: ["尚未证明该现象在其他项目重复出现", "尚未证明属于系统性缺陷或集团规律", "尚未证明与特定班组、材料批次存在因果关系", "没有真实成本节省或故障率改善数据"],
    knownFacts: ["来源事件成果包通过哈希链与重放验证", `${repair.targetBusinessId}完成${repair.method}并留下不可变记录`, "维修后微流量与湿度重新采集且事件进入RESOLVED", `${workerRecords.length}项工友施工证据被诊断与维修任务实际引用`],
    experienceLevel: "SINGLE_CASE_HYPOTHESIS",
    experienceLabel: "单事件待验证经验",
    confidenceBasis: ["一个完整闭环事件", "构件级拓扑与建筑记忆可追溯", "两次设备动作均有人工作出授权", "维修后观察发生在恢复供水之后"],
    initialReviewState: "PENDING_REVIEW",
    ruleVersion: GROUP_LEARNING_RULE_VERSION,
    buildingMemoryVersion: value.memoryVersion,
    eventAuditRootHash: value.hashes.auditRoot,
    sourceReferenceIds: [...new Set([value.eventId, value.packageId, value.eventMemoryPatch.patchId, repair.repairRecordId, ...value.authorizationRecords.map((item) => item.authorizationId), ...value.postRepairObservations.map((item) => item.id), ...value.eventMemoryPatch.evidenceRefs])].sort(),
    syntheticDemo: true,
    disclaimer: "脱敏合成演示数据。当前仅有一个完整事件，本卡是单事件待验证经验，不是集团规律或企业标准。"
  };
  return { ...draft, contentHash: hashPayload(draft) };
}
