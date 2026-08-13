import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLifeEventEngine, fixedClock } from "../lib/life-event-engine/index.ts";
import { controlsFromTemplate, evaluateControls } from "../lib/life-event-lab/model.ts";
import { LAB_SCHEMA_VERSION, withProductEvidenceDefaults, type LabSession } from "../lib/life-event-lab/types.ts";
import {
  createProductEvidenceAppendix,
  createPropertyEvidenceReview,
  createResidentEvidenceSubmission,
  type ResidentEvidenceDraft
} from "../lib/product/evidence.ts";
import { residentDomainEvidenceRefs, residentEvidenceToDomainControls } from "../lib/product/evidence-adapter.ts";

const now = Date.parse("2026-08-11T09:00:00.000Z");

function residentDraft(): ResidentEvidenceDraft {
  return {
    description: "我家卫生间北侧墙角最近一直很潮。",
    photo: {
      dataClass: "BROWSER_LOCAL",
      fileName: "north-wall.webp",
      mediaType: "image/webp",
      size: 1024,
      finding: "MOISTURE_VISIBLE"
    },
    meterFinding: "FLOW_CONFIRMED_NO_USE"
  };
}

test("an uploaded photo cannot reach domain controls before manual confirmation", () => {
  const draft = residentDraft() as unknown as { photo: { finding: string } };
  draft.photo.finding = "UNCONFIRMED";
  assert.throws(
    () => residentEvidenceToDomainControls(controlsFromTemplate("joint-supported"), draft as unknown as ResidentEvidenceDraft),
    /尚未确认照片观察/
  );
});

test("resident text remains product evidence while confirmed observations use existing domain evidence", () => {
  const controls = residentEvidenceToDomainControls(controlsFromTemplate("joint-supported"), residentDraft());
  const engine = createDefaultLifeEventEngine({ clock: fixedClock("2026-08-11T10:00:00.000Z") });
  const result = evaluateControls(engine, controls, 1, now);
  const refs = residentDomainEvidenceRefs(result);
  const product = createResidentEvidenceSubmission({
    draft: residentDraft(),
    eventId: result.eventId,
    submittedAt: new Date(now).toISOString(),
    domainPhotoEvidenceId: refs.photoEvidenceId,
    domainMeterEvidenceId: refs.meterEvidenceId
  });

  const text = product.evidence.find((item) => item.type === "RESIDENT_TEXT_OBSERVATION")!;
  const photo = product.evidence.find((item) => item.type === "RESIDENT_PHOTO_OBSERVATION")!;
  const meter = product.evidence.find((item) => item.type === "RESIDENT_METER_OBSERVATION")!;
  assert.equal(text.observedValue, residentDraft().description);
  assert.deepEqual(text.domainEvidenceRefs, []);
  assert.deepEqual(photo.domainEvidenceRefs, [refs.photoEvidenceId]);
  assert.deepEqual(meter.domainEvidenceRefs, [refs.meterEvidenceId]);
  assert.equal(result.input.evidence.some((item) => item.type === "RESIDENT_WALL_PHOTO"), true);
  assert.equal(result.input.evidence.some((item) => item.type === "METER_READING"), true);
  assert.equal(result.input.evidence.some((item) => (item.type as string) === "RESIDENT_TEXT_OBSERVATION"), false);
});

test("property review appends an independent product record without superseding resident evidence", () => {
  const product = createResidentEvidenceSubmission({
    draft: residentDraft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: new Date(now).toISOString(),
    domainPhotoEvidenceId: "EVD-PHOTO-LAB-001",
    domainMeterEvidenceId: "EVD-METER-LAB-001"
  });
  const original = structuredClone(product);
  const property = createPropertyEvidenceReview({
    draft: {
      residentSubmissionId: product.submission.submissionId,
      reviewedBy: "PROPERTY-DEMO-01",
      decision: "NEEDS_SITE_CHECK",
      note: "住户证据来源完整，仍需现场检查。"
    },
    eventId: product.submission.eventId,
    reviewedAt: new Date(now + 60_000).toISOString(),
    relatedEvidenceIds: product.submission.evidenceIds,
    sequence: 1
  });

  assert.deepEqual(product, original);
  assert.equal(property.review.residentSubmissionId, product.submission.submissionId);
  assert.deepEqual(property.evidence.relatedEvidenceIds, product.submission.evidenceIds);
  assert.deepEqual(property.evidence.domainEvidenceRefs, []);
  assert.equal(property.evidence.type, "PROPERTY_EVIDENCE_REVIEW");
});

test("V2 sessions accept additive product evidence fields without a schema migration", () => {
  const legacy = {
    schemaVersion: LAB_SCHEMA_VERSION,
    controls: controlsFromTemplate("joint-supported"),
    isolation: { humidity: 58, humidityBaseline: 55, microFlow: 0, microFlowBaseline: 0, durationMinutes: 30 },
    repairDraft: {} as LabSession["repairDraft"],
    postRepair: {} as LabSession["postRepair"],
    eventCounter: 0,
    result: null,
    selectedView: "VIEW_RESIDENT",
    selectedBusinessId: null,
    activeTab: "input",
    notice: null
  } satisfies LabSession;
  const normalized = withProductEvidenceDefaults(legacy);
  assert.equal(normalized.schemaVersion, 2);
  assert.deepEqual(normalized.residentSubmissions, []);
  assert.deepEqual(normalized.propertyReviews, []);
  assert.deepEqual(normalized.productEvidenceTimeline, []);
  assert.equal(normalized.photoObservationConfirmation, "UNCONFIRMED");
});

test("evidence appendix keeps product provenance separate from the verified event package", () => {
  const product = createResidentEvidenceSubmission({
    draft: residentDraft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: new Date(now).toISOString()
  });
  const appendix = createProductEvidenceAppendix({
    eventId: product.submission.eventId,
    generatedAt: new Date(now + 120_000).toISOString(),
    residentSubmissions: [product.submission],
    evidence: product.evidence
  });
  assert.equal(appendix.schemaVersion, 1);
  assert.equal(appendix.evidence.length, 3);
  assert.match(appendix.disclosure, /确定性结论仍以verifiedEventPackage为准/);
});

test("a second resident submission for the same reopened event gets unique immutable product ids", () => {
  const first = createResidentEvidenceSubmission({
    draft: residentDraft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: new Date(now).toISOString(),
    submissionSequence: 1
  });
  const second = createResidentEvidenceSubmission({
    draft: residentDraft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: new Date(now + 60_000).toISOString(),
    submissionSequence: 2
  });
  assert.equal(first.submission.eventId, second.submission.eventId);
  assert.notEqual(first.submission.submissionId, second.submission.submissionId);
  assert.equal(new Set([...first.submission.evidenceIds, ...second.submission.evidenceIds]).size, 6);
  assert.match(second.submission.submissionId, /-R02$/);
});