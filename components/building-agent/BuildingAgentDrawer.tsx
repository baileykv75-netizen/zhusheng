"use client";

import { AlertTriangle, ArrowRight, Check, ChevronDown, Database, FileSearch, GitBranch, LoaderCircle, LocateFixed, RotateCcw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createBrowserBuildingAgent } from "@/lib/building-agent/adapters/browser/index.ts";
import { BUILDING_AGENT_SESSION_KEY, createInitialAgentSession, DeepSeekGatewayBuildingAgentProvider, probeBuildingAgentGateway, replayAgentSession, verifyAgentTrace, type AgentSession, type DraftFields, type GatewayHealth } from "@/lib/building-agent/index.ts";

const example = "1602卫生间墙脚连续两天发潮，湿度大约78%，微流量0.06 L/min，停水以后水表还在缓慢走，墙面有一张照片。";

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

export function BuildingAgentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [session, setSession] = useState<AgentSession>(() => createInitialAgentSession());
  const [agent, setAgent] = useState<Awaited<ReturnType<typeof createBrowserBuildingAgent>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [gateway, setGateway] = useState<(GatewayHealth & { reachable: true }) | { reachable: false; providerConfigured: false; model: string } | null>(null);

  useEffect(() => { setSession(loadSession()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) sessionStorage.setItem(BUILDING_AGENT_SESSION_KEY, JSON.stringify(session)); }, [hydrated, session]);
  useEffect(() => {
    if (!open || agent || loading) return;
    setLoading(true); setError(null);
    probeBuildingAgentGateway()
      .then(async (health) => {
        setGateway({ ...health, reachable: true });
        return createBrowserBuildingAgent(fetch, health.providerConfigured ? new DeepSeekGatewayBuildingAgentProvider() : undefined);
      })
      .catch(async () => {
        setGateway({ reachable: false, providerConfigured: false, model: "未连接" });
        return createBrowserBuildingAgent();
      })
      .then(setAgent).catch((reason) => setError(reason instanceof Error ? reason.message : "总智能体事实源加载失败")).finally(() => setLoading(false));
  }, [agent, loading, open]);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);

  const response = session.response;
  const replay = useMemo(() => { try { return replayAgentSession(session.traceLog); } catch { return null; } }, [session.traceLog]);

  async function analyze() {
    if (!agent) return;
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
      setSession((current) => ({ ...current, mode: turn.response.mode, draft: turn.draft, draftEdits: turn.draft?.extractedFields ?? null, response: turn.response, traceLog: turn.traceLog }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "结构化输入被领域引擎拒绝"); }
    finally { setLoading(false); }
  }

  function updateField<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setSession((current) => current.draftEdits ? ({ ...current, draftEdits: { ...current.draftEdits, [key]: value } }) : current);
  }

  function reset() {
    sessionStorage.removeItem(BUILDING_AGENT_SESSION_KEY);
    setSession(createInitialAgentSession()); setError(null);
  }

  if (!open || !hydrated) return null;
  return createPortal(<div className="building-agent-shell" role="dialog" aria-modal="true" aria-label="筑生总智能体">
    <button className="building-agent-scrim" aria-label="关闭筑生总智能体" onClick={onClose} />
    <aside className="building-agent-drawer">
      <header className="agent-drawer-header"><div><span>BUILDING AGENT / BLD-ZS-DEMO-001</span><h2>筑生总智能体</h2><p>一栋楼的记忆、诊断、维修与经验入口</p></div><div className="agent-header-actions"><em className={`agent-mode ${session.mode}`}>{session.mode === "deterministic" ? "确定性演示模式" : session.mode === "fallback" ? "大模型失败，已安全回退" : "DeepSeek大模型增强模式"}</em><button ref={closeRef} onClick={onClose} aria-label="关闭"><X size={18} /></button></div></header>
      <div className="agent-boundary"><ShieldCheck size={15} /><span>语言层只做理解、草稿和编排。诊断、授权、设备动作与集团评审仍由确定性模块和人工完成。</span></div>
      <div className="agent-body">
        <section className="agent-input-zone"><div className="agent-section-label"><span>01 / 自然语言入口</span><button onClick={() => setSession((current) => ({ ...current, input: example, selectedExample: true }))}>填入示例</button></div><textarea aria-label="向筑生总智能体输入问题" value={session.input} onChange={(event) => setSession((current) => ({ ...current, input: event.target.value }))} placeholder="描述1602卫生间的现象，或查询建筑记忆、维修闭环和集团经验……" /><div className="agent-input-actions"><small>输入按不可信数据处理。未确认字段不会进入正式证据链。</small><button disabled={!agent || loading || !session.input.trim()} onClick={analyze}>{loading ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}理解并编排</button></div></section>
        {loading && !agent ? <div className="agent-loading"><LoaderCircle className="spin" /><span>正在校验建筑记忆、事件成果包与工具白名单</span></div> : null}
        {error ? <div className="agent-error" role="alert"><AlertTriangle size={16} /><div><strong>请求未执行</strong><p>{error}</p><small>确定性文字区仍可使用；不会伪装成功或绕过领域守卫。</small></div></div> : null}
        {session.draft && session.draft.status === "DRAFT" && session.draftEdits ? <section className="agent-draft"><header><div><span>02 / 待确认草稿</span><h3>先核对，再进入正式事件</h3></div><em>DRAFT</em></header><details open><summary>用户原文 <ChevronDown size={14} /></summary><blockquote>{session.draft.originalText}</blockquote></details><div className="agent-draft-grid"><label><span>空间</span><input value={session.draftEdits.spaceId} readOnly /></label><label><span>当前湿度 %</span><input type="number" min="0" max="100" value={session.draftEdits.humidity ?? ""} onChange={(event) => updateField("humidity", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>湿度基线 %</span><input type="number" min="0" max="100" value={session.draftEdits.humidityBaseline ?? ""} onChange={(event) => updateField("humidityBaseline", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>持续时间 分钟</span><input type="number" min="0" value={session.draftEdits.durationMinutes ?? ""} onChange={(event) => updateField("durationMinutes", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>微流量 L/min</span><input type="number" min="0" step="0.01" value={session.draftEdits.microFlow ?? ""} onChange={(event) => updateField("microFlow", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>水表观察</span><select value={session.draftEdits.meterFinding ?? ""} onChange={(event) => updateField("meterFinding", (event.target.value || null) as DraftFields["meterFinding"])}><option value="">未确认</option><option value="FLOW_CONFIRMED_NO_USE">无人用水仍有变化</option><option value="NO_CHANGE">无变化</option><option value="UNREADABLE">无法辨认</option></select></label><label><span>墙面照片</span><select value={session.draftEdits.photoFinding ?? ""} onChange={(event) => { const value = (event.target.value || null) as DraftFields["photoFinding"]; updateField("photoFinding", value); updateField("photoPresent", value ? true : null); }}><option value="">未确认</option><option value="MOISTURE_VISIBLE">可见潮湿</option><option value="NO_VISIBLE_MOISTURE">未见潮湿</option><option value="UNREADABLE">无法辨认</option></select></label><label><span>数据质量</span><select value={session.draftEdits.dataQuality} onChange={(event) => updateField("dataQuality", event.target.value as DraftFields["dataQuality"])}><option value="GOOD">良好</option><option value="DEGRADED">降级</option><option value="UNKNOWN">未知</option></select></label></div><label className="agent-revision"><span>字段修正说明</span><input value={session.revisionReason} onChange={(event) => setSession((current) => ({ ...current, revisionReason: event.target.value }))} /></label><div className="agent-draft-meta"><article><strong>系统提取</strong><p>湿度、持续时间、微流量、水表与照片候选字段</p></article><article><strong>系统推断</strong>{session.draft.inferences.length ? session.draft.inferences.map((item) => <p key={item}>{item}</p>) : <p>无额外推断</p>}</article><article><strong>尚不确定</strong>{session.draft.uncertainties.map((item) => <p key={item}>{item}</p>)}</article></div><button className="agent-confirm" disabled={loading} onClick={confirm}><Check size={16} />确认并调用事件引擎</button></section> : null}
        {response ? <section className="agent-response"><header><div><span>03 / 总智能体回答</span><h3>{response.intent === "EVALUATE_EVENT" ? "确定性领域结果" : "编排结果"}</h3></div><code>{response.traceId}</code></header><div className="agent-answer-grid"><article><strong>已确认事实</strong>{response.facts.map((item) => <p key={item}><Check size={12} />{item}</p>)}</article><article><strong>系统推断</strong>{response.inferences.length ? response.inferences.map((item) => <p key={item}>{item}</p>) : <p>无额外推断</p>}</article><article><strong>尚不确定</strong>{response.uncertainties.length ? response.uncertainties.map((item) => <p key={item}>{item}</p>) : <p>当前无新增不确定项</p>}</article></div>{response.decision ? <div className="agent-decision-strip"><div><small>生命事件状态</small><strong>{response.decision.state}</strong></div><div><small>第一候选</small><strong>{response.decision.rankedHypotheses[0].hypothesis}</strong></div><div><small>规则分值 / 可信等级</small><strong>{response.decision.rankedHypotheses[0].rawScore} / {response.decision.decisionConfidence}</strong></div><p>规则分值用于透明排序，不是真实故障概率。</p></div> : null}{response.modelEnhancement ? <div className="agent-model-trace"><header><strong>DeepSeek增强调用边界</strong><em>{response.modelEnhancement.calls.some((call) => call.schemaValid) ? "JSON + LOCAL SCHEMA VALID" : "SAFE FALLBACK"}</em></header>{response.modelEnhancement.calls.map((call) => <article key={`${call.task}-${call.requestId}`}><span><b>{call.task}</b><small>{call.model ?? call.errorType ?? "Provider"}</small></span><code>{call.responseId ? `${call.responseId.slice(0, 12)}…` : call.errorSummary}</code></article>)}<div><span>模型建议 {response.modelEnhancement.suggestedTools.join(" / ") || "无"}</span><span>本地批准 {response.modelEnhancement.locallyApprovedTools.join(" / ") || "无"}</span><span>实际执行 {response.modelEnhancement.executedSuggestedTools.join(" / ") || "无"}</span><span>安全拒绝 {response.modelEnhancement.rejectedTools.join(" / ") || "无"}</span></div><p>模型只提出草稿与只读建议；确定性事件引擎仍是唯一诊断与状态来源。</p></div> : null}<details className="agent-tool-trace" open><summary><GitBranch size={14} />调用了什么 · {response.toolCalls.length}项</summary><div>{response.toolCalls.map((call, index) => <article key={`${call.callId}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{call.specialistAgent}</strong><code>{call.toolName}</code><p>{call.outputSummary}</p><small>来源 {call.sourceRefs.join(" / ") || "无外部来源"}</small></span></article>)}</div></details><div className="agent-next"><div><strong>下一步</strong><p>{response.proposedNextAction?.label ?? "继续描述希望查询的建筑问题"}</p><small>{response.safetyNotice}</small></div>{response.proposedNextAction?.route ? <button onClick={() => router.push(response.proposedNextAction!.route!)}>进入专业工作台<ArrowRight size={15} /></button> : null}</div></section> : null}
        {session.traceLog.length ? <details className="agent-audit"><summary><FileSearch size={14} />调用轨迹审计 · {session.traceLog.length}条</summary><header><span>演示级防篡改链，不是数字签名</span><code>{replay?.rootHash?.slice(0, 16)}</code></header>{session.traceLog.map((entry) => <article key={entry.sequence}><i>{String(entry.sequence).padStart(2, "0")}</i><span><strong>{entry.actionType}</strong><small>{entry.intent} · {entry.mode}</small><code>{entry.entryHash.slice(0, 12)}</code></span></article>)}</details> : null}
      </div>
      <footer className="agent-drawer-footer"><span><Database size={13} />建筑记忆 v{response?.decision?.memoryVersion ?? "1.0.0"}</span><span><LocateFixed size={13} />16F / 1602 / 卫生间</span><span><Sparkles size={13} />{gateway?.reachable && gateway.providerConfigured ? `${gateway.model} · 服务端密钥已配置` : gateway?.reachable ? `${gateway.model} · 未配置密钥，确定性模式可用` : "网关未启动，确定性模式可用"}</span><button onClick={reset}><RotateCcw size={13} />重置会话</button></footer>
    </aside>
  </div>, document.body);
}
