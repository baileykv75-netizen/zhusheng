import type { LifeEventEngine } from "../life-event-engine/engine.ts";
import type { EvidenceItem, LifeEventInput, LifeEventResult, SensorObservation } from "../life-event-engine/types.ts";
import type { LabControls } from "./types.ts";

const BUILDING_ID = "BLD-ZS-DEMO-001" as const;
const SPACE_ID = "SPACE-1602-BATHROOM" as const;

function latestReopenedAt(previous: LifeEventResult): string | null {
  return [...previous.auditLog].reverse().find((item) => item.nextState === "REOPENED")?.timestamp ?? null;
}

function latestActiveEvidence(previous: LifeEventResult, type: EvidenceItem["type"]): EvidenceItem | null {
  const superseded = new Set(previous.input.evidence.flatMap((item) => item.supersedesId ? [item.supersedesId] : []));
  return previous.input.evidence
    .filter((item) => item.type === type && item.sourceActor === "RESIDENT" && !superseded.has(item.id))
    .sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""))
    .at(-1) ?? null;
}

export function hasFreshEvidenceAfterReopen(
  result: LifeEventResult | null,
  capturedAts: readonly string[]
): boolean {
  if (!capturedAts.length) return false;
  if (result?.state !== "REOPENED") return true;
  const reopenedAt = latestReopenedAt(result);
  if (!reopenedAt) return false;
  const threshold = Date.parse(reopenedAt);
  return capturedAts.some((value) => Date.parse(value) > threshold);
}

function residentEvidence(
  id: string,
  input: Omit<EvidenceItem, "id" | "reliability" | "provenance" | "syntheticDemo">
): EvidenceItem {
  const reliability = input.status === "PRESENT" ? 0.94 : input.status === "CONTRADICTORY" ? 0.9 : input.status === "UNVERIFIED" ? 0.45 : 0.1;
  return {
    id,
    ...input,
    reliability,
    provenance: "STEP 4 事件重新打开后的住户新观察 · 脱敏演示",
    syntheticDemo: true
  };
}

export function resumeReopenedAssessment(
  engine: LifeEventEngine,
  previous: LifeEventResult,
  controls: LabControls,
  nowMs = Date.now()
): LifeEventResult {
  if (previous.state !== "REOPENED") throw new Error("只有 REOPENED 事件才能追加重新检查证据");
  const reopenedAt = latestReopenedAt(previous);
  if (!reopenedAt) throw new Error("REOPENED 事件缺少重新打开审计记录");
  const reopenedMs = Date.parse(reopenedAt);
  const previousEvaluatedMs = Date.parse(previous.input.evaluatedAt);
  const observedMs = Math.max(reopenedMs + 1, previousEvaluatedMs + 1, nowMs - 1_000);
  const evaluatedMs = Math.max(previousEvaluatedMs + 1, observedMs + 1);
  if (evaluatedMs > nowMs) throw new Error("请在事件重新打开后等待新的现场观察再提交");

  const suffix = String(previous.auditLog.length + 1).padStart(3, "0");
  const observedAt = new Date(observedMs).toISOString();
  const evaluatedAt = new Date(evaluatedMs).toISOString();
  const previousPhoto = latestActiveEvidence(previous, "RESIDENT_WALL_PHOTO");
  const previousMeter = latestActiveEvidence(previous, "METER_READING");
  const observations: SensorObservation[] = [
    {
      id: `OBS-HUM-REOPEN-${suffix}`,
      sensorBusinessId: "SENSOR-1602-HUM-01",
      observedAt,
      metric: "RELATIVE_HUMIDITY",
      value: controls.humidity.value,
      unit: "%",
      ...(controls.humidity.baseline === null ? {} : { baseline: controls.humidity.baseline }),
      durationMinutes: controls.humidity.durationMinutes,
      quality: controls.humidity.quality,
      syntheticDemo: true
    },
    {
      id: `OBS-FLOW-REOPEN-${suffix}`,
      sensorBusinessId: "METER-1602-FLOW-01",
      observedAt,
      metric: "MICRO_FLOW",
      value: controls.microFlow.value,
      unit: "L/min",
      ...(controls.microFlow.baseline === null ? {} : { baseline: controls.microFlow.baseline }),
      durationMinutes: controls.microFlow.durationMinutes,
      quality: controls.microFlow.quality,
      syntheticDemo: true
    }
  ];
  const evidence: EvidenceItem[] = [
    residentEvidence(`EVD-PHOTO-REOPEN-${suffix}`, {
      type: "RESIDENT_WALL_PHOTO",
      status: controls.residentPhoto,
      observedValue: controls.photoFinding,
      sourceActor: "RESIDENT",
      relatedBusinessIds: ["WALL-1602-BATHROOM-NORTH", SPACE_ID],
      capturedAt: observedAt,
      ...(previousPhoto ? {
        supersedesId: previousPhoto.id,
        revisionReason: "事件维修后复验失败并重新打开，住户提交了新的墙面现场观察"
      } : {})
    }),
    residentEvidence(`EVD-METER-REOPEN-${suffix}`, {
      type: "METER_READING",
      status: controls.meterReading,
      observedValue: controls.meterFinding,
      sourceActor: "RESIDENT",
      relatedBusinessIds: ["METER-1602-FLOW-01"],
      capturedAt: observedAt,
      ...(previousMeter ? {
        supersedesId: previousMeter.id,
        revisionReason: "事件维修后复验失败并重新打开，住户提交了新的水表现场观察"
      } : {})
    })
  ];
  const input: LifeEventInput = {
    eventId: previous.eventId,
    buildingId: BUILDING_ID,
    spaceId: SPACE_ID,
    detectedAt: previous.input.detectedAt,
    evaluatedAt,
    observations,
    evidence,
    syntheticDemo: true
  };
  return engine.evaluate(input, previous);
}
