import type { AgentIntent } from "./types.ts";

export function routeIntent(input: string): AgentIntent {
  if (/集团|经验|试点|评审/.test(input)) return "VIEW_GROUP_LEARNING";
  if (/成果包|事件包|验证结果/.test(input)) return "EXPLAIN_DECISION";
  if (/去|打开|进入|跳转/.test(input) && /工友|住户|集团/.test(input)) return "NAVIGATE_WORKSPACE";
  if (/湿度|潮湿|发潮|潮|水表|微流量|漏水|照片/.test(input)) return "DRAFT_OBSERVATION";
  if (/哪里|位置|构件|拓扑|1602|卫生间|建筑记忆/.test(input)) return "QUERY_MEMORY";
  return "UNKNOWN";
}
