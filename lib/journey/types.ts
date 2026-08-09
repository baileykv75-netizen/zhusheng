import type { DemoSnapshot } from "../demo-engine.ts";
import type { GroupReviewState } from "../group-learning/types.ts";
import type { LifeEventState } from "../life-event-engine/types.ts";

export const JOURNEY_STAGES = [
  "REPORT",
  "CONFIRM",
  "MEMORY",
  "DIAGNOSIS",
  "AUTHORIZATION",
  "REPAIR",
  "GROUP_FEEDBACK"
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export type JourneyAction = {
  kind: "NAVIGATE" | "FOCUS_TASK" | "OPEN_DETAILS";
  label: string;
  route?: string;
  focusId?: string;
  actionType: string;
  enabled: boolean;
  blockedReason?: string;
};

export type JourneyView = {
  stage: JourneyStage;
  stageIndex: number;
  headline: string;
  summary: string;
  primaryAction: JourneyAction;
  secondaryActions: JourneyAction[];
  stateLabel: string;
  technicalState?: string;
};

export type AgentJourneyPhase = "IDLE" | "DRAFT" | "DECISION";

export type JourneyInput =
  | { source: "AGENT"; phase: AgentJourneyPhase; lifeEventState?: LifeEventState }
  | { source: "DEMO"; snapshot: Pick<DemoSnapshot, "currentStep" | "workerSubstep" | "incident" | "valve"> }
  | { source: "LIFE_EVENT"; state: LifeEventState }
  | { source: "GROUP"; reviewState: GroupReviewState };
