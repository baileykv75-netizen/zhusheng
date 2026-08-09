import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultGroupLearningSource } from "../lib/group-learning/adapters/node/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "artifacts", "stage4b", "EVT-1602-LAB-001.package.json");
const publicRoot = path.join(root, "public", "assets", "group-learning");
const targetPath = path.join(publicRoot, "EVT-1602-LAB-001.package.json");
const integrityPath = path.join(publicRoot, "assets-integrity.json");
const checkOnly = process.argv.includes("--check");

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

if (!existsSync(sourcePath)) throw new Error(`阶段4B成果包不存在：${sourcePath}`);
const source = readFileSync(sourcePath);
const learning = loadDefaultGroupLearningSource(sourcePath);
if (!learning.sourceVerification.valid) throw new Error("阶段4B成果包未通过集团学习来源验证");
const integrity = {
  schemaVersion: 1,
  syntheticDemo: true,
  sourceEventId: learning.packageValue.eventId,
  sourceFinalState: learning.packageValue.finalState,
  files: {
    "EVT-1602-LAB-001.package.json": {
      source: "artifacts/stage4b/EVT-1602-LAB-001.package.json",
      sha256: sha256(source),
      bytes: source.byteLength
    }
  }
};
const serializedIntegrity = `${JSON.stringify(integrity, null, 2)}\n`;

if (checkOnly) {
  if (!existsSync(targetPath) || !existsSync(integrityPath)) throw new Error("集团学习公开资产尚未同步");
  const target = readFileSync(targetPath);
  if (sha256(target) !== sha256(source) || target.byteLength !== source.byteLength) throw new Error("集团学习公开成果包已过期");
  if (readFileSync(integrityPath, "utf8") !== serializedIntegrity) throw new Error("集团学习资产完整性清单已过期");
  console.log(`GROUP_LEARNING_ASSETS_OK event=${learning.packageValue.eventId} state=${learning.packageValue.finalState}`);
} else {
  mkdirSync(publicRoot, { recursive: true });
  writeFileSync(targetPath, source);
  writeFileSync(integrityPath, serializedIntegrity, "utf8");
  console.log(`GROUP_LEARNING_ASSETS_SYNCED event=${learning.packageValue.eventId} state=${learning.packageValue.finalState}`);
}
