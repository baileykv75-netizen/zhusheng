export const SOURCE_CLASSES = [
  "IFC_DERIVED",
  "BUILDING_SPEC_DERIVED",
  "EXISTING_BUILDING_MEMORY",
  "SYNTHETIC_ENGINEERING_RECORD",
  "RUNTIME_OBSERVATION"
] as const;

export type SourceClass = (typeof SOURCE_CLASSES)[number];
export type FunctionalConnectionType = "FLUID_FLOW" | "DRAINAGE_FLOW" | "ELECTRICAL_POWER" | "SIGNAL";
export type SpatialPredicate = "BEHIND" | "INSIDE" | "ADJACENT_TO" | "ABOVE" | "BELOW";
export type QueryStatus = "OK" | "NOT_FOUND" | "NOT_RECORDED" | "AMBIGUOUS";
export type TargetEntityResolutionStatus = "RESOLVED" | "NOT_FOUND" | "AMBIGUOUS";

export type Provenance = {
  sourceId: string;
  sourceClass: SourceClass;
  synthetic: boolean;
  note: string;
  fieldOverrides?: Record<string, string>;
};

export type BuildingSource = Provenance & {
  label: string;
  path: string;
};

export type BuildingEntity = {
  businessId: string;
  displayName: string;
  entityType: string;
  spaceId?: string;
  systemId?: string;
  aliases?: string[];
  attributes?: Record<string, string | number | boolean>;
  provenance: Provenance;
};

export type BuildingSystem = BuildingEntity & {
  systemType: "DOMESTIC_COLD_WATER" | "DOMESTIC_HOT_WATER" | "SANITARY_DRAINAGE" | "ELECTRICAL_LIGHTING" | "ENVIRONMENT_MONITORING";
  memberIds: string[];
};

export type BuildingPort = {
  portId: string;
  ownerBusinessId: string;
  medium: "COLD_WATER" | "HOT_WATER" | "WASTE_WATER" | "ELECTRICITY" | "SIGNAL";
  direction: "IN" | "OUT" | "BIDIRECTIONAL";
  provenance: Provenance;
};

export type FunctionalConnection = {
  connectionId: string;
  connectionType: FunctionalConnectionType;
  fromBusinessId: string;
  toBusinessId: string;
  fromPortId?: string;
  toPortId?: string;
  systemId: string;
  provenance: Provenance;
};

export type SpatialRelation = {
  relationId: string;
  subjectBusinessId: string;
  predicate: SpatialPredicate;
  objectBusinessId: string;
  provenance: Provenance;
};

export type BuildingRecord = {
  recordId: string;
  recordType: "CONSTRUCTION" | "INSPECTION" | "MAINTENANCE" | "OBSERVATION";
  subjectBusinessIds: string[];
  title: string;
  occurredAt: string;
  summary: string;
  status: string;
  provenance: Provenance;
};

export type VisualBinding = {
  businessId: string;
  nodeName: string;
  visualKind: "MODEL_NODE" | "RUNTIME_OVERLAY";
  provenance: Provenance;
};

export type BuildingIntelligenceDataset = {
  datasetId: string;
  version: string;
  sources: BuildingSource[];
  spaces: BuildingEntity[];
  systems: BuildingSystem[];
  components: BuildingEntity[];
  ports: BuildingPort[];
  connections: FunctionalConnection[];
  spatialRelations: SpatialRelation[];
  records: BuildingRecord[];
  visualBindings: VisualBinding[];
};

export type BuildingFact = {
  factId: string;
  subjectBusinessId: string;
  predicate: string;
  value: string | number | boolean | string[];
  sourceIds: string[];
  provenance: SourceClass[];
};

export type GroundedBuildingClaim = {
  text: string;
  factIds: string[];
};

export type TargetEntityResolution = {
  status: TargetEntityResolutionStatus;
  mention: string;
  businessIds: string[];
  candidates: Array<{ businessId: string; displayName: string }>;
};

export type BuildingQueryToolName =
  | "find_space"
  | "find_component"
  | "get_component_detail"
  | "get_space_components"
  | "trace_system"
  | "get_upstream"
  | "get_downstream"
  | "get_components_behind_surface"
  | "get_construction_history"
  | "get_inspection_history"
  | "get_maintenance_history"
  | "get_current_observations";

export type BuildingQueryResult<T = unknown> = {
  tool: BuildingQueryToolName;
  status: QueryStatus;
  data: T;
  facts: BuildingFact[];
  sourceIds: string[];
  businessIds: string[];
  candidates?: Array<{ businessId: string; displayName: string }>;
};

export type QueryVisualMode = "FOCUS" | "SYSTEM_TRACE" | "XRAY" | "CONSTRUCTION_MEMORY" | "DIAGNOSTIC";

export type QueryVisualDirective = {
  mode: QueryVisualMode;
  targetBusinessIds: string[];
  revealBusinessIds: string[];
  sourceTool: BuildingQueryToolName;
};

export type BuildingAgentTurnResult = {
  mode: "LIVE_AI" | "LIVE_AI_CLARIFICATION" | "LOCAL_READ_ONLY" | "LIVE_AI_UNAVAILABLE";
  question: string;
  answer: string;
  groundedClaims?: GroundedBuildingClaim[];
  usedFactIds?: string[];
  clarificationQuestion?: string;
  toolTrace: Array<{ tool: BuildingQueryToolName; arguments: Record<string, string>; status: QueryStatus }>;
  facts: BuildingFact[];
  sources: Array<BuildingSource>;
  visualDirective: QueryVisualDirective | null;
  proposedAction?: { type: "CLOSE_VALVE" | "OPEN_VALVE" | "CREATE_INSPECTION_TASK"; authorizationRequired: true };
  selectedBusinessId?: string | null;
  targetEntityResolution?: TargetEntityResolution | null;
};
