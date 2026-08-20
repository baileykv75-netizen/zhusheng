import type { BuildingLifeEventSummary } from "./building-life-events.ts";
import type { LifeEventResult } from "@/lib/life-event-engine/types";

export type BuildingTask = {
  id: string;
  eventId: string;
  type: "COLLECT_EVIDENCE" | "REQUEST_AUTHORIZATION" | "PROFESSIONAL_ASSESSMENT" | "REPAIR" | "POST_REPAIR_REVIEW" | "REINSPECTION" | "GROUP_REVIEW";
  title: string;
  ownerRole: BuildingLifeEventSummary["ownerRole"];
  assignee: string;
  status: "ACTIVE" | "WAITING" | "DONE";
  createdAt: string;
  dueAt: string;
  requiredEvidence: string[];
  blockingReason: string | null;
  nextStateHint: string;
  historyRefs: string[];
};

function isPendingSameEventAssessment(event: BuildingLifeEventSummary) {
  return /确认本轮系统观测|同一事件上继续确定性评估/.test(`${event.displayStatus} ${event.nextAction}`);
}

function taskType(event: BuildingLifeEventSummary): BuildingTask["type"] {
  if (isPendingSameEventAssessment(event)) return "PROFESSIONAL_ASSESSMENT";
  const state = event.technicalState ?? event.displayStatus;
  if (/REOPENED|重新检查|仍有异常/.test(state)) return "REINSPECTION";
  if (/RESOLVED|已解决|已验证解决/.test(state)) return "GROUP_REVIEW";
  if (/REPAIR|维修/.test(state)) return "REPAIR";
  if (/POST_REPAIR|复验/.test(state)) return "POST_REPAIR_REVIEW";
  if (/AUTHORIZATION|授权/.test(state)) return "REQUEST_AUTHORIZATION";
  if (/COLLECTING|DETECTED|证据|现场信息/.test(state)) return "COLLECT_EVIDENCE";
  return "PROFESSIONAL_ASSESSMENT";
}

export function buildingTasks(events: BuildingLifeEventSummary[], deepResult?: LifeEventResult | null): BuildingTask[] {
  return events.map((event) => {
    const type = taskType(event);
    const pendingSameEvent = isPendingSameEventAssessment(event);
    const noPendingWork = event.nextAction === "无待办";
    const reopenedHistory = event.isDeepDemo && event.technicalState === "REOPENED" && deepResult;
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
      requiredEvidence: pendingSameEvent
        ? ["本轮住户新证据", "物业确认的本轮系统观测"]
        : type === "COLLECT_EVIDENCE"
          ? ["现场描述", "现场照片或人工观察"]
          : type === "REPAIR" ? ["维修记录", "维修照片"]
            : type === "POST_REPAIR_REVIEW" ? ["恢复供水后的新观察"]
              : type === "REINSPECTION" ? ["新的现场描述", "新的现场观察", "第一次维修记录", "第一次复验结果"]
              : [],
      blockingReason: pendingSameEvent
        ? event.displayStatus
        : type === "REINSPECTION"
          ? "维修后仍观察到异常，原事件不得关闭"
          : /等待/.test(event.displayStatus) ? event.displayStatus : null,
      nextStateHint: pendingSameEvent
        ? "住户新证据已存在；物业确认本轮系统观测后，仅在原事件ID上继续确定性评估"
        : type === "REINSPECTION"
          ? "保留第一次维修与复验记录，先收集新的现场事实，再由1602确定性事件引擎决定本轮补证与检查路径"
          : event.isDeepDemo ? "由1602确定性事件引擎校验后推进" : "仅展示产品任务，不创建完整领域状态",
      historyRefs: reopenedHistory
        ? [...new Set([...deepResult.repairRecords.map((record) => record.repairRecordId), ...deepResult.auditLog.flatMap((entry) => [...entry.repairRecordIds, ...entry.evidenceRefs])])]
        : []
    };
  });
}