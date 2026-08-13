import type { LifeEventResult, LifeEventState, SimulatedAction, VisualDirective } from "./types.ts";

export type GuardedLifecycleSource = {
  state: LifeEventState;
  valvePosition: "OPEN" | "CLOSED";
  authorizationRequirement?: LifeEventResult["authorizationRequirement"];
  proposedActions?: LifeEventResult["proposedActions"];
  authorizedActions?: LifeEventResult["authorizedActions"];
  visualDirective?: VisualDirective;
  auditLog?: LifeEventResult["auditLog"];
};

export type GuardedLifecycleActionId =
  | "COLLECT_RESIDENT_EVIDENCE"
  | "EVALUATE_FACTS"
  | "REVIEW_DIAGNOSIS"
  | "REQUEST_HUMAN_AUTHORIZATION"
  | "EXECUTE_AUTHORIZED_VALVE"
  | "RECORD_ISOLATION_OBSERVATION"
  | "RECORD_REPAIR"
  | "REQUEST_REOPEN_AUTHORIZATION"
  | "RECORD_POST_REPAIR_OBSERVATION"
  | "SHARE_RESOLVED_EXPERIENCE";

export type GuardedLifecycleDestination =
  | { kind: "FOCUS"; focus: "evidence" | "diagnosis" | "execute-valve" | "isolation" | "repair" | "post-repair" }
  | { kind: "ROUTE"; href: string };

export type GuardedLifecycleProjection = {
  phase: "EVIDENCE" | "DIAGNOSIS" | "AUTHORIZATION" | "ISOLATION" | "REPAIR" | "VERIFICATION" | "COMPLETE";
  state: LifeEventState | "NOT_STARTED";
  stateLabel: string;
  headline: string;
  summary: string;
  physicalTruth: {
    valvePosition: "OPEN" | "CLOSED";
    moistureState: VisualDirective["moistureState"] | "UNKNOWN";
    auditCount: number;
  };
  nextAction: {
    id: GuardedLifecycleActionId;
    label: string;
    actor: "RESIDENT" | "PROPERTY";
    destination: GuardedLifecycleDestination;
  };
  safetyBoundary: string;
};

export type GuardedExternalProposalType = "CLOSE_VALVE" | "OPEN_VALVE" | "CREATE_INSPECTION_TASK";
export type GuardedProposalGate = {
  status: "NONE" | "PROPOSAL_ONLY" | "AWAITING_DOMAIN_VALIDATION" | "VERIFIED" | "REJECTED";
  expectedAction: SimulatedAction | null;
  matchedTargetBusinessId: string | null;
  humanGateReady: boolean;
};

const STATE_LABELS: Record<LifeEventState, string> = {
  DETECTED: "已发现",
  COLLECTING_EVIDENCE: "证据收集中",
  ASSESSED: "已完成评估",
  ACTION_PROPOSED: "已提出动作",
  AUTHORIZATION_PENDING: "等待人工授权",
  AUTHORIZED: "已授权，未执行",
  SIMULATED_ACTION_APPLIED: "模拟动作已执行",
  VERIFYING: "隔离验证中",
  ISOLATION_CONFIRMED: "隔离已确认",
  REPAIR_PENDING: "等待维修",
  REPAIR_RECORDED: "维修已记录",
  POST_REPAIR_VERIFYING: "维修后复验",
  RESOLVED: "闭环完成",
  INCONCLUSIVE: "证据不足",
  REOPENED: "事件重新打开"
};

const PRE_VALIDATION_STATES = new Set<LifeEventState>(["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE", "REOPENED"]);

function authorizedAction(source: GuardedLifecycleSource | null): SimulatedAction | null {
  if (!source) return null;
  return source.authorizationRequirement?.action
    ?? source.authorizedActions?.at(-1)?.action
    ?? null;
}

function proposalToSimulatedAction(proposalType: GuardedExternalProposalType): SimulatedAction | null {
  if (proposalType === "CLOSE_VALVE") return "SIMULATE_CLOSE_VALVE";
  if (proposalType === "OPEN_VALVE") return "SIMULATE_REOPEN_VALVE";
  return null;
}

export function deriveGuardedProposalGate(
  proposalType: GuardedExternalProposalType | null,
  source: GuardedLifecycleSource | null
): GuardedProposalGate {
  if (!proposalType) {
    return { status: "NONE", expectedAction: null, matchedTargetBusinessId: null, humanGateReady: false };
  }
  const expectedAction = proposalToSimulatedAction(proposalType);
  if (!expectedAction) {
    return { status: "PROPOSAL_ONLY", expectedAction: null, matchedTargetBusinessId: null, humanGateReady: false };
  }
  if (!source) {
    return { status: "AWAITING_DOMAIN_VALIDATION", expectedAction, matchedTargetBusinessId: null, humanGateReady: false };
  }

  const requirement = ["AUTHORIZATION_PENDING", "AUTHORIZED"].includes(source.state)
    && source.authorizationRequirement?.action === expectedAction
    ? source.authorizationRequirement
    : null;
  const proposed = source.state === "ACTION_PROPOSED"
    ? source.proposedActions?.find((item) => item.action === expectedAction) ?? null
    : null;
  const authorized = source.state === "AUTHORIZED"
    ? source.authorizedActions?.find((item) => item.action === expectedAction) ?? null
    : null;
  const matched = requirement ?? proposed ?? authorized;

  if (matched) {
    return {
      status: "VERIFIED",
      expectedAction,
      matchedTargetBusinessId: matched.targetBusinessId,
      humanGateReady: source.state === "AUTHORIZATION_PENDING" && requirement?.status === "PENDING"
    };
  }
  if (PRE_VALIDATION_STATES.has(source.state)) {
    return { status: "AWAITING_DOMAIN_VALIDATION", expectedAction, matchedTargetBusinessId: null, humanGateReady: false };
  }
  return { status: "REJECTED", expectedAction, matchedTargetBusinessId: null, humanGateReady: false };
}

export function deriveGuardedLifecycleProjection(
  source: GuardedLifecycleSource | null,
  options: { hasResidentEvidence: boolean }
): GuardedLifecycleProjection {
  const state: GuardedLifecycleProjection["state"] = source?.state ?? "NOT_STARTED";
  const valvePosition = source?.valvePosition ?? "OPEN";
  const moistureState: VisualDirective["moistureState"] | "UNKNOWN" = source?.visualDirective?.moistureState ?? "UNKNOWN";
  const physicalTruth: GuardedLifecycleProjection["physicalTruth"] = {
    valvePosition,
    moistureState,
    auditCount: source?.auditLog?.length ?? 0
  };
  const base: Pick<GuardedLifecycleProjection, "state" | "stateLabel" | "physicalTruth" | "safetyBoundary"> = {
    state,
    stateLabel: source ? STATE_LABELS[source.state] : "尚未进入事件引擎",
    physicalTruth,
    safetyBoundary: "AI 只负责查询建筑与解释建议；授权、阀门执行、维修记录和最终闭环仍由确定性事件引擎与人工动作控制。"
  };

  if (!source || ["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE", "REOPENED"].includes(source.state)) {
    if (!options.hasResidentEvidence) {
      return {
        ...base,
        phase: "EVIDENCE",
        headline: source?.state === "REOPENED" ? "事件已重新打开，先补充新的现场事实" : "先让现场事实进入事件链",
        summary: "物业不能代替住户填写原始证据。先补齐描述、照片观察与水表观察，再由同一事件引擎评估。",
        nextAction: {
          id: "COLLECT_RESIDENT_EVIDENCE",
          label: "通知住户补充原始证据",
          actor: "RESIDENT",
          destination: { kind: "ROUTE", href: "/resident?focus=evidence" }
        }
      };
    }
    return {
      ...base,
      phase: "EVIDENCE",
      headline: source?.state === "REOPENED" ? "重新核对现场事实" : "核对现场事实与建筑记忆",
      summary: "住户原始证据已存在。下一步只运行确定性评估，不自动改变阀门、维修或事件状态。",
      nextAction: {
        id: "EVALUATE_FACTS",
        label: "核对现场事实，给出下一步",
        actor: "PROPERTY",
        destination: { kind: "FOCUS", focus: "evidence" }
      }
    };
  }

  if (["ASSESSED", "ACTION_PROPOSED"].includes(source.state)) {
    return {
      ...base,
      phase: "DIAGNOSIS",
      headline: "确定性判断已经形成",
      summary: "先查看候选、证据与不确定项；AI 的文字建议不能替代事件引擎的动作门禁。",
      nextAction: {
        id: "REVIEW_DIAGNOSIS",
        label: "查看确定性判断",
        actor: "PROPERTY",
        destination: { kind: "FOCUS", focus: "diagnosis" }
      }
    };
  }

  if (source.state === "AUTHORIZATION_PENDING") {
    const reopening = authorizedAction(source) === "SIMULATE_REOPEN_VALVE";
    return {
      ...base,
      phase: "AUTHORIZATION",
      headline: reopening ? "恢复供水需要新的独立授权" : "隔离验证正在等待人工授权",
      summary: reopening
        ? "维修完成不等于允许开阀；原关阀授权不能复用。"
        : "AI 和物业界面都不能替住户批准关阀。授权记录本身也不会执行设备动作。",
      nextAction: {
        id: reopening ? "REQUEST_REOPEN_AUTHORIZATION" : "REQUEST_HUMAN_AUTHORIZATION",
        label: reopening ? "通知住户确认恢复供水" : "通知住户完成授权",
        actor: "RESIDENT",
        destination: { kind: "ROUTE", href: "/resident?focus=authorization" }
      }
    };
  }

  if (source.state === "AUTHORIZED") {
    const reopening = authorizedAction(source) === "SIMULATE_REOPEN_VALVE";
    return {
      ...base,
      phase: "AUTHORIZATION",
      headline: "授权已记录，但物理动作仍未执行",
      summary: `当前阀门仍为 ${valvePosition}。只有用户再次明确点击，才会执行本次脱敏模拟${reopening ? "开阀" : "关阀"}。`,
      nextAction: {
        id: "EXECUTE_AUTHORIZED_VALVE",
        label: reopening ? "明确执行恢复供水" : "明确执行关阀隔离",
        actor: "PROPERTY",
        destination: { kind: "FOCUS", focus: "execute-valve" }
      }
    };
  }

  if (["SIMULATED_ACTION_APPLIED", "VERIFYING"].includes(source.state)) {
    return {
      ...base,
      phase: "ISOLATION",
      headline: "动作已经执行，等待新的隔离后观察",
      summary: "新的湿度、微流量与审计 sequence 必须发生在本次动作之后，历史观察不能直接复用。",
      nextAction: {
        id: "RECORD_ISOLATION_OBSERVATION",
        label: "提交隔离后的新观察",
        actor: "PROPERTY",
        destination: { kind: "FOCUS", focus: "isolation" }
      }
    };
  }

  if (["ISOLATION_CONFIRMED", "REPAIR_PENDING"].includes(source.state)) {
    return {
      ...base,
      phase: "REPAIR",
      headline: "隔离验证已收敛到维修任务",
      summary: "维修目标来自确定性候选与建筑拓扑；维修记录必须由人工提交并进入不可变事件链。",
      nextAction: {
        id: "RECORD_REPAIR",
        label: "填写并提交维修记录",
        actor: "PROPERTY",
        destination: { kind: "FOCUS", focus: "repair" }
      }
    };
  }

  if (source.state === "REPAIR_RECORDED") {
    return {
      ...base,
      phase: "AUTHORIZATION",
      headline: "维修已记录，供水仍保持隔离",
      summary: "恢复供水必须重新取得人工授权，不能复用此前的关阀授权。",
      nextAction: {
        id: "REQUEST_REOPEN_AUTHORIZATION",
        label: "通知住户确认恢复供水",
        actor: "RESIDENT",
        destination: { kind: "ROUTE", href: "/resident?focus=authorization" }
      }
    };
  }

  if (source.state === "POST_REPAIR_VERIFYING") {
    return {
      ...base,
      phase: "VERIFICATION",
      headline: "供水已恢复，等待维修后的独立复验",
      summary: "只接受恢复供水之后的新观察。复验结果由事件引擎决定进入 RESOLVED 还是 REOPENED。",
      nextAction: {
        id: "RECORD_POST_REPAIR_OBSERVATION",
        label: "提交维修后复验",
        actor: "PROPERTY",
        destination: { kind: "FOCUS", focus: "post-repair" }
      }
    };
  }

  return {
    ...base,
    phase: "COMPLETE",
    headline: "1602 事件闭环已经完成",
    summary: "维修、授权、动作与复验都保留在同一条可重放事件链中；现在可以把已验证经验送入集团学习。",
    nextAction: {
      id: "SHARE_RESOLVED_EXPERIENCE",
      label: "查看集团经验建议",
      actor: "PROPERTY",
      destination: { kind: "ROUTE", href: "/group?mode=task" }
    }
  };
}