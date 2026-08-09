import type { BuildingMemory, LifeEventResult, VisualManifest } from "../life-event-engine/types.ts";
import type { GroupLearningCard, GroupSourceVerification } from "../group-learning/types.ts";

export const BUILDING_AGENT_SCHEMA_VERSION = 1 as const;
export const BUILDING_AGENT_RULE_VERSION = "ZS-BA-1.0.0";
export const BUILDING_AGENT_SESSION_KEY = "zhusheng.building-agent.v1";

export type AgentMode = "deterministic" | "llm-enhanced" | "fallback";
export type AgentIntent = "QUERY_MEMORY" | "DRAFT_OBSERVATION" | "EVALUATE_EVENT" | "EXPLAIN_DECISION" | "VIEW_GROUP_LEARNING" | "NAVIGATE_WORKSPACE" | "UNKNOWN";
export type SpecialistAgent = "建筑记忆智能体" | "品质智能体" | "建筑健康智能体" | "设备动作智能体" | "居住服务智能体" | "集团学习智能体";

export const BUILDING_AGENT_TOOL_NAMES = [
  "query_building_memory", "locate_component", "list_required_evidence", "draft_observation",
  "submit_confirmed_observation", "evaluate_life_event", "explain_decision", "request_human_authorization",
  "generate_repair_task", "verify_event_package", "read_group_learning_card", "verify_group_learning_bundle",
  "navigate_to_workspace"
] as const;
export type BuildingAgentToolName = (typeof BUILDING_AGENT_TOOL_NAMES)[number];

export const MODEL_READ_ONLY_TOOL_NAMES = [
  "query_building_memory", "locate_component", "list_required_evidence", "draft_observation",
  "explain_decision", "verify_event_package", "read_group_learning_card", "verify_group_learning_bundle",
  "navigate_to_workspace"
] as const satisfies readonly BuildingAgentToolName[];
export type ModelReadOnlyToolName = (typeof MODEL_READ_ONLY_TOOL_NAMES)[number];

export type DraftFields = {
  spaceId: "SPACE-1602-BATHROOM";
  humidity: number | null;
  humidityBaseline: number | null;
  durationMinutes: number | null;
  microFlow: number | null;
  microFlowBaseline: number | null;
  meterFinding: "FLOW_CONFIRMED_NO_USE" | "NO_CHANGE" | "UNREADABLE" | null;
  photoFinding: "MOISTURE_VISIBLE" | "NO_VISIBLE_MOISTURE" | "UNREADABLE" | null;
  photoPresent: boolean | null;
  dataQuality: "GOOD" | "DEGRADED" | "UNKNOWN";
  sourceActor: "RESIDENT" | "PROPERTY";
};

export type DraftRevision = {
  revisionId: string;
  revisedAt: string;
  correctedFields: Partial<DraftFields>;
  revisionReason: string;
};

export type ObservationDraft = {
  draftId: string;
  originalText: string;
  extractedFields: DraftFields;
  inferences: string[];
  uncertainties: string[];
  revisions: DraftRevision[];
  status: "DRAFT" | "CONFIRMED";
  createdAt: string;
  confirmedAt?: string;
  syntheticDemo: true;
};

export type ProviderAnalysis = {
  intent: AgentIntent;
  fields: Partial<DraftFields>;
  inferences: string[];
  uncertainties: string[];
  suggestedTools: BuildingAgentToolName[];
};

export type ModelProviderCall = {
  task: "INTERPRET_OBSERVATION" | "PROPOSE_READ_ONLY_TOOLS" | "EXPLAIN_VERIFIED_RESULT";
  status: "SUCCEEDED" | "REJECTED" | "FAILED";
  model?: string;
  responseId?: string;
  requestId?: string;
  calledAt: string;
  schemaValid: boolean;
  errorType?: string;
  errorSummary?: string;
};

export type ProviderExplanation = {
  facts: string[];
  inferences: string[];
  uncertainties: string[];
  missingEvidence: string[];
  sourceRefs: string[];
  nextStep: string;
  safetyNotice: string;
};

export type BuildingAgentProvider = {
  name: string;
  mode: "deterministic" | "llm-enhanced";
  analyze(input: string): Promise<ProviderAnalysis>;
  explainVerifiedResult?(result: LifeEventResult): Promise<ProviderExplanation>;
  beginTurn?(): void;
  getCallHistory?(): ModelProviderCall[];
};

export type ModelEnhancementTrace = {
  provider: string;
  suggestedTools: BuildingAgentToolName[];
  locallyApprovedTools: BuildingAgentToolName[];
  executedSuggestedTools: BuildingAgentToolName[];
  rejectedTools: BuildingAgentToolName[];
  calls: ModelProviderCall[];
  explanation?: ProviderExplanation;
};

export type SourceRef = { businessId: string; label: string; sourceType: "BUILDING_MEMORY" | "LIFE_EVENT" | "EVENT_PACKAGE" | "GROUP_LEARNING" };
export type AgentToolCall = {
  callId: string;
  toolName: BuildingAgentToolName;
  specialistAgent: SpecialistAgent;
  inputSummary: string;
  outputSummary: string;
  sourceRefs: string[];
  status: "SUCCEEDED" | "REJECTED";
  occurredAt: string;
};

export type AgentResponse = {
  mode: AgentMode;
  intent: AgentIntent;
  facts: string[];
  inferences: string[];
  uncertainties: string[];
  missingEvidence: string[];
  toolCalls: AgentToolCall[];
  sourceRefs: SourceRef[];
  proposedNextAction: { label: string; route?: "/worker" | "/resident" | "/group" } | null;
  requiresHumanConfirmation: boolean;
  safetyNotice: string;
  specialistAgents: SpecialistAgent[];
  traceId: string;
  decision?: LifeEventResult;
  fallbackReason?: string;
  modelEnhancement?: ModelEnhancementTrace;
};

export type AgentTraceEntry = {
  sequence: number;
  traceId: string;
  sessionId: string;
  timestamp: string;
  mode: AgentMode;
  actionType: "INPUT_ANALYZED" | "DRAFT_CONFIRMED" | "TOOLS_EXECUTED" | "RESPONSE_COMPOSED" | "SESSION_RESET";
  userInputSummary: string;
  intent: AgentIntent;
  toolCalls: AgentToolCall[];
  sourceRefs: string[];
  userConfirmation: boolean;
  fallbackReason?: string;
  modelEnhancement?: ModelEnhancementTrace;
  responseSummary: string;
  previousHash: string;
  entryHash: string;
};

export type AgentSession = {
  schemaVersion: 1;
  sessionId: string;
  mode: AgentMode;
  input: string;
  draft: ObservationDraft | null;
  draftEdits: DraftFields | null;
  revisionReason: string;
  response: AgentResponse | null;
  traceLog: AgentTraceEntry[];
  selectedExample: boolean;
};

export type BuildingAgentContext = {
  memory: BuildingMemory;
  manifest: VisualManifest;
  engine: { evaluate: (...args: Parameters<import("../life-event-engine/engine.ts").LifeEventEngine["evaluate"]>) => LifeEventResult; memory: BuildingMemory };
  groupSource?: {
    card: GroupLearningCard;
    sourceVerification: GroupSourceVerification;
    packageValue: import("../life-event-engine/types.ts").VerifiedLifeEventPackage;
  };
};
