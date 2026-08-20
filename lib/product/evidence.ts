export type EvidenceType =
  | "CONSTRUCTION_MEMORY"
  | "MODEL_LOCATOR"
  | "RESIDENT_TEXT_OBSERVATION"
  | "RESIDENT_PHOTO_OBSERVATION"
  | "RESIDENT_METER_OBSERVATION"
  | "PROPERTY_EVIDENCE_REVIEW"
  | "PROPERTY_FIELD_OBSERVATION"
  | "USER_PHOTO"
  | "PROPERTY_PHOTO"
  | "METER_OBSERVATION"
  | "SENSOR_OBSERVATION"
  | "REPAIR_RECORD"
  | "POST_REPAIR_OBSERVATION";

export type EvidenceSource = "BIM_GLTF" | "WORKER" | "RESIDENT" | "PROPERTY" | "AI_GENERATED";

export type ProductEvidenceDataClass = "DEMO_SYNTHETIC" | "BROWSER_LOCAL" | "REAL";
export type ResidentPhotoFinding = "UNCONFIRMED" | "MOISTURE_VISIBLE" | "NO_VISIBLE_MOISTURE" | "UNREADABLE";
export type ResidentMeterFinding = "FLOW_CONFIRMED_NO_USE" | "NO_CHANGE" | "UNREADABLE" | "NOT_REQUESTED";
export type StoredResidentMeterFinding = Exclude<ResidentMeterFinding, "NOT_REQUESTED">;

export type ProductEvidenceRecord = {
  id: string;
  eventId: string;
  spaceId: "SPACE-1602-BATHROOM";
  relatedBusinessIds: string[];
  relatedEvidenceIds: string[];
  type: Extract<EvidenceType,
    | "RESIDENT_TEXT_OBSERVATION"
    | "RESIDENT_PHOTO_OBSERVATION"
    | "RESIDENT_METER_OBSERVATION"
    | "PROPERTY_EVIDENCE_REVIEW"
    | "PROPERTY_FIELD_OBSERVATION"
  >;
  sourceActor: "RESIDENT" | "PROPERTY";
  capturedAt: string;
  dataClass: ProductEvidenceDataClass;
  status: "PRESENT" | "UNVERIFIED";
  observedValue: string;
  disclosure: string;
  domainEvidenceRefs: string[];
  immutable: true;
};

export type ResidentEvidenceSubmission = {
  submissionId: string;
  eventId: string;
  submittedAt: string;
  submittedBy: "DEMO-RESIDENT-1602";
  evidenceIds: string[];
  descriptionEvidenceId: string;
  photoEvidenceId: string;
  meterEvidenceId?: string;
  photoFinding: Exclude<ResidentPhotoFinding, "UNCONFIRMED">;
  meterFinding: StoredResidentMeterFinding;
  meterObservationStatus?: "OBSERVED" | "NOT_REQUESTED";
  domainAdapterStatus?: "DOMAIN_ELIGIBLE" | "PRODUCT_ONLY";
  revisionOfSubmissionId?: string;
  revisionReason?: string;
  immutable: true;
};

export type PropertyEvidenceReview = {
  reviewId: string;
  eventId: string;
  residentSubmissionId: string;
  evidenceId: string;
  reviewedAt: string;
  reviewedBy: string;
  decision: "CONSISTENT" | "NEEDS_SITE_CHECK" | "INCONCLUSIVE";
  note: string;
  immutable: true;
};

export type ResidentEvidenceDraft = {
  description: string;
  photo: {
    dataClass: Extract<ProductEvidenceDataClass, "BROWSER_LOCAL" | "DEMO_SYNTHETIC">;
    fileName?: string;
    mediaType?: string;
    size?: number;
    assetPath?: string;
    finding: Exclude<ResidentPhotoFinding, "UNCONFIRMED">;
  };
  meterFinding: ResidentMeterFinding;
};

export type PropertyReviewDraft = {
  residentSubmissionId: string;
  reviewedBy: string;
  decision: PropertyEvidenceReview["decision"];
  note: string;
};

export type ProductEvidenceAppendix = {
  schemaVersion: 1;
  eventId: string;
  generatedAt: string;
  disclosure: string;
  residentSubmissions: ResidentEvidenceSubmission[];
  propertyReviews: PropertyEvidenceReview[];
  evidence: ProductEvidenceRecord[];
};

export type VerifiedProductEvidenceBundle<TVerifiedPackage> = {
  schemaVersion: 1;
  verifiedEventPackage: TVerifiedPackage;
  evidenceAppendix: ProductEvidenceAppendix;
};

export type BuildingEvidence = {
  id: string;
  eventId: string;
  spaceId: string;
  componentId?: string;
  type: EvidenceType;
  source: EvidenceSource;
  submittedBy: string;
  capturedAt: string;
  dataClass: ProductEvidenceDataClass;
  assetPath?: string;
  disclosure: string;
};

function productEvidenceId(prefix: string, eventId: string, sequence: number) {
  return `${prefix}-${eventId}-${String(sequence).padStart(2, "0")}`;
}

function residentSubmissionId(eventId: string, sequence: number) {
  return sequence === 1
    ? `RES-SUB-${eventId}`
    : `RES-SUB-${eventId}-R${String(sequence).padStart(2, "0")}`;
}

export function createResidentEvidenceSubmission(input: {
  draft: ResidentEvidenceDraft;
  eventId: string;
  submittedAt: string;
  domainPhotoEvidenceId?: string;
  domainMeterEvidenceId?: string;
  submissionSequence?: number;
}): { submission: ResidentEvidenceSubmission; evidence: ProductEvidenceRecord[] } {
  const submissionSequence = Math.max(1, input.submissionSequence ?? 1);
  const cycleSuffix = submissionSequence === 1 ? "" : `-R${String(submissionSequence).padStart(2, "0")}`;
  const productEventKey = `${input.eventId}${cycleSuffix}`;
  const submissionId = residentSubmissionId(input.eventId, submissionSequence);
  const descriptionEvidenceId = productEvidenceId("PROD-RES-TEXT", productEventKey, 1);
  const photoEvidenceId = productEvidenceId("PROD-RES-PHOTO", productEventKey, 2);
  const meterRequested = input.draft.meterFinding !== "NOT_REQUESTED";
  const storedMeterFinding: StoredResidentMeterFinding = input.draft.meterFinding === "NOT_REQUESTED"
    ? "UNREADABLE"
    : input.draft.meterFinding;
  const meterEvidenceId = meterRequested ? productEvidenceId("PROD-RES-METER", productEventKey, 3) : undefined;
  const photoDescription = [
    `人工观察=${input.draft.photo.finding}`,
    input.draft.photo.fileName ? `文件=${input.draft.photo.fileName}` : null,
    input.draft.photo.mediaType ? `类型=${input.draft.photo.mediaType}` : null,
    input.draft.photo.size !== undefined ? `大小=${input.draft.photo.size}` : null,
    input.draft.photo.assetPath ? `演示资产=${input.draft.photo.assetPath}` : null
  ].filter(Boolean).join("；");
  const disclosure = input.draft.photo.dataClass === "DEMO_SYNTHETIC"
    ? "AI生成 · 脱敏合成演示 · 观察结论由住户手工确认"
    : "浏览器本地证据 · 图片不上传服务器 · 观察结论由住户手工确认";
  const evidence: ProductEvidenceRecord[] = [
    {
      id: descriptionEvidenceId,
      eventId: input.eventId,
      spaceId: "SPACE-1602-BATHROOM",
      relatedBusinessIds: ["SPACE-1602-BATHROOM"],
      relatedEvidenceIds: [],
      type: "RESIDENT_TEXT_OBSERVATION",
      sourceActor: "RESIDENT",
      capturedAt: input.submittedAt,
      dataClass: "BROWSER_LOCAL",
      status: "PRESENT",
      observedValue: input.draft.description.trim(),
      disclosure: "住户浏览器本地自然语言原文 · 仅用于来源追踪，不参与诊断评分",
      domainEvidenceRefs: [],
      immutable: true
    },
    {
      id: photoEvidenceId,
      eventId: input.eventId,
      spaceId: "SPACE-1602-BATHROOM",
      relatedBusinessIds: ["WALL-1602-BATHROOM-NORTH", "SPACE-1602-BATHROOM"],
      relatedEvidenceIds: [descriptionEvidenceId],
      type: "RESIDENT_PHOTO_OBSERVATION",
      sourceActor: "RESIDENT",
      capturedAt: input.submittedAt,
      dataClass: input.draft.photo.dataClass,
      status: input.draft.photo.finding === "UNREADABLE" ? "UNVERIFIED" : "PRESENT",
      observedValue: photoDescription,
      disclosure,
      domainEvidenceRefs: input.domainPhotoEvidenceId ? [input.domainPhotoEvidenceId] : [],
      immutable: true
    }
  ];
  if (meterRequested && meterEvidenceId) {
    evidence.push({
      id: meterEvidenceId,
      eventId: input.eventId,
      spaceId: "SPACE-1602-BATHROOM",
      relatedBusinessIds: ["METER-1602-FLOW-01"],
      relatedEvidenceIds: [descriptionEvidenceId],
      type: "RESIDENT_METER_OBSERVATION",
      sourceActor: "RESIDENT",
      capturedAt: input.submittedAt,
      dataClass: "BROWSER_LOCAL",
      status: storedMeterFinding === "UNREADABLE" ? "UNVERIFIED" : "PRESENT",
      observedValue: storedMeterFinding,
      disclosure: "住户浏览器本地人工水表观察",
      domainEvidenceRefs: input.domainMeterEvidenceId ? [input.domainMeterEvidenceId] : [],
      immutable: true
    });
  }
  const revisionOfSubmissionId = submissionSequence > 1
    ? residentSubmissionId(input.eventId, submissionSequence - 1)
    : undefined;
  return {
    submission: {
      submissionId,
      eventId: input.eventId,
      submittedAt: input.submittedAt,
      submittedBy: "DEMO-RESIDENT-1602",
      evidenceIds: evidence.map((item) => item.id),
      descriptionEvidenceId,
      photoEvidenceId,
      ...(meterEvidenceId ? { meterEvidenceId } : {}),
      photoFinding: input.draft.photo.finding,
      meterFinding: storedMeterFinding,
      meterObservationStatus: meterRequested ? "OBSERVED" : "NOT_REQUESTED",
      domainAdapterStatus: input.draft.photo.finding === "MOISTURE_VISIBLE" ? "DOMAIN_ELIGIBLE" : "PRODUCT_ONLY",
      ...(revisionOfSubmissionId ? {
        revisionOfSubmissionId,
        revisionReason: "住户在同一事件中追加新的现场事实；前一Submission保持不可变"
      } : {}),
      immutable: true
    },
    evidence
  };
}

export function createPropertyEvidenceReview(input: {
  draft: PropertyReviewDraft;
  eventId: string;
  reviewedAt: string;
  relatedEvidenceIds: string[];
  sequence: number;
}): { review: PropertyEvidenceReview; evidence: ProductEvidenceRecord } {
  const reviewId = `PROP-REVIEW-${input.eventId}-${String(input.sequence).padStart(2, "0")}`;
  const evidenceId = `${reviewId}-EVIDENCE`;
  return {
    review: {
      reviewId,
      eventId: input.eventId,
      residentSubmissionId: input.draft.residentSubmissionId,
      evidenceId,
      reviewedAt: input.reviewedAt,
      reviewedBy: input.draft.reviewedBy,
      decision: input.draft.decision,
      note: input.draft.note.trim(),
      immutable: true
    },
    evidence: {
      id: evidenceId,
      eventId: input.eventId,
      spaceId: "SPACE-1602-BATHROOM",
      relatedBusinessIds: ["SPACE-1602-BATHROOM", "WALL-1602-BATHROOM-NORTH"],
      relatedEvidenceIds: input.relatedEvidenceIds,
      type: "PROPERTY_EVIDENCE_REVIEW",
      sourceActor: "PROPERTY",
      capturedAt: input.reviewedAt,
      dataClass: "BROWSER_LOCAL",
      status: "PRESENT",
      observedValue: `${input.draft.decision}：${input.draft.note.trim()}`,
      disclosure: "物业浏览器本地独立复核记录 · 不覆盖住户原始证据 · 默认不参与诊断评分",
      domainEvidenceRefs: [],
      immutable: true
    }
  };
}

export function createProductEvidenceAppendix(input: {
  eventId: string;
  residentSubmissions?: ResidentEvidenceSubmission[];
  propertyReviews?: PropertyEvidenceReview[];
  evidence?: ProductEvidenceRecord[];
  generatedAt?: string;
}): ProductEvidenceAppendix {
  return {
    schemaVersion: 1,
    eventId: input.eventId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    disclosure: "本附录记录产品层来源与人工观察；确定性结论仍以verifiedEventPackage为准。",
    residentSubmissions: structuredClone(input.residentSubmissions ?? []),
    propertyReviews: structuredClone(input.propertyReviews ?? []),
    evidence: structuredClone(input.evidence ?? [])
  };
}

export const syntheticEvidenceCatalog: BuildingEvidence[] = [
  {
    id: "SYN-WORKER-PIPE-INSTALL",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "J-1602-CW-03",
    type: "CONSTRUCTION_MEMORY",
    source: "AI_GENERATED",
    submittedBy: "匿名施工记录（脱敏演示）",
    capturedAt: "2025-06-18T09:20:00+08:00",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/demo-evidence/1602-construction-cold-water-joint.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-RESIDENT-NORTH-WALL",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "WALL-1602-BATHROOM-NORTH",
    type: "USER_PHOTO",
    source: "AI_GENERATED",
    submittedBy: "1602住户（脱敏演示）",
    capturedAt: "2026-08-09T08:35:00+08:00",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/demo-evidence/1602-resident-damp-wall.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-RESIDENT-WATER-METER",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "METER-1602-FLOW-01",
    type: "METER_OBSERVATION",
    source: "AI_GENERATED",
    submittedBy: "1602住户（脱敏演示）",
    capturedAt: "2026-08-09T08:42:00+08:00",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/demo-evidence/1602-water-meter-observation.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-PROPERTY-JOINT-INSPECTION",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "J-1602-CW-03",
    type: "PROPERTY_PHOTO",
    source: "AI_GENERATED",
    submittedBy: "物业运行人员（脱敏演示）",
    capturedAt: "2026-08-09T10:25:00+08:00",
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
    submittedBy: "物业维修人员（脱敏演示）",
    capturedAt: "2026-08-09T14:10:00+08:00",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/demo-evidence/1602-repair-open-wall.webp",
    disclosure: "AI生成 · 脱敏合成演示"
  },
  {
    id: "SYN-POST-REPAIR-DRY",
    eventId: "EVT-1602",
    spaceId: "SPACE-1602-BATHROOM",
    componentId: "WALL-1602-BATHROOM-NORTH",
    type: "POST_REPAIR_OBSERVATION",
    source: "AI_GENERATED",
    submittedBy: "物业复验人员（脱敏演示）",
    capturedAt: "2026-08-09T15:20:00+08:00",
    dataClass: "DEMO_SYNTHETIC",
    assetPath: "/assets/demo-evidence/1602-post-repair-wall.webp",
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
