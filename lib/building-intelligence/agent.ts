import { getBuildingAgentGatewayUrl } from "../building-agent/providers/deepseek-gateway.ts";
import { building1602Dataset, entityById } from "./catalog.ts";
import {
  findComponent,
  getComponentDetail,
  getComponentsBehindSurface,
  getConstructionHistory,
  getCurrentObservations,
  getDownstream,
  getInspectionHistory,
  getMaintenanceHistory,
  getSpaceComponents,
  getUpstream,
  traceSystem
} from "./queries.ts";
import type { BuildingAgentTurnResult, BuildingQueryResult, BuildingQueryToolName, QueryVisualDirective } from "./types.ts";
import { resolveTargetEntity } from "./entity-resolution.ts";

export type Invocation = { tool: BuildingQueryToolName; arguments: Record<string, string>; result: BuildingQueryResult };

const SELECTION_REFERENCE = /它|这个|该构件|这个构件|选中/;

export function selectedContextForQuestion(question: string, selectedBusinessId?: string | null) {
  return selectedBusinessId && SELECTION_REFERENCE.test(question) ? selectedBusinessId : null;
}

export function isCurrentObservationQuery(question: string) {
  const asksCurrent = /(现在|当前|实时|此刻|目前|眼下|刚刚)/u.test(question);
  const asksObservationValue = /(湿度|温度|微流量|流量|读数|数值|运行状态|传感器状态)/u.test(question);
  const asksValue = /(多少|是多少|读数|数值|值|状态|有没有变化|是否变化)/u.test(question);
  const structuralOnly = /(在哪里|在哪|位置|有哪些|构件|组成|路径|怎么走|连接|属于什么系统)/u.test(question);
  return asksCurrent && asksObservationValue && (asksValue || !structuralOnly);
}

function resolveComponent(question: string, selectedBusinessId?: string | null) {
  const selectedContext = selectedContextForQuestion(question, selectedBusinessId);
  const target = resolveTargetEntity(question, selectedContext);
  if (target?.status === "RESOLVED" && building1602Dataset.components.some((item) => item.businessId === target.businessIds[0])) return target.businessIds[0];
  return selectedContext;
}

function resolveSystem(question: string) {
  const matches = building1602Dataset.systems.filter((item) => [item.businessId, item.displayName, ...(item.aliases ?? [])].some((value) => question.toLocaleLowerCase().includes(value.toLocaleLowerCase())));
  return matches.length === 1 ? matches[0].businessId : null;
}

function invoke(tool: BuildingQueryToolName, args: Record<string, string>): Invocation {
  switch (tool) {
    case "find_component": return { tool, arguments: args, result: findComponent(args.query) };
    case "get_component_detail": return { tool, arguments: args, result: getComponentDetail(args.businessId) };
    case "get_space_components": return { tool, arguments: args, result: getSpaceComponents(args.spaceId) };
    case "trace_system": return { tool, arguments: args, result: traceSystem(args.systemId) };
    case "get_upstream": return { tool, arguments: args, result: getUpstream(args.businessId) };
    case "get_downstream": return { tool, arguments: args, result: getDownstream(args.businessId) };
    case "get_components_behind_surface": return { tool, arguments: args, result: getComponentsBehindSurface(args.surfaceBusinessId) };
    case "get_construction_history": return { tool, arguments: args, result: getConstructionHistory(args.businessId) };
    case "get_inspection_history": return { tool, arguments: args, result: getInspectionHistory(args.businessId) };
    case "get_maintenance_history": return { tool, arguments: args, result: getMaintenanceHistory(args.businessId) };
    case "get_current_observations": return { tool, arguments: args, result: getCurrentObservations(args.businessId) };
    case "find_space": throw new Error("本地编排不需要预定义空间查找");
  }
}

function diagnosticTargetsForQuestion(question: string) {
  if (/(臭味|异味|返味|反味|臭气|下水道味)/u.test(question)) return ["SYS-1602-DRAIN"];
  if (/(潮湿|返潮|湿痕|水印|渗水|漏水|墙脚湿|地面湿)/u.test(question)) return ["SYS-1602-CW", "WP-1602-BATHROOM"];
  if (/(排水不畅|排水变慢|下水慢|地漏堵|排水异常)/u.test(question)) return ["SYS-1602-DRAIN"];
  if (/(镜前灯|顶灯|照明|灯具)/u.test(question) && /(不亮|闪烁|跳闸|异常|故障|原因|为什么|排查)/u.test(question)) return ["SYS-1602-EL-LIGHT"];
  if (/(冷水|微流量|冷水管|冷水接头)/u.test(question) && /(漏|渗|潮|异常|原因|为什么|排查)/u.test(question)) return ["SYS-1602-CW"];
  if (/(热水|热水管)/u.test(question) && /(漏|渗|潮|异常|原因|为什么|排查)/u.test(question)) return ["SYS-1602-HW"];
  return [];
}

function diagnosticMemoryInvocations(question: string): Invocation[] {
  if (isCurrentObservationQuery(question)) return [];
  const targets = diagnosticTargetsForQuestion(question);
  if (!targets.length) return [];
  if (!/(为什么|原因|可能|异常|故障|排查|解决|怎么处理|怎么修|臭味|异味|返味|反味|漏|渗|潮|湿|不亮|闪烁|跳闸|排水不畅|下水慢)/u.test(question)) return [];
  return targets.flatMap((businessId) => [
    invoke("get_construction_history", { businessId }),
    invoke("get_inspection_history", { businessId })
  ]);
}

function mergeInvocations(primary: Invocation[], extras: Invocation[]) {
  const seen = new Set(primary.map((item) => `${item.tool}:${JSON.stringify(item.arguments)}`));
  return [...primary, ...extras.filter((item) => {
    const key = `${item.tool}:${JSON.stringify(item.arguments)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

export function planLocalBuildingQuery(question: string, selectedBusinessId?: string | null): Invocation[] {
  const componentId = resolveComponent(question, selectedBusinessId);
  const systemId = resolveSystem(question);
  const surface = building1602Dataset.components.find((item) => item.entityType === "SURFACE" && [item.displayName, ...(item.aliases ?? [])].some((value) => question.includes(value)));
  if (/后面|背后|墙内|墙后/.test(question) && surface) return [invoke("get_components_behind_surface", { surfaceBusinessId: surface.businessId })];
  if (/施工|建造|留痕|安装|照片|热熔/.test(question)) return [invoke("get_construction_history", { businessId: componentId ?? systemId ?? "SPACE-1602-BATHROOM" })];
  if (/检查|检验|保压/.test(question)) return [invoke("get_inspection_history", { businessId: componentId ?? systemId ?? "SPACE-1602-BATHROOM" })];
  if (/维修|修过|维护/.test(question)) return [invoke("get_maintenance_history", { businessId: componentId ?? "SPACE-1602-BATHROOM" })];
  if (isCurrentObservationQuery(question)) return [invoke("get_current_observations", { businessId: componentId ?? systemId ?? "SPACE-1602-BATHROOM" })];
  if (/上游|从哪来|前面/.test(question) && componentId) return [invoke("get_upstream", { businessId: componentId })];
  if (/下游|到哪里|后面连接/.test(question) && componentId) return [invoke("get_downstream", { businessId: componentId })];
  if (componentId && /说明|信息|详情|这个|该构件|选中/.test(question)) return [invoke("get_component_detail", { businessId: componentId })];
  if (systemId) return [invoke("trace_system", { systemId })];
  if (componentId) return [invoke("get_component_detail", { businessId: componentId })];
  if (/全部|所有|有哪些|卫生间里/.test(question)) return [invoke("get_space_components", { spaceId: "SPACE-1602-BATHROOM" })];
  return [invoke("find_component", { query: question })];
}

function readableName(id: string) { return entityById(id)?.displayName ?? id; }

export function composeAnswer(invocations: Invocation[]) {
  const invocation = invocations[invocations.length - 1];
  const { result, tool } = invocation;
  if (result.status === "NOT_FOUND") return "在当前 1602 深度空间数据中没有找到对应对象。";
  if (result.status === "NOT_RECORDED") {
    if (tool === "get_current_observations" && result.facts.some((fact) => fact.predicate === "NO_LIVE_OBSERVATION_SOURCE")) {
      return "当前筑生演示没有连接实时传感器或 BMS 数据源，因此不能回答此刻的湿度、流量或运行状态。Building Memory 中存在历史观察记录，但它们不能当作当前读数。";
    }
    return "当前建筑记忆未记录这项信息。未记录不等于从未发生，需要现场或资料复核。";
  }
  if (result.status === "AMBIGUOUS") return `找到多个可能对象：${(result.candidates ?? []).map((item) => item.displayName).join("、")}。请再指定一个。`;
  if (tool === "get_components_behind_surface") {
    const surfaceId = invocation.arguments.surfaceBusinessId;
    return `${readableName(surfaceId)}后方记录了：${result.businessIds.filter((id) => id !== surfaceId).map(readableName).join("、")}。`;
  }
  if (tool === "trace_system") {
    const systemId = invocation.arguments.systemId;
    const links = result.facts.filter((fact) => ["FLUID_FLOW", "DRAINAGE_FLOW", "ELECTRICAL_POWER", "SIGNAL"].includes(fact.predicate));
    const route = links.map((fact) => `${readableName(fact.subjectBusinessId)} → ${readableName(String(fact.value))}`).join("；");
    return `${readableName(systemId)}的已记录功能路径为：${route || "当前只记录了系统成员，未形成连接路径"}。`;
  }
  if (tool.endsWith("history")) return result.facts.map((fact) => {
    const [time, title, summary] = String(fact.value).split("｜");
    if (!summary) return String(fact.value);
    const date = time.slice(0, 10).replaceAll("-", ".");
    return `${date} · ${title}：${summary}`;
  }).join("；");
  if (tool === "get_upstream") return `已记录的完整上游路径涉及：${result.businessIds.map(readableName).join("、")}。`;
  if (tool === "get_downstream") return `已记录的完整下游路径涉及：${result.businessIds.map(readableName).join("、")}。`;
  if (tool === "get_space_components") return `当前 1602 深度空间共记录 ${result.businessIds.length} 个可查询构件。`;
  const names = result.businessIds.map(readableName);
  return names.length ? `已定位：${names.join("、")}。` : "已完成只读查询。";
}

const visualPriority: Array<{ mode: QueryVisualDirective["mode"]; tools: BuildingQueryToolName[] }> = [
  { mode: "XRAY", tools: ["get_components_behind_surface"] },
  { mode: "SYSTEM_TRACE", tools: ["trace_system", "get_upstream", "get_downstream"] },
  { mode: "CONSTRUCTION_MEMORY", tools: ["get_construction_history"] },
  { mode: "DIAGNOSTIC", tools: ["get_current_observations"] },
  { mode: "FOCUS", tools: ["find_space", "find_component", "get_component_detail", "get_space_components", "get_inspection_history", "get_maintenance_history"] }
];

export function resolveQueryVisualDirective(invocations: Invocation[]): QueryVisualDirective | null {
  for (const group of visualPriority) {
    const primary = invocations.filter((item) => item.result.status === "OK" && group.tools.includes(item.tool) && item.result.businessIds.length);
    if (!primary.length) continue;
    const source = primary[0];
    let allIds = [...new Set(primary.flatMap((item) => item.result.businessIds))];
    if (group.mode === "XRAY") {
      const surfaces = [...new Set(primary.map((item) => item.arguments.surfaceBusinessId).filter(Boolean))];
      return { mode: group.mode, targetBusinessIds: surfaces, revealBusinessIds: allIds.filter((id) => !surfaces.includes(id)), sourceTool: source.tool };
    }
    if (group.mode === "SYSTEM_TRACE") {
      const rankedSystems = building1602Dataset.systems.map((system) => ({ system, overlap: system.memberIds.filter((id) => allIds.includes(id)).length })).filter((item) => item.overlap > 0).sort((a, b) => b.overlap - a.overlap);
      const activeSystem = rankedSystems[0]?.system;
      if (activeSystem) {
        const memberIds = new Set(activeSystem.memberIds);
        const routingIds = building1602Dataset.spatialRelations.filter((relation) => memberIds.has(relation.subjectBusinessId) || memberIds.has(relation.objectBusinessId)).flatMap((relation) => [relation.subjectBusinessId, relation.objectBusinessId]);
        allIds = [...new Set([...allIds, ...activeSystem.memberIds, ...routingIds])];
      }
    }
    return { mode: group.mode, targetBusinessIds: allIds, revealBusinessIds: allIds, sourceTool: source.tool };
  }
  return null;
}

function sourcesForInvocations(invocations: Invocation[]) {
  const sourceIds = new Set(invocations.flatMap((item) => item.result.sourceIds));
  return building1602Dataset.sources.filter((source) => sourceIds.has(source.sourceId));
}

export function augmentDiagnosticMemory(result: BuildingAgentTurnResult): BuildingAgentTurnResult {
  const extras = diagnosticMemoryInvocations(result.question);
  if (!extras.length) return result;
  const existing = new Set(result.toolTrace.map((item) => `${item.tool}:${JSON.stringify(item.arguments)}`));
  const accepted = extras.filter((item) => !existing.has(`${item.tool}:${JSON.stringify(item.arguments)}`));
  if (!accepted.length) return result;
  const facts = [...new Map([...result.facts, ...accepted.flatMap((item) => item.result.facts)].map((fact) => [fact.factId, fact])).values()];
  const sourceIds = new Set([...result.sources.map((source) => source.sourceId), ...accepted.flatMap((item) => item.result.sourceIds)]);
  const memoryVisual = resolveQueryVisualDirective(accepted);
  const preserveExisting = result.visualDirective && ["XRAY", "SYSTEM_TRACE"].includes(result.visualDirective.mode);
  return {
    ...result,
    facts,
    sources: building1602Dataset.sources.filter((source) => sourceIds.has(source.sourceId)),
    toolTrace: [...result.toolTrace, ...accepted.map((item) => ({ tool: item.tool, arguments: item.arguments, status: item.result.status }))],
    visualDirective: preserveExisting ? result.visualDirective : (memoryVisual ?? result.visualDirective)
  };
}

export function createLocalBuildingAgentTurn(question: string, selectedBusinessId?: string | null, mode: BuildingAgentTurnResult["mode"] = "LOCAL_READ_ONLY"): BuildingAgentTurnResult {
  const selectedContext = selectedContextForQuestion(question, selectedBusinessId);
  const targetEntityResolution = resolveTargetEntity(question, selectedContext);
  if (targetEntityResolution?.status !== undefined && targetEntityResolution.status !== "RESOLVED") {
    const alternatives = targetEntityResolution.candidates.map((item) => item.displayName).join("、");
    const clarificationQuestion = targetEntityResolution.status === "AMBIGUOUS"
      ? `“${targetEntityResolution.mention}”对应多个已记录对象（${alternatives}），请指定一个。`
      : `当前 1602 建筑数据中没有找到“${targetEntityResolution.mention}”这一独立构件，请确认名称或选择已记录构件。`;
    return { mode: "LIVE_AI_CLARIFICATION", question, answer: "", clarificationQuestion, toolTrace: [], facts: [], sources: [], visualDirective: null, selectedBusinessId: selectedContext, targetEntityResolution };
  }
  const invocations = mergeInvocations(planLocalBuildingQuery(question, selectedContext), diagnosticMemoryInvocations(question));
  const facts = [...new Map(invocations.flatMap((item) => item.result.facts).map((fact) => [fact.factId, fact])).values()];
  const sources = sourcesForInvocations(invocations);
  const asksClose = /关.*阀|阀.*关|关水/.test(question);
  const asksOpen = /开阀|恢复供水/.test(question);
  const asksInspection = /创建|新建|安排/.test(question) && /检查|任务|工单/.test(question);
  return {
    mode,
    question,
    answer: composeAnswer(invocations),
    toolTrace: invocations.map(({ tool, arguments: args, result }) => ({ tool, arguments: args, status: result.status })),
    facts,
    sources,
    visualDirective: resolveQueryVisualDirective(invocations),
    ...(asksClose ? { proposedAction: { type: "CLOSE_VALVE" as const, authorizationRequired: true as const } }
      : asksOpen ? { proposedAction: { type: "OPEN_VALVE" as const, authorizationRequired: true as const } }
        : asksInspection ? { proposedAction: { type: "CREATE_INSPECTION_TASK" as const, authorizationRequired: true as const } } : {}),
    selectedBusinessId: selectedContext,
    targetEntityResolution
  };
}

export async function queryBuildingAgent(question: string, selectedBusinessId?: string | null, fetcher: typeof fetch = fetch): Promise<BuildingAgentTurnResult> {
  const selectedContext = selectedContextForQuestion(question, selectedBusinessId);
  try {
    const response = await fetcher(`${getBuildingAgentGatewayUrl()}/v1/agent/query`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, selectedBusinessId: selectedContext })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { ok: true; result: BuildingAgentTurnResult };
    if (body.ok !== true || !Array.isArray(body.result?.facts)) throw new Error("invalid result");
    return augmentDiagnosticMemory(body.result);
  } catch {
    return augmentDiagnosticMemory(createLocalBuildingAgentTurn(question, selectedContext, "LOCAL_READ_ONLY"));
  }
}
