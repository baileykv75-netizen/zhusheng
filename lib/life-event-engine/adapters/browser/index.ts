import { LifeEventEngine } from "../../engine.ts";
import { validateLifeEventContext } from "../../context-validation.ts";
import type { BuildingMemory, EngineClock, VisualManifest } from "../../types.ts";
import { publicAssetPath } from "../../../site-path.ts";

export const LIFE_EVENT_ASSET_ROOT = publicAssetPath("/assets/life-event");

export type AssetIntegrity = {
  schemaVersion: 1;
  syntheticDemo: true;
  files: Record<string, { source: string; sha256: string; bytes: number }>;
};

export type BrowserLifeEventAssets = {
  memory: BuildingMemory;
  manifest: VisualManifest;
  integrity: AssetIntegrity;
  glbUrl: string;
  runtimeTransforms: {
    schemaVersion: 1;
    sceneId: string;
    syntheticDemo: true;
    transforms: Record<string, { translation: [number, number, number]; rotation: [number, number, number, number]; scale: [number, number, number] }>;
  };
};

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("浏览器不支持SHA-256完整性校验");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadVerifiedAsset(
  fetcher: typeof fetch,
  root: string,
  integrity: AssetIntegrity,
  filename: string
): Promise<ArrayBuffer> {
  const descriptor = integrity.files[filename];
  if (!descriptor) throw new Error(`资产完整性清单缺少 ${filename}`);
  const response = await fetcher(`${root}/${filename}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法加载 ${filename}: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== descriptor.bytes) throw new Error(`${filename} 文件大小与事实源不一致`);
  if (await sha256Hex(buffer) !== descriptor.sha256) throw new Error(`${filename} SHA-256与事实源不一致`);
  return buffer;
}

export async function loadBrowserLifeEventAssets(
  fetcher: typeof fetch = fetch,
  root = LIFE_EVENT_ASSET_ROOT
): Promise<BrowserLifeEventAssets> {
  const integrityResponse = await fetcher(`${root}/assets-integrity.json`, { cache: "no-store" });
  if (!integrityResponse.ok) throw new Error(`无法加载资产完整性清单: HTTP ${integrityResponse.status}`);
  const integrity = await integrityResponse.json() as AssetIntegrity;
  if (integrity.schemaVersion !== 1 || integrity.syntheticDemo !== true) throw new Error("资产完整性清单版本无效");
  const [memoryBytes, manifestBytes, , transformBytes] = await Promise.all([
    loadVerifiedAsset(fetcher, root, integrity, "building-memory.seed.json"),
    loadVerifiedAsset(fetcher, root, integrity, "bathroom-1602.manifest.json"),
    loadVerifiedAsset(fetcher, root, integrity, "bathroom-1602.glb"),
    loadVerifiedAsset(fetcher, root, integrity, "bathroom-1602.runtime-transforms.json")
  ]);
  const decoder = new TextDecoder();
  const context = validateLifeEventContext(
    JSON.parse(decoder.decode(memoryBytes)),
    JSON.parse(decoder.decode(manifestBytes))
  );
  const runtimeTransforms = JSON.parse(decoder.decode(transformBytes)) as BrowserLifeEventAssets["runtimeTransforms"];
  if (runtimeTransforms.schemaVersion !== 1 || runtimeTransforms.sceneId !== context.manifest.sceneId || runtimeTransforms.syntheticDemo !== true) {
    throw new Error("运行时变换侧车文件与数字样间不一致");
  }
  for (const node of Object.values(context.manifest.nodes)) {
    if (!runtimeTransforms.transforms[node.nodeName]) throw new Error(`运行时变换缺少节点 ${node.nodeName}`);
  }
  return { ...context, integrity, runtimeTransforms, glbUrl: `${root}/bathroom-1602.glb` };
}

export function createBrowserLifeEventEngine(assets: Pick<BrowserLifeEventAssets, "memory" | "manifest">, clock?: EngineClock) {
  return new LifeEventEngine({ memory: assets.memory, manifest: assets.manifest, clock });
}
