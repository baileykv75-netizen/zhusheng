import assert from "node:assert/strict";
import test from "node:test";
import type { LifeEventResult } from "../lib/life-event-engine/types.ts";
import type { ProductEvidenceRecord } from "../lib/product/evidence.ts";
import { derivedDomainEvidenceRefs, projectProductEvidenceDomainLinks } from "../lib/product/evidence-adapter.ts";

function productRecord(
  id: string,
  type: "RESIDENT_PHOTO_OBSERVATION" | "RESIDENT_METER_OBSERVATION",
  capturedAt: string
): ProductEvidenceRecord {
  return {
    id,
    eventId: "EVT-1602-LAB-001",
    spaceId: "SPACE-1602-BATHROOM",
    relatedBusinessIds: ["SPACE-1602-BATHROOM"],
    relatedEvidenceIds: [],
    type,
    sourceActor: "RESIDENT",
    capturedAt,
    dataClass: "DEMO_SYNTHETIC",
    status: "PRESENT",
    observedValue: type === "RESIDENT_PHOTO_OBSERVATION" ? "人工观察=MOISTURE_VISIBLE" : "FLOW_CONFIRMED_NO_USE",
    disclosure: "test",
    domainEvidenceRefs: [],
    immutable: true
  };
}

function domainResult(entries: Array<{ id: string; type: "RESIDENT_WALL_PHOTO" | "METER_READING"; capturedAt: string }>) {
  return {
    eventId: "EVT-1602-LAB-001",
    input: {
      evidence: entries.map((entry) => ({ ...entry, sourceActor: "RESIDENT" }))
    }
  } as unknown as LifeEventResult;
}

const t1 = "2026-08-20T01:00:00.000Z";
const t2 = "2026-08-20T01:10:00.000Z";

const photo1 = productRecord("PROD-PHOTO-01", "RESIDENT_PHOTO_OBSERVATION", t1);
const meter1 = productRecord("PROD-METER-01", "RESIDENT_METER_OBSERVATION", t1);
const photo2 = productRecord("PROD-PHOTO-02", "RESIDENT_PHOTO_OBSERVATION", t2);
const meter2 = productRecord("PROD-METER-02", "RESIDENT_METER_OBSERVATION", t2);

const twoCycleResult = domainResult([
  { id: "EVD-PHOTO-001", type: "RESIDENT_WALL_PHOTO", capturedAt: t1 },
  { id: "EVD-METER-001", type: "METER_READING", capturedAt: t1 },
  { id: "EVD-PHOTO-002", type: "RESIDENT_WALL_PHOTO", capturedAt: t2 },
  { id: "EVD-METER-002", type: "METER_READING", capturedAt: t2 }
]);

test("single-record derivation only accepts an exact immutable cycle timestamp", () => {
  assert.deepEqual(derivedDomainEvidenceRefs(photo1, twoCycleResult), ["EVD-PHOTO-001"]);
  assert.deepEqual(derivedDomainEvidenceRefs(meter2, twoCycleResult), ["EVD-METER-002"]);

  const shifted = { ...photo1, capturedAt: "2026-08-20T01:00:01.000Z" };
  assert.deepEqual(derivedDomainEvidenceRefs(shifted, twoCycleResult), []);
});

test("two resident cycles keep first and second product evidence linked to their own domain revisions", () => {
  const source = [photo1, meter1, photo2, meter2];
  const before = structuredClone(source);
  const projected = projectProductEvidenceDomainLinks(source, twoCycleResult);
  const refs = Object.fromEntries(projected.map((record) => [record.id, record.domainEvidenceRefs]));

  assert.deepEqual(source, before);
  assert.ok(projected.every((record, index) => record !== source[index]));
  assert.deepEqual(refs[photo1.id], ["EVD-PHOTO-001"]);
  assert.deepEqual(refs[meter1.id], ["EVD-METER-001"]);
  assert.deepEqual(refs[photo2.id], ["EVD-PHOTO-002"]);
  assert.deepEqual(refs[meter2.id], ["EVD-METER-002"]);
});

test("legacy shifted timestamps recover only by equal-count chronological pairing", () => {
  const legacyResult = domainResult([
    { id: "EVD-PHOTO-OLD-001", type: "RESIDENT_WALL_PHOTO", capturedAt: "2026-08-20T01:01:00.000Z" },
    { id: "EVD-PHOTO-OLD-002", type: "RESIDENT_WALL_PHOTO", capturedAt: "2026-08-20T01:11:00.000Z" },
    { id: "EVD-METER-OLD-001", type: "METER_READING", capturedAt: "2026-08-20T01:01:01.000Z" },
    { id: "EVD-METER-OLD-002", type: "METER_READING", capturedAt: "2026-08-20T01:11:01.000Z" }
  ]);
  const projected = projectProductEvidenceDomainLinks([photo1, meter1, photo2, meter2], legacyResult);
  const refs = Object.fromEntries(projected.map((record) => [record.id, record.domainEvidenceRefs]));

  assert.deepEqual(refs[photo1.id], ["EVD-PHOTO-OLD-001"]);
  assert.deepEqual(refs[photo2.id], ["EVD-PHOTO-OLD-002"]);
  assert.deepEqual(refs[meter1.id], ["EVD-METER-OLD-001"]);
  assert.deepEqual(refs[meter2.id], ["EVD-METER-OLD-002"]);
});

test("mismatched cycle counts stay unlinked instead of borrowing the latest domain evidence", () => {
  const incomplete = domainResult([
    { id: "EVD-PHOTO-ONLY", type: "RESIDENT_WALL_PHOTO", capturedAt: "2026-08-20T01:05:00.000Z" }
  ]);
  const projected = projectProductEvidenceDomainLinks([photo1, photo2], incomplete);

  assert.deepEqual(projected[0].domainEvidenceRefs, []);
  assert.deepEqual(projected[1].domainEvidenceRefs, []);
});
