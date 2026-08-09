import type { EvidenceItem, LifeEventResult, RepairMethod, RepairRecord, SensorObservation, VisualDirective } from "../life-event-engine/types.ts";

export const LAB_SCHEMA_VERSION = 2;
export const LAB_SESSION_KEY = "zhusheng.life-event-lab.v2";

export type LabTemplateId = "joint-supported" | "humidity-only" | "missing-evidence" | "contradictory-evidence";
export type EvidenceStatus = EvidenceItem["status"];

export type LabControls = {
  humidity: { value: number; baseline: number | null; durationMinutes: number; quality: SensorObservation["quality"] };
  microFlow: { value: number; baseline: number | null; durationMinutes: number; quality: SensorObservation["quality"] };
  pipeInstallation: EvidenceStatus;
  waterproofing: EvidenceStatus;
  closedWaterTest: EvidenceStatus;
  residentPhoto: EvidenceStatus;
  photoFinding: "MOISTURE_VISIBLE" | "NO_VISIBLE_MOISTURE" | "UNREADABLE";
  meterReading: EvidenceStatus;
  meterFinding: "FLOW_CONFIRMED_NO_USE" | "NO_CHANGE" | "UNREADABLE";
};

export type LabAuthorizationDraft = {
  actorType: "RESIDENT" | "PROPERTY";
  actorId: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
};

export type IsolationControls = {
  humidity: number;
  humidityBaseline: number;
  microFlow: number;
  microFlowBaseline: number;
  durationMinutes: number;
};

export type RepairDraft = {
  targetBusinessId: string;
  method: RepairMethod;
  startedAt: string;
  completedAt: string;
  crewId: string;
  description: string;
  result: RepairRecord["result"];
  restoreSupplyVerificationRequired: boolean;
};

export type PostRepairControls = {
  humidity: number;
  humidityBaseline: number;
  humidityQuality: SensorObservation["quality"];
  microFlow: number;
  microFlowBaseline: number;
  microFlowQuality: SensorObservation["quality"];
  durationMinutes: number;
  observationNote: string;
};

export type LabSession = {
  schemaVersion: typeof LAB_SCHEMA_VERSION;
  controls: LabControls;
  isolation: IsolationControls;
  repairDraft: RepairDraft;
  postRepair: PostRepairControls;
  eventCounter: number;
  result: LifeEventResult | null;
  selectedView: VisualDirective["view"];
  selectedBusinessId: string | null;
  activeTab: "input" | "diagnosis" | "actions" | "audit";
  notice: string | null;
};
