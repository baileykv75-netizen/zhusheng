import { allEntities } from "./catalog.ts";
import { SOURCE_CLASSES, type BuildingIntelligenceDataset, type FunctionalConnectionType } from "./types.ts";

export type ValidationIssue = { code: string; message: string; subjectId?: string };
export type ValidationReport = { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] };

const allowedConnectionForSystem: Record<BuildingIntelligenceDataset["systems"][number]["systemType"], FunctionalConnectionType[]> = {
  DOMESTIC_COLD_WATER: ["FLUID_FLOW"],
  DOMESTIC_HOT_WATER: ["FLUID_FLOW"],
  SANITARY_DRAINAGE: ["DRAINAGE_FLOW"],
  ELECTRICAL_LIGHTING: ["ELECTRICAL_POWER", "SIGNAL"],
  ENVIRONMENT_MONITORING: ["SIGNAL"]
};

export function validateBuildingDataset(dataset: BuildingIntelligenceDataset): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const entities = allEntities(dataset);
  const entityIds = new Set(entities.map((entity) => entity.businessId));
  const sourceIds = new Set(dataset.sources.map((source) => source.sourceId));
  const portById = new Map(dataset.ports.map((port) => [port.portId, port]));
  const systemById = new Map(dataset.systems.map((system) => [system.businessId, system]));

  const provenanceValues = [
    ...dataset.sources, ...entities, ...dataset.ports, ...dataset.connections,
    ...dataset.spatialRelations, ...dataset.records, ...dataset.visualBindings
  ];
  for (const item of provenanceValues) {
    const provenance = "provenance" in item ? item.provenance : item;
    if (!SOURCE_CLASSES.includes(provenance.sourceClass)) errors.push({ code: "SOURCE_CLASS_INVALID", message: `无效来源分类 ${provenance.sourceClass}` });
    if (!sourceIds.has(provenance.sourceId) && !("sourceId" in item && item.sourceId === provenance.sourceId)) errors.push({ code: "SOURCE_NOT_FOUND", message: `来源 ${provenance.sourceId} 未声明` });
    if (provenance.sourceClass === "SYNTHETIC_ENGINEERING_RECORD" && !provenance.synthetic) errors.push({ code: "SYNTHETIC_FLAG_REQUIRED", message: `${provenance.sourceId} 必须标记 synthetic` });
  }

  for (const system of dataset.systems) {
    for (const memberId of system.memberIds) if (!entityIds.has(memberId)) errors.push({ code: "SYSTEM_MEMBER_NOT_FOUND", message: `${system.businessId} 引用了缺失构件 ${memberId}`, subjectId: system.businessId });
  }
  for (const port of dataset.ports) if (!entityIds.has(port.ownerBusinessId)) errors.push({ code: "PORT_OWNER_NOT_FOUND", message: `${port.portId} 的构件不存在`, subjectId: port.portId });

  for (const connection of dataset.connections) {
    const system = systemById.get(connection.systemId);
    if (!system) errors.push({ code: "CONNECTION_SYSTEM_NOT_FOUND", message: `${connection.connectionId} 的系统不存在`, subjectId: connection.connectionId });
    if (!entityIds.has(connection.fromBusinessId) || !entityIds.has(connection.toBusinessId)) errors.push({ code: "CONNECTION_ENTITY_NOT_FOUND", message: `${connection.connectionId} 引用了缺失构件`, subjectId: connection.connectionId });
    if (system && !allowedConnectionForSystem[system.systemType].includes(connection.connectionType)) errors.push({ code: "SYSTEM_CONNECTION_MISMATCH", message: `${system.systemType} 不允许 ${connection.connectionType}`, subjectId: connection.connectionId });
    if ([connection.fromBusinessId, connection.toBusinessId].some((id) => id.startsWith("CONDUIT-"))) errors.push({ code: "CONDUIT_FUNCTIONAL_PATH", message: "Conduit 只能表达物理敷设，不能进入功能连接", subjectId: connection.connectionId });
    const fromPort = connection.fromPortId ? portById.get(connection.fromPortId) : null;
    const toPort = connection.toPortId ? portById.get(connection.toPortId) : null;
    if (connection.fromPortId && (!fromPort || fromPort.ownerBusinessId !== connection.fromBusinessId)) errors.push({ code: "FROM_PORT_INVALID", message: `${connection.connectionId} 上游端口不匹配`, subjectId: connection.connectionId });
    if (connection.toPortId && (!toPort || toPort.ownerBusinessId !== connection.toBusinessId)) errors.push({ code: "TO_PORT_INVALID", message: `${connection.connectionId} 下游端口不匹配`, subjectId: connection.connectionId });
    if (fromPort && !["OUT", "BIDIRECTIONAL"].includes(fromPort.direction)) errors.push({ code: "FROM_PORT_DIRECTION", message: `${fromPort.portId} 不能作为上游`, subjectId: connection.connectionId });
    if (toPort && !["IN", "BIDIRECTIONAL"].includes(toPort.direction)) errors.push({ code: "TO_PORT_DIRECTION", message: `${toPort.portId} 不能作为下游`, subjectId: connection.connectionId });
    if (fromPort && toPort && fromPort.medium !== toPort.medium) errors.push({ code: "PORT_MEDIA_MISMATCH", message: `${connection.connectionId} 两端介质不一致`, subjectId: connection.connectionId });
  }

  for (const relation of dataset.spatialRelations) {
    if (!entityIds.has(relation.subjectBusinessId) || !entityIds.has(relation.objectBusinessId)) errors.push({ code: "SPATIAL_ENTITY_NOT_FOUND", message: `${relation.relationId} 引用了缺失实体`, subjectId: relation.relationId });
  }
  for (const record of dataset.records) for (const id of record.subjectBusinessIds) if (!entityIds.has(id)) errors.push({ code: "RECORD_SUBJECT_NOT_FOUND", message: `${record.recordId} 引用了缺失实体 ${id}`, subjectId: record.recordId });

  validateWater(dataset, errors);
  validateDrainage(dataset, errors);
  validateElectrical(dataset, errors);
  if (!dataset.connections.some((connection) => connection.connectionType === "SIGNAL")) warnings.push({ code: "NO_SIGNAL_CONNECTIONS", message: "当前深度空间未记录信号连接；这不影响给排水与照明演示。" });
  return { valid: errors.length === 0, errors, warnings };
}

function reaches(startId: string, target: (id: string) => boolean, connections: BuildingIntelligenceDataset["connections"]) {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    if (target(id)) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...connections.filter((item) => item.fromBusinessId === id).map((item) => item.toBusinessId));
  }
  return false;
}

function validateWater(dataset: BuildingIntelligenceDataset, errors: ValidationIssue[]) {
  const water = dataset.connections.filter((item) => item.connectionType === "FLUID_FLOW");
  const terminals = new Set(["FIXTURE-1602-BASIN-01", "FIXTURE-1602-WC-01", "FIXTURE-1602-SHOWER-01"]);
  for (const connection of water) if (terminals.has(connection.fromBusinessId)) errors.push({ code: "WATER_TERMINAL_AS_SOURCE", message: "给水末端不能作为上游水源", subjectId: connection.connectionId });
  const cold = dataset.systems.find((item) => item.businessId === "SYS-1602-CW");
  if (cold && !reaches("METER-1602-FLOW-01", (id) => id === "PIPE-1602-CW-02", water)) errors.push({ code: "WATER_PATH_INCOMPLETE", message: "冷水系统没有形成水表→阀门→管段/接头的基本路径", subjectId: cold.businessId });
}

function validateDrainage(dataset: BuildingIntelligenceDataset, errors: ValidationIssue[]) {
  const drainage = dataset.connections.filter((item) => item.connectionType === "DRAINAGE_FLOW");
  if (!reaches("DRAIN-1602-BASIN-01", (id) => id === "STACK-1602-DRAIN-IF-01", drainage)) errors.push({ code: "DRAINAGE_PATH_INCOMPLETE", message: "台盆排水未形成末端→存水弯/支管→立管接口路径" });
  if (drainage.some((item) => item.fromBusinessId === "STACK-1602-DRAIN-IF-01")) errors.push({ code: "DRAINAGE_STACK_REVERSED", message: "空间级排水接口不应反向成为末端上游源" });
}

function validateElectrical(dataset: BuildingIntelligenceDataset, errors: ValidationIssue[]) {
  const power = dataset.connections.filter((item) => item.connectionType === "ELECTRICAL_POWER");
  if (!reaches("CIRCUIT-1602-LIGHT-01", (id) => id === "LIGHT-1602-CEILING-01", power)) errors.push({ code: "ELECTRICAL_PATH_INCOMPLETE", message: "灯具未通过电缆/开关连接至照明回路" });
  const cableInsideConduit = dataset.spatialRelations.some((item) => item.subjectBusinessId === "CABLE-1602-LIGHT-01" && item.predicate === "INSIDE" && item.objectBusinessId === "CONDUIT-1602-LIGHT-01");
  if (!cableInsideConduit) errors.push({ code: "ELECTRICAL_ROUTING_MISSING", message: "电缆缺少在线管内的物理敷设关系" });
}
