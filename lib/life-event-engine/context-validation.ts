import { assertBuildingMemory, assertVisualManifest } from "./schemas.ts";
import type { BuildingMemory, VisualManifest } from "./types.ts";

export function validateLifeEventContext(memoryValue: unknown, manifestValue: unknown) {
  assertBuildingMemory(memoryValue);
  assertVisualManifest(manifestValue);
  const memory = memoryValue as BuildingMemory;
  const manifest = manifestValue as VisualManifest;
  const componentIds = new Set(memory.components.map((item) => item.businessId));
  for (const connection of memory.connections) {
    if (!componentIds.has(connection.fromComponentId) || !componentIds.has(connection.toComponentId)) {
      throw new Error(`Broken building memory connection: ${connection.businessId}`);
    }
  }
  if (manifest.sourceBuildingId !== memory.buildingId) throw new Error("Manifest and building memory refer to different buildings");
  if (!memory.spaces.some((space) => space.businessId === manifest.sourceSpaceId)) {
    throw new Error(`Manifest source space is absent from building memory: ${manifest.sourceSpaceId}`);
  }
  for (const node of Object.values(manifest.nodes)) {
    if (!node.visualOnly && node.businessId && node.ifcGlobalId && memory.identityIndex[node.businessId]?.ifcGlobalId !== node.ifcGlobalId) {
      throw new Error(`Manifest identity mismatch for ${node.businessId}`);
    }
  }
  return { memory, manifest };
}
