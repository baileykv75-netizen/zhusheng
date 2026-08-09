export const HYPOTHESES = [
  "COLD_WATER_JOINT_LEAK",
  "WATERPROOFING_FAILURE",
  "CONDENSATION_OR_AMBIENT_HUMIDITY",
  "UNRESOLVED"
] as const;

export type Hypothesis = (typeof HYPOTHESES)[number];
export type ConfidenceLevel = "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH";
export type CandidateConfidence = ConfidenceLevel | "NOT_APPLICABLE";
export const LIFE_EVENT_STATES = [
  "DETECTED",
  "COLLECTING_EVIDENCE",
  "ASSESSED",
  "ACTION_PROPOSED",
  "AUTHORIZATION_PENDING",
  "AUTHORIZED",
  "SIMULATED_ACTION_APPLIED",
  "VERIFYING",
  "ISOLATION_CONFIRMED",
  "REPAIR_PENDING",
  "REPAIR_RECORDED",
  "POST_REPAIR_VERIFYING",
  "RESOLVED",
  "INCONCLUSIVE",
  "REOPENED"
] as const;
export type LifeEventState = (typeof LIFE_EVENT_STATES)[number];

export type SensorObservation = {
  id: string;
  sensorBusinessId: string;
  observedAt: string;
  metric: "RELATIVE_HUMIDITY" | "MICRO_FLOW";
  value: number;
  unit: "%" | "L/min";
  baseline?: number;
  durationMinutes?: number;
  quality: "GOOD" | "DEGRADED" | "UNKNOWN";
  syntheticDemo: true;
};

export type EvidenceType =
  | "PIPE_INSTALLATION_RECORD"
  | "WATERPROOFING_RECORD"
  | "CLOSED_WATER_TEST"
  | "RESIDENT_WALL_PHOTO"
  | "METER_READING"
  | "VALVE_ISOLATION_OBSERVATION"
  | "REPAIR_RESULT";

export type EvidenceItem = {
  id: string;
  type: EvidenceType;
  status: "PRESENT" | "MISSING" | "CONTRADICTORY" | "UNVERIFIED";
  observedValue?: string | number | boolean;
  sourceActor: "WORKER" | "RESIDENT" | "PROPERTY" | "SENSOR" | "SYSTEM";
  relatedBusinessIds: string[];
  capturedAt?: string;
  supersedesId?: string;
  revisionReason?: string;
  actionAuditSequence?: number;
  actionTargetBusinessId?: string;
  relatedObservationIds?: string[];
  reliability: number;
  provenance: string;
  syntheticDemo: true;
};

export type AuthorizationRecord = {
  authorizationId: string;
  eventId: string;
  action: SimulatedAction;
  targetBusinessId: string;
  decision: "APPROVED" | "REJECTED";
  actorType: "RESIDENT" | "PROPERTY";
  actorId: string;
  decidedAt: string;
  reason?: string;
};

export const REPAIR_METHODS = [
  "JOINT_RETIGHTEN",
  "SEAL_REPLACEMENT",
  "JOINT_REPLACEMENT",
  "LOCAL_PIPE_REPLACEMENT",
  "INSPECTION_ONLY"
] as const;

export type RepairMethod = (typeof REPAIR_METHODS)[number];

export type RepairRecord = {
  repairRecordId: string;
  eventId: string;
  targetBusinessId: string;
  method: RepairMethod;
  startedAt: string;
  completedAt: string;
  submittedAt: string;
  crewId: string;
  description: string;
  evidenceBeforeIds: string[];
  evidenceAfterIds: string[];
  result: "COMPLETED" | "INSPECTION_ONLY" | "UNSUCCESSFUL";
  restoreSupplyVerificationRequired: boolean;
  submittedByActorType: "PROPERTY";
  submittedByActorId: string;
  supersedesId?: string;
  revisionReason?: string;
  syntheticDemo: true;
};

export type RepairTask = {
  taskId: string;
  eventId: string;
  building: { businessId: string; displayName: string };
  storey: { businessId: string; displayName: string };
  unit: { businessId: string; displayName: string };
  space: { businessId: string; displayName: string };
  target: { businessId: string; displayName: string; ifcClass: string; ifcGlobalId: string };
  isolationValve: { businessId: string; displayName: string };
  relatedMeterIds: string[];
  relatedSensorIds: string[];
  upstreamComponentIds: string[];
  downstreamComponentIds: string[];
  inspectionLocation: string;
  recommendedScope: string[];
  rawScore: number;
  decisionConfidence: ConfidenceLevel;
  scoreDisclaimer: string;
  evidenceIds: string[];
  safetyRequirements: string[];
  humanAuthorizationRequired: boolean;
  currentState: LifeEventState;
  syntheticDemo: true;
  disclaimer: string;
};

export type LifeEventInput = {
  eventId: string;
  buildingId: "BLD-ZS-DEMO-001";
  spaceId: "SPACE-1602-BATHROOM";
  detectedAt: string;
  evaluatedAt: string;
  observations: SensorObservation[];
  evidence: EvidenceItem[];
  requestedAction?: SimulatedAction;
  authorizationRecords?: AuthorizationRecord[];
  repairRecords?: RepairRecord[];
  syntheticDemo: true;
};

export type MemorySpace = {
  businessId: string;
  displayName: string;
  ifcGlobalId: string;
  parentId: string;
  syntheticDemo: true;
};

export type MemoryComponent = {
  buildingId: string;
  businessId: string;
  displayName: string;
  downstreamIds: string[];
  evidenceTypes: string[];
  humanAuthorizationRequired: boolean;
  ifcClass: string;
  ifcGlobalId: string;
  lifecycleStatus: string;
  spaceId: string;
  storeyId: string;
  syntheticDemo: true;
  systemId: string | null;
  unitId: string;
  upstreamIds: string[];
};

export type MemoryConnection = {
  businessId: string;
  fromComponentId: string;
  toComponentId: string;
  fromPortId: string;
  toPortId: string;
  flowDirection: string;
  ifcGlobalId: string;
};

export type MemorySystem = {
  businessId: string;
  displayName: string;
  ifcClass: string;
  ifcGlobalId: string;
  memberIds: string[];
  syntheticDemo: true;
  systemType: string;
};

export type BuildingMemory = {
  schemaVersion: string;
  buildingId: string;
  disclaimer: string;
  modelStatus: "synthetic_demo";
  spaces: MemorySpace[];
  components: MemoryComponent[];
  systems: MemorySystem[];
  connections: MemoryConnection[];
  identityIndex: Record<string, { displayName: string; ifcClass: string; ifcGlobalId: string }>;
  safetyPolicies: Array<{
    actionClass: string;
    authorizationState: string;
    componentId: string;
    fallbackMode: string;
    humanAuthorizationRequired: boolean;
  }>;
  evidenceRequirements: Array<{ componentId: string; evidenceTypes: string[] }>;
};

export type VisualManifest = {
  sceneId: string;
  sourceBuildingId: string;
  sourceSpaceId: string;
  ifcSchema: string;
  syntheticDemo: true;
  nodes: Record<string, {
    nodeName: string;
    businessId: string | null;
    ifcGlobalId: string | null;
    ifcClass: string;
    interactive: boolean;
    visualOnly: boolean;
    defaultVisible: boolean;
    viewLayers: string[];
    allowedVisualStates: string[];
  }>;
  views: Record<string, {
    camera: string;
    visibleLayers: string[];
    hiddenLayers: string[];
    hiddenNodes: string[];
  }>;
  visualStates: {
    states: string[];
    defaultState: string;
    stateBindings: Record<string, { visibleNodes: string[]; hiddenNodes: string[] }>;
    valvePosition: {
      values: string[];
      default: string;
      authorizationRequired: boolean;
      doesNotGrantAuthorization: boolean;
      nodeName: string;
      transforms: Record<string, { rotationEuler: [number, number, number] }>;
    };
  };
  evidenceAnchors: Record<string, {
    nodeName: string;
    businessId: string;
    relatedBusinessIds: string[];
  }>;
};

export type Fact = {
  factId: string;
  present: boolean;
  reliability: number;
  inputRefs: string[];
  explanation: string;
};

export type FactEvaluation = {
  facts: Record<string, Fact>;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  contradictions: Contradiction[];
  missingEvidence: MissingEvidence[];
  latestHumidity?: SensorObservation;
  latestMicroFlow?: SensorObservation;
};

export type DiagnosticRule = {
  ruleId: string;
  version: string;
  hypothesis: Hypothesis;
  requiredFacts: string[];
  contribution: number;
  explanation: string;
  contradicts?: string[];
};

export type RuleContribution = {
  ruleId: string;
  hypothesis: Hypothesis;
  contribution: number;
  evidenceIds: string[];
  explanation: string;
};

export type HypothesisResult = {
  hypothesis: Hypothesis;
  candidateBusinessIds: string[];
  rawScore: number;
  evidenceCoverage: number;
  gapFromLeader: number;
  confidence: CandidateConfidence;
  contributions: RuleContribution[];
};

export type MissingEvidence = {
  evidenceType: EvidenceType;
  reason: string;
  requestedFrom: "WORKER" | "RESIDENT" | "PROPERTY";
  relatedBusinessIds: string[];
};

export type Contradiction = {
  contradictionId: string;
  evidenceIds: string[];
  explanation: string;
  retestRequired: boolean;
};

export type SimulatedAction = "SIMULATE_CLOSE_VALVE" | "SIMULATE_REOPEN_VALVE";

export type ActionProposal = {
  action: SimulatedAction;
  targetBusinessId: string;
  reason: string;
  authorizationRequired: boolean;
};

export type AuthorizationRequest = {
  action: "REQUEST_HUMAN_AUTHORIZATION";
  requestedAction: SimulatedAction;
  targetBusinessId: string;
};

export type VisualDirective = {
  view: "VIEW_RESIDENT" | "VIEW_DIAGNOSTIC" | "VIEW_CONSTRUCTION_MEMORY" | "VIEW_MAINTENANCE";
  highlightBusinessIds: string[];
  moistureState: "DRY" | "DAMP_LIGHT" | "DAMP_MODERATE" | "DAMP_SEVERE" | "REPAIR_OPEN" | "REPAIRED";
  valvePosition: "OPEN" | "CLOSED";
  evidenceAnchorIds: string[];
  allowedActions: string[];
  authorizationRequired: boolean;
};

export type AuditEvent = {
  sequence: number;
  eventId: string;
  timestamp: string;
  actorType: string;
  actionType: string;
  previousState: LifeEventState;
  nextState: LifeEventState;
  inputRefs: string[];
  evidenceRefs: string[];
  componentRefs: string[];
  ruleIds: string[];
  ruleSetVersion: string;
  memoryVersion: string;
  previousHash: string;
  entryHash: string;
  inputSnapshotHash: string;
  evidenceSnapshotHash: string;
  authorizationRecordIds: string[];
  repairRecordIds: string[];
  actorId?: string;
  decisionOutputHash: string;
  actionTargetBusinessId?: string;
};

export type DecisionSnapshot = {
  eventId: string;
  evaluatedAt: string;
  decisionConfidence: ConfidenceLevel;
  rankedHypotheses: HypothesisResult[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: MissingEvidence[];
  contradictions: Contradiction[];
  proposedActions: ActionProposal[];
  authorizationRequests: AuthorizationRequest[];
  authorizedActions: ActionProposal[];
  completedActions: ActionProposal[];
};

export type LifeEventArtifact = {
  eventId: string;
  inputSnapshots: Record<string, LifeEventInput>;
  evidenceSnapshots: Record<string, EvidenceItem[]>;
  decisionSnapshots: Record<string, DecisionSnapshot>;
  auditLog: AuditEvent[];
  currentState: LifeEventState;
  currentValvePosition: "OPEN" | "CLOSED";
  lastDecisionSnapshotHash: string;
  repairRecords: RepairRecord[];
  syntheticDemo: true;
};

export type TransitionResult =
  | { accepted: true; state: LifeEventState }
  | { accepted: false; state: LifeEventState; reason: string };

export type LifeEventResult = {
  eventId: string;
  state: LifeEventState;
  valvePosition: "OPEN" | "CLOSED";
  rankedHypotheses: HypothesisResult[];
  decisionConfidence: ConfidenceLevel;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: MissingEvidence[];
  contradictions: Contradiction[];
  nextSteps: string[];
  proposedActions: ActionProposal[];
  authorizationRequests: AuthorizationRequest[];
  authorizedActions: ActionProposal[];
  completedActions: ActionProposal[];
  authorizationRequirement: null | {
    action: SimulatedAction;
    targetBusinessId: string;
    status: "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED";
  };
  visualDirective: VisualDirective;
  auditLog: AuditEvent[];
  ruleSetVersion: string;
  memoryVersion: string;
  syntheticDemo: true;
  input: LifeEventInput;
  inputSnapshots: Record<string, LifeEventInput>;
  evidenceSnapshots: Record<string, EvidenceItem[]>;
  decisionSnapshots: Record<string, DecisionSnapshot>;
  lastDecisionSnapshotHash: string;
  repairRecords: RepairRecord[];
};

export type EventMemoryPatch = {
  patchId: string;
  eventId: string;
  spaceId: string;
  candidateBusinessId: string;
  repairedBusinessId: string;
  repairMethod: RepairMethod;
  authorizationActions: SimulatedAction[];
  repairResult: RepairRecord["result"];
  verificationResult: "RECOVERED" | "NOT_RECOVERED";
  evidenceRefs: string[];
  auditRootHash: string;
  reusableExperience: {
    symptomMetrics: SensorObservation["metric"][];
    isolationValveId: string;
    verificationRequirements: string[];
  };
  memoryVersion: string;
  syntheticDemo: true;
  disclaimer: string;
};

export type EventPackageVerification = {
  valid: boolean;
  checkedAt: string;
  checks: Array<{ id: string; passed: boolean; message: string }>;
  replayedState?: LifeEventState;
  replayedValvePosition?: "OPEN" | "CLOSED";
};

export type VerifiedLifeEventPackage = {
  packageVersion: "1.0.0";
  packageId: string;
  eventId: string;
  generatedAt: string;
  eventArtifact: LifeEventArtifact;
  auditLog: AuditEvent[];
  repairTask: RepairTask;
  repairRecords: RepairRecord[];
  authorizationRecords: AuthorizationRecord[];
  postRepairObservations: SensorObservation[];
  finalState: LifeEventState;
  finalValvePosition: "OPEN" | "CLOSED";
  hashes: {
    packagePayload: string;
    auditRoot: string;
    buildingMemory: string;
    visualManifest: string;
    sourceAssets: Record<string, string>;
  };
  ruleSetVersion: string;
  memoryVersion: string;
  eventMemoryPatch: EventMemoryPatch;
  verification: EventPackageVerification;
  syntheticDemo: true;
  disclaimer: string;
};

export type ScenarioDocument = {
  steps: LifeEventInput[];
  description?: string;
  syntheticDemo: true;
};

export type EngineClock = { now(): string };
