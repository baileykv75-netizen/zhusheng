import assert from "node:assert/strict";
import test from "node:test";
import { controlsFromTemplate } from "../lib/life-event-lab/model.ts";
import {
  createPropertyEvidenceReview,
  createResidentEvidenceSubmission,
  type ResidentEvidenceDraft
} from "../lib/product/evidence.ts";
import {
  projectProductEvidenceDomainLinks,
  residentEvidenceToDomainControls
} from "../lib/product/evidence-adapter.ts";
import { residentEvidenceNeedsAssessment } from "../lib/product/resident-assessment.ts";

const capturedAt = "2026-08-20T09:00:00.000Z";

function draft(overrides: Partial<ResidentEvidenceDraft> = {}): ResidentEvidenceDraft {
  return {
    description: "卫生间镜前灯一直闪烁。",
    photo: {
      dataClass: "DEMO_SYNTHETIC",
      assetPath: "/assets/demo-evidence/1602-resident-damp-wall.webp",
      finding: "NO_VISIBLE_MOISTURE"
    },
    meterFinding: "NOT_REQUESTED",
    ...overrides
  };
}

test("a stopped leak branch still persists immutable product evidence without inventing a meter observation", () => {
  const product = createResidentEvidenceSubmission({
    draft: draft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: capturedAt
  });

  assert.equal(product.submission.meterObservationStatus, "NOT_REQUESTED");
  assert.equal(product.submission.meterFinding, "UNREADABLE", "legacy-compatible field must remain non-confirmed when no meter question occurred");
  assert.equal(product.submission.meterEvidenceId, undefined);
  assert.equal(product.submission.domainAdapterStatus, "PRODUCT_ONLY");
  assert.equal(product.evidence.length, 2);
  assert.equal(product.evidence.some((item) => item.type === "RESIDENT_METER_OBSERVATION"), false);

  const text = product.evidence.find((item) => item.type === "RESIDENT_TEXT_OBSERVATION")!;
  const photo = product.evidence.find((item) => item.type === "RESIDENT_PHOTO_OBSERVATION")!;
  assert.equal(text.dataClass, "BROWSER_LOCAL", "typed resident text must not inherit a synthetic photo label");
  assert.equal(photo.dataClass, "DEMO_SYNTHETIC");
});

test("product-only resident facts do not create a pending domain assessment", () => {
  const productOnly = createResidentEvidenceSubmission({
    draft: draft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: capturedAt
  }).submission;

  assert.equal(productOnly.domainAdapterStatus, "PRODUCT_ONLY");
  assert.equal(residentEvidenceNeedsAssessment(null, [productOnly]), false);
});

test("domain-eligible and legacy resident submissions remain assessment eligible", () => {
  const eligible = createResidentEvidenceSubmission({
    draft: draft({
      description: "卫生间北墙可见潮湿。",
      photo: {
        dataClass: "BROWSER_LOCAL",
        fileName: "north-wall.webp",
        mediaType: "image/webp",
        size: 2048,
        finding: "MOISTURE_VISIBLE"
      },
      meterFinding: "UNREADABLE"
    }),
    eventId: "EVT-1602-LAB-001",
    submittedAt: capturedAt
  }).submission;

  assert.equal(eligible.domainAdapterStatus, "DOMAIN_ELIGIBLE");
  assert.equal(residentEvidenceNeedsAssessment(null, [eligible]), true);

  const legacyEligible = { ...eligible, domainAdapterStatus: undefined };
  assert.equal(residentEvidenceNeedsAssessment(null, [legacyEligible]), true, "legacy submissions without adapter metadata must preserve the pre-existing assessment path");
});

test("a later product-only fact cannot hide an earlier unassessed domain-eligible submission", () => {
  const eligible = createResidentEvidenceSubmission({
    draft: draft({
      description: "卫生间北墙可见潮湿。",
      photo: {
        dataClass: "BROWSER_LOCAL",
        fileName: "north-wall.webp",
        mediaType: "image/webp",
        size: 2048,
        finding: "MOISTURE_VISIBLE"
      },
      meterFinding: "UNREADABLE"
    }),
    eventId: "EVT-1602-LAB-001",
    submittedAt: capturedAt,
    submissionSequence: 1
  }).submission;
  const laterProductOnly = createResidentEvidenceSubmission({
    draft: draft({ description: "随后补充：镜前灯仍然闪烁，但没有看到新的潮湿。" }),
    eventId: "EVT-1602-LAB-001",
    submittedAt: "2026-08-20T09:10:00.000Z",
    submissionSequence: 2
  }).submission;

  assert.equal(laterProductOnly.domainAdapterStatus, "PRODUCT_ONLY");
  assert.equal(residentEvidenceNeedsAssessment(null, [eligible, laterProductOnly]), true);
});

test("same-event resident submissions form an explicit revision chain without mutating predecessors", () => {
  const first = createResidentEvidenceSubmission({
    draft: draft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: capturedAt,
    submissionSequence: 1
  });
  const second = createResidentEvidenceSubmission({
    draft: draft({
      description: "随后重新拍摄，墙角确实可见潮湿。",
      photo: { dataClass: "BROWSER_LOCAL", fileName: "wall.webp", mediaType: "image/webp", size: 2048, finding: "MOISTURE_VISIBLE" },
      meterFinding: "UNREADABLE"
    }),
    eventId: "EVT-1602-LAB-001",
    submittedAt: "2026-08-20T09:10:00.000Z",
    submissionSequence: 2
  });

  assert.equal(first.submission.revisionOfSubmissionId, undefined);
  assert.equal(second.submission.revisionOfSubmissionId, first.submission.submissionId);
  assert.match(second.submission.revisionReason ?? "", /前一Submission保持不可变/);
  assert.notEqual(second.submission.submissionId, first.submission.submissionId);
});

test("browser-entered property review remains independent local product evidence", () => {
  const resident = createResidentEvidenceSubmission({
    draft: draft(),
    eventId: "EVT-1602-LAB-001",
    submittedAt: capturedAt
  });
  const review = createPropertyEvidenceReview({
    draft: {
      residentSubmissionId: resident.submission.submissionId,
      reviewedBy: "PROPERTY-DEMO-01",
      decision: "INCONCLUSIVE",
      note: "当前资料不足，保留住户原始提交。"
    },
    eventId: resident.submission.eventId,
    reviewedAt: "2026-08-20T09:20:00.000Z",
    relatedEvidenceIds: resident.submission.evidenceIds,
    sequence: 1
  });

  assert.equal(review.evidence.dataClass, "BROWSER_LOCAL");
  assert.deepEqual(review.evidence.relatedEvidenceIds, resident.submission.evidenceIds);
  assert.deepEqual(review.evidence.domainEvidenceRefs, []);
});

test("domain adapter represents not-requested and unreadable observations without fabricating present evidence", () => {
  const notRequested = residentEvidenceToDomainControls(controlsFromTemplate("joint-supported"), draft());
  assert.equal(notRequested.residentPhoto, "PRESENT");
  assert.equal(notRequested.photoFinding, "NO_VISIBLE_MOISTURE");
  assert.equal(notRequested.meterReading, "MISSING");
  assert.equal(notRequested.meterFinding, "UNREADABLE");

  const unreadable = residentEvidenceToDomainControls(controlsFromTemplate("joint-supported"), draft({
    photo: { dataClass: "BROWSER_LOCAL", fileName: "blur.jpg", mediaType: "image/jpeg", size: 100, finding: "UNREADABLE" }
  }));
  assert.equal(unreadable.residentPhoto, "UNVERIFIED");
});

test("optional legacy product timeline projects safely as empty", () => {
  assert.deepEqual(projectProductEvidenceDomainLinks(undefined, null), []);
});
