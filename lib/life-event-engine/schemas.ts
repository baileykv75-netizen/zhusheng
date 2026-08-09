import { findComponentsInSpace } from "./topology-traversal.ts";
import { REPAIR_METHODS } from "./types.ts";
import type {
  AuthorizationRecord,
  BuildingMemory,
  EvidenceItem,
  EvidenceType,
  LifeEventInput,
  RepairRecord,
  SensorObservation,
  SimulatedAction,
  VisualManifest
} from "./types.ts";

const evidenceTypes = new Set<EvidenceType>([
  "PIPE_INSTALLATION_RECORD", "WATERPROOFING_RECORD", "CLOSED_WATER_TEST",
  "RESIDENT_WALL_PHOTO", "METER_READING", "VALVE_ISOLATION_OBSERVATION", "REPAIR_RESULT"
]);
const actions = new Set<SimulatedAction>(["SIMULATE_CLOSE_VALVE", "SIMULATE_REOPEN_VALVE"]);
const historicalEvidence = new Set<EvidenceType>(["PIPE_INSTALLATION_RECORD", "WATERPROOFING_RECORD", "CLOSED_WATER_TEST"]);
const allowedActors: Record<EvidenceType, EvidenceItem["sourceActor"][]> = {
  PIPE_INSTALLATION_RECORD: ["WORKER"],
  WATERPROOFING_RECORD: ["WORKER"],
  CLOSED_WATER_TEST: ["WORKER", "PROPERTY"],
  RESIDENT_WALL_PHOTO: ["RESIDENT", "PROPERTY"],
  METER_READING: ["RESIDENT", "PROPERTY"],
  VALVE_ISOLATION_OBSERVATION: ["PROPERTY"],
  REPAIR_RESULT: ["PROPERTY"]
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw new TypeError(`${label} must be true for synthetic demo data`);
  return true;
}

function isoDate(value: unknown, label: string): string {
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result))) throw new TypeError(`${label} must be an ISO date-time`);
  return result;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item, index) => text(item, `${label}[${index}]`));
}

function timestamp(value: string): number {
  return Date.parse(value);
}

export function parseSensorObservation(value: unknown): SensorObservation {
  const item = record(value, "observation");
  const metric = text(item.metric, "observation.metric");
  if (metric !== "RELATIVE_HUMIDITY" && metric !== "MICRO_FLOW") throw new TypeError(`Unsupported metric: ${metric}`);
  const unit = text(item.unit, "observation.unit");
  if ((metric === "RELATIVE_HUMIDITY" && unit !== "%") || (metric === "MICRO_FLOW" && unit !== "L/min")) throw new TypeError(`Unit ${unit} is invalid for ${metric}`);
  const quality = text(item.quality, "observation.quality");
  if (!new Set(["GOOD", "DEGRADED", "UNKNOWN"]).has(quality)) throw new TypeError(`Unsupported quality: ${quality}`);
  const durationMinutes = item.durationMinutes === undefined ? undefined : finite(item.durationMinutes, "observation.durationMinutes");
  if (durationMinutes !== undefined && durationMinutes < 0) throw new RangeError("observation.durationMinutes must be non-negative");
  const numericValue = finite(item.value, "observation.value");
  const baseline = item.baseline === undefined ? undefined : finite(item.baseline, "observation.baseline");
  if (metric === "RELATIVE_HUMIDITY" && (numericValue < 0 || numericValue > 100)) throw new RangeError("relative humidity must be between 0 and 100");
  if (metric === "RELATIVE_HUMIDITY" && baseline !== undefined && (baseline < 0 || baseline > 100)) throw new RangeError("relative humidity baseline must be between 0 and 100");
  if (metric === "MICRO_FLOW" && numericValue < 0) throw new RangeError("micro flow must be non-negative");
  if (metric === "MICRO_FLOW" && baseline !== undefined && baseline < 0) throw new RangeError("micro flow baseline must be non-negative");
  return {
    id: text(item.id, "observation.id"), sensorBusinessId: text(item.sensorBusinessId, "observation.sensorBusinessId"),
    observedAt: isoDate(item.observedAt, "observation.observedAt"), metric, value: numericValue,
    unit: unit as SensorObservation["unit"], baseline, durationMinutes,
    quality: quality as SensorObservation["quality"], syntheticDemo: literalTrue(item.syntheticDemo, "observation.syntheticDemo")
  };
}

export function parseEvidenceItem(value: unknown): EvidenceItem {
  const item = record(value, "evidence");
  const type = text(item.type, "evidence.type") as EvidenceType;
  if (!evidenceTypes.has(type)) throw new TypeError(`Unsupported evidence type: ${type}`);
  const status = text(item.status, "evidence.status");
  if (!new Set(["PRESENT", "MISSING", "CONTRADICTORY", "UNVERIFIED"]).has(status)) throw new TypeError(`Unsupported evidence status: ${status}`);
  const sourceActor = text(item.sourceActor, "evidence.sourceActor") as EvidenceItem["sourceActor"];
  if (!new Set(["WORKER", "RESIDENT", "PROPERTY", "SENSOR", "SYSTEM"]).has(sourceActor)) throw new TypeError(`Unsupported source actor: ${sourceActor}`);
  if (!allowedActors[type].includes(sourceActor)) throw new TypeError(`${type} cannot be submitted by ${sourceActor}`);
  const reliability = finite(item.reliability, "evidence.reliability");
  if (reliability < 0 || reliability > 1) throw new RangeError("evidence.reliability must be between 0 and 1");
  const observedValue = item.observedValue;
  if (observedValue !== undefined && !["string", "number", "boolean"].includes(typeof observedValue)) throw new TypeError("evidence.observedValue must be string, number or boolean");
  if (type === "RESIDENT_WALL_PHOTO" && observedValue !== undefined && !["MOISTURE_VISIBLE", "NO_VISIBLE_MOISTURE", "UNREADABLE"].includes(String(observedValue))) {
    throw new RangeError("RESIDENT_WALL_PHOTO must use MOISTURE_VISIBLE, NO_VISIBLE_MOISTURE or UNREADABLE");
  }
  const actionAuditSequence = item.actionAuditSequence === undefined ? undefined : finite(item.actionAuditSequence, "evidence.actionAuditSequence");
  if (actionAuditSequence !== undefined && (!Number.isInteger(actionAuditSequence) || actionAuditSequence < 1)) throw new RangeError("evidence.actionAuditSequence must be a positive integer");
  return {
    id: text(item.id, "evidence.id"), type, status: status as EvidenceItem["status"], observedValue: observedValue as EvidenceItem["observedValue"],
    sourceActor, relatedBusinessIds: stringArray(item.relatedBusinessIds, "evidence.relatedBusinessIds"),
    capturedAt: item.capturedAt === undefined ? undefined : isoDate(item.capturedAt, "evidence.capturedAt"),
    supersedesId: item.supersedesId === undefined ? undefined : text(item.supersedesId, "evidence.supersedesId"),
    revisionReason: item.revisionReason === undefined ? undefined : text(item.revisionReason, "evidence.revisionReason"),
    actionAuditSequence,
    actionTargetBusinessId: item.actionTargetBusinessId === undefined ? undefined : text(item.actionTargetBusinessId, "evidence.actionTargetBusinessId"),
    relatedObservationIds: item.relatedObservationIds === undefined ? undefined : stringArray(item.relatedObservationIds, "evidence.relatedObservationIds"),
    reliability, provenance: text(item.provenance, "evidence.provenance"), syntheticDemo: literalTrue(item.syntheticDemo, "evidence.syntheticDemo")
  };
}

export function parseAuthorizationRecord(value: unknown): AuthorizationRecord {
  const item = record(value, "authorization");
  const actorType = text(item.actorType, "authorization.actorType");
  if (actorType !== "RESIDENT" && actorType !== "PROPERTY") throw new TypeError("authorization.actorType must be RESIDENT or PROPERTY");
  const decision = text(item.decision, "authorization.decision");
  if (decision !== "APPROVED" && decision !== "REJECTED") throw new TypeError(`Unsupported authorization decision: ${decision}`);
  const action = text(item.action, "authorization.action") as SimulatedAction;
  if (!actions.has(action)) throw new TypeError(`Unsupported authorization action: ${action}`);
  return {
    authorizationId: text(item.authorizationId, "authorization.authorizationId"), eventId: text(item.eventId, "authorization.eventId"), action,
    targetBusinessId: text(item.targetBusinessId, "authorization.targetBusinessId"), decision, actorType,
    actorId: text(item.actorId, "authorization.actorId"), decidedAt: isoDate(item.decidedAt, "authorization.decidedAt"),
    reason: item.reason === undefined ? undefined : text(item.reason, "authorization.reason")
  };
}

export function parseRepairRecord(value: unknown): RepairRecord {
  const item = record(value, "repairRecord");
  const method = text(item.method, "repairRecord.method") as RepairRecord["method"];
  if (!(REPAIR_METHODS as readonly string[]).includes(method)) throw new TypeError(`Unsupported repair method: ${method}`);
  const result = text(item.result, "repairRecord.result") as RepairRecord["result"];
  if (!["COMPLETED", "INSPECTION_ONLY", "UNSUCCESSFUL"].includes(result)) throw new TypeError(`Unsupported repair result: ${result}`);
  const actorType = text(item.submittedByActorType, "repairRecord.submittedByActorType");
  if (actorType !== "PROPERTY") throw new TypeError("repairRecord must be submitted by PROPERTY");
  if (typeof item.restoreSupplyVerificationRequired !== "boolean") throw new TypeError("repairRecord.restoreSupplyVerificationRequired must be boolean");
  const startedAt = isoDate(item.startedAt, "repairRecord.startedAt");
  const completedAt = isoDate(item.completedAt, "repairRecord.completedAt");
  const submittedAt = isoDate(item.submittedAt, "repairRecord.submittedAt");
  if (timestamp(completedAt) < timestamp(startedAt)) throw new RangeError("repairRecord.completedAt cannot precede startedAt");
  if (timestamp(submittedAt) < timestamp(completedAt)) throw new RangeError("repairRecord.submittedAt cannot precede completedAt");
  const supersedesId = item.supersedesId === undefined ? undefined : text(item.supersedesId, "repairRecord.supersedesId");
  const revisionReason = item.revisionReason === undefined ? undefined : text(item.revisionReason, "repairRecord.revisionReason");
  if (supersedesId && !revisionReason) throw new RangeError("repairRecord revision requires revisionReason");
  return {
    repairRecordId: text(item.repairRecordId, "repairRecord.repairRecordId"),
    eventId: text(item.eventId, "repairRecord.eventId"),
    targetBusinessId: text(item.targetBusinessId, "repairRecord.targetBusinessId"),
    method, startedAt, completedAt, submittedAt,
    crewId: text(item.crewId, "repairRecord.crewId"),
    description: text(item.description, "repairRecord.description"),
    evidenceBeforeIds: stringArray(item.evidenceBeforeIds, "repairRecord.evidenceBeforeIds"),
    evidenceAfterIds: stringArray(item.evidenceAfterIds, "repairRecord.evidenceAfterIds"),
    result,
    restoreSupplyVerificationRequired: item.restoreSupplyVerificationRequired,
    submittedByActorType: "PROPERTY",
    submittedByActorId: text(item.submittedByActorId, "repairRecord.submittedByActorId"),
    supersedesId, revisionReason,
    syntheticDemo: literalTrue(item.syntheticDemo, "repairRecord.syntheticDemo")
  };
}

function validateEvidenceRelation(item: EvidenceItem, input: Pick<LifeEventInput, "spaceId">, memory: BuildingMemory) {
  const identity = (id: string) => memory.identityIndex[id];
  const component = (id: string) => memory.components.find((entry) => entry.businessId === id);
  const inSpace = new Set(findComponentsInSpace(memory, input.spaceId).map((entry) => entry.businessId));
  const coldSystem = memory.systems.find((system) => system.systemType === "DOMESTIC_COLD_WATER");
  const coldMembers = new Set(coldSystem?.memberIds ?? []);
  for (const id of item.relatedBusinessIds) if (!identity(id)) throw new RangeError(`Unknown evidence BusinessId: ${id}`);
  const matches = item.relatedBusinessIds.some((id) => {
    const cls = identity(id)?.ifcClass;
    if (item.type === "PIPE_INSTALLATION_RECORD") return coldMembers.has(id) && ["IfcPipeSegment", "IfcPipeFitting"].includes(cls);
    if (item.type === "WATERPROOFING_RECORD") return cls === "IfcCovering" && component(id)?.spaceId === input.spaceId;
    if (item.type === "CLOSED_WATER_TEST") return id === input.spaceId || (cls === "IfcCovering" && component(id)?.spaceId === input.spaceId);
    if (item.type === "RESIDENT_WALL_PHOTO") return id === input.spaceId || (cls === "IfcWall" && id.includes("1602-BATHROOM"));
    if (item.type === "METER_READING") return cls === "IfcFlowMeter" && coldMembers.has(id) && inSpace.has(id);
    if (item.type === "VALVE_ISOLATION_OBSERVATION") return cls === "IfcValve" && coldMembers.has(id) && inSpace.has(id);
    if (item.type === "REPAIR_RESULT") return coldMembers.has(id) && ["IfcPipeSegment", "IfcPipeFitting"].includes(cls);
    return false;
  });
  if (!matches) throw new RangeError(`${item.type} has no related object of the required type, space and system`);
}

export function parseLifeEventInput(value: unknown, memory: BuildingMemory): LifeEventInput {
  const item = record(value, "lifeEventInput");
  const buildingId = text(item.buildingId, "buildingId");
  const spaceId = text(item.spaceId, "spaceId");
  const detectedAt = isoDate(item.detectedAt, "detectedAt");
  const evaluatedAt = isoDate(item.evaluatedAt, "evaluatedAt");
  if (timestamp(evaluatedAt) < timestamp(detectedAt)) throw new RangeError("evaluatedAt cannot precede detectedAt");
  if (buildingId !== memory.buildingId || !memory.identityIndex[buildingId]) throw new RangeError(`Unknown building BusinessId: ${buildingId}`);
  if (!memory.spaces.some((space) => space.businessId === spaceId)) throw new RangeError(`Unknown space BusinessId: ${spaceId}`);
  if (!Array.isArray(item.observations) || !Array.isArray(item.evidence)) throw new TypeError("observations and evidence must be arrays");
  const observations = item.observations.map(parseSensorObservation);
  const evidence = item.evidence.map(parseEvidenceItem);
  const componentIndex = new Map(memory.components.map((entry) => [entry.businessId, entry]));
  const coldSystem = memory.systems.find((system) => system.systemType === "DOMESTIC_COLD_WATER");
  for (const observation of observations) {
    const component = componentIndex.get(observation.sensorBusinessId);
    if (!component || component.buildingId !== buildingId) throw new RangeError(`Unknown sensor or meter BusinessId: ${observation.sensorBusinessId}`);
    if (timestamp(observation.observedAt) < timestamp(detectedAt) || timestamp(observation.observedAt) > timestamp(evaluatedAt)) throw new RangeError(`${observation.id} must be observed between event detection and evaluation`);
    if (observation.metric === "RELATIVE_HUMIDITY" && (component.ifcClass !== "IfcSensor" || component.spaceId !== spaceId || component.systemId !== "SYS-1602-ENV")) throw new RangeError(`${observation.sensorBusinessId} is not the event-space humidity sensor`);
    if (observation.metric === "MICRO_FLOW" && (component.ifcClass !== "IfcFlowMeter" || !coldSystem?.memberIds.includes(component.businessId))) throw new RangeError(`${observation.sensorBusinessId} is not a related cold-water flow meter`);
  }
  for (const evidenceItem of evidence) {
    validateEvidenceRelation(evidenceItem, { spaceId: spaceId as LifeEventInput["spaceId"] }, memory);
    if (evidenceItem.capturedAt && timestamp(evidenceItem.capturedAt) > timestamp(evaluatedAt)) throw new RangeError(`${evidenceItem.id} is future evidence`);
    if (!historicalEvidence.has(evidenceItem.type)) {
      if (!evidenceItem.capturedAt) throw new RangeError(`${evidenceItem.type} requires capturedAt`);
      if (timestamp(evidenceItem.capturedAt) < timestamp(detectedAt)) throw new RangeError(`${evidenceItem.id} predates event detection`);
    }
    if (evidenceItem.supersedesId && !evidenceItem.revisionReason) throw new RangeError(`${evidenceItem.id} requires revisionReason when supersedesId is present`);
  }
  const authorizationRecords = item.authorizationRecords === undefined ? undefined : Array.isArray(item.authorizationRecords)
    ? item.authorizationRecords.map(parseAuthorizationRecord)
    : (() => { throw new TypeError("authorizationRecords must be an array"); })();
  for (const authorization of authorizationRecords ?? []) {
    const target = componentIndex.get(authorization.targetBusinessId);
    if (!target || target.ifcClass !== "IfcValve" || target.buildingId !== buildingId) throw new RangeError(`Unknown or invalid authorization target: ${authorization.targetBusinessId}`);
    if (timestamp(authorization.decidedAt) > timestamp(evaluatedAt)) throw new RangeError(`${authorization.authorizationId} is a future authorization`);
  }
  const requestedAction = item.requestedAction === undefined ? undefined : text(item.requestedAction, "requestedAction") as SimulatedAction;
  if (requestedAction && !actions.has(requestedAction)) throw new TypeError(`Unsupported requested action: ${requestedAction}`);
  const repairRecords = item.repairRecords === undefined ? undefined : Array.isArray(item.repairRecords)
    ? item.repairRecords.map(parseRepairRecord)
    : (() => { throw new TypeError("repairRecords must be an array"); })();
  for (const repairRecord of repairRecords ?? []) {
    if (repairRecord.eventId !== text(item.eventId, "eventId")) throw new RangeError(`${repairRecord.repairRecordId} belongs to another event`);
    const target = componentIndex.get(repairRecord.targetBusinessId);
    if (!target || target.buildingId !== buildingId || target.spaceId !== spaceId || !["IfcPipeFitting", "IfcPipeSegment"].includes(target.ifcClass)) {
      throw new RangeError(`${repairRecord.targetBusinessId} is not a repairable component in the event space`);
    }
    if (timestamp(repairRecord.submittedAt) > timestamp(evaluatedAt)) throw new RangeError(`${repairRecord.repairRecordId} is a future repair record`);
  }
  return {
    eventId: text(item.eventId, "eventId"), buildingId: buildingId as LifeEventInput["buildingId"], spaceId: spaceId as LifeEventInput["spaceId"],
    detectedAt, evaluatedAt, observations, evidence, requestedAction, authorizationRecords, repairRecords,
    syntheticDemo: literalTrue(item.syntheticDemo, "syntheticDemo")
  };
}

export function assertBuildingMemory(value: unknown): asserts value is BuildingMemory {
  const memory = record(value, "buildingMemory");
  text(memory.schemaVersion, "buildingMemory.schemaVersion"); text(memory.buildingId, "buildingMemory.buildingId");
  if (memory.modelStatus !== "synthetic_demo") throw new TypeError("Building memory must be synthetic_demo");
  for (const key of ["spaces", "components", "systems", "connections", "safetyPolicies", "evidenceRequirements"]) if (!Array.isArray(memory[key])) throw new TypeError(`buildingMemory.${key} must be an array`);
  record(memory.identityIndex, "buildingMemory.identityIndex");
}

export function assertVisualManifest(value: unknown): asserts value is VisualManifest {
  const manifest = record(value, "visualManifest");
  text(manifest.sceneId, "visualManifest.sceneId"); text(manifest.sourceBuildingId, "visualManifest.sourceBuildingId"); text(manifest.sourceSpaceId, "visualManifest.sourceSpaceId");
  literalTrue(manifest.syntheticDemo, "visualManifest.syntheticDemo");
  record(manifest.nodes, "visualManifest.nodes"); record(manifest.views, "visualManifest.views"); record(manifest.visualStates, "visualManifest.visualStates"); record(manifest.evidenceAnchors, "visualManifest.evidenceAnchors");
}
