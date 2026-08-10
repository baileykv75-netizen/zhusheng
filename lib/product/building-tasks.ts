import type { BuildingLifeEventSummary } from "./building-life-events.ts";

export type BuildingTask = {
  id: string;
  eventId: string;
  type: "COLLECT_EVIDENCE" | "REQUEST_AUTHORIZATION" | "PROFESSIONAL_ASSESSMENT" | "REPAIR" | "POST_REPAIR_REVIEW" | "GROUP_REVIEW";
  title: string;
  ownerRole: BuildingLifeEventSummary["ownerRole"];
  assignee: string;
  status: "ACTIVE" | "WAITING" | "DONE";
  createdAt: string;
  dueAt: string;
  requiredEvidence: string[];
  blockingReason: string | null;
  nextStateHint: string;
};

function taskType(event: BuildingLifeEventSummary): BuildingTask["type"] {
  const state = event.technicalState ?? event.displayStatus;
  if (/RESOLVED|已解决|已验证解决/.test(state)) return "GROUP_REVIEW";
  if (/REPAIR|维修/.test(state)) return "REPAIR";
  if (/POST_REPAIR|复验/.test(state)) return "POST_REPAIR_REVIEW";
  if (/AUTHORIZATION|授权/.test(state)) return "REQUEST_AUTHORIZATION";
  if (/COLLECTING|DETECTED|证据|现场信息/.test(state)) return "COLLECT_EVIDENCE";
  return "PROFESSIONAL_ASSESSMENT";
}

export function buildingTasks(events: BuildingLifeEventSummary[]): BuildingTask[] {
  return events.map((event) => {
    const type = taskType(event);
    const noPendingWork = event.nextAction === "无待办";
    return {
      id: `TASK-${event.id}-${type}`,
      eventId: event.id,
      type,
      title: event.nextAction,
      ownerRole: event.ownerRole,
      assignee: event.ownerRole === "住户" ? `${event.unitId}住户` : `${event.ownerRole}（脱敏）`,
      status: noPendingWork ? "DONE" : /等待/.test(event.displayStatus) ? "WAITING" : "ACTIVE",
      createdAt: event.updatedAt,
      dueAt: noPendingWork ? "已完成" : "当前事件阶段内",
      requiredEvidence: type === "COLLECT_EVIDENCE"
        ? ["现场照片", "人工观察"]
        : type === "REPAIR" ? ["维修记录", "维修照片"]
          : type === "POST_REPAIR_REVIEW" ? ["恢复供水后的新观察"]
            : [],
      blockingReason: /等待/.test(event.displayStatus) ? event.displayStatus : null,
      nextStateHint: event.isDeepDemo ? "由1602确定性事件引擎校验后推进" : "仅展示产品任务，不创建完整领域状态"
    };
  });
}
