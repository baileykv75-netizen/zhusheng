import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLifeEventContext } from "../../../life-event-engine/memory-loader.ts";
import type { VerifiedLifeEventPackage } from "../../../life-event-engine/types.ts";
import { createEvidenceChain, createGroupLearningCard, createWorkerContributions } from "../../generator.ts";
import { assertVerifiedGroupLearningSource } from "../../source-validator.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export function loadDefaultGroupLearningSource(packagePath = path.join(root, "artifacts", "stage4b", "EVT-1602-LAB-001.package.json")) {
  const packageValue = JSON.parse(readFileSync(packagePath, "utf8")) as VerifiedLifeEventPackage;
  const { memory } = loadLifeEventContext();
  const sourceVerification = assertVerifiedGroupLearningSource(packageValue, memory);
  return {
    packageValue,
    memory,
    sourceVerification,
    evidenceChain: createEvidenceChain(packageValue),
    card: createGroupLearningCard(packageValue, memory),
    workerContributions: createWorkerContributions(packageValue, memory)
  };
}
