import { JOURNEY_STAGES, type JourneyAction, type JourneyInput, type JourneyStage, type JourneyView } from "./types.ts";
import type { LifeEventState } from "../life-event-engine/types.ts";

const routeAction = (label: string, route: string, actionType: string, enabled = true): JourneyAction => ({
  kind: "NAVIGATE",
  label,
  route,
  actionType,
  enabled
});

const focusAction = (label: string, route: string, actionType: string, focusId: string, enabled = true, blockedReason?: string): JourneyAction => ({
  kind: "FOCUS_TASK",
  label,
  route,
  actionType,
  focusId,
  enabled,
  ...(blockedReason ? { blockedReason } : {})
});

function view(
  stage: JourneyStage,
  headline: string,
  summary: string,
  primaryAction: JourneyAction,
  stateLabel: string,
  technicalState?: string,
  secondaryActions: JourneyAction[] = []
): JourneyView {
  return {
    stage,
    stageIndex: JOURNEY_STAGES.indexOf(stage),
    headline,
    summary,
    primaryAction,
    secondaryActions: secondaryActions.slice(0, 2),
    stateLabel,
    technicalState
  };
}

export function deriveLifeEventJourney(state: LifeEventState): JourneyView {
  switch (state) {
    case "DETECTED":
    case "COLLECTING_EVIDENCE":
      return view("REPORT", "补齐现场观察", "先确认潮湿、微流量和现场证据，证据不足时不会推进设备动作。", focusAction("补充水表或照片", "/resident?mode=task", "COLLECT_EVIDENCE", "evidence"), "正在收集证据", state);
    case "ASSESSED":
    case "ACTION_PROPOSED":
      return view("DIAGNOSIS", "查看联合诊断", "诊断来自建筑记忆、拓扑和透明规则；规则分值不是故障概率。", focusAction("查看诊断依据", "/resident?mode=task", "REVIEW_DIAGNOSIS", "diagnosis"), "诊断已形成", state);
    case "AUTHORIZATION_PENDING":
      return view("AUTHORIZATION", "等待人工授权", "阀门保持开启。只有住户或物业完成当前事件授权后，才能出现模拟关阀动作。", focusAction("提交人工授权", "/resident?mode=task", "REQUEST_AUTHORIZATION", "authorization"), "等待住户或物业授权", state);
    case "AUTHORIZED":
      return view("AUTHORIZATION", "授权已记录，等待执行", "人工批准不会自动改变阀门；仍需用户明确执行模拟关阀。", focusAction("模拟执行关阀", "/resident?mode=task", "EXECUTE_ISOLATION", "execute-valve"), "已授权，尚未执行", state);
    case "SIMULATED_ACTION_APPLIED":
    case "VERIFYING":
      return view("AUTHORIZATION", "验证关阀后的变化", "提交关阀后的新湿度和微流量观察，旧证据不能作为隔离后结果。", focusAction("提交隔离后观察", "/resident?mode=task", "VERIFY_ISOLATION", "isolation"), "正在验证关阀后的变化", state);
    case "ISOLATION_CONFIRMED":
    case "REPAIR_PENDING":
      return view("REPAIR", "事件已控制，等待维修", "隔离有效只说明供水链得到支持，不等于已经维修或解决。", focusAction("填写维修记录", "/resident?mode=task", "RECORD_REPAIR", "repair"), "事件已临时控制", state);
    case "REPAIR_RECORDED":
      return view("REPAIR", "维修已记录，等待恢复供水", "开阀需要一份独立人工授权，关阀授权不能复用。", focusAction("申请独立开阀授权", "/resident?mode=task", "REQUEST_REOPEN_AUTHORIZATION", "authorization"), "等待恢复供水授权", state);
    case "POST_REPAIR_VERIFYING":
      return view("REPAIR", "验证维修后的真实结果", "只有恢复供水后的新观察持续正常，事件才能进入已解决状态。", focusAction("提交维修后观察", "/resident?mode=task", "VERIFY_REPAIR", "post-repair"), "正在维修后复验", state);
    case "RESOLVED":
      return view("GROUP_FEEDBACK", "维修闭环已验证", "本次脱敏事件可以形成有来源、有边界、待人工评审的单事件经验。", routeAction("形成集团经验建议", "/group?mode=task", "OPEN_GROUP_FEEDBACK"), "维修闭环完成", state);
    case "INCONCLUSIVE":
      return view("REPORT", "证据不足，暂停设备动作", "补充水表观察或墙面照片后重新评估，当前不能进入高可信诊断。", focusAction("补充水表或照片", "/resident?mode=task", "COLLECT_EVIDENCE", "evidence"), "证据不足", state);
    case "REOPENED":
      return view("DIAGNOSIS", "异常仍存在，需要重新诊断", "维修后观察没有恢复正常，事件已重新打开，不会被错误关闭。", focusAction("重新采集观察", "/resident?mode=task", "REASSESS_EVENT", "evidence"), "事件已重新打开", state);
  }
}

function deriveDemoJourney(input: Extract<JourneyInput, { source: "DEMO" }>): JourneyView {
  const { snapshot } = input;
  if (snapshot.currentStep === 0) {
    return view("REPORT", "先描述1602发生了什么", "筑生总智能体会定位空间、核对事实，再调用已有专业能力。", routeAction("描述问题", "/", "FOCUS_AGENT_INPUT"), "尚未开始");
  }
  if (snapshot.currentStep <= 2) {
    const labels = ["开始现场口述", "核对结构化记录", "写入建筑记忆", "进入入住诊断"];
    const action = labels[snapshot.workerSubstep] ?? labels[3];
    return view("MEMORY", "让建造事实留下来", "工友记录经过人工确认和品质核验后，成为入住阶段可引用的建筑记忆。", routeAction(action, "/worker", "OPEN_WORKER_TASK"), "正在形成建造记忆", `DEMO_STEP_${snapshot.currentStep}`);
  }
  if (snapshot.currentStep <= 4) {
    return view("DIAGNOSIS", "调用建造记忆联合诊断", "异常观察与隐蔽工程记录被重新连接，系统会明确证据缺口。", routeAction(snapshot.currentStep === 3 ? "调取建造记忆" : "补充住户观察", "/resident?mode=task", "OPEN_RESIDENT_TASK"), "正在联合诊断", `DEMO_STEP_${snapshot.currentStep}`);
  }
  if (snapshot.currentStep === 5 || snapshot.incident?.status === "awaiting_authorization") {
    return view("AUTHORIZATION", "等待住户或物业授权", "设备动作已冻结；未授权时阀门保持开启。", routeAction("提交人工授权", "/resident?mode=task", "REQUEST_AUTHORIZATION"), "等待人工授权", snapshot.incident?.status);
  }
  if (snapshot.currentStep === 6 || snapshot.valve.status === "closed") {
    return view("REPAIR", "验证隔离并进入维修", "关阀用于临时控制，维修与复验仍需继续完成。", routeAction("查看维修与复验", "/resident?mode=task", "OPEN_REPAIR_TASK"), "事件已临时控制", snapshot.incident?.status);
  }
  return view("GROUP_FEEDBACK", "把一次闭环变成下一批试点检查", "集团人员基于可验证事件人工决定采纳、退回补证或暂不采纳。", routeAction("进入集团人工评审", "/group?mode=task", "OPEN_GROUP_REVIEW"), "等待集团治理", snapshot.incident?.status);
}

export function deriveJourneyView(input: JourneyInput): JourneyView {
  if (input.source === "LIFE_EVENT") return deriveLifeEventJourney(input.state);
  if (input.source === "DEMO") return deriveDemoJourney(input);
  if (input.source === "GROUP") {
    if (input.reviewState === "APPROVED_AS_PILOT") {
      return view("GROUP_FEEDBACK", "已形成人工批准的试点检查项", "结果仍为PILOT_ONLY，不是企业标准。", routeAction("查看试点检查项", "/group?mode=task", "VIEW_PILOT_ITEM"), "已批准为试点");
    }
    if (input.reviewState === "RETURNED_FOR_EVIDENCE" || input.reviewState === "HELD_WITHOUT_ADOPTION") {
      return view("GROUP_FEEDBACK", "本轮评审未采纳", "补充新证据并提交新一轮评审后，才能再次作出人工决定。", routeAction("补证并提交新一轮评审", "/group?mode=task", "RESUBMIT_GROUP_REVIEW"), input.reviewState === "RETURNED_FOR_EVIDENCE" ? "已退回补证" : "暂不采纳");
    }
    return view("GROUP_FEEDBACK", "审阅单事件待验证经验", "一个完整事件只能形成待验证经验，系统不会自动升级为集团规律。", routeAction("提交人工评审", "/group?mode=task", "REVIEW_GROUP_CARD"), "等待人工评审");
  }
  if (input.lifeEventState) return deriveLifeEventJourney(input.lifeEventState);
  if (input.phase === "DRAFT") {
    return view("CONFIRM", "核对系统提取的事实", "草稿尚未进入正式事件。请修正字段后再确认提交。", routeAction("确认并调用事件引擎", "/", "CONFIRM_DRAFT"), "等待人工确认");
  }
  if (input.phase === "DECISION") {
    return view("DIAGNOSIS", "查看有来源的联合判断", "事实、推断和不确定项已分开呈现，下一步由领域状态决定。", routeAction("进入住户任务处置", "/resident?mode=task", "OPEN_RESIDENT_TASK"), "已完成本轮评估");
  }
  return view("REPORT", "描述问题，由总智能体编排", "用自然语言说明空间、现象和已有证据；系统会先形成待确认草稿。", routeAction("理解并编排", "/", "ANALYZE_INPUT"), "等待描述");
}
