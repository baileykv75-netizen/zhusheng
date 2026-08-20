import type { LifeEventEngine } from "../life-event-engine/engine.ts";
import { createRepairTask } from "../life-event-engine/repair-task.ts";
import type { AuthorizationRecord, EvidenceItem, LifeEventInput, LifeEventResult, RepairRecord, RepairTask, SensorObservation } from "../life-event-engine/types.ts";
import type { IsolationControls, LabAuthorizationDraft, LabControls, LabTemplateId, PostRepairControls, RepairDraft } from "./types.ts";

const BUILDING_ID = "BLD-ZS-DEMO-001" as const;
const SPACE_ID = "SPACE-1602-BATHROOM" as const;

export const LAB_TEMPLATES: Record<LabTemplateId, LabControls> = {
  "joint-supported": {
    humidity: { value: 82, baseline: 55, durationMinutes: 45, quality: "GOOD" },
    microFlow: { value: 0.06, baseline: 0, durationMinutes: 30, quality: "GOOD" },
    pipeInstallation: "PRESENT", waterproofing: "PRESENT", closedWaterTest: "PRESENT",
    residentPhoto: "PRESENT", photoFinding: "MOISTURE_VISIBLE",
    meterReading: "PRESENT", meterFinding: "FLOW_CONFIRMED_NO_USE"
  },
  "humidity-only": {
    humidity: { value: 82, baseline: 55, durationMinutes: 45, quality: "GOOD" },
    microFlow: { value: 0, baseline: 0, durationMinutes: 30, quality: "GOOD" },
    pipeInstallation: "PRESENT", waterproofing: "PRESENT", closedWaterTest: "PRESENT",
    residentPhoto: "PRESENT", photoFinding: "MOISTURE_VISIBLE",
    meterReading: "PRESENT", meterFinding: "NO_CHANGE"
  },
  "missing-evidence": {
    humidity: { value: 82, baseline: 55, durationMinutes: 45, quality: "GOOD" },
    microFlow: { value: 0.06, baseline: 0, durationMinutes: 30, quality: "GOOD" },
    pipeInstallation: "PRESENT", waterproofing: "PRESENT", closedWaterTest: "PRESENT",
    residentPhoto: "MISSING", photoFinding: "UNREADABLE",
    meterReading: "MISSING", meterFinding: "UNREADABLE"
  },
  "contradictory-evidence": {
    humidity: { value: 82, baseline: 55, durationMinutes: 45, quality: "GOOD" },
    microFlow: { value: 0.06, baseline: 0, durationMinutes: 30, quality: "GOOD" },
    pipeInstallation: "PRESENT", waterproofing: "PRESENT", closedWaterTest: "PRESENT",
    residentPhoto: "PRESENT", photoFinding: "MOISTURE_VISIBLE",
    meterReading: "CONTRADICTORY", meterFinding: "NO_CHANGE"
  }
};

export const DEFAULT_ISOLATION_CONTROLS: IsolationControls = {
  humidity: 58, humidityBaseline: 55, microFlow: 0, microFlowBaseline: 0, durationMinutes: 30
};

export const DEFAULT_POST_REPAIR_CONTROLS: PostRepairControls = {
  humidity: 58, humidityBaseline: 55, humidityQuality: "GOOD",
  microFlow: 0, microFlowBaseline: 0, microFlowQuality: "GOOD",
  durationMinutes: 30, observationNote: "维修后持续观察，墙面未见新增潮湿。"
};

export function defaultRepairDraft(nowMs = Date.now()): RepairDraft {
  return {
    targetBusinessId: "",
    method: "JOINT_REPLACEMENT",
    startedAt: new Date(nowMs - 20 * 60_000).toISOString(),
    completedAt: new Date(nowMs - 5 * 60_000).toISOString(),
    crewId: "PROPERTY-DEMO-01",
    description: "按任务定位检查连接部位，完成演示维修并记录复验条件。",
    result: "COMPLETED",
    restoreSupplyVerificationRequired: true
  };
}

export function controlsFromTemplate(template: LabTemplateId): LabControls {
  return structuredClone(LAB_TEMPLATES[template]);
}

function iso(nowMs: number, offsetMs: number): string {
  return new Date(nowMs + offsetMs).toISOString();
}

function statusReliability(status: EvidenceItem["status"], present = 0.94): number {
  return status === "PRESENT" ? present : status === "CONTRADICTORY" ? 0.9 : status === "UNVERIFIED" ? 0.45 : 0.1;
}

function evidence(id: string, input: Omit<EvidenceItem, "id" | "reliability" | "provenance" | "syntheticDemo">, reliability?: number): EvidenceItem {
  return { id, ...input, reliability: reliability ?? statusReliability(input.status), provenance: "阶段4B浏览器本地脱敏合成输入", syntheticDemo: true };
}

function validatedResidentCapturedAt(value: string | undefined, nowMs: number, fallbackOffsetMs: number) {
  if (!value) return iso(nowMs, fallbackOffsetMs);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("住户证据时间无效");
  if (parsed > nowMs) throw new Error("住户证据不能使用未来时间");
  return new Date(parsed).toISOString();
}

function assessmentEvaluatedAt(residentCapturedAt: string | undefined, nowMs: number) {
  if (!residentCapturedAt) return iso(nowMs, -60_000);
  const capturedMs = Date.parse(residentCapturedAt);
  if (!Number.isFinite(capturedMs)) throw new Error("住户证据时间无效");
  if (capturedMs > nowMs) throw new Error("住户证据不能使用未来时间");
  const preferredMs = nowMs - 1_000;
  return new Date(Math.min(nowMs, Math.max(capturedMs + 1, preferredMs))).toISOString();
}

export function buildAssessmentInput(controls: LabControls, eventCounter: number, nowMs = Date.now(), residentCapturedAt?: string): LifeEventInput {
  const suffix = String(eventCounter).padStart(3, "0");
  const eventId = `EVT-1602-LAB-${suffix}`;
  const detectedAt = iso(nowMs, -10 * 60_000);
  const observedAt = iso(nowMs, -5 * 60_000);
  const photoCapturedAt = validatedResidentCapturedAt(residentCapturedAt, nowMs, -3 * 60_000);
  const meterCapturedAt = validatedResidentCapturedAt(residentCapturedAt, nowMs, -2 * 60_000);
  const observations: SensorObservation[] = [
    { id: `OBS-HUM-LAB-${suffix}`, sensorBusinessId: "SENSOR-1602-HUM-01", observedAt, metric: "RELATIVE_HUMIDITY", value: controls.humidity.value, unit: "%", ...(controls.humidity.baseline === null ? {} : { baseline: controls.humidity.baseline }), durationMinutes: controls.humidity.durationMinutes, quality: controls.humidity.quality, syntheticDemo: true },
    { id: `OBS-FLOW-LAB-${suffix}`, sensorBusinessId: "METER-1602-FLOW-01", observedAt, metric: "MICRO_FLOW", value: controls.microFlow.value, unit: "L/min", ...(controls.microFlow.baseline === null ? {} : { baseline: controls.microFlow.baseline }), durationMinutes: controls.microFlow.durationMinutes, quality: controls.microFlow.quality, syntheticDemo: true }
  ];
  return {
    eventId, buildingId: BUILDING_ID, spaceId: SPACE_ID, detectedAt, evaluatedAt: assessmentEvaluatedAt(residentCapturedAt, nowMs), observations,
    evidence: [
      evidence(`EVD-PIPE-LAB-${suffix}`, { type: "PIPE_INSTALLATION_RECORD", status: controls.pipeInstallation, observedValue: "TRACEABLE", sourceActor: "WORKER", relatedBusinessIds: ["J-1602-CW-03", "PIPE-1602-CW-01"], capturedAt: "2025-03-18T14:26:00.000Z" }),
      evidence(`EVD-WP-LAB-${suffix}`, { type: "WATERPROOFING_RECORD", status: controls.waterproofing, observedValue: "COMPLETE", sourceActor: "WORKER", relatedBusinessIds: ["WP-1602-BATHROOM"], capturedAt: "2025-03-19T10:08:00.000Z" }),
      evidence(`EVD-CWT-LAB-${suffix}`, { type: "CLOSED_WATER_TEST", status: controls.closedWaterTest, observedValue: "PASS", sourceActor: "PROPERTY", relatedBusinessIds: ["WP-1602-BATHROOM"], capturedAt: "2025-03-21T16:40:00.000Z" }),
      evidence(`EVD-PHOTO-LAB-${suffix}`, { type: "RESIDENT_WALL_PHOTO", status: controls.residentPhoto, observedValue: controls.photoFinding, sourceActor: "RESIDENT", relatedBusinessIds: ["WALL-1602-BATHROOM-NORTH", SPACE_ID], capturedAt: photoCapturedAt }),
      evidence(`EVD-METER-LAB-${suffix}`, { type: "METER_READING", status: controls.meterReading, observedValue: controls.meterFinding, sourceActor: "RESIDENT", relatedBusinessIds: ["METER-1602-FLOW-01"], capturedAt: meterCapturedAt })
    ], syntheticDemo: true
  };
}

function resumeInput(previous: LifeEventResult, evaluatedAt: string): LifeEventInput {
  return {
    eventId: previous.eventId, buildingId: BUILDING_ID, spaceId: SPACE_ID,
    detectedAt: previous.input.detectedAt, evaluatedAt, observations: [], evidence: [], syntheticDemo: true
  };
}

function operationTime(previous: LifeEventResult, preferredOffsetMs: number, nowMs = Date.now()): string {
  const now = nowMs;
  const minimum = Date.parse(previous.input.evaluatedAt) + 1;
  return new Date(Math.min(now, Math.max(minimum, now + preferredOffsetMs))).toISOString();
}

function latestActiveResidentEvidence(previous: LifeEventResult, type: EvidenceItem["type"]): EvidenceItem | null {
  const superseded = new Set(previous.input.evidence.flatMap((item) => item.supersedesId ? [item.supersedesId] : []));
  return previous.input.evidence
    .filter((item) => item.type === type && item.sourceActor === "RESIDENT" && !superseded.has(item.id))
    .sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""))
    .at(-1) ?? null;
}

export function evaluateControls(engine: LifeEventEngine, controls: LabControls, eventCounter: number, nowMs = Date.now(), residentCapturedAt?: string): LifeEventResult {
  return assertStage4ABoundary(engine.evaluate(buildAssessmentInput(controls, eventCounter, nowMs, residentCapturedAt)));
}

export function resumeInconclusiveAssessment(
  engine: LifeEventEngine,
  previous: LifeEventResult,
  controls: LabControls,
  residentCapturedAt: string,
  nowMs = Date.now()
): LifeEventResult {
  if (previous.state !== "INCONCLUSIVE") throw new Error("只有 INCONCLUSIVE 事件才能在原事件上追加补证评估");
  const capturedMs = Date.parse(residentCapturedAt);
  if (!Number.isFinite(capturedMs)) throw new Error("住户补证时间无效");
  if (capturedMs <= Date.parse(previous.input.evaluatedAt)) throw new Error("需要提交晚于上一轮评估的新住户证据");
  const evaluatedMs = Math.max(Date.parse(previous.input.evaluatedAt) + 1, capturedMs + 1);
  if (evaluatedMs > nowMs) throw new Error("请等待新住户证据写入后再重新评估");
  const capturedAt = new Date(capturedMs).toISOString();
  const observedAt = new Date(Math.max(Date.parse(previous.input.evaluatedAt) + 1, Math.min(capturedMs, nowMs - 1))).toISOString();
  const suffix = String(previous.auditLog.length + 1).padStart(3, "0");
  const previousPhoto = latestActiveResidentEvidence(previous, "RESIDENT_WALL_PHOTO");
  const previousMeter = latestActiveResidentEvidence(previous, "METER_READING");
  const input = resumeInput(previous, new Date(evaluatedMs).toISOString());
  input.observations = [
    { id: `OBS-HUM-REFINE-${suffix}`, sensorBusinessId: "SENSOR-1602-HUM-01", observedAt, metric: "RELATIVE_HUMIDITY", value: controls.humidity.value, unit: "%", ...(controls.humidity.baseline === null ? {} : { baseline: controls.humidity.baseline }), durationMinutes: controls.humidity.durationMinutes, quality: controls.humidity.quality, syntheticDemo: true },
    { id: `OBS-FLOW-REFINE-${suffix}`, sensorBusinessId: "METER-1602-FLOW-01", observedAt, metric: "MICRO_FLOW", value: controls.microFlow.value, unit: "L/min", ...(controls.microFlow.baseline === null ? {} : { baseline: controls.microFlow.baseline }), durationMinutes: controls.microFlow.durationMinutes, quality: controls.microFlow.quality, syntheticDemo: true }
  ];
  input.evidence = [
    evidence(`EVD-PHOTO-REFINE-${suffix}`, {
      type: "RESIDENT_WALL_PHOTO", status: controls.residentPhoto, observedValue: controls.photoFinding,
      sourceActor: "RESIDENT", relatedBusinessIds: ["WALL-1602-BATHROOM-NORTH", SPACE_ID], capturedAt,
      ...(previousPhoto ? { supersedesId: previousPhoto.id, revisionReason: "住户在证据不足后提交了新的墙面现场观察" } : {})
    }),
    evidence(`EVD-METER-REFINE-${suffix}`, {
      type: "METER_READING", status: controls.meterReading, observedValue: controls.meterFinding,
      sourceActor: "RESIDENT", relatedBusinessIds: ["METER-1602-FLOW-01"], capturedAt,
      ...(previousMeter ? { supersedesId: previousMeter.id, revisionReason: "住户在证据不足后提交了新的水表现场观察" } : {})
    })
  ];
  return assertStage4ABoundary(engine.evaluate(input, previous));
}

export function attemptUnauthorizedClose(engine: LifeEventEngine, previous: LifeEventResult, nowMs = Date.now()): LifeEventResult {
  if (previous.authorizationRequirement?.action !== "SIMULATE_CLOSE_VALVE") throw new Error("当前待授权动作不是模拟关阀");
  return attemptUnauthorizedAction(engine, previous, nowMs);
}

export function attemptUnauthorizedAction(engine: LifeEventEngine, previous: LifeEventResult, nowMs = Date.now()): LifeEventResult {
  const action = previous.authorizationRequirement?.action;
  if (!action) throw new Error("当前事件没有待授权动作");
  const input = resumeInput(previous, operationTime(previous, -45_000, nowMs));
  input.requestedAction = action;
  return assertStage4ABoundary(engine.evaluate(input, previous));
}

export function decideAuthorization(engine: LifeEventEngine, previous: LifeEventResult, draft: LabAuthorizationDraft, nowMs = Date.now()): LifeEventResult {
  const evaluatedAt = operationTime(previous, -30_000, nowMs);
  const requirement = previous.authorizationRequirement;
  if (!requirement) throw new Error("当前事件没有待处理的人工授权请求");
  const record: AuthorizationRecord = {
    authorizationId: `AUTH-${previous.eventId}-${previous.auditLog.length + 1}`,
    eventId: previous.eventId, action: requirement.action, targetBusinessId: requirement.targetBusinessId,
    decision: draft.decision, actorType: draft.actorType, actorId: draft.actorId, decidedAt: evaluatedAt,
    reason: draft.reason || "阶段4B脱敏合成人工决定"
  };
  const input = resumeInput(previous, evaluatedAt);
  input.authorizationRecords = [record];
  return assertStage4ABoundary(engine.evaluate(input, previous));
}

export function executeAuthorizedClose(engine: LifeEventEngine, previous: LifeEventResult, nowMs = Date.now()): LifeEventResult {
  if (!previous.authorizedActions.some((item) => item.action === "SIMULATE_CLOSE_VALVE")) throw new Error("事件引擎尚未产生可执行的已授权关阀动作");
  const input = resumeInput(previous, operationTime(previous, -15_000, nowMs));
  input.requestedAction = "SIMULATE_CLOSE_VALVE";
  return assertStage4ABoundary(engine.evaluate(input, previous));
}

export function submitIsolationObservation(engine: LifeEventEngine, previous: LifeEventResult, values: IsolationControls, nowMs = Date.now()): LifeEventResult {
  if (previous.state !== "VERIFYING") throw new Error("只有模拟关阀进入验证状态后才能提交隔离观察");
  const action = [...previous.auditLog].reverse().find((item) => item.actionType === "SIMULATED_VALVE_CLOSED");
  if (!action?.actionTargetBusinessId) throw new Error("找不到本次模拟关阀的审计记录");
  const observedMs = Math.min(nowMs - 1_000, Math.max(Date.parse(action.timestamp) + 1_000, nowMs - 5_000));
  if (observedMs <= Date.parse(action.timestamp)) throw new Error("请稍后再提交关阀后的新观察");
  const evaluatedAt = new Date(Math.min(nowMs, observedMs + 500)).toISOString();
  const suffix = String(previous.auditLog.length + 1).padStart(3, "0");
  const flowId = `OBS-FLOW-ISOLATION-${suffix}`;
  const humidityId = `OBS-HUM-ISOLATION-${suffix}`;
  const input = resumeInput(previous, evaluatedAt);
  const candidateId = previous.rankedHypotheses[0]?.candidateBusinessIds[0];
  if (!candidateId) throw new Error("当前诊断没有可关联的候选构件");
  input.observations = [
    { id: flowId, sensorBusinessId: "METER-1602-FLOW-01", observedAt: new Date(observedMs).toISOString(), metric: "MICRO_FLOW", value: values.microFlow, unit: "L/min", baseline: values.microFlowBaseline, durationMinutes: values.durationMinutes, quality: "GOOD", syntheticDemo: true },
    { id: humidityId, sensorBusinessId: "SENSOR-1602-HUM-01", observedAt: new Date(observedMs).toISOString(), metric: "RELATIVE_HUMIDITY", value: values.humidity, unit: "%", baseline: values.humidityBaseline, durationMinutes: values.durationMinutes, quality: "GOOD", syntheticDemo: true }
  ];
  input.evidence = [evidence(`EVD-ISOLATION-${suffix}`, {
    type: "VALVE_ISOLATION_OBSERVATION", status: "PRESENT",
    observedValue: values.microFlow - values.microFlowBaseline < 0.01 && values.humidity < 65 ? "FLOW_AND_HUMIDITY_DECREASED" : "NO_RECOVERY",
    sourceActor: "PROPERTY", relatedBusinessIds: [action.actionTargetBusinessId, candidateId, "METER-1602-FLOW-01", "SENSOR-1602-HUM-01"],
    capturedAt: new Date(observedMs).toISOString(), actionAuditSequence: action.sequence,
    actionTargetBusinessId: action.actionTargetBusinessId, relatedObservationIds: [flowId, humidityId]
  }, 0.98)];
  return assertStage4ABoundary(engine.evaluate(input, previous));
}

export function repairTaskForResult(engine: LifeEventEngine, result: LifeEventResult): RepairTask {
  return createRepairTask(engine.memory, result);
}

export function submitRepairRecord(engine: LifeEventEngine, previous: LifeEventResult, draft: RepairDraft, nowMs = Date.now()): LifeEventResult {
  if (previous.state !== "REPAIR_PENDING") throw new Error("只有进入REPAIR_PENDING后才能提交维修记录");
  const task = repairTaskForResult(engine, previous);
  if (draft.targetBusinessId !== task.target.businessId) throw new Error("维修对象必须与当前拓扑诊断候选构件一致");
  const isolation = [...previous.auditLog].reverse().find((item) => item.actionType === "ISOLATION_CONFIRMED");
  if (!isolation) throw new Error("找不到隔离确认审计记录");
  const startedAt = new Date(draft.startedAt).toISOString();
  const completedAt = new Date(draft.completedAt).toISOString();
  if (Date.parse(startedAt) <= Date.parse(isolation.timestamp)) throw new Error("维修开始时间必须晚于隔离确认");
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw new Error("维修完成时间不能早于开始时间");
  const evaluatedMs = Math.max(Date.parse(previous.input.evaluatedAt) + 1, Date.parse(completedAt) + 1);
  if (evaluatedMs > nowMs) throw new Error("维修记录不能使用未来时间");
  const evaluatedAt = new Date(evaluatedMs).toISOString();
  const suffix = String(previous.repairRecords.length + 1).padStart(3, "0");
  const evidenceId = `EVD-REPAIR-${previous.eventId}-${suffix}`;
  const repairRecordId = `REPAIR-${previous.eventId}-${suffix}`;
  const input = resumeInput(previous, evaluatedAt);
  input.evidence = [evidence(evidenceId, {
    type: "REPAIR_RESULT", status: "PRESENT", observedValue: draft.result,
    sourceActor: "PROPERTY", relatedBusinessIds: [draft.targetBusinessId], capturedAt: completedAt
  }, 0.98)];
  const record: RepairRecord = {
    repairRecordId, eventId: previous.eventId, targetBusinessId: draft.targetBusinessId,
    method: draft.method, startedAt, completedAt, submittedAt: evaluatedAt,
    crewId: draft.crewId, description: draft.description,
    evidenceBeforeIds: task.evidenceIds.filter((id) => previous.input.evidence.some((item) => item.id === id)),
    evidenceAfterIds: [evidenceId], result: draft.result,
    restoreSupplyVerificationRequired: draft.restoreSupplyVerificationRequired,
    submittedByActorType: "PROPERTY", submittedByActorId: draft.crewId,
    syntheticDemo: true
  };
  input.repairRecords = [record];
  return engine.evaluate(input, previous);
}

export function executeAuthorizedReopen(engine: LifeEventEngine, previous: LifeEventResult, nowMs = Date.now()): LifeEventResult {
  if (!previous.authorizedActions.some((item) => item.action === "SIMULATE_REOPEN_VALVE")) throw new Error("事件引擎尚未产生可执行的已授权恢复供水动作");
  if (previous.valvePosition !== "CLOSED") throw new Error("恢复供水前阀门应保持关闭");
  const input = resumeInput(previous, operationTime(previous, -5_000, nowMs));
  input.requestedAction = "SIMULATE_REOPEN_VALVE";
  return engine.evaluate(input, previous);
}

export function submitPostRepairObservation(engine: LifeEventEngine, previous: LifeEventResult, values: PostRepairControls, nowMs = Date.now()): LifeEventResult {
  if (previous.state !== "POST_REPAIR_VERIFYING") throw new Error("只有模拟恢复供水后才能提交维修后观察");
  const reopen = [...previous.auditLog].reverse().find((item) => item.actionType === "SIMULATED_VALVE_REOPENED");
  const repair = [...previous.repairRecords].sort((a, b) => a.completedAt.localeCompare(b.completedAt)).at(-1);
  if (!reopen || !repair) throw new Error("缺少恢复供水动作或维修记录");
  const observedMs = Math.max(Date.parse(reopen.timestamp) + 1_000, Date.parse(repair.completedAt) + 1_000);
  if (observedMs >= nowMs) throw new Error("请在恢复供水后等待新的观察数据");
  const evaluatedAt = new Date(Math.min(nowMs, observedMs + 1_000)).toISOString();
  const suffix = String(previous.auditLog.length + 1).padStart(3, "0");
  const input = resumeInput(previous, evaluatedAt);
  input.observations = [
    {
      id: `OBS-FLOW-POST-REPAIR-${suffix}`, sensorBusinessId: "METER-1602-FLOW-01",
      observedAt: new Date(observedMs).toISOString(), metric: "MICRO_FLOW", value: values.microFlow,
      unit: "L/min", baseline: values.microFlowBaseline, durationMinutes: values.durationMinutes,
      quality: values.microFlowQuality, syntheticDemo: true
    },
    {
      id: `OBS-HUM-POST-REPAIR-${suffix}`, sensorBusinessId: "SENSOR-1602-HUM-01",
      observedAt: new Date(observedMs).toISOString(), metric: "RELATIVE_HUMIDITY", value: values.humidity,
      unit: "%", baseline: values.humidityBaseline, durationMinutes: values.durationMinutes,
      quality: values.humidityQuality, syntheticDemo: true
    }
  ];
  return engine.evaluate(input, previous);
}

export function assertStage4ABoundary(result: LifeEventResult): LifeEventResult {
  if (["REPAIR_RECORDED", "POST_REPAIR_VERIFYING", "RESOLVED"].includes(result.state)) {
    throw new Error(`阶段4A禁止进入 ${result.state}`);
  }
  if (result.visualDirective.moistureState === "REPAIRED") throw new Error("阶段4A禁止输出REPAIRED视觉状态");
  return result;
}
