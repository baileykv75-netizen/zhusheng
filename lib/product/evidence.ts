export type EvidenceType =
  | "CONSTRUCTION_MEMORY"
  | "MODEL_LOCATOR"
  | "USER_PHOTO"
  | "PROPERTY_PHOTO"
  | "METER_OBSERVATION"
  | "SENSOR_OBSERVATION"
  | "REPAIR_RECORD"
  | "POST_REPAIR_OBSERVATION";

export type EvidenceSource = "BIM_GLTF" | "WORKER" | "RESIDENT" | "PROPERTY" | "AI_GENERATED";

export type BuildingEvidence = {
  id: string;
  eventId: string;
  spaceId: string;
  componentId?: string;
  type: EvidenceType;
  source: EvidenceSource;
  submittedBy: string;
  capturedAt: string;
  dataClass: "DEMO_SYNTHETIC" | "BROWSER_LOCAL" | "REAL";
  assetPath?: string;
  disclosure: string;
};

export const syntheticEvidenceCatalog: BuildingEvidence[] = [
  {
    id: "SYN-WORKER-PIPE-INSTALL",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "J-1602-CW-03",
    type: "CONSTRUCTION_MEMORY",
    source: "AI_GENERATED",
    submittedBy: "脱敏演示资产",
    capturedAt: "DEMO_TIME",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/v6/evidence/construction-pipe-install.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-RESIDENT-NORTH-WALL",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "WALL-1602-BATHROOM-NORTH",
    type: "USER_PHOTO",
    source: "AI_GENERATED",
    submittedBy: "脱敏演示资产",
    capturedAt: "DEMO_TIME",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/v6/evidence/resident-north-wall.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-RESIDENT-WATER-METER",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "METER-1602-FLOW-01",
    type: "METER_OBSERVATION",
    source: "AI_GENERATED",
    submittedBy: "脱敏演示资产",
    capturedAt: "DEMO_TIME",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/v6/evidence/water-meter-observation.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-PROPERTY-JOINT-INSPECTION",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "J-1602-CW-03",
    type: "PROPERTY_PHOTO",
    source: "AI_GENERATED",
    submittedBy: "脱敏演示资产",
    capturedAt: "DEMO_TIME",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/v6/evidence/property-joint-inspection.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-REPAIR-RECORD",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "J-1602-CW-03",
    type: "REPAIR_RECORD",
    source: "AI_GENERATED",
    submittedBy: "脱敏演示资产",
    capturedAt: "DEMO_TIME",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/v6/evidence/repair-record.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-POST-REPAIR-DRY",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "WALL-1602-BATHROOM-NORTH",
    type: "POST_REPAIR_OBSERVATION",
    source: "AI_GENERATED",
    submittedBy: "脱敏演示资产",
    capturedAt: "DEMO_TIME",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/v6/evidence/post-repair-dry.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  }
];

export const syntheticEvidenceTimelineIds = [
  "SYN-WORKER-PIPE-INSTALL",
  "SYN-RESIDENT-NORTH-WALL",
  "SYN-RESIDENT-WATER-METER",
  "SYN-REPAIR-RECORD",
  "SYN-POST-REPAIR-DRY"
] as const;
