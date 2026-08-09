import type { BuildingMemory, MemoryComponent } from "./types.ts";

function components(memory: BuildingMemory) {
  return new Map(memory.components.map((item) => [item.businessId, item]));
}

function requireComponent(memory: BuildingMemory, componentId: string): MemoryComponent {
  const component = components(memory).get(componentId);
  if (!component) throw new RangeError(`Unknown component BusinessId: ${componentId}`);
  return component;
}

function adjacency(memory: BuildingMemory, direction: "upstream" | "downstream") {
  const result = new Map<string, string[]>();
  for (const connection of memory.connections) {
    const from = direction === "upstream" ? connection.toComponentId : connection.fromComponentId;
    const to = direction === "upstream" ? connection.fromComponentId : connection.toComponentId;
    result.set(from, [...(result.get(from) ?? []), to]);
  }
  for (const [key, values] of result) result.set(key, [...new Set(values)].sort());
  return result;
}

function traverse(memory: BuildingMemory, componentId: string, direction: "upstream" | "downstream") {
  requireComponent(memory, componentId);
  const index = components(memory);
  const graph = adjacency(memory, direction);
  const queue = [...(graph.get(componentId) ?? [])];
  const visited = new Set<string>();
  const result: MemoryComponent[] = [];
  while (queue.length) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = index.get(currentId);
    if (!current) throw new Error(`Broken topology: missing component ${currentId}`);
    result.push(current);
    queue.push(...(graph.get(currentId) ?? []));
  }
  return result;
}

export function findComponentsInSpace(memory: BuildingMemory, spaceId: string): MemoryComponent[] {
  if (!memory.spaces.some((space) => space.businessId === spaceId)) throw new RangeError(`Unknown space BusinessId: ${spaceId}`);
  return memory.components.filter((item) => item.spaceId === spaceId).sort((a, b) => a.businessId.localeCompare(b.businessId));
}

export function findUpstreamComponents(memory: BuildingMemory, componentId: string): MemoryComponent[] {
  return traverse(memory, componentId, "upstream");
}

export function findDownstreamComponents(memory: BuildingMemory, componentId: string): MemoryComponent[] {
  return traverse(memory, componentId, "downstream");
}

export function findIsolationValve(memory: BuildingMemory, componentId: string): MemoryComponent | null {
  return findUpstreamComponents(memory, componentId).find((item) => item.ifcClass === "IfcValve") ?? null;
}

export function findRelatedMeters(memory: BuildingMemory, componentId: string): MemoryComponent[] {
  return findUpstreamComponents(memory, componentId).filter((item) => item.ifcClass === "IfcFlowMeter");
}

export function findRelatedSensors(memory: BuildingMemory, componentId: string): MemoryComponent[] {
  const component = requireComponent(memory, componentId);
  return memory.components
    .filter((item) => item.ifcClass === "IfcSensor" && item.spaceId === component.spaceId)
    .sort((a, b) => a.businessId.localeCompare(b.businessId));
}

export function traceSpatialHierarchy(memory: BuildingMemory, componentId: string) {
  const component = requireComponent(memory, componentId);
  for (const businessId of [component.buildingId, component.storeyId, component.unitId, component.spaceId]) {
    if (!memory.identityIndex[businessId]) throw new Error(`Broken spatial hierarchy at ${businessId}`);
  }
  return {
    buildingId: component.buildingId,
    storeyId: component.storeyId,
    unitId: component.unitId,
    spaceId: component.spaceId
  };
}

export function findColdWaterJointCandidates(memory: BuildingMemory, spaceId: string): MemoryComponent[] {
  const coldSystems = new Set(memory.systems.filter((item) => item.systemType === "DOMESTIC_COLD_WATER").map((item) => item.businessId));
  return findComponentsInSpace(memory, spaceId).filter((item) => {
    if (item.ifcClass !== "IfcPipeFitting" || !item.systemId || !coldSystems.has(item.systemId)) return false;
    return Boolean(findIsolationValve(memory, item.businessId) && findRelatedMeters(memory, item.businessId).length);
  });
}
