import { loadBrowserLifeEventAssets } from "../../../life-event-engine/adapters/browser/index.ts";
import type { VerifiedLifeEventPackage } from "../../../life-event-engine/types.ts";
import { createEvidenceChain, createGroupLearningCard, createWorkerContributions } from "../../generator.ts";
import { assertVerifiedGroupLearningSource } from "../../source-validator.ts";

export const GROUP_LEARNING_ASSET_ROOT = "/assets/group-learning";

export type GroupLearningAssetIntegrity = {
  schemaVersion: 1;
  syntheticDemo: true;
  files: Record<string, { source: string; sha256: string; bytes: number }>;
};

async function buildBrowserGroupLearningSource(packageValue: VerifiedLifeEventPackage, fetcher: typeof fetch, integrity?: GroupLearningAssetIntegrity) {
  const lifeAssets = await loadBrowserLifeEventAssets(fetcher);
  const sourceVerification = assertVerifiedGroupLearningSource(packageValue, lifeAssets.memory);
  return {
    packageValue,
    memory: lifeAssets.memory,
    sourceVerification,
    evidenceChain: createEvidenceChain(packageValue),
    card: createGroupLearningCard(packageValue, lifeAssets.memory),
    workerContributions: createWorkerContributions(packageValue, lifeAssets.memory),
    integrity: integrity ?? null
  };
}

export async function loadBrowserGroupLearningSourceFromPackage(packageValue: VerifiedLifeEventPackage, fetcher: typeof fetch = fetch) {
  return buildBrowserGroupLearningSource(packageValue, fetcher);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("浏览器不支持集团学习资产SHA-256校验");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function loadBrowserGroupLearningSource(fetcher: typeof fetch = fetch, root = GROUP_LEARNING_ASSET_ROOT) {
  const integrityResponse = await fetcher(`${root}/assets-integrity.json`, { cache: "no-store" });
  if (!integrityResponse.ok) throw new Error(`无法加载集团学习资产清单: HTTP ${integrityResponse.status}`);
  const integrity = await integrityResponse.json() as GroupLearningAssetIntegrity;
  if (integrity.schemaVersion !== 1 || integrity.syntheticDemo !== true) throw new Error("集团学习资产清单版本无效");
  const filename = "EVT-1602-LAB-001.package.json";
  const descriptor = integrity.files[filename];
  if (!descriptor) throw new Error(`集团学习资产清单缺少 ${filename}`);
  const response = await fetcher(`${root}/${filename}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法加载阶段4B成果包: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== descriptor.bytes) throw new Error("阶段4B成果包大小与来源不一致");
  if (await sha256Hex(bytes) !== descriptor.sha256) throw new Error("阶段4B成果包SHA-256与来源不一致");
  const packageValue = JSON.parse(new TextDecoder().decode(bytes)) as VerifiedLifeEventPackage;
  return buildBrowserGroupLearningSource(packageValue, fetcher, integrity);
}
