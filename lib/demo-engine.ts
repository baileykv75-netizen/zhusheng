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
  schemaVersion: 2;
  currentStep: number;
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
  { id: "capture", label: "工友提交证据", route: "/worker", task: "口述管线、防水与闭水试验记录" },
  { id: "memory", label: "写入建筑记忆", route: "/worker", task: "品质核验并关联空间与构件" },
  { id: "anomaly", label: "发现持续异常", route: "/resident", task: "湿度与微流量触发事件" },
  { id: "dispatch", label: "跨阶段协作", route: "/resident", task: "调用品质与建筑健康智能体" },
  { id: "context", label: "住户补充信息", route: "/resident", task: "补充水表状态与墙面照片" },
  { id: "action", label: "授权设备行动", route: "/resident", task: "授权关阀并生成精准工单" },
  { id: "feedback", label: "维修验证反哺", route: "/group", task: "写回记忆并生成工艺建议" }
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
    schemaVersion: 2,
    currentStep: 0,
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

function executeStep(state: DemoSnapshot, index: number): DemoSnapshot {
  const next = structuredClone(state);
  next.currentStep = index;

  if (index === 1) {
    next.evidence.push({
      id: "EV-2848",
      type: "管线接头复核",
      source: "安装班组口述 + 现场照片",
      status: "needs_review",
      note: "1602卫生间北侧墙冷热水接头已完成，照片与房间码已同步。",
      capturedAt: "2025-03-18 14:26",
      refs: ["1602卫生间", "MIC-BATH-1602", "W-1602-B7"]
    });
    trace(next, "工友现场口述", "工友服务智能体", "整理施工记录", "识别房间、构件与工序，保留原始口述。", ["MIC-BATH-1602"], 84, next.runtimeMode);
  }

  if (index === 2) {
    const record = next.evidence.find((item) => item.id === "EV-2848");
    if (record) record.status = "verified";
    trace(next, "工友服务智能体", "品质智能体", "核验证据并写入建筑记忆", "证据已关联空间、构件、班组与验收阶段。", ["EV-2848", "W-1602-B7"], 96);
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
      diagnosis: "持续湿度异常，需补充停水后水表状态以排除生活用水影响。",
      missing: ["停用水后水表状态", "墙面潮湿区域照片"],
      timeline: [
        { time: "16:31", actor: "建筑健康智能体", text: "湿度连续30分钟高于动态阈值" },
        { time: "16:32", actor: "建筑总智能体", text: "创建事件并冻结设备自主动作" }
      ]
    };
    trace(next, "S-M1602-04", "建筑健康智能体", "识别持续湿度异常", "连续异常并伴随微流量，创建待补充事件。", ["S-M1602-04", "F-1602-01"], 56);
  }

  if (index === 4 && next.incident) {
    next.incident.timeline.push(
      { time: "16:32", actor: "品质智能体", text: "检索到4条关联建造证据" },
      { time: "16:33", actor: "建筑总智能体", text: "等待住户补充现场信息" }
    );
    trace(next, "建筑总智能体", "品质智能体", "检索建造阶段身体记忆", "找到管线、防水、闭水与补充复核证据。", ["EV-2845", "EV-2846", "EV-2847", "EV-2848"], 94);
  }

  if (index === 5 && next.incident) {
    next.incident.status = "awaiting_authorization";
    next.incident.confidence = 86;
    next.incident.diagnosis = "停用水后仍存在微流量，潮湿位置与支管接头W-1602-B7空间关系吻合，建议局部关阀后检修。";
    next.incident.missing = [];
    next.incident.timeline.push(
      { time: "16:34", actor: "住户", text: "确认水表仍缓慢转动，补充墙面照片" },
      { time: "16:35", actor: "设备具身智能体", text: "阀门在线，等待人工授权" }
    );
    next.actions = [{ id: "ACT-001", status: "pending", title: "关闭1602卫生间局部进水阀" }];
    trace(next, "住户补充信息", "建筑总智能体", "联合诊断与权限检查", "疑似漏点收敛至W-1602-B7，关阀必须人工授权。", ["住户墙面照片", "F-1602-01", "W-1602-B7"], 86);
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
    next.workOrders[0].status = "completed";
    next.telemetry.push({ time: "18:30", humidity: 25, flow: 0 });
    next.feedback = [{
      id: "FB-001",
      title: "PPR支管接头增加双角度影像与热熔参数留痕",
      target: "下一批MiC卫生间模块",
      status: "待纳入企业工艺标准"
    }];
    trace(next, "运营结果", "集团知识中枢", "形成跨项目改进建议", "将故障位置、施工证据与维修结果关联为工艺建议。", ["WO-260725-08", "W-1602-B7", "FB-001"], 98);
  }

  if (!next.completedSteps.includes(index)) next.completedSteps.push(index);
  return next;
}

export const DemoEngine = {
  start(mode: RuntimeMode = "fallback") {
    return { ...createInitialSnapshot(mode), currentStep: 1 };
  },
  next(state: DemoSnapshot) {
    if (state.currentStep === 0) return executeStep(state, 1);
    if (state.currentStep === 1 && !state.completedSteps.includes(1)) return executeStep(state, 1);
    return state.currentStep >= 7 ? state : executeStep(state, state.currentStep + 1);
  },
  previous(state: DemoSnapshot) {
    const target = Math.max(0, state.currentStep - 1);
    let replay = createInitialSnapshot(state.runtimeMode);
    for (let index = 1; index <= target; index += 1) replay = executeStep(replay, index);
    return replay;
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
