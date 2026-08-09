import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertBuildingMemory, assertVisualManifest } from "./schemas.ts";
import { validateLifeEventContext } from "./context-validation.ts";
import type { BuildingMemory, VisualManifest } from "./types.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_MEMORY_PATH = resolve(repoRoot, "bim/data/building-memory.seed.json");
export const DEFAULT_MANIFEST_PATH = resolve(repoRoot, "bim/visual/bathroom-1602.manifest.json");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadBuildingMemory(path = DEFAULT_MEMORY_PATH): BuildingMemory {
  const memory = readJson(path);
  assertBuildingMemory(memory);
  const componentIds = new Set(memory.components.map((item) => item.businessId));
  for (const connection of memory.connections) {
    if (!componentIds.has(connection.fromComponentId) || !componentIds.has(connection.toComponentId)) {
      throw new Error(`Broken building memory connection: ${connection.businessId}`);
    }
  }
  return memory;
}

export function loadVisualManifest(path = DEFAULT_MANIFEST_PATH): VisualManifest {
  const manifest = readJson(path);
  assertVisualManifest(manifest);
  return manifest;
}

export function loadLifeEventContext(memoryPath = DEFAULT_MEMORY_PATH, manifestPath = DEFAULT_MANIFEST_PATH) {
  return validateLifeEventContext(loadBuildingMemory(memoryPath), loadVisualManifest(manifestPath));
}
