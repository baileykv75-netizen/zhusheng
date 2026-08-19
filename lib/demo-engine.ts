export type RuntimeMode = "ai" | "fallback" | "degraded";

export type EvidenceRecord = {
  id: string;
  type: string;
  source: string;
  status: "verified" | "needs_review";
  note: string;
  capturedAt: string;
  refs: string[];
};

export type WorkerEvidenceDraft = {
  transcript: string;
  room: string;
  component: string;
  process: string;
  pressure: string;
};

export type AgentTrace = {
  id: string;
  time: string;
  from: string;
  to: string;
  task: string;
  output: string;
  refs: string[];
  confidence: number;
  mode: RuntimeMode | "rules";
};

export type DemoSnapshot = {
  schemaVersion: 3;
  currentStep: number;
  workerSubstep: 0 | 1 | 2 | 3;
  completedSteps: number[];
  runtimeMode: RuntimeMode;
  evidence: EvidenceRecord[];
  incident: null | {
    id: string;
    status: "investigating" | "awaiting_authorization" | "dispatched" | "resolved";
    confidence: number;
    diagnosis: string;
    missing: string[];
    timeline: { time: string; actor: string; text: string }[];
  };
  valve: { id: string; status: "open" | "closed"; authorizedBy?: string };
  actions: { id: string; status: "pending" | "executed"; title: string }[];
  workOrders: {
    id: string;
    status: "dispatched" | "completed";
    location: string;
    component: string;
    instruction: string;
    refs: string[];
  }[];
  feedback: { id: string; title: string; target: string; status: string }[];
  agentTrace: AgentTrace[];
  telemetry: { time: string; humidity: number; flow: number }[];
};

export const demoSteps = [
  { id: "capture", label: "工友提交证据", route: "/worker", task: "口述当前管线工序与现场复核结果" },
  { id: "memory", label: "写入建筑记忆", route: "/worker", task: "人工确认AI整理字段并关联空间与构件" },
  { id: "anomaly", label: "发现持续异常", route: "/resident", task: "系统观测触发待补证事件" },
  { id: "dispatch", label: "跨阶段协作", route: "/resident", task: "调取建筑记忆与当前事件事实" },
  { id: "context", label: "住户补充信息", route: "/resident", task: "先提交现场现象，再按当前缺口补证" },
  { id: "action", label: "授权设备行动", route: "/resident", task: "在确定性门禁后请求人工授权" },
  { id: "feedback", label: "维修验证反哺", route: "/group", task: "闭环后形成待治理经验候选" }
] as const;

const baseTelemetry = [
  { time: "08:00", humidity: 18, flow: 0 },
  { time: "10:00", humidity: 21, flow: 1.2 },
  { time: "12:00", humidity: 22, flow: 0.4 },
  { time: "14:00", humidity: 23, flow: 0 },
  { time: "15:00", humidity: 22, flow: 0 }
];

export function createInitialSnapshot(mode: RuntimeMode = "fallback"): DemoSnapshot {
  return {
    schemaVersion: 3,
    currentStep: 0,
    workerSubstep: 0,
    completedSteps: [],
    runtimeMode: mode,
    evidence: [
      {
        id: "EV-2845",
        type: "管线接头影像",
        source: "工友语音 + 现场照片",
        status: "verified",
        note: "冷热水支管打压完成，接头无渗漏。",
        capturedAt: "2025-03-18 14:26",
        refs: ["1602卫生间", "MIC-BATH-1602", "W-1602-B7"]
      },
      {
        id: "EV-2846",
        type: "防水施工记录",
        source: "MiC模块工序卡",
        status: "verified",
        note: "聚合物水泥防水涂膜两遍，总厚度1.6 mm。",
        capturedAt: "2025-03-19 10:08",
        refs: ["1602卫生间", "MIC-BATH-1602"]
      },
      {
        id: "EV-2847",
        type: "48小时闭水试验",
        source: "质量员复核",
        status: "verified",
        note: "液面无明显下降，楼下顶板无湿痕。",
        capturedAt: "2025-03-21 16:40",
        refs: ["1602卫生间", "MIC-BATH-1602"]
      }
    ],
    incident: null,
    valve: { id: "V-16F-02-B", status: "open" },
    actions: [],
    workOrders: [],
    feedback: [],
    agentTrace: [],
    telemetry: baseTelemetry
  };
}

function trace(
  state: DemoSnapshot,
  from: string,
  to: string,
  task: string,
  output: string,
  refs: string[],
  confidence: number,
  mode: AgentTrace["mode"] = "rules"
) {
  state.agentTrace.push({
    id: `TR-${String(state.agentTrace.length + 1).padStart(3, "0")}`,
    time: ["14:26", "14:27", "16:31", "16:32", "16:34", "16:36", "18:36"][state.currentStep] || "16:31",
    from,
    to,
    task,
    output,
    refs,
    confidence,
    mode
  });
}

function workerEvidenceRefs(state: DemoSnapshot) {
  const record = state.evidence.find((item) => item.id === "EV-2848");
  return record?.refs.length ? [record.id, ...record.refs] : ["EV-2848", "W-1602-B7"];
}

function executeStep(state: DemoSnapshot, index: number): DemoSnapshot {
  const next = structuredClone(state);
  next.currentStep = index;

  if (index === 2) {
    const record = next.evidence.find((item) => item.id === "EV-2848");
    if (record) record.status = "verified";
    trace(next, "工友服务智能体", "品质智能体", "核验证据并写入建筑记忆", "人工确认后的字段、原始口述与现场证据已关联空间、构件、班组与验收阶段。", workerEvidenceRefs(next), 96);
  }

  if (index === 3) {
    next.telemetry.push(
      { time: "16:00", humidity: 28, flow: 0.1 },
      { time: "16:15", humidity: 34, flow: 0.1 },
      { time: "16:30", humidity: 41, flow: 0.1 }
    );
    next.incident = {
      id: "INC-260725-01",
      status: "investigating",
      confidence: 56,
      diagnosis: "持续湿度异常；当前只确认异常现象，仍需住户现场事实与后续补证区分可能方向。",
      missing: ["住户现场描述", "现场照片观察"],
      timeline: [
        { time: "16:31", actor: "建筑健康智能体", text: "湿度连续30分钟高于动态阈值" },
        { time: "16:32", actor: "建筑总智能体", text: "创建事件并冻结设备自主动作" }
      ]
    };
    trace(next, "S-M1602-04", "建筑健康智能体", "识别持续湿度异常", "系统观测形成异常事件，但原因尚未收敛，等待现场事实。", ["S-M1602-04"], 56);
  }

  if (index === 4 && next.incident) {
    next.incident.timeline.push(
      { time: "16:32", actor: "品质智能体", text: "检索到关联建造证据" },
      { time: "16:33", actor: "建筑总智能体", text: "等待住户补充现场信息" }
    );
    trace(next, "建筑总智能体", "品质智能体", "检索建造阶段身体记忆", "找到管线、防水、闭水与工友复核记录；这些历史只用于后续相关性判断。", ["EV-2845", "EV-2846", "EV-2847", "EV-2848"], 94);
  }

  if (index === 5 && next.incident) {
    next.incident.status = "awaiting_authorization";
    next.incident.confidence = 86;
    next.incident.diagnosis = "在住户现场证据与无人用水观察均支持后，供水侧候选收敛；建议局部隔离验证。";
    next.incident.missing = [];
    next.incident.timeline.push(
      { time: "16:34", actor: "住户", text: "完成本轮现场事实与必要补证" },
      { time: "16:35", actor: "设备具身智能体", text: "受控阀门在线，等待人工授权" }
    );
    next.actions = [{ id: "ACT-001", status: "pending", title: "关闭1602卫生间局部进水阀" }];
    trace(next, "住户补充信息", "建筑总智能体", "联合诊断与权限检查", "当前证据支持局部隔离验证；关阀必须人工授权。", ["住户现场证据", "F-1602-01"], 86);
  }

  if (index === 6 && next.incident) {
    next.valve = { id: "V-16F-02-B", status: "closed", authorizedBy: "1602住户" };
    next.actions = [{ id: "ACT-001", status: "executed", title: "关闭1602卫生间局部进水阀" }];
    next.incident.status = "dispatched";
    next.incident.timeline.push(
      { time: "16:36", actor: "1602住户", text: "确认局部关阀" },
      { time: "16:37", actor: "建筑总智能体", text: "生成精准工单WO-260725-08" }
    );
    next.telemetry.push({ time: "16:40", humidity: 38, flow: 0 });
    next.workOrders = [{
      id: "WO-260725-08",
      status: "dispatched",
      location: "1602卫生间北侧墙体，距完成面1.15 m",
      component: "PPR DN20支管接头 W-1602-B7",
      instruction: "优先从检修口进入；更换接头后完成30分钟保压。",
      refs: ["EV-2845", "EV-2848", "BIM-1602-WATER"]
    }];
    trace(next, "住户授权", "设备具身智能体", "执行局部关阀并验证流量", "阀门已关闭，流量降至0，生成物业工单。", ["ACT-001", "V-16F-02-B"], 100);
  }

  if (index === 7 && next.incident) {
    next.incident.status = "resolved";
    next.incident.confidence = 100;
    next.incident.diagnosis = "支管接头热熔边缘存在细微缺口，已更换并通过保压复核；湿度持续回落。";
    next.incident.timeline.push(
      { time: "18:02", actor: "物业维修人员", text: "完成接头更换与保压复核" },
      { time: "18:36", actor: "建筑总智能体", text: "维修结果写回建筑记忆" }
    );
    next.valve = { id: "V-16F-02-B", status: "open", authorizedBy: "物业复核" };
    if (next.workOrders[0]) next.workOrders[0].status = "completed";
    next.telemetry.push({ time: "18:30", humidity: 25, flow: 0 });
    next.feedback = [{
      id: "FB-001",
      title: "PPR支管接头增加双角度影像与热熔参数留痕",
      target: "下一批MiC卫生间模块",
      status: "待纳入企业工艺标准"
    }];
    trace(next, "运营结果", "集团知识中枢", "形成跨项目改进建议", "将故障位置、施工证据与维修结果关联为待治理经验候选。", ["WO-260725-08", "FB-001"], 98);
  }

  if (!next.completedSteps.includes(index)) next.completedSteps.push(index);
  return next;
}

function structureWorkerEvidence(state: DemoSnapshot): DemoSnapshot {
  const next = structuredClone(state);
  next.currentStep = 1;
  next.workerSubstep = 2;
  if (!next.evidence.some((item) => item.id === "EV-2848")) {
    next.evidence.push({
      id: "EV-2848",
      type: "管线接头复核",
      source: "安装班组口述 + 现场照片",
      status: "needs_review",
      note: "待人工确认AI整理字段与原始口述的一致性。",
      capturedAt: "2025-03-18 14:26",
      refs: ["1602卫生间", "MIC-BATH-1602", "W-1602-B7"]
    });
  }
  trace(next, "工友现场口述", "工友服务智能体", "整理施工记录", "识别房间、构件与工序，保留原始口述；尚未写入确认后的字段。", ["MIC-BATH-1602"], 84, next.runtimeMode);
  return next;
}

function applyWorkerEvidenceDraft(state: DemoSnapshot, draft: WorkerEvidenceDraft): DemoSnapshot {
  const next = structuredClone(state);
  const record = next.evidence.find((item) => item.id === "EV-2848");
  if (!record) throw new Error("EV-2848 worker evidence draft is missing");
  const room = draft.room.trim();
  const component = draft.component.trim();
  const process = draft.process.trim();
  const pressure = draft.pressure.trim();
  const transcript = draft.transcript.trim();
  if (!room || !component || !process || !pressure || !transcript) throw new Error("Worker evidence confirmation requires room, component, process, pressure and original transcript");
  record.type = process;
  record.source = "安装班组口述 + 现场照片 · 人工确认";
  record.note = `${room} · ${component} · ${process} · 保压结果：${pressure}。原始口述：${transcript}`;
  record.refs = [room, "MIC-BATH-1602", component];
  return next;
}

function submitWorkerQuality(state: DemoSnapshot): DemoSnapshot {
  const next = structuredClone(state);
  next.currentStep = 1;
  next.workerSubstep = 3;
  if (!next.completedSteps.includes(1)) next.completedSteps.push(1);
  trace(next, "工友服务智能体", "品质智能体", "提交关键工序证据", "人工确认后的字段与影像证据已提交，等待写入建筑生命记忆。", workerEvidenceRefs(next), 92);
  return next;
}

function stageOrdinal(state: DemoSnapshot) {
  if (state.currentStep === 0) return 0;
  if (state.currentStep === 1) return state.workerSubstep || 1;
  return state.currentStep + 2;
}

function startSnapshot(mode: RuntimeMode = "fallback"): DemoSnapshot {
  return { ...createInitialSnapshot(mode), currentStep: 1, workerSubstep: 1 };
}

function advanceState(state: DemoSnapshot): DemoSnapshot {
  if (state.currentStep === 0) return startSnapshot(state.runtimeMode);
  if (state.currentStep === 1 && state.workerSubstep === 1) return structureWorkerEvidence(state);
  if (state.currentStep === 1 && state.workerSubstep === 2) return submitWorkerQuality(state);
  if (state.currentStep === 1 && state.workerSubstep === 3) return executeStep(state, 2);
  if (state.currentStep === 5 && state.incident?.status === "awaiting_authorization") return state;
  return state.currentStep >= 7 ? state : executeStep(state, state.currentStep + 1);
}

function replayToOrdinal(mode: RuntimeMode, target: number): DemoSnapshot {
  if (target <= 0) return createInitialSnapshot(mode);
  let replay: DemoSnapshot = startSnapshot(mode);
  while (stageOrdinal(replay) < target) {
    replay = replay.currentStep === 5 && replay.incident?.status === "awaiting_authorization"
      ? executeStep(replay, 6)
      : advanceState(replay);
  }
  return replay;
}

export const DemoEngine = {
  start(mode: RuntimeMode = "fallback"): DemoSnapshot {
    return startSnapshot(mode);
  },
  next(state: DemoSnapshot) {
    return advanceState(state);
  },
  confirmWorkerEvidence(state: DemoSnapshot, draft: WorkerEvidenceDraft) {
    if (state.currentStep !== 1 || state.workerSubstep !== 2) return state;
    return submitWorkerQuality(applyWorkerEvidenceDraft(state, draft));
  },
  previous(state: DemoSnapshot) {
    const target = Math.max(0, stageOrdinal(state) - 1);
    return replayToOrdinal(state.runtimeMode, target);
  },
  replayToChapter(state: DemoSnapshot, chapter: number) {
    const target = chapter <= 1 ? 1 : Math.min(9, chapter + 2);
    return replayToOrdinal(state.runtimeMode, target);
  },
  reset(mode: RuntimeMode = "fallback") {
    return createInitialSnapshot(mode);
  },
  approve(state: DemoSnapshot, approver = "1602住户") {
    if (!state.incident || state.incident.status !== "awaiting_authorization") return state;
    const next = executeStep(state, 6);
    next.valve.authorizedBy = approver;
    return next;
  }
};
