"use client";

import { ArrowUp, Bot, Box, Braces, Database, LoaderCircle, LocateFixed, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { queryBuildingAgent } from "@/lib/building-intelligence/agent.ts";
import { entityById } from "@/lib/building-intelligence/catalog.ts";
import type { BuildingAgentTurnResult } from "@/lib/building-intelligence/types.ts";
import { probeBuildingAgentGateway, type GatewayHealth } from "@/lib/building-agent/providers/deepseek-gateway.ts";

const examples = ["冷水从哪里进入，又经过哪些构件？", "北墙后面有哪些构件？", "重点冷水接头留下了哪些施工记录？"];
type Props = { selectedBusinessId: string | null; result: BuildingAgentTurnResult | null; onResult(result: BuildingAgentTurnResult | null): void };

export function BuildingIntelligenceWorkspace({ selectedBusinessId, result, onResult }: Props) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const selected = selectedBusinessId ? entityById(selectedBusinessId) : null;
  useEffect(() => { let alive = true; probeBuildingAgentGateway().then((value) => { if (alive) setHealth(value); }).catch(() => { if (alive) setHealth(null); }); return () => { alive = false; }; }, []);

  async function ask(event?: FormEvent) {
    event?.preventDefault(); const input = question.trim(); if (!input || busy) return; setBusy(true);
    try { onResult(await queryBuildingAgent(input, selectedBusinessId)); } finally { setBusy(false); }
  }

  if (!result) return <section className="building-ai building-ai-empty" aria-label="筑生建筑智能查询">
    <header><div><Sparkles size={16} /><span>筑生 AI</span></div><GatewayBadge health={health} /></header>
    <div className="building-ai-intro"><i><Bot size={22} /></i><p>QUERYABLE BUILDING INTELLIGENCE</p><h2>问这栋房子<br />任何问题</h2><span>答案只来自已查询的空间、构件、系统和记录。模型不能绕过 facts 新增建筑事实。</span></div>
    {selected ? <button className="selected-context" type="button" onClick={() => setQuestion(`请说明${selected.displayName}的已记录信息`)}><LocateFixed size={14} /><span>已选中 {selected.displayName}</span><strong>问筑生这个构件</strong></button> : null}
    <div className="building-ai-examples">{examples.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)}>{item}<ArrowUp size={13} /></button>)}</div>
    <QuestionForm question={question} busy={busy} setQuestion={setQuestion} ask={ask} />
    {!health ? <p className="building-ai-unavailable"><TriangleAlert size={13} /> LIVE AI UNAVAILABLE · 可继续使用本地确定性只读查询</p> : null}
  </section>;

  const synthetic = result.sources.some((source) => source.synthetic);
  return <section className="building-ai building-ai-result" aria-label="筑生建筑智能查询结果" data-agent-mode={result.mode}>
    <header><button type="button" onClick={() => onResult(null)}>← 新问题</button><GatewayBadge health={health} mode={result.mode} /></header>
    <div className="ai-result-scroll">
      <p className="ai-question">{result.question}</p><div className="ai-answer"><span>查询结论</span><h2>{result.answer}</h2></div>
      {synthetic ? <div className="synthetic-warning"><TriangleAlert size={15} /><p><strong>包含合成工程数据</strong>用于展示系统查询能力，不代表真实项目竣工记录。</p></div> : null}
      <section className="ai-tool-trace"><header><Braces size={14} /><span>确定性工具轨迹</span></header>{result.toolTrace.map((item, index) => <article key={`${item.tool}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><div><strong>{item.tool}</strong><small>{Object.entries(item.arguments).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small></div><em>{item.status}</em></article>)}</section>
      <details className="ai-facts"><summary><Database size={14} />机器可验证 facts <b>{result.facts.length}</b></summary><div>{result.facts.map((fact) => <article key={fact.factId}><strong>{fact.subjectBusinessId}</strong><span>{fact.predicate}</span><p>{Array.isArray(fact.value) ? fact.value.join("、") : String(fact.value)}</p><small>{fact.sourceIds.join(" · ")}</small></article>)}</div></details>
      <section className="ai-sources"><header><ShieldCheck size={14} /><span>来源</span></header>{result.sources.map((source) => <article key={source.sourceId}><div><strong>{source.label}</strong><small>{source.sourceClass}</small></div><em className={source.synthetic ? "synthetic" : "verified"}>{source.synthetic ? "合成记录" : "可追溯"}</em><p>{source.note}</p></article>)}</section>
      {result.visualDirective ? <div className="ai-visual-state"><Box size={14} /><span>3D 已响应</span><strong>{result.visualDirective.mode}</strong><small>{result.visualDirective.targetBusinessIds.length} 个空间对象</small></div> : null}
      {result.proposedAction ? <div className="ai-proposed-action"><ShieldCheck size={15} /><p><strong>只提出下一步：{result.proposedAction.type}</strong>需要独立人工授权；本次查询没有执行任何设备动作或事件状态变更。</p></div> : null}
    </div><QuestionForm question={question} busy={busy} setQuestion={setQuestion} ask={ask} compact />
  </section>;
}

function GatewayBadge({ health, mode }: { health: GatewayHealth | null; mode?: BuildingAgentTurnResult["mode"] }) { const live = mode === "LIVE_AI" || (!mode && health?.providerConfigured); return <span className={`gateway-badge ${live ? "live" : "local"}`}><i />{live ? `LIVE AI · ${health?.model ?? "DeepSeek"}` : "LOCAL READ-ONLY QUERY"}</span>; }
function QuestionForm({ question, busy, setQuestion, ask, compact = false }: { question: string; busy: boolean; setQuestion(value: string): void; ask(event?: FormEvent): void; compact?: boolean }) { return <form className={`building-ai-form ${compact ? "compact" : ""}`} onSubmit={ask}><label htmlFor={compact ? "building-question-next" : "building-question"}>向筑生提问</label><textarea id={compact ? "building-question-next" : "building-question"} value={question} onChange={(event) => setQuestion(event.target.value)} rows={compact ? 1 : 2} placeholder="例如：北墙后面有什么？" /><button type="submit" aria-label="发送问题" disabled={!question.trim() || busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}</button></form>; }
