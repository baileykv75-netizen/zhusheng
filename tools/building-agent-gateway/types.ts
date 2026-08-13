import { MODEL_READ_ONLY_TOOL_NAMES, type DraftFields } from "../../lib/building-agent/types.ts";

export const MODEL_TASKS = ["INTERPRET_OBSERVATION", "PROPOSE_READ_ONLY_TOOLS", "EXPLAIN_VERIFIED_RESULT"] as const;
export type ModelTask = (typeof MODEL_TASKS)[number];

export const MODEL_READ_ONLY_TOOLS = MODEL_READ_ONLY_TOOL_NAMES;
export type ModelReadOnlyTool = (typeof MODEL_READ_ONLY_TOOLS)[number];

export type InterpretOutput = {
  intent: "QUERY_MEMORY" | "DRAFT_OBSERVATION" | "EXPLAIN_DECISION" | "VIEW_GROUP_LEARNING" | "NAVIGATE_WORKSPACE" | "UNKNOWN";
  fields: {
    spaceId: DraftFields["spaceId"] | null;
    humidity: number | null;
    humidityBaseline: number | null;
    durationMinutes: number | null;
    microFlow: number | null;
    microFlowBaseline: number | null;
    meterFinding: DraftFields["meterFinding"];
    photoFinding: DraftFields["photoFinding"];
    photoPresent: boolean | null;
    dataQuality: DraftFields["dataQuality"];
    sourceActor: DraftFields["sourceActor"];
  };
  inferences: string[];
  uncertainties: string[];
  missingFields: string[];
  proposedTools: ModelReadOnlyTool[];
};

export type ExplainOutput = {
  facts: string[];
  inferences: string[];
  uncertainties: string[];
  missingEvidence: string[];
  sourceRefs: string[];
  nextStep: string;
  safetyNotice: string;
};

export type BuildingAnswerClaim = {
  text: string;
  factIds: string[];
};

export type BuildingAnswerDraft =
  | { claims: BuildingAnswerClaim[] }
  | { clarification: { question: string } };

export type GatewayCallMetadata = {
  task: ModelTask;
  responseId: string;
  model: string;
  calledAt: string;
  requestId: string;
  inputHash: string;
  schemaValid: true;
};

export type GatewaySuccess<T> = {
  ok: true;
  result: T;
  metadata: GatewayCallMetadata;
};

export type GatewayFailure = {
  ok: false;
  error: { type: string; message: string; requestId: string };
};

export type GatewayConfig = {
  apiKey: string;
  model: string;
  host: "127.0.0.1" | "localhost" | "::1";
  port: number;
  allowedOrigins: string[];
  timeoutMs: number;
  maxInputChars: number;
  maxOutputTokens: number;
};
