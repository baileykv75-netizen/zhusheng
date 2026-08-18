"use client";

import { ArrowUp, Bot, Box, Braces, CheckCircle2, CircleHelp, Database, LoaderCircle, LocateFixed, ShieldCheck, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { queryBuildingAgent } from "@/lib/building-intelligence/agent.ts";
import { building1602Dataset, entityById } from "@/lib/building-intelligence/catalog.ts";
import { deriveEngineeringReasoning } from "@/lib/building-intelligence/engineering-reasoning.ts";
import type { BuildingAgentTurnResult } from "@/lib/building-intelligence/types.ts";
import { probeBuildingAgentGateway, type GatewayHealth } from "@/lib/building-agent/providers/deepseek-gateway.ts";
import styles from "./BuildingIntelligenceWorkspace.module.css";

const examples = ["卫生间有臭味可能是什么原因？", "卫生间墙脚潮湿可能是什么原因？", "北墙后面有哪些构件？", "重点冷水接头留下了哪些施工记录？"];
const memoryTradeCount = new Set(building1602Dataset.records.map((record) => record.memory?.trade).filter(Boolean)).size;
type Props = { selectedBusinessId: string | null; result: BuildingAgentTurnResult | null; onResult(result: BuildingAgentTurnResult | null): void };

export function BuildingIntelligenceWorkspace({ selectedBusinessId, result, onResult }: Props) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const selected = selectedBusinessId ? entityById(selectedBusinessId) : null;
  const reasoning = result ? deriveEngineeringReasoning(result.question, result.facts) : null;
  useEffect(() => { let alive = true; probeBuildingAgentGateway().then((value) => { if (alive) setHealth(value); }).catch(() => { if (alive) setHealth(null); }); return () => { alive = false; }; }, []);

  async function ask(event?: FormEvent) {
    event?.preventDefault(); const input = question.trim(); if (!input || busy) return; setBusy(true);
    try { onResult(await queryBuildingAgent(input, selectedBusinessId)); } finally { setBusy(false); }
  }

  if (!result) return <section className="building-ai building-ai-empty" aria-label="筑生建筑智能查询">
    <header><div><Sparkles size={16} /><span>筑生 AI</span></div><GatewayBadge health={health} /></header>
    <div className="building-ai-intro"><i><Bot size={22} /></i><p>QUERYABLE BUILDING INTELLIGENCE</p><h2>问这栋房子<br />任何问题</h2><span>事实来自建筑数据；原因类问题会优先回看这栋房子的正常施工、现场调整、返工、验收边界与交付基线，再给出排查顺序。</span></div>
    <div className={styles.memoryScope}><strong>{building1602Dataset.records.length}</strong><span>条生命周期记忆</span><i /><strong>{memoryTradeCount}</strong><span>类专业/阶段</span><i /><span>施工 → 验收 → 交付 → 运行</span></div>
    {selected ? <button className="selected-context" type="button" onClick={() => setQuestion(`请说明${selected.displayName}的已记录信息`)}><LocateFixed size={14} /><span>已选中 {selected.displayName}</span><strong>问筑生这个构件</strong></button> : null}
    <div className="building-ai-examples">{examples.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)}>{item}<ArrowUp size={13} /></button>)}</div>
    <QuestionForm question={question} busy={busy} setQuestion={setQuestion} ask={ask} />
    {!health ? <p className="building-ai-unavailable"><TriangleAlert size={13} /> LIVE AI UNAVAILABLE · 可继续使用本地确定性只读查询</p> : null}
  </section>;

  const synthetic = result.sources.some((source) => source.synthetic);
  const answerTitle = result.mode === "LIVE_AI_CLARIFICATION" ? "需要澄清" : reasoning?.memoryBased ? "本楼诊断结论" : reasoning ? "分析结论" : "查询结论";
  const answerText = result.mode === "LIVE_AI_CLARIFICATION" ? result.clarificationQuestion : reasoning?.summary ?? result.answer;

  return <section className="building-ai building-ai-result" aria-label="筑生建筑智能查询结果" data-agent-mode={result.mode}>
    <header><button type="button" onClick={() => onResult(null)}>← 新问题</button><GatewayBadge health={health} mode={result.mode} /></header>
    <div className="ai-result-scroll">
      <p className="ai-question">{result.question}</p>
      <div className="ai-answer"><span>{answerTitle}</span><h2>{answerText}</h2></div>

      {reasoning ? <div className={styles.reasoningStack}>
        <section className={styles.confirmedCard}>
          <div className={styles.sectionLabel}><CheckCircle2 size={14} />已确认的建筑事实</div>
          <strong>{reasoning.confirmedSummary}</strong>
          <p>{reasoning.memoryBased ? "系统已把本次问题与 1602 的相关施工、返工、验收和交付记忆交叉匹配；下面的优先级来自这栋房子的历史，而不是通用故障清单。" : "当前没有足够的本楼施工记忆用于排序，因此只能退回一般工程机理。"}</p>
        </section>

        <section className={styles.hypothesisBlock}>
          <div className={styles.hypothesisHeader}>
            <span><CircleHelp size={14} />{reasoning.memoryBased ? "基于本楼记忆的诊断候选" : "工程推理"}</span>
            <em>{reasoning.memoryBased ? "建筑记忆优先" : "待验证假设"}</em>
          </div>
          <div className={styles.hypothesisGrid}>{reasoning.hypotheses.map((item) => <article className={styles.hypothesisCard} key={item.id}>
            <div className={styles.memoryMeta}><span>优先级 {item.priority}</span>{item.sourceRecordId ? <code>{item.sourceRecordId}</code> : <code>GENERAL</code>}</div>
            <strong>{item.title}</strong>
            <p>{item.mechanism}</p>
            {item.evidence ? <p className={styles.evidenceLine}>建筑记忆依据：{item.evidence}</p> : null}
            <small>怎么验证：{item.verification}</small>
          </article>)}</div>
        </section>

        <section className={styles.nextStepCard}>
          <div className={styles.sectionLabel}><Wrench size={14} />建议下一步</div>
          <strong>{reasoning.memoryBased ? "按这栋房子的历史顺序排查" : "先做最小成本排查"}</strong>
          <p>{reasoning.nextStep}</p>
        </section>

        <section className={styles.boundaryCard}>
          <div className={styles.sectionLabel}><ShieldCheck size={14} />事实边界</div>
          <p>{reasoning.boundary}</p>
        </section>
      </div> : null}

      {synthetic ? <div className={styles.demoNote}><TriangleAlert size={13} /><span>DEMO DATA</span><p>部分工程记录为合成数据；用于演示“建筑历史如何改变诊断顺序”，不冒充真实竣工档案。</p></div> : null}

      {result.visualDirective ? <div className="ai-visual-state"><Box size={14} /><span>3D 已响应</span><strong>{result.visualDirective.mode}</strong><small>{result.visualDirective.targetBusinessIds.length} 个空间对象</small></div> : null}
      {result.proposedAction ? <div className="ai-proposed-action"><ShieldCheck size={15} /><p><strong>只提出下一步：{result.proposedAction.type}</strong>需要独立人工授权；本次查询没有执行任何设备动作或事件状态变更。</p></div> : null}

      <details className={styles.technicalDetails}>
        <summary><Braces size={14} />技术详情<b>{result.toolTrace.length} 次工具调用 · {result.facts.length} facts</b></summary>
        <div className={styles.technicalBody}>
          <section className="ai-tool-trace"><header><Braces size={14} /><span>确定性工具轨迹</span></header>{result.toolTrace.map((item, index) => <article key={`${item.tool}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><div><strong>{item.tool}</strong><small>{Object.entries(item.arguments).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small></div><em>{item.status}</em></article>)}</section>
          <details className="ai-facts"><summary><Database size={14} />机器可验证 facts <b>{result.facts.length}</b></summary><div>{result.facts.map((fact) => <article key={fact.factId}><strong>{fact.subjectBusinessId}</strong><span>{fact.predicate}</span><p>{Array.isArray(fact.value) ? fact.value.join("、") : String(fact.value)}</p><small>{fact.sourceIds.join(" · ")}</small></article>)}</div></details>
          <section className="ai-sources"><header><ShieldCheck size={14} /><span>来源</span></header>{result.sources.map((source) => <article key={source.sourceId}><div><strong>{source.label}</strong><small>{source.sourceClass}</small></div><em className={source.synthetic ? "synthetic" : "verified"}>{source.synthetic ? "合成记录" : "可追溯"}</em><p>{source.note}</p></article>)}</section>
        </div>
      </details>
    </div><QuestionForm question={question} busy={busy} setQuestion={setQuestion} ask={ask} compact />
  </section>;
}

function GatewayBadge({ health, mode }: { health: GatewayHealth | null; mode?: BuildingAgentTurnResult["mode"] }) { const live = mode === "LIVE_AI" || mode === "LIVE_AI_CLARIFICATION" || (!mode && health?.providerConfigured); return <span className={`gateway-badge ${live ? "live" : "local"}`}><i />{live ? `${mode === "LIVE_AI_CLARIFICATION" ? "LIVE AI · CLARIFICATION" : "LIVE AI"} · ${health?.model ?? "DeepSeek"}` : "LOCAL READ-ONLY QUERY"}</span>; }
function QuestionForm({ question, busy, setQuestion, ask, compact = false }: { question: string; busy: boolean; setQuestion(value: string): void; ask(event?: FormEvent): void; compact?: boolean }) { return <form className={`building-ai-form ${compact ? "compact" : ""}`} onSubmit={ask}><label htmlFor={compact ? "building-question-next" : "building-question"}>向筑生提问</label><textarea id={compact ? "building-question-next" : "building-question"} value={question} onChange={(event) => setQuestion(event.target.value)} rows={compact ? 1 : 2} placeholder="例如：卫生间有臭味可能是什么原因？" /><button type="submit" aria-label="发送问题" disabled={!question.trim() || busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUp size={17} />}</button></form>; }
