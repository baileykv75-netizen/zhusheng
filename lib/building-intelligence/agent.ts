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

export type Invocation = { tool: BuildingQueryToolName; arguments: Record<string, string>; result: BuildingQueryResult };

function resolveComponent(question: string, selectedBusinessId?: string | null) {
  const direct = building1602Dataset.components.find((item) => [item.businessId, item.displayName, ...(item.aliases ?? [])].some((value) => question.toLocaleLowerCase().includes(value.toLocaleLowerCase())));
  if (direct) return direct.businessId;
  if (selectedBusinessId && /它|这个|该构件|这个构件|选中/.test(question)) return selectedBusinessId;
  return null;
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

export function planLocalBuildingQuery(question: string, selectedBusinessId?: string | null): Invocation[] {
  const componentId = resolveComponent(question, selectedBusinessId);
  const systemId = resolveSystem(question);
  const surface = building1602Dataset.components.find((item) => item.entityType === "SURFACE" && [item.displayName, ...(item.aliases ?? [])].some((value) => question.includes(value)));
  if (/后面|背后|墙内|墙后/.test(question) && surface) return [invoke("get_components_behind_surface", { surfaceBusinessId: surface.businessId })];
  if (/施工|建造|留痕|安装|照片|热熔/.test(question)) return [invoke("get_construction_history", { businessId: componentId ?? "J-1602-CW-03" })];
  if (/检查|检验|保压/.test(question)) return [invoke("get_inspection_history", { businessId: componentId ?? systemId ?? "J-1602-CW-03" })];
  if (/维修|修过|维护/.test(question)) return [invoke("get_maintenance_history", { businessId: componentId ?? "SPACE-1602-BATHROOM" })];
  if (/观察|湿度|现在|当前/.test(question) && !systemId) return [invoke("get_current_observations", { businessId: componentId ?? "SPACE-1602-BATHROOM" })];
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
  if (result.status === "NOT_RECORDED") return "当前建筑记忆未记录这项信息。未记录不等于从未发生，需要现场或资料复核。";
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
  if (tool.endsWith("history") || tool === "get_current_observations") return result.facts.map((fact) => {
    const [time, title, summary] = String(fact.value).split("｜");
    if (!summary) return String(fact.value);
    const date = time.slice(0, 10).replaceAll("-", ".");
    return `${date} · ${title}：${summary}`;
  }).join("；");
  if (tool === "get_upstream") return `直接上游为：${result.businessIds.map(readableName).join("、")}。`;
  if (tool === "get_downstream") return `直接下游为：${result.businessIds.map(readableName).join("、")}。`;
  if (tool === "get_space_components") return `当前 1602 深度空间共记录 ${result.businessIds.length} 个可查询构件。`;
  const names = result.businessIds.map(readableName);
  return names.length ? `已定位：${names.join("、")}。` : "已完成只读查询。";
}

function visualFor(invocation: Invocation): QueryVisualDirective | null {
  if (invocation.result.status !== "OK" || !invocation.result.businessIds.length) return null;
  const mode = invocation.tool === "trace_system" ? "SYSTEM_TRACE"
    : invocation.tool === "get_components_behind_surface" ? "XRAY"
      : invocation.tool === "get_construction_history" ? "CONSTRUCTION_MEMORY"
        : invocation.tool === "get_current_observations" ? "DIAGNOSTIC" : "FOCUS";
  return { mode, targetBusinessIds: invocation.result.businessIds, revealBusinessIds: invocation.result.businessIds, sourceTool: invocation.tool };
}

export function createLocalBuildingAgentTurn(question: string, selectedBusinessId?: string | null, mode: BuildingAgentTurnResult["mode"] = "LOCAL_READ_ONLY"): BuildingAgentTurnResult {
  const invocations = planLocalBuildingQuery(question, selectedBusinessId);
  const facts = [...new Map(invocations.flatMap((item) => item.result.facts).map((fact) => [fact.factId, fact])).values()];
  const sourceIds = new Set(invocations.flatMap((item) => item.result.sourceIds));
  const sources = building1602Dataset.sources.filter((source) => sourceIds.has(source.sourceId));
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
    visualDirective: visualFor(invocations[invocations.length - 1]),
    ...(asksClose ? { proposedAction: { type: "CLOSE_VALVE" as const, authorizationRequired: true as const } }
      : asksOpen ? { proposedAction: { type: "OPEN_VALVE" as const, authorizationRequired: true as const } }
        : asksInspection ? { proposedAction: { type: "CREATE_INSPECTION_TASK" as const, authorizationRequired: true as const } } : {}),
    selectedBusinessId
  };
}

export async function queryBuildingAgent(question: string, selectedBusinessId?: string | null, fetcher: typeof fetch = fetch): Promise<BuildingAgentTurnResult> {
  try {
    const response = await fetcher("http://127.0.0.1:4180/v1/agent/query", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, selectedBusinessId: selectedBusinessId ?? null })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { ok: true; result: BuildingAgentTurnResult };
    if (body.ok !== true || !Array.isArray(body.result?.facts)) throw new Error("invalid result");
    return body.result;
  } catch {
    return createLocalBuildingAgentTurn(question, selectedBusinessId, "LOCAL_READ_ONLY");
  }
}
