import type { GroupLearningCard, GroupReviewReplay } from "@/lib/group-learning/types";

export type GroupDecisionTask = {
  id: string;
  sourceCardId: string;
  type: "PILOT_TASK" | "EVIDENCE_TASK" | "HOLD_CONDITION";
  title: string;
  owner: string;
  status: "ACTIVE" | "WAITING";
  governanceStatus: "PILOT_ONLY" | "EVIDENCE_REQUIRED" | "HELD";
  scope: string;
  sample: string;
  dueAt: string;
  successCriteria: string[];
  requiredEvidence: string[];
  reason: string;
  reopenCondition: string | null;
  dataClass: "DEMO_SYNTHETIC";
};

export function groupDecisionTask(card: GroupLearningCard, review: Pick<GroupReviewReplay, "state" | "lastDecision">): GroupDecisionTask | null {
  if (review.state === "PENDING_REVIEW") return null;
  const common = {
    sourceCardId: card.cardId,
    dataClass: "DEMO_SYNTHETIC" as const,
    reason: review.lastDecision?.reviewComment ?? "等待人工评审说明"
  };
  if (review.state === "APPROVED_AS_PILOT") return {
    ...common,
    id: `GROUP-TASK-${card.cardId}-PILOT`,
    type: "PILOT_TASK",
    title: "在下一批MiC卫生间执行冷水接头试点检查",
    owner: "集团质量负责人 + 试点项目质量人员（脱敏演示）",
    status: "ACTIVE",
    governanceStatus: "PILOT_ONLY",
    scope: "下一批MiC卫生间模块封板前冷水支管接头",
    sample: "3个脱敏演示卫生间模块",
    dueAt: "下一批样板封板前",
    successCriteria: ["目标接头证据完整率100%", "保压记录覆盖率100%", "异常发现与复核结果可追溯"],
    requiredEvidence: ["接头双角度照片", "保压记录", "构件BusinessId", "人工复核结论"],
    reopenCondition: null
  };
  if (review.state === "RETURNED_FOR_EVIDENCE") return {
    ...common,
    id: `GROUP-TASK-${card.cardId}-EVIDENCE`,
    type: "EVIDENCE_TASK",
    title: "补齐封板前接头证据后重新提交评审",
    owner: "原事件资料提交人 + 项目质量人员（脱敏演示）",
    status: "ACTIVE",
    governanceStatus: "EVIDENCE_REQUIRED",
    scope: "1602来源事件与对应施工记录",
    sample: "当前单事件，不扩展为集团统计",
    dueAt: "下一评审轮开始前",
    successCriteria: ["新增证据身份完整", "证据与J-1602-CW-03空间位置一致", "重新提交原因明确"],
    requiredEvidence: ["封板前接头双角度照片", "保压记录复核说明", "新增证据来源与时间"],
    reopenCondition: null
  };
  return {
    ...common,
    id: `GROUP-TASK-${card.cardId}-HOLD`,
    type: "HOLD_CONDITION",
    title: "暂不采纳，等待满足重新评审条件",
    owner: "集团质量评审人（脱敏演示）",
    status: "WAITING",
    governanceStatus: "HELD",
    scope: "当前单事件经验候选",
    sample: "不创建试点样本",
    dueAt: "条件满足后重新开启",
    successCriteria: ["出现第二个验证通过的同类事件，或当前事件获得关键新增证据"],
    requiredEvidence: ["新的验证事件或关键补证", "重新开启说明"],
    reopenCondition: "出现第二个验证通过的同类事件，或补齐足以改变当前判断的关键证据"
  };
}
