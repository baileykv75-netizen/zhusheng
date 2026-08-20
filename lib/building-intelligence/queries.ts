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

const governedDetailFields = ["brand", "manufacturer", "model", "material", "specification"] as const;

function sourceClasses(sourceIds: string[], dataset: BuildingIntelligenceDataset) {
  return [...new Set(sourceIds.map((sourceId) => dataset.sources.find((source) => source.sourceId === sourceId)?.sourceClass).filter((value): value is BuildingFact["provenance"][number] => Boolean(value)))];
}

function searchedRangeSourceIds(items: Array<{ provenance: { sourceId: string } }>, fallbackSourceId: string) {
  return [...new Set([fallbackSourceId, ...items.map((item) => item.provenance.sourceId)])].sort();
}

function notRecordedFact(tool: BuildingQueryToolName, subjectBusinessId: string, dimension: string, sourceIds: string[], dataset: BuildingIntelligenceDataset): BuildingFact {
  return {
    factId: `NOT_RECORDED:${tool}:${subjectBusinessId}:${dimension}`,
    subjectBusinessId,
    predicate: "NOT_RECORDED",
    value: `当前建筑记忆在${dimension}数据范围内未检索到记录；未记录不等于从未发生`,
    sourceIds,
    provenance: sourceClasses(sourceIds, dataset)
  };
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
  for (const field of governedDetailFields) {
    const value = entity.attributes?.[field];
    facts.push(value === undefined
      ? notRecordedFact("get_component_detail", businessId, `component.${field}`, [entity.provenance.sourceId], dataset)
      : { factId: `${businessId}:${field}`, subjectBusinessId: businessId, predicate: field, value, sourceIds: [entity.provenance.sourceId], provenance: [entity.provenance.sourceClass] });
  }
  const spatialRelations = dataset.spatialRelations.filter((relation) => relation.subjectBusinessId === businessId || relation.objectBusinessId === businessId);
  for (const relation of spatialRelations) facts.push({ factId: relation.relationId, subjectBusinessId: relation.subjectBusinessId, predicate: relation.predicate, value: relation.objectBusinessId, sourceIds: [relation.provenance.sourceId], provenance: [relation.provenance.sourceClass] });
  return result("get_component_detail", "OK", { entity, spatialRelations }, facts, [businessId, ...(entity.systemId ? [entity.systemId] : []), ...spatialRelations.flatMap((relation) => [relation.subjectBusinessId, relation.objectBusinessId])]);
}

export function getSpaceComponents(spaceId: string, dataset = building1602Dataset) {
  const items = stable(dataset.components.filter((item) => item.spaceId === spaceId));
  if (items.length) return result("get_space_components", "OK", items, factsForEntities(items), items.map((item) => item.businessId));
  const space = entityById(spaceId, dataset);
  if (!space) return result("get_space_components", "NOT_FOUND", [], [], []);
  const sourceIds = searchedRangeSourceIds(dataset.components, space.provenance.sourceId);
  return result("get_space_components", "NOT_RECORDED", [], [notRecordedFact("get_space_components", spaceId, "components", sourceIds, dataset)], [spaceId]);
}

export function traceSystem(systemId: string, dataset = building1602Dataset) {
  const system = dataset.systems.find((item) => item.businessId === systemId);
  if (!system) return result("trace_system", "NOT_FOUND", null, [], []);
  const connections = stable(dataset.connections.filter((item) => item.systemId === systemId) as Array<typeof dataset.connections[number] & { businessId: string }>).map(({ businessId: _, ...item }) => item);
  const members = stable(dataset.components.filter((item) => system.memberIds.includes(item.businessId)));
  const facts = factsForEntities(members);
  facts.unshift({ factId: `${systemId}:systemType`, subjectBusinessId: systemId, predicate: "systemType", value: system.systemType, sourceIds: [system.provenance.sourceId], provenance: [system.provenance.sourceClass] });
  for (const connection of connections) facts.push({ factId: connection.connectionId, subjectBusinessId: connection.fromBusinessId, predicate: connection.connectionType, value: connection.toBusinessId, sourceIds: [connection.provenance.sourceId], provenance: [connection.provenance.sourceClass] });
  const memberIds = new Set(system.memberIds);
  const routingRelations = dataset.spatialRelations.filter((relation) => memberIds.has(relation.subjectBusinessId) || memberIds.has(relation.objectBusinessId));
  for (const relation of routingRelations) facts.push({ factId: relation.relationId, subjectBusinessId: relation.subjectBusinessId, predicate: relation.predicate, value: relation.objectBusinessId, sourceIds: [relation.provenance.sourceId], provenance: [relation.provenance.sourceClass] });
  return result("trace_system", "OK", { system, members, connections, spatialRelations: routingRelations }, facts, [systemId, ...system.memberIds, ...routingRelations.flatMap((relation) => [relation.subjectBusinessId, relation.objectBusinessId])]);
}

function connected(direction: "upstream" | "downstream", businessId: string, dataset = building1602Dataset) {
  const tool = direction === "upstream" ? "get_upstream" : "get_downstream";
  const entity = entityById(businessId, dataset);
  if (!entity) return result(tool, "NOT_FOUND", [], [], []);
  const connections: typeof dataset.connections = [];
  const visited = new Set<string>();
  const queue = [businessId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const adjacent = dataset.connections.filter((item) => direction === "upstream" ? item.toBusinessId === current : item.fromBusinessId === current);
    for (const connection of adjacent) {
      if (!connections.some((item) => item.connectionId === connection.connectionId)) connections.push(connection);
      queue.push(direction === "upstream" ? connection.fromBusinessId : connection.toBusinessId);
    }
  }
  if (!connections.length) {
    const sourceIds = searchedRangeSourceIds(dataset.connections, entity.provenance.sourceId);
    return result(tool, "NOT_RECORDED", [], [notRecordedFact(tool, businessId, direction === "upstream" ? "functionalConnections.upstream" : "functionalConnections.downstream", sourceIds, dataset)], [businessId]);
  }
  const ids = [...new Set([businessId, ...connections.flatMap((item) => [item.fromBusinessId, item.toBusinessId])])];
  const entities = stable(dataset.components.filter((item) => ids.includes(item.businessId)));
  const facts = connections.map((connection) => ({ factId: connection.connectionId, subjectBusinessId: connection.fromBusinessId, predicate: connection.connectionType, value: connection.toBusinessId, sourceIds: [connection.provenance.sourceId], provenance: [connection.provenance.sourceClass] } satisfies BuildingFact));
  return result(tool, "OK", { entities, connections }, facts, ids);
}

export const getUpstream = (businessId: string, dataset = building1602Dataset) => connected("upstream", businessId, dataset);
export const getDownstream = (businessId: string, dataset = building1602Dataset) => connected("downstream", businessId, dataset);

export function getComponentsBehindSurface(surfaceBusinessId: string, dataset = building1602Dataset) {
  const surface = entityById(surfaceBusinessId, dataset);
  if (!surface) return result("get_components_behind_surface", "NOT_FOUND", [], [], []);
  const relations = dataset.spatialRelations.filter((item) => item.predicate === "BEHIND" && item.objectBusinessId === surfaceBusinessId);
  if (!relations.length) {
    const sourceIds = searchedRangeSourceIds(dataset.spatialRelations, surface.provenance.sourceId);
    return result("get_components_behind_surface", "NOT_RECORDED", [], [notRecordedFact("get_components_behind_surface", surfaceBusinessId, "spatialRelations.BEHIND", sourceIds, dataset)], [surfaceBusinessId]);
  }
  const ids = relations.map((item) => item.subjectBusinessId);
  const entities = stable(dataset.components.filter((item) => ids.includes(item.businessId)));
  const facts = relations.map((relation) => ({ factId: relation.relationId, subjectBusinessId: relation.subjectBusinessId, predicate: relation.predicate, value: relation.objectBusinessId, sourceIds: [relation.provenance.sourceId], provenance: [relation.provenance.sourceClass] } satisfies BuildingFact));
  return result("get_components_behind_surface", "OK", entities, facts, [surfaceBusinessId, ...ids]);
}

function historyFactValue(record: BuildingRecord) {
  const parts = [record.occurredAt, record.title, record.summary];
  const memory = record.memory;
  if (!memory) return parts.join("｜");
  if (memory.memoryClass) parts.push(`记忆分类:${memory.memoryClass}`);
  if (memory.reason) parts.push(`形成原因:${memory.reason}`);
  if (memory.fieldDecision) parts.push(`现场处理:${memory.fieldDecision}`);
  if (memory.workerStatement) parts.push(`工友留痕:${memory.workerStatement}`);
  if (memory.verification) {
    parts.push(`验证方法:${memory.verification.method}`);
    parts.push(`验证结果:${memory.verification.result}`);
    if (memory.verification.checkedItems.length) parts.push(`已检查:${memory.verification.checkedItems.join("、")}`);
    if (memory.verification.uncheckedItems.length) parts.push(`未检查:${memory.verification.uncheckedItems.join("、")}`);
  }
  if (memory.residualRisk) parts.push(`事实边界:${memory.residualRisk}`);
  return parts.join("｜");
}

function history(tool: BuildingQueryToolName, recordType: BuildingRecord["recordType"], businessId: string, dataset = building1602Dataset) {
  const entity = entityById(businessId, dataset);
  if (!entity) return result(tool, "NOT_FOUND", [], [], []);
  const records = [...dataset.records].filter((record) => record.recordType === recordType && record.subjectBusinessIds.includes(businessId)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (!records.length) {
    const inspectedRange = dataset.records.filter((record) => record.recordType === recordType);
    const sourceIds = searchedRangeSourceIds(inspectedRange, entity.provenance.sourceId);
    return result(tool, "NOT_RECORDED", [], [notRecordedFact(tool, businessId, `records.${recordType}`, sourceIds, dataset)], [businessId]);
  }
  const facts = records.map((record) => ({ factId: record.recordId, subjectBusinessId: businessId, predicate: `${recordType.toLowerCase()}Record`, value: historyFactValue(record), sourceIds: [record.provenance.sourceId], provenance: [record.provenance.sourceClass] } satisfies BuildingFact));
  return result(tool, "OK", records, facts, records.flatMap((item) => item.subjectBusinessIds));
}

export const getConstructionHistory = (id: string, dataset = building1602Dataset) => history("get_construction_history", "CONSTRUCTION", id, dataset);
export const getInspectionHistory = (id: string, dataset = building1602Dataset) => history("get_inspection_history", "INSPECTION", id, dataset);
export const getMaintenanceHistory = (id: string, dataset = building1602Dataset) => history("get_maintenance_history", "MAINTENANCE", id, dataset);

export function getCurrentObservations(id: string, dataset = building1602Dataset) {
  const entity = entityById(id, dataset);
  if (!entity) return result("get_current_observations", "NOT_FOUND", null, [], []);
  const historical = dataset.records.filter((record) => record.recordType === "OBSERVATION" && record.subjectBusinessIds.includes(id));
  const sourceIds = searchedRangeSourceIds(historical, entity.provenance.sourceId);
  const boundary: BuildingFact = {
    factId: `NO_LIVE_OBSERVATION:${id}`,
    subjectBusinessId: id,
    predicate: "NO_LIVE_OBSERVATION_SOURCE",
    value: `当前筑生演示没有连接可用于回答实时状态的传感器或BMS数据源；静态Building Memory中存在${historical.length}条历史OBSERVATION记录，但这些历史记录不能作为当前读数或当前运行状态`,
    sourceIds,
    provenance: sourceClasses(sourceIds, dataset)
  };
  return result("get_current_observations", "NOT_RECORDED", { historicalObservationCount: historical.length, liveObservationConnected: false }, [boundary], [id]);
}

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
