import { allEntities, building1602Dataset, entityById } from "./catalog.ts";
import type { BuildingEntity, BuildingFact, BuildingIntelligenceDataset, BuildingQueryResult, BuildingQueryToolName, BuildingRecord } from "./types.ts";

const stable = <T extends { businessId?: string; recordId?: string }>(items: T[]) => [...items].sort((a, b) => String(a.businessId ?? a.recordId).localeCompare(String(b.businessId ?? b.recordId)));

function factsForEntities(entities: BuildingEntity[], predicate = "displayName"): BuildingFact[] {
  return entities.map((entity) => ({
    factId: `${entity.businessId}:${predicate}`,
    subjectBusinessId: entity.businessId,
    predicate,
    value: predicate === "displayName" ? entity.displayName : String(entity.attributes?.[predicate] ?? ""),
    sourceIds: [entity.provenance.sourceId],
    provenance: [entity.provenance.sourceClass]
  }));
}

function result<T>(tool: BuildingQueryToolName, status: BuildingQueryResult["status"], data: T, facts: BuildingFact[], businessIds: string[], candidates?: BuildingQueryResult["candidates"]): BuildingQueryResult<T> {
  return { tool, status, data, facts, sourceIds: [...new Set(facts.flatMap((fact) => fact.sourceIds))].sort(), businessIds: [...new Set(businessIds)].sort(), ...(candidates ? { candidates } : {}) };
}

function matchEntities(query: string, type?: string, dataset = building1602Dataset) {
  const normalized = query.trim().toLocaleLowerCase();
  return allEntities(dataset).filter((entity) => (!type || entity.entityType === type) && [entity.businessId, entity.displayName, ...(entity.aliases ?? [])].some((name) => name.toLocaleLowerCase().includes(normalized) || normalized.includes(name.toLocaleLowerCase())));
}

export function findSpace(query: string, dataset = building1602Dataset) {
  const matches = stable(matchEntities(query, "SPACE", dataset));
  return matches.length === 0 ? result("find_space", "NOT_FOUND", [], [], []) : matches.length > 1 ? result("find_space", "AMBIGUOUS", [], [], [], matches.map(({ businessId, displayName }) => ({ businessId, displayName }))) : result("find_space", "OK", matches, factsForEntities(matches), matches.map((item) => item.businessId));
}

export function findComponent(query: string, dataset = building1602Dataset) {
  const matches = stable(matchEntities(query, undefined, dataset).filter((item) => item.entityType !== "SPACE" && item.entityType !== "SYSTEM"));
  return matches.length === 0 ? result("find_component", "NOT_FOUND", [], [], []) : matches.length > 6 ? result("find_component", "AMBIGUOUS", [], [], [], matches.map(({ businessId, displayName }) => ({ businessId, displayName }))) : result("find_component", "OK", matches, factsForEntities(matches), matches.map((item) => item.businessId));
}

export function getComponentDetail(businessId: string, dataset = building1602Dataset) {
  const entity = entityById(businessId, dataset);
  if (!entity) return result("get_component_detail", "NOT_FOUND", null, [], []);
  const facts: BuildingFact[] = factsForEntities([entity]);
  facts.push({ factId: `${businessId}:entityType`, subjectBusinessId: businessId, predicate: "entityType", value: entity.entityType, sourceIds: [entity.provenance.sourceId], provenance: [entity.provenance.sourceClass] });
  if (entity.systemId) facts.push({ factId: `${businessId}:systemId`, subjectBusinessId: businessId, predicate: "belongsToSystem", value: entity.systemId, sourceIds: [entity.provenance.sourceId], provenance: [entity.provenance.sourceClass] });
  return result("get_component_detail", "OK", entity, facts, [businessId, ...(entity.systemId ? [entity.systemId] : [])]);
}

export function getSpaceComponents(spaceId: string, dataset = building1602Dataset) {
  const items = stable(dataset.components.filter((item) => item.spaceId === spaceId));
  return items.length ? result("get_space_components", "OK", items, factsForEntities(items), items.map((item) => item.businessId)) : result("get_space_components", entityById(spaceId, dataset) ? "NOT_RECORDED" : "NOT_FOUND", [], [], []);
}

export function traceSystem(systemId: string, dataset = building1602Dataset) {
  const system = dataset.systems.find((item) => item.businessId === systemId);
  if (!system) return result("trace_system", "NOT_FOUND", null, [], []);
  const connections = stable(dataset.connections.filter((item) => item.systemId === systemId) as Array<typeof dataset.connections[number] & { businessId: string }>).map(({ businessId: _, ...item }) => item);
  const members = stable(dataset.components.filter((item) => system.memberIds.includes(item.businessId)));
  const facts = factsForEntities(members);
  facts.unshift({ factId: `${systemId}:systemType`, subjectBusinessId: systemId, predicate: "systemType", value: system.systemType, sourceIds: [system.provenance.sourceId], provenance: [system.provenance.sourceClass] });
  for (const connection of connections) facts.push({ factId: connection.connectionId, subjectBusinessId: connection.fromBusinessId, predicate: connection.connectionType, value: connection.toBusinessId, sourceIds: [connection.provenance.sourceId], provenance: [connection.provenance.sourceClass] });
  return result("trace_system", "OK", { system, members, connections }, facts, [systemId, ...system.memberIds]);
}

function connected(direction: "upstream" | "downstream", businessId: string, dataset = building1602Dataset) {
  const tool = direction === "upstream" ? "get_upstream" : "get_downstream";
  const connections = dataset.connections.filter((item) => direction === "upstream" ? item.toBusinessId === businessId : item.fromBusinessId === businessId);
  if (!entityById(businessId, dataset)) return result(tool, "NOT_FOUND", [], [], []);
  if (!connections.length) return result(tool, "NOT_RECORDED", [], [], []);
  const ids = connections.map((item) => direction === "upstream" ? item.fromBusinessId : item.toBusinessId);
  const entities = stable(dataset.components.filter((item) => ids.includes(item.businessId)));
  const facts = connections.map((connection) => ({ factId: connection.connectionId, subjectBusinessId: connection.fromBusinessId, predicate: connection.connectionType, value: connection.toBusinessId, sourceIds: [connection.provenance.sourceId], provenance: [connection.provenance.sourceClass] } satisfies BuildingFact));
  return result(tool, "OK", entities, facts, ids);
}

export const getUpstream = (businessId: string, dataset = building1602Dataset) => connected("upstream", businessId, dataset);
export const getDownstream = (businessId: string, dataset = building1602Dataset) => connected("downstream", businessId, dataset);

export function getComponentsBehindSurface(surfaceBusinessId: string, dataset = building1602Dataset) {
  if (!entityById(surfaceBusinessId, dataset)) return result("get_components_behind_surface", "NOT_FOUND", [], [], []);
  const relations = dataset.spatialRelations.filter((item) => item.predicate === "BEHIND" && item.objectBusinessId === surfaceBusinessId);
  if (!relations.length) return result("get_components_behind_surface", "NOT_RECORDED", [], [], []);
  const ids = relations.map((item) => item.subjectBusinessId);
  const entities = stable(dataset.components.filter((item) => ids.includes(item.businessId)));
  const facts = relations.map((relation) => ({ factId: relation.relationId, subjectBusinessId: relation.subjectBusinessId, predicate: relation.predicate, value: relation.objectBusinessId, sourceIds: [relation.provenance.sourceId], provenance: [relation.provenance.sourceClass] } satisfies BuildingFact));
  return result("get_components_behind_surface", "OK", entities, facts, [surfaceBusinessId, ...ids]);
}

function history(tool: BuildingQueryToolName, recordType: BuildingRecord["recordType"], businessId: string, dataset = building1602Dataset) {
  if (!entityById(businessId, dataset)) return result(tool, "NOT_FOUND", [], [], []);
  const records = [...dataset.records].filter((record) => record.recordType === recordType && record.subjectBusinessIds.includes(businessId)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (!records.length) return result(tool, "NOT_RECORDED", [], [], []);
  const facts = records.map((record) => ({ factId: record.recordId, subjectBusinessId: businessId, predicate: `${recordType.toLowerCase()}Record`, value: `${record.occurredAt}｜${record.title}｜${record.summary}`, sourceIds: [record.provenance.sourceId], provenance: [record.provenance.sourceClass] } satisfies BuildingFact));
  return result(tool, "OK", records, facts, records.flatMap((item) => item.subjectBusinessIds));
}

export const getConstructionHistory = (id: string, dataset = building1602Dataset) => history("get_construction_history", "CONSTRUCTION", id, dataset);
export const getInspectionHistory = (id: string, dataset = building1602Dataset) => history("get_inspection_history", "INSPECTION", id, dataset);
export const getMaintenanceHistory = (id: string, dataset = building1602Dataset) => history("get_maintenance_history", "MAINTENANCE", id, dataset);
export const getCurrentObservations = (id: string, dataset = building1602Dataset) => history("get_current_observations", "OBSERVATION", id, dataset);

export const buildingQueryTools = {
  find_space: ({ query }: { query: string }) => findSpace(query),
  find_component: ({ query }: { query: string }) => findComponent(query),
  get_component_detail: ({ businessId }: { businessId: string }) => getComponentDetail(businessId),
  get_space_components: ({ spaceId }: { spaceId: string }) => getSpaceComponents(spaceId),
  trace_system: ({ systemId }: { systemId: string }) => traceSystem(systemId),
  get_upstream: ({ businessId }: { businessId: string }) => getUpstream(businessId),
  get_downstream: ({ businessId }: { businessId: string }) => getDownstream(businessId),
  get_components_behind_surface: ({ surfaceBusinessId }: { surfaceBusinessId: string }) => getComponentsBehindSurface(surfaceBusinessId),
  get_construction_history: ({ businessId }: { businessId: string }) => getConstructionHistory(businessId),
  get_inspection_history: ({ businessId }: { businessId: string }) => getInspectionHistory(businessId),
  get_maintenance_history: ({ businessId }: { businessId: string }) => getMaintenanceHistory(businessId),
  get_current_observations: ({ businessId }: { businessId: string }) => getCurrentObservations(businessId)
};
