import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDefaultLifeEventEngine, fixedClock, loadLifeEventContext } from "../lib/life-event-engine/index.ts";
import { loadBrowserLifeEventAssets } from "../lib/life-event-engine/adapters/browser/index.ts";
import type { VisualDirective } from "../lib/life-event-engine/types.ts";
import { attemptUnauthorizedClose, controlsFromTemplate, decideAuthorization, DEFAULT_ISOLATION_CONTROLS, evaluateControls, executeAuthorizedClose, submitIsolationObservation } from "../lib/life-event-lab/model.ts";
import { naturalTransform, resolveScenePlan } from "../lib/life-event-lab/scene-controller.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-07-29T14:00:00.000Z");
const engine = () => createDefaultLifeEventEngine({ clock: fixedClock("2026-07-30T00:00:00.000Z") });
const supported = () => evaluateControls(engine(), controlsFromTemplate("joint-supported"), 1, now);

function runtimeImports(entry: string, visited = new Set<string>()): Set<string> {
  const path = resolve(repoRoot, entry);
  if (visited.has(path)) return visited;
  visited.add(path);
  const source = readFileSync(path, "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  for (const specifier of imports) {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    const base = specifier.startsWith("@/") ? resolve(repoRoot, specifier.slice(2)) : resolve(dirname(path), specifier);
    const candidates = extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
    const candidate = candidates.find((item) => {
      try { readFileSync(item); return true; } catch { return false; }
    });
    if (candidate) runtimeImports(candidate.slice(repoRoot.length + 1), visited);
  }
  return visited;
}

test("resident free-lab client dependency graph excludes Node fs and crypto", () => {
  const paths = runtimeImports("components/life-event/ResidentFreeLab.tsx");
  const content = [...paths].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(content, /node:fs/);
  assert.doesNotMatch(content, /node:crypto/);
  assert.ok([...paths].some((path) => path.replaceAll("\\", "/").endsWith("adapters/browser/index.ts")));
  assert.ok(![...paths].some((path) => path.endsWith("memory-loader.ts")));
});

test("published browser assets match BIM truth-source hashes", () => {
  const integrity = JSON.parse(readFileSync(resolve(repoRoot, "public/assets/life-event/assets-integrity.json"), "utf8")) as { files: Record<string, { source: string; sha256: string; bytes: number }> };
  for (const [filename, descriptor] of Object.entries(integrity.files)) {
    const source = readFileSync(resolve(repoRoot, descriptor.source));
    const published = readFileSync(resolve(repoRoot, "public/assets/life-event", filename));
    assert.equal(published.byteLength, descriptor.bytes);
    assert.equal(createHash("sha256").update(source).digest("hex"), descriptor.sha256);
    assert.deepEqual(published, source);
  }
});

test("browser memory and manifest identities cross-validate", () => {
  const memory = JSON.parse(readFileSync(resolve(repoRoot, "public/assets/life-event/building-memory.seed.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "public/assets/life-event/bathroom-1602.manifest.json"), "utf8"));
  const context = loadLifeEventContext(resolve(repoRoot, "public/assets/life-event/building-memory.seed.json"), resolve(repoRoot, "public/assets/life-event/bathroom-1602.manifest.json"));
  assert.equal(context.memory.buildingId, memory.buildingId);
  assert.equal(context.manifest.sceneId, manifest.sceneId);
});

test("browser adapter verifies every published asset before creating context", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const name = String(input).split("/").at(-1)!;
    try {
      const bytes = readFileSync(resolve(repoRoot, "public/assets/life-event", name));
      return new Response(new Uint8Array(bytes), { status: 200 });
    } catch {
      return new Response("missing", { status: 404 });
    }
  }) as typeof fetch;
  const assets = await loadBrowserLifeEventAssets(fetcher, "/assets/life-event");
  assert.equal(assets.memory.buildingId, "BLD-ZS-DEMO-001");
  assert.equal(assets.manifest.sourceSpaceId, "SPACE-1602-BATHROOM");
  assert.ok(assets.runtimeTransforms.transforms["MESH-PIPE-1602-CW-01"]);
});

test("runtime transform sidecar restores hidden system mesh geometry", () => {
  const runtime = JSON.parse(readFileSync(resolve(repoRoot, "public/assets/life-event/bathroom-1602.runtime-transforms.json"), "utf8")) as { transforms: Record<string, { translation: number[]; scale: number[] }> };
  for (const id of ["MESH-PIPE-1602-CW-01", "J-1602-CW-03", "MESH-VALVE-1602-CW-01-HANDLE"]) {
    const transform = runtime.transforms[id];
    assert.ok(transform, `missing ${id}`);
    assert.notDeepEqual(transform.scale, [0, 0, 0]);
    assert.notDeepEqual(transform.translation, [0, 0, -64]);
  }
});

test("humidity changes facts and visual moisture without UI rules", () => {
  const high = controlsFromTemplate("joint-supported");
  const low = structuredClone(high);
  low.humidity.value = 60;
  const highResult = evaluateControls(engine(), high, 1, now);
  const lowResult = evaluateControls(engine(), low, 2, now);
  assert.equal(highResult.visualDirective.moistureState, "DAMP_MODERATE");
  assert.equal(lowResult.visualDirective.moistureState, "DRY");
});

test("micro-flow changes candidate ordering", () => {
  const wet = evaluateControls(engine(), controlsFromTemplate("joint-supported"), 1, now);
  const ambient = evaluateControls(engine(), controlsFromTemplate("humidity-only"), 2, now);
  assert.equal(wet.rankedHypotheses[0].hypothesis, "COLD_WATER_JOINT_LEAK");
  assert.equal(ambient.rankedHypotheses[0].hypothesis, "CONDENSATION_OR_AMBIENT_HUMIDITY");
});

test("missing photo and meter evidence cannot remain HIGH", () => {
  const result = evaluateControls(engine(), controlsFromTemplate("missing-evidence"), 3, now);
  assert.notEqual(result.decisionConfidence, "HIGH");
  assert.ok(result.missingEvidence.some((item) => item.evidenceType === "METER_READING"));
  assert.ok(result.missingEvidence.some((item) => item.evidenceType === "RESIDENT_WALL_PHOTO"));
});

test("contradictory template reaches INCONCLUSIVE through the engine", () => {
  const result = evaluateControls(engine(), controlsFromTemplate("contradictory-evidence"), 4, now);
  assert.equal(result.state, "INCONCLUSIVE");
  assert.ok(result.contradictions.length > 0);
  assert.deepEqual(result.visualDirective.allowedActions, ["REQUEST_METER_RETEST"]);
});

test("templates only populate controls and share one evaluation entry", () => {
  const source = readFileSync(resolve(repoRoot, "lib/life-event-lab/model.ts"), "utf8");
  assert.doesNotMatch(source, /if\s*\(\s*(scenario|template)/);
  for (const [index, id] of (["joint-supported", "humidity-only", "missing-evidence", "contradictory-evidence"] as const).entries()) {
    assert.doesNotThrow(() => evaluateControls(engine(), controlsFromTemplate(id), index + 1, now));
  }
});

test("resident view hides systems and diagnostic view restores them", () => {
  const { manifest } = loadLifeEventContext();
  const directive: VisualDirective = { view: "VIEW_RESIDENT", highlightBusinessIds: [], moistureState: "DRY", valvePosition: "OPEN", evidenceAnchorIds: [], allowedActions: [], authorizationRequired: false };
  assert.equal(resolveScenePlan(manifest, directive).layerVisibility.SYSTEMS, false);
  assert.equal(resolveScenePlan(manifest, { ...directive, view: "VIEW_DIAGNOSTIC" }).layerVisibility.SYSTEMS, true);
});

test("construction-memory view restores waterproofing and evidence layers", () => {
  const { manifest } = loadLifeEventContext();
  const directive: VisualDirective = { view: "VIEW_CONSTRUCTION_MEMORY", highlightBusinessIds: [], moistureState: "DRY", valvePosition: "OPEN", evidenceAnchorIds: ["EVIDENCE-ANCHOR-WATERPROOF"], allowedActions: [], authorizationRequired: false };
  const plan = resolveScenePlan(manifest, directive);
  assert.equal(plan.layerVisibility.WATERPROOFING, true);
  assert.equal(plan.layerVisibility.EVIDENCE, true);
});

test("export-hidden transforms recover scale and -64 offset exactly once", () => {
  const recovered = naturalTransform({ position: [0, 0, -64], scale: [0, 0, 0], quaternion: [0, 0, 0, 1], visible: true });
  assert.deepEqual(recovered.position, [0, 0, 0]);
  assert.deepEqual(recovered.scale, [1, 1, 1]);
  assert.deepEqual(naturalTransform(recovered), recovered);
});

test("repeated view resolution never accumulates transforms", () => {
  const { manifest } = loadLifeEventContext();
  const directive: VisualDirective = { view: "VIEW_DIAGNOSTIC", highlightBusinessIds: ["J-1602-CW-03"], moistureState: "DAMP_MODERATE", valvePosition: "OPEN", evidenceAnchorIds: [], allowedActions: [], authorizationRequired: true };
  const first = resolveScenePlan(manifest, directive);
  resolveScenePlan(manifest, { ...directive, view: "VIEW_RESIDENT" });
  assert.deepEqual(resolveScenePlan(manifest, directive), first);
});

test("engine highlight IDs and valve transforms exist in GLB manifest", () => {
  const result = supported();
  const { manifest } = loadLifeEventContext();
  result.visualDirective.highlightBusinessIds.forEach((id) => assert.ok(manifest.nodes[id]));
  assert.deepEqual(resolveScenePlan(manifest, result.visualDirective).valveRotation, [0, 0, 0]);
  const closed = resolveScenePlan(manifest, { ...result.visualDirective, valvePosition: "CLOSED" });
  assert.notDeepEqual(closed.valveRotation, [0, 0, 0]);
});

test("unauthorized close is rejected and audited with valve OPEN", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const rejected = attemptUnauthorizedClose(local, pending, now);
  assert.equal(rejected.state, "AUTHORIZATION_PENDING");
  assert.equal(rejected.valvePosition, "OPEN");
  assert.equal(rejected.authorizedActions.length, 0);
  assert.equal(rejected.auditLog.at(-1)?.actionType, "UNAUTHORIZED_ACTION_REJECTED");
});

test("rejected human authorization keeps valve OPEN", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const rejected = decideAuthorization(local, pending, { actorType: "RESIDENT", actorId: "DEMO-R", decision: "REJECTED", reason: "不同意" }, now);
  assert.equal(rejected.valvePosition, "OPEN");
  assert.equal(rejected.state, "AUTHORIZATION_PENDING");
});

test("approval exposes an authorized action but does not close the valve", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const approved = decideAuthorization(local, pending, { actorType: "PROPERTY", actorId: "DEMO-P", decision: "APPROVED", reason: "批准模拟" }, now);
  assert.equal(approved.state, "AUTHORIZED");
  assert.equal(approved.valvePosition, "OPEN");
  assert.deepEqual(approved.authorizedActions.map((item) => item.action), ["SIMULATE_CLOSE_VALVE"]);
});

test("only the explicit execute call closes the valve", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const approved = decideAuthorization(local, pending, { actorType: "RESIDENT", actorId: "DEMO-R", decision: "APPROVED", reason: "批准模拟" }, now);
  const applied = executeAuthorizedClose(local, approved, now);
  assert.equal(applied.state, "VERIFYING");
  assert.equal(applied.valvePosition, "CLOSED");
  assert.equal(applied.authorizedActions.length, 0);
  assert.ok(applied.completedActions.some((item) => item.action === "SIMULATE_CLOSE_VALVE"));
});

test("post-isolation recovery stops at REPAIR_PENDING", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const approved = decideAuthorization(local, pending, { actorType: "RESIDENT", actorId: "DEMO-R", decision: "APPROVED", reason: "批准模拟" }, now);
  const applied = executeAuthorizedClose(local, approved, now);
  const verified = submitIsolationObservation(local, applied, DEFAULT_ISOLATION_CONTROLS, now);
  assert.equal(verified.state, "REPAIR_PENDING");
  assert.equal(verified.valvePosition, "CLOSED");
  assert.notEqual(verified.visualDirective.moistureState, "REPAIRED");
});

test("failed isolation verification reopens and never resolves", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const approved = decideAuthorization(local, pending, { actorType: "PROPERTY", actorId: "DEMO-P", decision: "APPROVED", reason: "批准模拟" }, now);
  const applied = executeAuthorizedClose(local, approved, now);
  const failed = submitIsolationObservation(local, applied, { ...DEFAULT_ISOLATION_CONTROLS, microFlow: 0.06, humidity: 82 }, now);
  assert.equal(failed.state, "REOPENED");
  assert.notEqual(failed.state as string, "RESOLVED");
});

test("legacy stage4A path still stops at REPAIR_PENDING after stage4B extension", () => {
  const local = engine();
  const pending = evaluateControls(local, controlsFromTemplate("joint-supported"), 1, now);
  const approved = decideAuthorization(local, pending, { actorType: "RESIDENT", actorId: "DEMO-R", decision: "APPROVED", reason: "批准模拟" }, now);
  const applied = executeAuthorizedClose(local, approved, now);
  const verified = submitIsolationObservation(local, applied, DEFAULT_ISOLATION_CONTROLS, now);
  assert.equal(verified.state, "REPAIR_PENDING");
  assert.equal(verified.valvePosition, "CLOSED");
  assert.equal(verified.repairRecords.length, 0);
});
