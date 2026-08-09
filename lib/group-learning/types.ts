import type { ConfidenceLevel, RepairMethod, VerifiedLifeEventPackage } from "../life-event-engine/types.ts";

export const GROUP_LEARNING_RULE_VERSION = "ZS-GL-1.0.0";
export const GROUP_LEARNING_SCHEMA_VERSION = 1 as const;

export type ExperienceLevel = "SINGLE_CASE_HYPOTHESIS";
export type GroupReviewDecisionType = "APPROVE_AS_PILOT_CHECK" | "RETURN_FOR_EVIDENCE" | "HOLD_WITHOUT_ADOPTION";
export type GroupReviewState = "PENDING_REVIEW" | "RETURNED_FOR_EVIDENCE" | "HELD_WITHOUT_ADOPTION" | "APPROVED_AS_PILOT";

export type SourceValidationCheck = { id: string; passed: boolean; message: string };
export type GroupSourceVerification = {
  valid: boolean;
  checkedAt: string;
  checks: SourceValidationCheck[];
  packagePayloadHash: string;
};

export type EvidenceChainStage = {
  stageId: "CONSTRUCTION" | "EVENT" | "DIAGNOSIS" | "AUTHORIZATION" | "REPAIR" | "POST_REPAIR" | "MEMORY_PATCH";
  label: string;
  occurredAt: string;
  summary: string;
  referenceIds: string[];
  businessIds: string[];
};

export type WorkerEvidenceContribution = {
  contributionId: string;
  evidenceId: string;
  evidenceType: string;
  constructionProcess: string;
  relatedSpaceIds: string[];
  relatedComponentIds: string[];
  contributorId: string;
  contributorIdentityStatus: "DEMO_ID_NOT_RECORDED";
  usedBy: Array<{
    useType: "DIAGNOSIS" | "REPAIR_TASK" | "MEMORY_PATCH";
    referenceId: string;
    usedAt: string;
  }>;
  locatingContribution: string;
  responsibilityInference: "PROHIBITED";
  contentHash: string;
  syntheticDemo: true;
};

export type GroupLearningCard = {
  schemaVersion: 1;
  cardId: string;
  sourceEventIds: string[];
  sourceEventCount: 1;
  sourcePackageId: string;
  sourcePackageHash: string;
  location: {
    building: { businessId: string; displayName: string };
    storey: { businessId: string; displayName: string };
    unit: { businessId: string; displayName: string };
    space: { businessId: string; displayName: string };
  };
  targetComponent: { businessId: string; displayName: string; ifcClass: string; ifcGlobalId: string };
  originalSymptoms: string[];
  firstDiagnosis: {
    hypothesis: string;
    targetBusinessId: string;
    rawScore: number;
    decisionConfidence: ConfidenceLevel;
    scoreDisclaimer: string;
  };
  actualRepair: {
    repairRecordId: string;
    targetBusinessId: string;
    method: RepairMethod;
    result: string;
    crewId: string;
    completedAt: string;
  };
  postRepairVerification: Array<{
    observationId: string;
    metric: string;
    value: number;
    unit: string;
    quality: string;
    observedAt: string;
  }>;
  constructionEvidenceIds: string[];
  workerRecordIds: string[];
  recommendedChecks: string[];
  applicableScope: string[];
  excludedScope: string[];
  unprovenClaims: string[];
  knownFacts: string[];
  experienceLevel: "SINGLE_CASE_HYPOTHESIS";
  experienceLabel: "单事件待验证经验";
  confidenceBasis: string[];
  initialReviewState: "PENDING_REVIEW";
  ruleVersion: string;
  buildingMemoryVersion: string;
  eventAuditRootHash: string;
  sourceReferenceIds: string[];
  contentHash: string;
  syntheticDemo: true;
  disclaimer: string;
};

export type GroupReviewDecisionInput = {
  decisionId: string;
  cardId: string;
  decisionType: GroupReviewDecisionType;
  reviewerId: string;
  reviewComment: string;
  decidedAt: string;
  evidenceRefs: string[];
  reviewRound?: number;
  resubmission?: GroupReviewResubmission;
};

export type GroupReviewResubmission = {
  resubmissionId: string;
  submittedBy: string;
  submittedAt: string;
  revisionReason: string;
  newEvidence: Array<{
    evidenceId: string;
    summary: string;
    provenance: string;
    syntheticDemo: true;
  }>;
};

export type GroupReviewAuditEntry = Omit<GroupReviewDecisionInput, "reviewRound" | "resubmission"> & {
  reviewRound: number;
  resubmission: GroupReviewResubmission | null;
  sequence: number;
  actorType: "GROUP_REVIEWER";
  previousState: GroupReviewState;
  nextState: GroupReviewState;
  previousHash: string;
  entryHash: string;
};

export type GroupReviewReplay = {
  state: GroupReviewState;
  lastDecision: GroupReviewAuditEntry | null;
  rootHash: string;
};

export type PilotQualityChecklistItem = {
  checklistItemId: string;
  sourceCardId: string;
  sourceEventIds: string[];
  applicableProjectTypes: string[];
  applicableSpaces: string[];
  targetComponentType: string;
  targetBusinessId: string;
  inspectionProcess: string[];
  requiredEvidence: string[];
  passConditions: string[];
  failureHandling: string[];
  status: "PILOT_ONLY";
  reviewerId: string;
  reviewedAt: string;
  reviewDecisionId: string;
  contentHash: string;
  syntheticDemo: true;
  disclaimer: string;
};

export type GroupLearningBundle = {
  bundleVersion: "1.0.0";
  sourcePackage: VerifiedLifeEventPackage;
  sourceVerification: GroupSourceVerification;
  evidenceChain: EvidenceChainStage[];
  card: GroupLearningCard;
  workerContributions: WorkerEvidenceContribution[];
  reviewAudit: GroupReviewAuditEntry[];
  pilotChecklistItem: PilotQualityChecklistItem | null;
  generatedAt: string;
  syntheticDemo: true;
};

export type GroupBundleVerification = {
  valid: boolean;
  checks: SourceValidationCheck[];
  reviewState: GroupReviewState;
  reviewRootHash: string;
};
