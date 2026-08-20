import assert from "node:assert/strict";
import test from "node:test";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";
import type { ProductEvidenceRecord } from "../lib/product/evidence.ts";
import { derivedDomainEvidenceRefs, projectProductEvidenceDomainLinks } from "../lib/product/evidence-adapter.ts";

const photo: ProductEvidenceRecord = {
  id: "PROD-PHOTO-01",
  eventId: "EVT-1602-LAB-001",
  spaceId: "SPACE-1602-BATHROOM",
  relatedBusinessIds: ["SPACE-1602-BATHROOM"],
  relatedEvidenceIds: [],
  type: "RESIDENT_PHOTO_OBSERVATION",
  sourceActor: "RESIDENT",
  capturedAt: "2026-08-20T01:00:00.000Z",
  dataClass: "DEMO_SYNTHETIC",
  status: "PRESENT",
  observedValue: "人工观察=MOISTURE_VISIBLE",
  disclosure: "test",
  domainEvidenceRefs: [],
  immutable: true
};

const meter: ProductEvidenceRecord = {
  ...photo,
  id: "PROD-METER-01",
  type: "RESIDENT_METER_OBSERVATION",
  observedValue: "FLOW_CONFIRMED_NO_USE"
};

const result = {
  eventId: "EVT-1602-LAB-001",
  input: {
    evidence: [
      { id: "EVD-PHOTO-001", type: "RESIDENT_WALL_PHOTO", sourceActor: "RESIDENT", capturedAt: "2026-08-20T01:01:00.000Z" },
      { id: "EVD-METER-001", type: "METER_READING", sourceActor: "RESIDENT", capturedAt: "2026-08-20T01:01:01.000Z" }
    ]
  }
} as unknown as LifeEventResult;

test("resident product evidence derives the domain evidence created by deterministic evaluation", () => {
  assert.deepEqual(derivedDomainEvidenceRefs(photo, result), ["EVD-PHOTO-001"]);
  assert.deepEqual(derivedDomainEvidenceRefs(meter, result), ["EVD-METER-001"]);
});

test("projection enriches an export copy while leaving immutable source records untouched", () => {
  const source = [photo, meter];
  const before = structuredClone(source);
  const projected = projectProductEvidenceDomainLinks(source, result);

  assert.deepEqual(source, before);
  assert.notEqual(projected[0], source[0]);
  assert.deepEqual(projected[0].domainEvidenceRefs, ["EVD-PHOTO-001"]);
  assert.deepEqual(projected[1].domainEvidenceRefs, ["EVD-METER-001"]);
});
