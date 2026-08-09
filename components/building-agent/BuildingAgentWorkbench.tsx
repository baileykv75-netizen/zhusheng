"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, Database, FileSearch, Layers3, LoaderCircle, LocateFixed, RotateCcw, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { JourneyRail } from "@/components/journey/JourneyRail";
import { SceneStage } from "@/components/scene-stage";
import { createBrowserBuildingAgent } from "@/lib/building-agent/adapters/browser/index.ts";
import { BUILDING_AGENT_SESSION_KEY, createInitialAgentSession, DeepSeekGatewayBuildingAgentProvider, probeBuildingAgentGateway, replayAgentSession, verifyAgentTrace, type AgentSession, type DraftFields, type GatewayHealth } from "@/lib/building-agent/index.ts";
import { deriveJourneyView, type AgentJourneyPhase } from "@/lib/journey/index.ts";
import type { SceneId } from "@/lib/stage";

const example = "1602卫生间墙脚连续两天发潮，湿度大约78%，微流量0.06 L/min，停水以后水表还在缓慢走，墙面有一张照片。";

const sceneByPhase: Record<AgentJourneyPhase, SceneId> = {
  IDLE: "buildingOverview",
  DRAFT: "buildingSpace",
  DECISION: "buildingWater"
};

function loadSession(): AgentSession {
  try {
    const value = JSON.parse(sessionStorage.getItem(BUILDING_AGENT_SESSION_KEY) ?? "null") as AgentSession | null;
    if (value?.schemaVersion === 1 && value.sessionId && Array.isArray(value.traceLog)) {
      verifyAgentTrace(value.traceLog);
      return value;
    }
  } catch { sessionStorage.removeItem(BUILDING_AGENT_SESSION_KEY); }
  return createInitialAgentSession();
}

function withTaskMode(route: string) {
  if (route === "/resident") return "/resident?mode=task";
  if (route === "/group") return "/group?mode=task";
  return route;
}

export function BuildingAgentWorkbench() {
  const router = useRouter();
  const { state: demoState } = useDemo();
  const { seedFromAgent } = useLifecycleJourney();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [session, setSession] = useState<AgentSession>(() => createInitialAgentSession());
  const [agent, setAgent] = useState<Awaited<ReturnType<typeof createBrowserBuildingAgent>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [gateway, setGateway] = useState<(GatewayHealth & { reachable: true }) | { reachable: false; providerConfigured: false; model: string } | null>(null);
  const [sceneLayer, setSceneLayer] = useState<"建筑" | "空间" | "水系统">("建筑");

  useEffect(() => { setSession(loadSession()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) sessionStorage.setItem(BUILDING_AGENT_SESSION_KEY, JSON.stringify(session)); }, [hydrated, session]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    probeBuildingAgentGateway()
      .then(async (health) => {
        if (active) setGateway({ ...health, reachable: true });
        return createBrowserBuildingAgent(fetch, health.providerConfigured ? new DeepSeekGatewayBuildingAgentProvider() : undefined);
      })
      .catch(async () => {
        if (active) setGateway({ reachable: false, providerConfigured: false, model: "未连接" });
        return createBrowserBuildingAgent();
      })
      .then((value) => { if (active) setAgent(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "总智能体事实源加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const response = session.response;
  const phase: AgentJourneyPhase = session.draft?.status === "DRAFT" ? "DRAFT" : response ? "DECISION" : "IDLE";
  const journey = demoState.currentStep > 0 && !response && !session.draft
    ? deriveJourneyView({ source: "DEMO", snapshot: demoState })
    : deriveJourneyView({ source: "AGENT", phase, lifeEventState: response?.decision?.state });
  const replay = useMemo(() => { try { return replayAgentSession(session.traceLog); } catch { return null; } }, [session.traceLog]);
  const scene = sceneLayer === "建筑" ? sceneByPhase[phase] : sceneLayer === "空间" ? "buildingSpace" : "buildingWater";

  async function analyze() {
    if (!agent || !session.input.trim()) return;
    setLoading(true); setError(null);
    try {
      const turn = await agent.handleInput(session.input, session.sessionId, session.traceLog);
      setSession((current) => ({ ...current, mode: turn.response.mode, draft: turn.draft, draftEdits: turn.draft?.extractedFields ?? null, response: turn.response, traceLog: turn.traceLog }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "总智能体未能处理当前输入"); }
    finally { setLoading(false); }
  }

  async function confirm() {
    if (!agent || !session.draft || !session.draftEdits) return;
    setLoading(true); setError(null);
    try {
      const turn = await agent.confirmAndEvaluate(session.draft, session.draftEdits, session.revisionReason, session.sessionId, session.traceLog);
      if (turn.response.decision) seedFromAgent(session.draftEdits, turn.response.decision);
      setSession((current) => ({ ...current, mode: turn.response.mode, draft: turn.draft, draftEdits: turn.draft?.extractedFields ?? null, response: turn.response, traceLog: turn.traceLog }));
      setSceneLayer("水系统");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "结构化输入被领域引擎拒绝"); }
    finally { setLoading(false); }
  }

  function updateField<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setSession((current) => current.draftEdits ? ({ ...current, draftEdits: { ...current.draftEdits, [key]: value } }) : current);
  }

  function fillExample() {
    setSession((current) => ({ ...current, input: example, selectedExample: true, draft: null, draftEdits: null, response: null }));
    inputRef.current?.focus();
  }

  function reset() {
    sessionStorage.removeItem(BUILDING_AGENT_SESSION_KEY);
    setSession(createInitialAgentSession()); setError(null); setSceneLayer("建筑");
  }

  function openNext() {
    const route = journey.primaryAction.route ?? response?.proposedNextAction?.route;
    if (route && route !== "/") {
      const target = withTaskMode(route);
      const separator = target.includes("?") ? "&" : "?";
      router.push(journey.primaryAction.focusId ? `${target}${separator}focus=${encodeURIComponent(journey.primaryAction.focusId)}` : target);
    }
    else inputRef.current?.focus();
  }

  if (!hydrated) return null;

  return <SceneStage view="building" scene={scene} focus={phase === "IDLE" ? "overview" : "room-1602"} preload={["buildingOverview", "buildingSpace", "buildingWater", "bathroomConstruction"]} activeFlow={phase === "DECISION"} cues={phase === "IDLE" ? [{ id: "building", label: "BLD-HZZ-02", detail: "运营第1684天", x: 49, y: 67, tone: "safe" }] : [{ id: "room", label: "16F · 1602", detail: "建筑记忆与水系统已定位", x: 49, y: 39, tone: "water" }]}>
    <section className="agent-workbench" aria-label="筑生总智能体工作台">
      <aside className="agent-journey-panel">
        <div className="agent-workbench-brand"><span>ZS / BUILDING AGENT</span><strong>建筑生命任务线</strong></div>
        <JourneyRail current={journey.stage} />
        <div className="journey-scope"><ShieldCheck size={15} /><p>语言层只负责理解和编排。诊断、授权、阀门与评审仍由确定性领域模块和人工完成。</p></div>
      </aside>

      <div className="agent-scene-tools">
        <Layers3 size={14} /><label htmlFor="scene-layer">场景图层</label>
        <select id="scene-layer" value={sceneLayer} onChange={(event) => setSceneLayer(event.target.value as typeof sceneLayer)}><option>建筑</option><option>空间</option><option>水系统</option></select>
        <span>脱敏演示模型</span>
      </div>

      <aside className="agent-task-panel">
        <header><div><small>{journey.stateLabel}</small><h1>{journey.headline}</h1></div><em className={`agent-mode ${session.mode}`}>{session.mode === "deterministic" ? "确定性演示" : session.mode === "fallback" ? "安全回退" : "DeepSeek增强"}</em></header>
        <p className="agent-task-summary">{journey.summary}</p>
        {loading && !agent ? <div className="agent-loading compact"><LoaderCircle className="spin" size={18} /><span>正在核验建筑记忆与工具白名单</span></div> : null}
        {error ? <div className="agent-error compact" role="alert"><AlertTriangle size={16} /><span>{error}</span></div> : null}

        {phase === "IDLE" ? <div className="agent-current-card"><span>当前建筑</span><strong>华章新筑 · 2号楼</strong><dl><div><dt>定位</dt><dd>16F / 1602 / 卫生间</dd></div><div><dt>能力</dt><dd>记忆、诊断、维修、经验回流</dd></div></dl></div> : null}

        {phase === "DRAFT" && session.draftEdits && session.draft ? <section className="journey-draft">
          <div className="task-section-title"><span>待确认结构化事实</span><em>未进入正式事件</em></div>
          <blockquote>{session.draft.originalText}</blockquote>
          <div className="journey-draft-grid">
            <label><span>当前湿度 %</span><input type="number" min="0" max="100" value={session.draftEdits.humidity ?? ""} onChange={(event) => updateField("humidity", event.target.value === "" ? null : Number(event.target.value))} /></label>
            <label><span>持续时间 分钟</span><input type="number" min="0" value={session.draftEdits.durationMinutes ?? ""} onChange={(event) => updateField("durationMinutes", event.target.value === "" ? null : Number(event.target.value))} /></label>
            <label><span>微流量 L/min</span><input type="number" min="0" step="0.01" value={session.draftEdits.microFlow ?? ""} onChange={(event) => updateField("microFlow", event.target.value === "" ? null : Number(event.target.value))} /></label>
            <label><span>水表观察</span><select value={session.draftEdits.meterFinding ?? ""} onChange={(event) => updateField("meterFinding", (event.target.value || null) as DraftFields["meterFinding"])}><option value="">未确认</option><option value="FLOW_CONFIRMED_NO_USE">无人用水仍有变化</option><option value="NO_CHANGE">无变化</option><option value="UNREADABLE">无法辨认</option></select></label>
            <label><span>墙面照片</span><select value={session.draftEdits.photoFinding ?? ""} onChange={(event) => { const value = (event.target.value || null) as DraftFields["photoFinding"]; updateField("photoFinding", value); updateField("photoPresent", value ? true : null); }}><option value="">未确认</option><option value="MOISTURE_VISIBLE">可见潮湿</option><option value="NO_VISIBLE_MOISTURE">未见潮湿</option><option value="UNREADABLE">无法辨认</option></select></label>
          </div>
          <details className="journey-validation-details"><summary>查看推断与不确定项<ChevronDown size={14} /></summary><div><strong>系统推断</strong>{session.draft.inferences.map((item) => <p key={item}>{item}</p>)}<strong>尚不确定</strong>{session.draft.uncertainties.map((item) => <p key={item}>{item}</p>)}</div></details>
        </section> : null}

        {phase === "DECISION" && response ? <section className="journey-answer">
          <div className="answer-block confirmed"><strong>已确认事实</strong>{response.facts.slice(0, 3).map((item) => <p key={item}><Check size={12} />{item}</p>)}</div>
          <div className="answer-block"><strong>当前判断</strong><p>{response.inferences[0] ?? response.decision?.rankedHypotheses[0]?.hypothesis ?? "等待更多信息"}</p></div>
          <div className="answer-block uncertain"><strong>尚缺什么</strong>{(response.missingEvidence.length ? response.missingEvidence : response.uncertainties).slice(0, 2).map((item) => <p key={item}>{item}</p>)}{!response.missingEvidence.length && !response.uncertainties.length ? <p>当前无新增证据缺口</p> : null}</div>
          {response.decision ? <div className="journey-decision-line"><span><small>第一候选</small><strong>{response.decision.rankedHypotheses[0].hypothesis}</strong></span><span><small>规则分值 / 可信等级</small><strong>{response.decision.rankedHypotheses[0].rawScore} / {response.decision.decisionConfidence}</strong></span><p>分值用于透明排序，不是真实故障概率。</p></div> : null}
        </section> : null}

        {response || session.traceLog.length ? <details className="journey-validation-vault"><summary><FileSearch size={14} />验证详情<ChevronDown size={14} /></summary><div className="journey-technical-grid"><article><strong>来源引用</strong>{response?.sourceRefs.map((ref) => <p key={ref.businessId}><LocateFixed size={11} />{ref.businessId} · {ref.label}</p>)}</article><article><strong>专业智能体</strong>{response?.specialistAgents.map((item) => <p key={item}>{item}</p>)}</article><article><strong>工具轨迹</strong>{response?.toolCalls.map((call) => <p key={call.callId}><code>{call.toolName}</code>{call.outputSummary}</p>)}</article>{response?.modelEnhancement ? <article className="journey-model-trace"><strong>DeepSeek增强调用</strong>{response.modelEnhancement.calls.map((call) => <p key={`${call.task}-${call.requestId}`}><code>{call.task}</code>{call.schemaValid ? "Schema通过" : call.errorSummary ?? "安全回退"}{call.responseId ? ` · ${call.responseId.slice(0, 12)}…` : ""}</p>)}<p>模型建议：{response.modelEnhancement.suggestedTools.join(" / ") || "无"}</p><p>本地执行：{response.modelEnhancement.executedSuggestedTools.join(" / ") || "无"}</p></article> : null}<article><strong>审计</strong><p>演示级防篡改链，不是数字签名。</p><code>{replay?.rootHash?.slice(0, 18) ?? "尚无轨迹"}</code></article></div></details> : null}

        {phase === "IDLE" ? <div className="agent-mobile-input"><textarea aria-label="移动端向筑生总智能体输入问题" value={session.input} onChange={(event) => setSession((current) => ({ ...current, input: event.target.value }))} placeholder="描述1602卫生间发生了什么……" /></div> : null}

        <footer className="agent-task-footer">
          {phase === "DRAFT" ? <button className="journey-primary" disabled={loading} onClick={confirm}>{loading ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}确认并调用事件引擎</button> : phase === "DECISION" ? <button className="journey-primary" onClick={openNext}>{response?.proposedNextAction?.label ?? journey.primaryAction.label}<ArrowRight size={15} /></button> : <button className="journey-primary" disabled={!agent || loading || !session.input.trim()} onClick={analyze}>{loading ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}理解并编排</button>}
          <div className="journey-secondary-actions">
            {phase === "IDLE" ? <button onClick={fillExample}><Sparkles size={14} />体验1602完整闭环</button> : null}
            {phase === "DECISION" ? <button onClick={() => router.push("/resident?mode=lab")}>高级实验</button> : null}
            <button onClick={reset}><RotateCcw size={13} />重置</button>
          </div>
        </footer>
      </aside>

      <div className="agent-command-dock">
        <textarea ref={inputRef} aria-label="向筑生总智能体输入问题" value={session.input} onChange={(event) => setSession((current) => ({ ...current, input: event.target.value }))} placeholder="描述1602卫生间的现象，或查询建筑记忆、维修闭环和集团经验……" />
        <span>当前阶段 {journey.stageIndex + 1} / 7</span>
      </div>

      <div className="agent-source-foot"><Database size={13} />建筑记忆 v{response?.decision?.memoryVersion ?? "1.0.0"}<span /><LocateFixed size={13} />SPACE-1602-BATHROOM<span /><Sparkles size={13} />{gateway?.reachable && gateway.providerConfigured ? gateway.model : "确定性模式可用"}</div>
    </section>
  </SceneStage>;
}
