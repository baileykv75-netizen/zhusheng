import { DIAGNOSTIC_THRESHOLDS } from "./rules.ts";
import type {
  BuildingMemory,
  EvidenceItem,
  EvidenceType,
  Fact,
  FactEvaluation,
  LifeEventInput,
  MissingEvidence,
  SensorObservation
} from "./types.ts";

function latest(items: SensorObservation[]): SensorObservation | undefined {
  return [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).at(-1);
}

function observationReliability(item: SensorObservation | undefined): number {
  if (!item) return 0;
  return item.quality === "GOOD" ? 1 : item.quality === "DEGRADED" ? 0.55 : 0.25;
}

function evidenceByType(input: LifeEventInput, type: EvidenceType): EvidenceItem[] {
  const superseded = new Set(input.evidence.flatMap((item) => item.supersedesId ? [item.supersedesId] : []));
  return input.evidence.filter((item) => item.type === type && !superseded.has(item.id));
}

function presentEvidence(input: LifeEventInput, type: EvidenceType): EvidenceItem[] {
  return evidenceByType(input, type).filter((item) => item.status === "PRESENT");
}

function fact(factId: string, present: boolean, reliability: number, inputRefs: string[], explanation: string): Fact {
  return { factId, present, reliability: Math.max(0, Math.min(1, reliability)), inputRefs: [...new Set(inputRefs)].sort(), explanation };
}

function normalized(value: EvidenceItem["observedValue"]): string {
  return String(value ?? "").trim().toUpperCase();
}

function currentDiagnosticCycle(items: SensorObservation[]): SensorObservation[] {
  const reopened = items.filter((item) => item.id.includes("-REOPEN-"));
  if (!reopened.length) return items;
  const newest = latest(reopened);
  return newest ? [newest] : [];
}

const missingDefinitions: Array<{
  type: EvidenceType;
  reason: string;
  requestedFrom: MissingEvidence["requestedFrom"];
  classes: string[];
}> = [
  { type: "PIPE_INSTALLATION_RECORD", reason: "用于核对接头位置、工序与施工记忆完整性", requestedFrom: "WORKER", classes: ["IfcPipeFitting", "IfcPipeSegment"] },
  { type: "WATERPROOFING_RECORD", reason: "用于比较供水路径与防水路径的相对支持度", requestedFrom: "WORKER", classes: ["IfcCovering"] },
  { type: "CLOSED_WATER_TEST", reason: "用于判断历史防水验收对当前假设的约束", requestedFrom: "PROPERTY", classes: ["IfcCovering"] },
  { type: "RESIDENT_WALL_PHOTO", reason: "用于定位潮湿区域与隐蔽构件的空间关系", requestedFrom: "RESIDENT", classes: ["IfcPipeFitting"] },
  { type: "METER_READING", reason: "用于复核无人用水条件下微流量是否真实存在", requestedFrom: "RESIDENT", classes: ["IfcFlowMeter"] }
];

export function evaluateEvidence(input: LifeEventInput, memory: BuildingMemory): FactEvaluation {
  const humidity = input.observations.filter((item) => item.metric === "RELATIVE_HUMIDITY");
  const microFlow = input.observations.filter((item) => item.metric === "MICRO_FLOW");
  const latestHumidity = latest(humidity);
  const latestMicroFlow = latest(microFlow);

  // Preserve the established first-cycle semantics: isolation and repair observations
  // must not erase the original diagnostic basis. Once a REOPENED assessment creates
  // an explicit REOPEN sensor cycle, however, only the newest REOPEN observation for
  // each metric represents the current second-cycle diagnosis. Historical samples
  // remain immutable in the merged input and audit chain.
  const diagnosticHumidity = currentDiagnosticCycle(humidity);
  const diagnosticMicroFlow = currentDiagnosticCycle(microFlow);
  const humidityAnomaly = diagnosticHumidity.some((item) =>
    item.quality === "GOOD"
    && item.baseline !== undefined
    && item.value >= DIAGNOSTIC_THRESHOLDS.humidity.minimum
    && item.value - item.baseline >= DIAGNOSTIC_THRESHOLDS.humidity.deltaFromBaseline
    && (item.durationMinutes ?? 0) >= DIAGNOSTIC_THRESHOLDS.humidity.durationMinutes
  );
  const microFlowAnomaly = diagnosticMicroFlow.some((item) =>
    item.quality === "GOOD"
    && item.baseline !== undefined
    && item.value - item.baseline >= DIAGNOSTIC_THRESHOLDS.microFlow.deltaFromBaseline
    && (item.durationMinutes ?? 0) >= DIAGNOSTIC_THRESHOLDS.microFlow.durationMinutes
  );
  const microFlowNormal = Boolean(latestMicroFlow)
    && latestMicroFlow!.quality === "GOOD"
    && latestMicroFlow!.baseline !== undefined
    && latestMicroFlow!.value - latestMicroFlow!.baseline < DIAGNOSTIC_THRESHOLDS.microFlow.normalDelta;

  const meterEvidence = evidenceByType(input, "METER_READING");
  const meterSupports = meterEvidence.filter((item) => item.status === "PRESENT" && ["FLOW_CONFIRMED_NO_USE", "MOVING", "INCREASED", "TRUE"].includes(normalized(item.observedValue)));
  const meterNoChange = meterEvidence.filter((item) => item.status === "CONTRADICTORY" || ["NO_CHANGE", "STABLE", "FALSE"].includes(normalized(item.observedValue)));
  const wallPhotos = presentEvidence(input, "RESIDENT_WALL_PHOTO").filter((item) => normalized(item.observedValue) === "MOISTURE_VISIBLE");
  const pipeMemory = presentEvidence(input, "PIPE_INSTALLATION_RECORD");
  const waterproofMemory = presentEvidence(input, "WATERPROOFING_RECORD");
  const closedWater = presentEvidence(input, "CLOSED_WATER_TEST").filter((item) => ["PASS", "PASSED", "QUALIFIED", "TRUE"].includes(normalized(item.observedValue)));
  const isolation = evidenceByType(input, "VALVE_ISOLATION_OBSERVATION");
  const isolationRecovery = isolation.filter((item) => item.status === "PRESENT" && ["FLOW_AND_HUMIDITY_DECREASED", "RECOVERED", "TRUE"].includes(normalized(item.observedValue)));
  const isolationNoRecovery = isolation.filter((item) => item.status === "PRESENT" && ["NO_RECOVERY", "UNCHANGED", "FALSE"].includes(normalized(item.observedValue)));

  const contradictions = microFlowAnomaly && meterNoChange.length
    ? [{ contradictionId: "CONTRADICTION-MICROFLOW-METER", evidenceIds: [...diagnosticMicroFlow.filter((item) => item.baseline !== undefined && item.value > item.baseline).map((item) => item.id), ...meterNoChange.map((item) => item.id)].sort(), explanation: "微流量传感器显示异常，但人工水表观察显示无变化", retestRequired: true }]
    : [];

  const missingEvidence = missingDefinitions.flatMap((definition) => {
    if (presentEvidence(input, definition.type).length) return [];
    const relatedBusinessIds = memory.components
      .filter((item) => item.spaceId === input.spaceId && definition.classes.includes(item.ifcClass))
      .map((item) => item.businessId)
      .sort();
    return [{ evidenceType: definition.type, reason: definition.reason, requestedFrom: definition.requestedFrom, relatedBusinessIds }];
  });
  const criticalMissing = missingEvidence.some((item) => ["METER_READING", "RESIDENT_WALL_PHOTO", "PIPE_INSTALLATION_RECORD"].includes(item.evidenceType));

  const facts: Record<string, Fact> = {
    HUMIDITY_ANOMALY: fact("HUMIDITY_ANOMALY", humidityAnomaly, Math.max(...diagnosticHumidity.map(observationReliability), 0), diagnosticHumidity.map((item) => item.id), "湿度达到持续异常阈值"),
    MICRO_FLOW_ANOMALY: fact("MICRO_FLOW_ANOMALY", microFlowAnomaly, Math.max(...diagnosticMicroFlow.map(observationReliability), 0), diagnosticMicroFlow.map((item) => item.id), "无人用水条件下存在持续微流量"),
    MICRO_FLOW_NORMAL: fact("MICRO_FLOW_NORMAL", microFlowNormal, observationReliability(latestMicroFlow), latestMicroFlow ? [latestMicroFlow.id] : [], "最新微流量处于正常范围"),
    METER_SUPPORTS_FLOW: fact("METER_SUPPORTS_FLOW", Boolean(meterSupports.length), Math.max(...meterSupports.map((item) => item.reliability), 0), meterSupports.map((item) => item.id), "人工水表观察支持持续流量"),
    METER_REPORTS_NO_CHANGE: fact("METER_REPORTS_NO_CHANGE", Boolean(meterNoChange.length), Math.max(...meterNoChange.map((item) => item.reliability), 0), meterNoChange.map((item) => item.id), "人工水表观察未见变化"),
    WALL_PHOTO_PRESENT: fact("WALL_PHOTO_PRESENT", Boolean(wallPhotos.length), Math.max(...wallPhotos.map((item) => item.reliability), 0), wallPhotos.map((item) => item.id), "住户墙面照片可用于定位潮湿区域"),
    PIPE_MEMORY_PRESENT: fact("PIPE_MEMORY_PRESENT", Boolean(pipeMemory.length), Math.max(...pipeMemory.map((item) => item.reliability), 0), pipeMemory.map((item) => item.id), "管线施工记忆存在"),
    WATERPROOFING_MEMORY_PRESENT: fact("WATERPROOFING_MEMORY_PRESENT", Boolean(waterproofMemory.length), Math.max(...waterproofMemory.map((item) => item.reliability), 0), waterproofMemory.map((item) => item.id), "防水施工记忆存在"),
    CLOSED_WATER_TEST_PASS: fact("CLOSED_WATER_TEST_PASS", Boolean(closedWater.length), Math.max(...closedWater.map((item) => item.reliability), 0), closedWater.map((item) => item.id), "历史闭水试验记录为合格"),
    POST_ISOLATION_RECOVERY: fact("POST_ISOLATION_RECOVERY", Boolean(isolationRecovery.length && microFlowNormal), Math.max(...isolationRecovery.map((item) => item.reliability), 0), [...isolationRecovery.map((item) => item.id), ...(latestMicroFlow ? [latestMicroFlow.id] : []), ...(latestHumidity ? [latestHumidity.id] : [])], "授权隔离后的流量和湿度趋势恢复"),
    POST_ISOLATION_NO_RECOVERY: fact("POST_ISOLATION_NO_RECOVERY", Boolean(isolationNoRecovery.length), Math.max(...isolationNoRecovery.map((item) => item.reliability), 0), isolationNoRecovery.map((item) => item.id), "隔离后异常未恢复"),
    EVIDENCE_CONTRADICTION: fact("EVIDENCE_CONTRADICTION", Boolean(contradictions.length), contradictions.length ? 1 : 0, contradictions.flatMap((item) => item.evidenceIds), "存在需要复测的证据矛盾"),
    CRITICAL_EVIDENCE_MISSING: fact("CRITICAL_EVIDENCE_MISSING", criticalMissing, criticalMissing ? 1 : 0, [], "关键定位或复核证据缺失")
  };

  return {
    facts,
    supportingEvidence: [...new Set(Object.values(facts).filter((item) => item.present && !item.factId.includes("CONTRADICTION") && !item.factId.includes("MISSING") && !item.factId.includes("NO_CHANGE")).flatMap((item) => item.inputRefs))].sort(),
    contradictingEvidence: [...new Set(contradictions.flatMap((item) => item.evidenceIds))].sort(),
    contradictions,
    missingEvidence,
    latestHumidity,
    latestMicroFlow
  };
}
