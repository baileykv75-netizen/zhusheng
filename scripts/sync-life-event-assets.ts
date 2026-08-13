import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  sourceBuildingId: string;
  sourceSpaceId: string;
  syntheticDemo: true;
  nodes: Record<string, { nodeName: string; businessId: string | null; ifcGlobalId: string | null; visualOnly: boolean }>;
};

type Memory = {
  buildingId: string;
  modelStatus: "synthetic_demo";
  spaces: Array<{ businessId: string }>;
  identityIndex: Record<string, { ifcGlobalId: string }>;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(repoRoot, "public/assets/life-event");
const checkOnly = process.argv.includes("--check");
const assets = [
  { filename: "bathroom-1602.glb", source: "bim/visual/bathroom-1602.glb" },
  { filename: "bathroom-1602-premium.glb", source: "bim/visual/bathroom-1602-premium.glb" },
  { filename: "bathroom-1602-premium.validation.json", source: "bim/visual/bathroom-1602-premium.validation.json" },
  { filename: "bathroom-1602.manifest.json", source: "bim/visual/bathroom-1602.manifest.json" },
  { filename: "building-memory.seed.json", source: "bim/data/building-memory.seed.json" },
  { filename: "bathroom-1602.runtime-transforms.json", source: "bim/visual/bathroom-1602.runtime-transforms.json" }
] as const;

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function glbNodeNames(buffer: Buffer): Set<string> {
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("bathroom-1602.glb is not a binary glTF file");
  const jsonLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString("ascii", 16, 20);
  if (chunkType !== "JSON") throw new Error("bathroom-1602.glb has no leading JSON chunk");
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/, "")) as { nodes?: Array<{ name?: string }> };
  return new Set((json.nodes ?? []).flatMap((node) => node.name ? [node.name] : []));
}

const assetByName = Object.fromEntries(assets.map((asset) => [asset.filename, asset]));
const manifest = JSON.parse(readFileSync(resolve(repoRoot, assetByName["bathroom-1602.manifest.json"].source), "utf8")) as Manifest;
const memory = JSON.parse(readFileSync(resolve(repoRoot, assetByName["building-memory.seed.json"].source), "utf8")) as Memory;
const runtimeTransforms = JSON.parse(readFileSync(resolve(repoRoot, assetByName["bathroom-1602.runtime-transforms.json"].source), "utf8")) as { sceneId: string; transforms: Record<string, unknown> };
const semanticGlbNames = glbNodeNames(readFileSync(resolve(repoRoot, assetByName["bathroom-1602.glb"].source)));
const premiumGlbNames = glbNodeNames(readFileSync(resolve(repoRoot, assetByName["bathroom-1602-premium.glb"].source)));
const premiumValidation = JSON.parse(readFileSync(resolve(repoRoot, assetByName["bathroom-1602-premium.validation.json"].source), "utf8")) as { passed?: boolean; semanticBaseline?: string; missingCriticalNodes?: string[] };
if (manifest.syntheticDemo !== true || memory.modelStatus !== "synthetic_demo") throw new Error("Only synthetic demo assets may be published");
if (manifest.sourceBuildingId !== memory.buildingId) throw new Error("Manifest building does not match building memory");
if (!memory.spaces.some((space) => space.businessId === manifest.sourceSpaceId)) throw new Error("Manifest space is missing from building memory");
if (runtimeTransforms.sceneId !== "SCENE-1602-BATHROOM") throw new Error("Runtime transforms refer to a different scene");
if (premiumValidation.passed !== true || premiumValidation.semanticBaseline !== "bathroom-1602.glb" || premiumValidation.missingCriticalNodes?.length) {
  throw new Error("Premium visual twin has not passed semantic-baseline validation");
}
for (const node of Object.values(manifest.nodes)) {
  if (!semanticGlbNames.has(node.nodeName)) throw new Error(`Semantic GLB node missing: ${node.nodeName}`);
  if (!premiumGlbNames.has(node.nodeName)) throw new Error(`Premium GLB node missing: ${node.nodeName}`);
  if (!runtimeTransforms.transforms[node.nodeName]) throw new Error(`Runtime transform missing: ${node.nodeName}`);
  if (!node.visualOnly && node.businessId && node.ifcGlobalId !== memory.identityIndex[node.businessId]?.ifcGlobalId) {
    throw new Error(`IFC identity mismatch: ${node.businessId}`);
  }
}

const integrity = {
  schemaVersion: 1 as const,
  syntheticDemo: true as const,
  sourceBuildingId: manifest.sourceBuildingId,
  sourceSpaceId: manifest.sourceSpaceId,
  files: Object.fromEntries(assets.map(({ filename, source }) => {
    const bytes = readFileSync(resolve(repoRoot, source));
    return [filename, { source, sha256: sha256(bytes), bytes: bytes.byteLength }];
  }))
};
const integrityText = `${JSON.stringify(integrity, null, 2)}\n`;

if (checkOnly) {
  for (const { filename } of assets) {
    const published = resolve(publicRoot, filename);
    if (!statSync(published, { throwIfNoEntry: false })) throw new Error(`Public asset missing: ${filename}; run pnpm run sync:life-event-assets`);
    const descriptor = integrity.files[filename];
    const bytes = readFileSync(published);
    if (bytes.byteLength !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) throw new Error(`Public asset is stale: ${filename}`);
  }
  const publishedIntegrity = readFileSync(resolve(publicRoot, "assets-integrity.json"), "utf8");
  if (publishedIntegrity !== integrityText) throw new Error("Public assets-integrity.json is stale");
  console.log(`LIFE_EVENT_ASSETS_OK files=${assets.length} building=${manifest.sourceBuildingId} space=${manifest.sourceSpaceId}`);
} else {
  mkdirSync(publicRoot, { recursive: true });
  for (const { filename, source } of assets) copyFileSync(resolve(repoRoot, source), resolve(publicRoot, filename));
  writeFileSync(resolve(publicRoot, "assets-integrity.json"), integrityText, "utf8");
  console.log(`LIFE_EVENT_ASSETS_SYNCED files=${assets.length} destination=${publicRoot}`);
}
