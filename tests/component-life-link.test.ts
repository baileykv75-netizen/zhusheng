import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CASE_1602_PATH,
  componentLifeHref,
  isCase1602Path,
  resolveComponentLifeObjectId
} from "../lib/product/component-life-link.ts";

const providerUrl = new URL("../components/product/BuildingContextProvider.tsx", import.meta.url);
const overlayUrl = new URL("../components/product/ComponentLifeOverlay.tsx", import.meta.url);

const joint = "J-1602-CW-03";

test("component life deep links accept only real objects in the 1602 bathroom dataset", () => {
  assert.equal(CASE_1602_PATH, "/case-1602");
  assert.equal(isCase1602Path("/case-1602"), true);
  assert.equal(isCase1602Path("/case-1602/"), true);
  assert.equal(isCase1602Path("/resident"), false);
  assert.equal(resolveComponentLifeObjectId(joint), joint);
  assert.equal(resolveComponentLifeObjectId("SYS-1602-CW"), null, "system ids are trace targets, not object-life entities");
  assert.equal(resolveComponentLifeObjectId("UNKNOWN-1602-OBJECT"), null);
  assert.equal(resolveComponentLifeObjectId(""), null);
  assert.equal(componentLifeHref(joint), `/case-1602?object=${joint}`);
  assert.equal(componentLifeHref("UNKNOWN-1602-OBJECT"), null);
});

test("shared Building Context owns URL-to-object hydration and object-to-URL synchronization", async () => {
  const provider = await readFile(providerUrl, "utf8");

  assert.match(provider, /useSearchParams/);
  assert.match(provider, /useRouter/);
  assert.match(provider, /resolveComponentLifeObjectId\(objectParam\)/);
  assert.match(provider, /function|syncSelectedObjectUrl/);
  assert.match(provider, /params\.set\("object", nextResolved\)/);
  assert.match(provider, /params\.delete\("object"\)/);
  assert.match(provider, /router\.replace/);
  assert.match(provider, /if \(!requestedObjectId \|\| pendingResidentAssessment\) return/);
  assert.match(provider, /selectedBusinessId: requestedObjectId/);
  assert.match(provider, /setSelectedBusinessId\(value\)/);
  assert.match(provider, /syncSelectedObjectUrl\(value\)/);
  assert.match(provider, /syncSelectedObjectUrl\(target\)/);
  assert.match(provider, /Unknown \/ out-of-space object ids/);
});

test("component life overlay can render directly from the validated object query without inventing event truth", async () => {
  const overlay = await readFile(overlayUrl, "utf8");

  assert.match(overlay, /searchParams\.get\("object"\)/);
  assert.match(overlay, /resolveComponentLifeObjectId/);
  assert.match(overlay, /requestedObjectId \?\? product\.selectedBusinessId/);
  assert.match(overlay, /data-component-life-deep-linked/);
  assert.match(overlay, /componentLifeHref\(life\.entity\.businessId\)/);
  assert.match(overlay, /data-component-life-link/);
  assert.match(overlay, /当前事件身份/);
  assert.match(overlay, /candidateLabels\[life\.candidateStatus\]/);
});
