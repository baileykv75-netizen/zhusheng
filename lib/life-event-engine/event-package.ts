import { hashPayload } from "./canonical.ts";
import { replayLifeEventArtifact, verifyLifeEventArtifact } from "./replay.ts";
import { createRepairTask } from "./repair-task.ts";
import { toLifeEventArtifact } from "./engine.ts";
import type {
  AuthorizationRecord,
  BuildingMemory,
  EventMemoryPatch,
  EventPackageVerification,
  LifeEventResult,
  SensorObservation,
  VerifiedLifeEventPackage,
  VisualManifest
} from "./types.ts";

export type EventPackageSourceHashes = Record<string, string>;

function packagePayloadHash(value: VerifiedLifeEventPackage): string {
  const { verification: _verification, ...payload } = value;
  return hashPayload({ ...payload, hashes: { ...value.hashes, packagePayload: "" } });
}

function collectAuthorizations(result: LifeEventResult): AuthorizationRecord[] {
  return [...new Map(Object.values(result.inputSnapshots)
    .flatMap((input) => input.authorizationRecords ?? [])
    .map((record) => [record.authorizationId, record])).values()]
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
}

function postRepairObservations(result: LifeEventResult): SensorObservation[] {
  const reopen = [...result.auditLog].reverse().find((event) => event.actionType === "SIMULATED_VALVE_REOPENED");
  if (!reopen) return [];
  return result.input.observations
    .filter((item) => Date.parse(item.observedAt) > Date.parse(reopen.timestamp))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function createMemoryPatch(result: LifeEventResult, memory: BuildingMemory): EventMemoryPatch {
  const repair = [...result.repairRecords].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).at(-1);
  const leader = result.rankedHypotheses[0];
  const candidateId = leader?.candidateBusinessIds[0];
  const valve = result.completedActions.find((item) => item.action === "SIMULATE_CLOSE_VALVE")?.targetBusinessId;
  if (!repair || !candidateId || !valve) throw new Error("Event memory patch requires candidate, repair record and isolated valve");
  return {
    patchId: `PATCH-${result.eventId}-${result.auditLog.at(-1)?.sequence ?? 0}`,
    eventId: result.eventId,
    spaceId: result.input.spaceId,
    candidateBusinessId: candidateId,
    repairedBusinessId: repair.targetBusinessId,
    repairMethod: repair.method,
    authorizationActions: collectAuthorizations(result).filter((item) => item.decision === "APPROVED").map((item) => item.action),
    repairResult: repair.result,
    verificationResult: result.state === "RESOLVED" ? "RECOVERED" : "NOT_RECOVERED",
    evidenceRefs: [...new Set(result.auditLog.flatMap((item) => item.evidenceRefs))].sort(),
    auditRootHash: result.auditLog.at(-1)?.entryHash ?? "",
    reusableExperience: {
      symptomMetrics: [...new Set(result.input.observations.map((item) => item.metric))],
      isolationValveId: valve,
      verificationRequirements: ["恢复供水必须独立人工授权", "维修后重新采集微流量与湿度", "只有复验正常才能关闭事件"]
    },
    memoryVersion: memory.schemaVersion,
    syntheticDemo: true,
    disclaimer: "本补丁仅记录脱敏合成演示事件，不修改建筑记忆基础事实源。"
  };
}

export function verifyEventPackage(value: VerifiedLifeEventPackage, checkedAt = new Date().toISOString()): EventPackageVerification {
  const checks: EventPackageVerification["checks"] = [];
  const check = (id: string, operation: () => void) => {
    try {
      operation();
      checks.push({ id, passed: true, message: "通过" });
    } catch (error) {
      checks.push({ id, passed: false, message: error instanceof Error ? error.message : String(error) });
    }
  };
  let replayedState: EventPackageVerification["replayedState"];
  let replayedValvePosition: EventPackageVerification["replayedValvePosition"];
  check("AUDIT_AND_SNAPSHOT_HASHES", () => { verifyLifeEventArtifact(value.eventArtifact); });
  check("EVENT_REPLAY", () => {
    const replayed = replayLifeEventArtifact(value.eventArtifact);
    replayedState = replayed.state;
    replayedValvePosition = replayed.valvePosition;
    if (replayed.state !== value.finalState || replayed.valvePosition !== value.finalValvePosition) throw new Error("重放结果与成果包声明不一致");
  });
  check("REFERENCE_COMPLETENESS", () => {
    const evidence = new Set(Object.values(value.eventArtifact.evidenceSnapshots).flat().map((item) => item.id));
    const repairs = new Set(value.repairRecords.map((item) => item.repairRecordId));
    const authorizations = new Set(value.authorizationRecords.map((item) => item.authorizationId));
    for (const event of value.auditLog) {
      for (const id of event.evidenceRefs) if (!evidence.has(id)) throw new Error(`审计引用缺失证据 ${id}`);
      for (const id of event.repairRecordIds) if (!repairs.has(id)) throw new Error(`审计引用缺失维修记录 ${id}`);
      for (const id of event.authorizationRecordIds) if (!authorizations.has(id)) throw new Error(`审计引用缺失授权记录 ${id}`);
    }
  });
  check("SOURCE_HASHES", () => {
    if (hashPayload(value.eventArtifact) === "") throw new Error("事件哈希为空");
    if (!value.hashes.buildingMemory || !value.hashes.visualManifest || !value.hashes.auditRoot) throw new Error("关键事实源哈希缺失");
    if (value.hashes.auditRoot !== value.auditLog.at(-1)?.entryHash) throw new Error("审计根哈希不一致");
  });
  check("PACKAGE_HASH", () => {
    if (packagePayloadHash(value) !== value.hashes.packagePayload) throw new Error("成果包内容哈希不一致");
  });
  return { valid: checks.every((item) => item.passed), checkedAt, checks, replayedState, replayedValvePosition };
}

export function createVerifiedEventPackage(options: {
  result: LifeEventResult;
  memory: BuildingMemory;
  manifest: VisualManifest;
  sourceAssetHashes?: EventPackageSourceHashes;
  generatedAt?: string;
}): VerifiedLifeEventPackage {
  const { result, memory, manifest } = options;
  if (result.state !== "RESOLVED" && result.state !== "REOPENED") throw new Error("Event package requires a completed post-repair verification result");
  if (!result.repairRecords.length) throw new Error("Event package requires a structured repair record");
  const eventArtifact = toLifeEventArtifact(result);
  verifyLifeEventArtifact(eventArtifact);
  const replayed = replayLifeEventArtifact(eventArtifact);
  if (replayed.state !== result.state || replayed.valvePosition !== result.valvePosition) throw new Error("Event replay does not match current result");
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const repairTask = createRepairTask(memory, result);
  const draft: VerifiedLifeEventPackage = {
    packageVersion: "1.0.0",
    packageId: `PACKAGE-${result.eventId}`,
    eventId: result.eventId,
    generatedAt,
    eventArtifact,
    auditLog: result.auditLog,
    repairTask,
    repairRecords: result.repairRecords,
    authorizationRecords: collectAuthorizations(result),
    postRepairObservations: postRepairObservations(result),
    finalState: result.state,
    finalValvePosition: result.valvePosition,
    hashes: {
      packagePayload: "",
      auditRoot: result.auditLog.at(-1)?.entryHash ?? "",
      buildingMemory: hashPayload(memory),
      visualManifest: hashPayload(manifest),
      sourceAssets: options.sourceAssetHashes ?? {}
    },
    ruleSetVersion: result.ruleSetVersion,
    memoryVersion: result.memoryVersion,
    eventMemoryPatch: createMemoryPatch(result, memory),
    verification: { valid: true, checkedAt: generatedAt, checks: [], replayedState: result.state, replayedValvePosition: result.valvePosition },
    syntheticDemo: true,
    disclaimer: "脱敏合成演示事件成果包，不是真实工程、物业工单或外部可信数字签名。"
  };
  draft.hashes.packagePayload = packagePayloadHash(draft);
  const verification = verifyEventPackage(draft, generatedAt);
  if (!verification.valid) throw new Error(`Event package verification failed: ${verification.checks.filter((item) => !item.passed).map((item) => item.message).join("; ")}`);
  return { ...draft, verification };
}
