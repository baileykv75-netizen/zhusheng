export type ProductInformationTier = "PRIMARY" | "SECONDARY" | "PROOF";

export const productInformationHierarchy = {
  property: {
    PRIMARY: ["event", "scene", "assessment", "relevant-memory", "evidence-gap", "next-action"],
    SECONDARY: ["resident-evidence", "property-review", "observations", "repair", "verification"],
    PROOF: ["tool-trace", "facts", "provenance", "audit", "proposal-gate"]
  },
  resident: {
    PRIMARY: ["task", "description", "photo", "photo-confirmation", "meter-confirmation", "authorization"],
    SECONDARY: ["event-progress", "result"],
    PROOF: ["data-disclosure", "evidence-boundary", "audit"]
  },
  worker: {
    PRIMARY: ["capture", "ai-structuring", "human-confirmation", "memory-write"],
    SECONDARY: ["evidence-preview", "building-context"],
    PROOF: ["source-disclosure", "record-provenance"]
  },
  case1602: {
    PRIMARY: ["scene", "timeline-position", "memory-hit", "assessment", "human-gate", "outcome"],
    SECONDARY: ["evidence-chain", "event-route"],
    PROOF: ["facts", "sources", "technical-boundary"]
  },
  events: {
    PRIMARY: ["building-situation", "active-events", "status-summary"],
    SECONDARY: ["event-details", "ownership", "next-work"],
    PROOF: ["demo-depth", "data-disclosure"]
  },
  group: {
    PRIMARY: ["source-event", "experience-candidate", "evidence-coverage", "human-decision"],
    SECONDARY: ["evidence-gaps", "pilot-scope"],
    PROOF: ["synthetic-aggregation", "governance-audit"]
  }
} as const satisfies Record<string, Record<ProductInformationTier, readonly string[]>>;
