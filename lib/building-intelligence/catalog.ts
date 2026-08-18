import sourcesJson from "../../data/building/1602/sources.json" with { type: "json" };
import spacesJson from "../../data/building/1602/spaces.json" with { type: "json" };
import systemsJson from "../../data/building/1602/systems.json" with { type: "json" };
import componentsJson from "../../data/building/1602/components.json" with { type: "json" };
import portsJson from "../../data/building/1602/ports.json" with { type: "json" };
import connectionsJson from "../../data/building/1602/connections.json" with { type: "json" };
import relationsJson from "../../data/building/1602/spatial-relations.json" with { type: "json" };
import recordsJson from "../../data/building/1602/records.json" with { type: "json" };
import prepFinishMemoryJson from "../../data/building/1602/memory-prep-finish.json" with { type: "json" };
import drainageMemoryJson from "../../data/building/1602/memory-drainage.json" with { type: "json" };
import waterproofingMemoryJson from "../../data/building/1602/memory-waterproofing.json" with { type: "json" };
import waterSupplyMemoryJson from "../../data/building/1602/memory-water-supply.json" with { type: "json" };
import electricalMemoryJson from "../../data/building/1602/memory-electrical.json" with { type: "json" };
import lifecycleMemoryJson from "../../data/building/1602/memory-lifecycle.json" with { type: "json" };
import visualJson from "../../data/building/1602/visual-manifest.json" with { type: "json" };
import type { BuildingIntelligenceDataset } from "./types.ts";

const records = [
  ...(recordsJson as BuildingIntelligenceDataset["records"]),
  ...(prepFinishMemoryJson as BuildingIntelligenceDataset["records"]),
  ...(drainageMemoryJson as BuildingIntelligenceDataset["records"]),
  ...(waterproofingMemoryJson as BuildingIntelligenceDataset["records"]),
  ...(waterSupplyMemoryJson as BuildingIntelligenceDataset["records"]),
  ...(electricalMemoryJson as BuildingIntelligenceDataset["records"]),
  ...(lifecycleMemoryJson as BuildingIntelligenceDataset["records"])
].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.recordId.localeCompare(b.recordId));

export const building1602Dataset: BuildingIntelligenceDataset = {
  datasetId: "ZS-DEMO-001/UNIT-1602/BATHROOM",
  version: "6.6.0-step4-full-memory",
  sources: sourcesJson as BuildingIntelligenceDataset["sources"],
  spaces: spacesJson as BuildingIntelligenceDataset["spaces"],
  systems: systemsJson as BuildingIntelligenceDataset["systems"],
  components: componentsJson as BuildingIntelligenceDataset["components"],
  ports: portsJson as BuildingIntelligenceDataset["ports"],
  connections: connectionsJson as BuildingIntelligenceDataset["connections"],
  spatialRelations: relationsJson as BuildingIntelligenceDataset["spatialRelations"],
  records,
  visualBindings: visualJson as BuildingIntelligenceDataset["visualBindings"]
};

export function allEntities(dataset = building1602Dataset) {
  return [...dataset.spaces, ...dataset.systems, ...dataset.components];
}

export function entityById(businessId: string, dataset = building1602Dataset) {
  return allEntities(dataset).find((entity) => entity.businessId === businessId) ?? null;
}
