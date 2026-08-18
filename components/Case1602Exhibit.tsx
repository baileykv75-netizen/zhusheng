"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, CircleDot, ExternalLink, LockKeyhole, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { BathroomTwinViewport } from "@/components/life-event/BathroomTwinViewport";
import { EvidenceTimeChain } from "@/components/EvidenceTimeChain";
import { BuildingIntelligenceWorkspace } from "@/components/BuildingIntelligenceWorkspace";
import { deriveJourneyView } from "@/lib/journey";
import type { VisualDirective } from "@/lib/life-event-engine/types";
import type { BuildingAgentTurnResult } from "@/lib/building-intelligence/types.ts";

const emptyDirective: VisualDirective = { view: "VIEW_CONSTRUCTION_MEMORY", highlightBusinessIds: ["J-1602-CW-03"], moistureState: "DRY", valvePosition: "OPEN", evidenceAnchorIds: ["EVIDENCE-ANCHOR-PIPE-INSTALL"], allowedActions: [], authorizationRequired: false };

type Chapter = { id: string; label: string; title: string; fact: string; why: string; href: string; action: string };

const chapters: Chapter[] = [
  { id: "memory", label: "01 / 施工留痕", title: "一份工友记录，后来真的被用上了", fact: "冷热水支管接头的施工口述、照片和保压结果已关联至1602卫生间。", why: "建造不是交付时被归档的过去，它是未来定位问题的第一份证据。", href: "/worker?from=case", action: "查看施工记忆" },
  { id: "observe", label: "02 / 潮湿发现", title: "住户只需描述眼前的异常", fact: "潮湿、微流量和水表变化进入同一栋房子的事件上下文。", why: "住户无需理解管线；系统先回到空间、构件和已经留下的记忆。", href: "/resident?mode=task", action: "进入联合诊断" },
  { id: "authorize", label: "03 / 人工授权", title: "关键动作，始终由人决定", fact: "关阀与恢复供水分别需要住户或物业的独立人工授权。", why: "智能体可以解释和编排，不能代替住户批准设备动作。", href: "/resident?mode=task&focus=authorization", action: "查看人工授权" },
  { id: "verify", label: "04 / 维修复验", title: "维修记录不是结论，新观察才是", fact: "维修后必须恢复供水，并以新的湿度和微流量观察验证结果。", why: "只有可重放的复验通过，事件才会被标记为已解决。", href: "/property?mode=task", action: "进入物业维修复验" },
  { id: "feedback", label: "05 / 经验回流", title: "一件事，不会被轻率地写成企业标准", fact: "已验证事件只生成单事件经验，经人工评审后最多形成PILOT_ONLY试点项。", why: "让经验生长，但不让系统用单个案例替人下结论。", href: "/group?mode=task", action: "进入人工评审" }
];

function activeChapter(resultState?: string) {
  if (!resultState) return 0;
  if (["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE", "ASSESSED", "ACTION_PROPOSED"].includes(resultState)) return 1;
  if (["AUTHORIZATION_PENDING", "AUTHORIZED", "SIMULATED_ACTION_APPLIED", "VERIFYING"].includes(resultState)) return 2;
  if (["ISOLATION_CONFIRMED", "REPAIR_PENDING", "REPAIR_RECORDED", "POST_REPAIR_VERIFYING", "REOPENED"].includes(resultState)) return 3;
  return 4;
}

export function Case1602Exhibit() {
  const { session, assets, assetError } = useLifecycleJourney();
  const result = session.result;
  const index = activeChapter(result?.state);
  const directive = result?.visualDirective ?? emptyDirective;
  const current = chapters[index];
  const isResolved = result?.state === "RESOLVED";
  const journeyAction = result ? deriveJourneyView({ source: "LIFE_EVENT", state: result.state }).primaryAction : null;
  const currentHref = journeyAction?.route ?? current.href;
  const currentAction = journeyAction?.label ?? current.action;
  const presentView = directive.view === "VIEW_CONSTRUCTION_MEMORY" ? "VIEW_RESIDENT" : directive.view;
  const [view, setView] = useState<VisualDirective["view"]>(directive.view);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(directive.highlightBusinessIds[0] ?? null);
  const [workspace, setWorkspace] = useState<"ai" | "event">("ai");
  const [buildingTurn, setBuildingTurn] = useState<BuildingAgentTurnResult | null>(null);

  useEffect(() => {
    setView(directive.view);
    setSelectedBusinessId(directive.highlightBusinessIds[0] ?? null);
  }, [directive]);

  return <div className="case-exhibit">
    <section className="case-intro">
      <div><p className="concept-kicker">筑生 / 1602建筑生命事件</p><h1 className="display-headline"><span className="display-headline-line">一件潮湿异常，</span><span className="display-headline-line">唤醒一栋房子的记忆</span></h1><p>从建造时留下的管线与工序，到入住后的现场观察、人工授权、维修和复验，所有动作都发生在同一条事件生命线上。</p></div>
      <aside><span>当前事件位置</span><strong>{current.label}</strong><p>{result ? `事件：${result.eventId}` : "尚未开启1602事件"}</p><Link href={currentHref}>继续处理 <ArrowRight size={15} /></Link></aside>
    </section>

    <section className="case-stage" aria-label="1602卫生间数字样间">
      <div className="case-model">
        <div className="case-time-switch" role="group" aria-label="数字样间时间视图">
          <button type="button" className={view === presentView ? "active" : ""} aria-pressed={view === presentView} onClick={() => setView(presentView)}>此刻</button>
          <button type="button" className={view === "VIEW_CONSTRUCTION_MEMORY" ? "active" : ""} aria-pressed={view === "VIEW_CONSTRUCTION_MEMORY"} onClick={() => setView("VIEW_CONSTRUCTION_MEMORY")}>建造时</button>
        </div>
        <BathroomTwinViewport assets={assets} externalError={assetError} directive={directive} view={view} selectedBusinessId={selectedBusinessId} onViewChange={setView} onSelect={setSelectedBusinessId} queryVisual={workspace === "ai" ? buildingTurn?.visualDirective : null} />
      </div>
      <div className="case-workspace">
        <nav aria-label="1602工作区切换"><button type="button" className={workspace === "ai" ? "active" : ""} onClick={() => setWorkspace("ai")}>筑生 AI</button><button type="button" className={workspace === "event" ? "active" : ""} onClick={() => setWorkspace("event")}>事件闭环 / 专业验证</button></nav>
        {workspace === "ai" ? <BuildingIntelligenceWorkspace selectedBusinessId={selectedBusinessId} result={buildingTurn} onResult={setBuildingTurn} /> : <article className="case-current-card"><p>{current.label}</p><h2 className="display-headline">{current.title}</h2><div><span>此刻发生了什么</span><strong>{current.fact}</strong></div><div><span>为什么重要</span><strong>{current.why}</strong></div><Link href={currentHref} className="case-primary">{currentAction} <ArrowRight size={17} /></Link><details><summary>查看事件详情 <ChevronDown size={15} /></summary><p>空间与构件来自1602卫生间GLB；业务状态、授权与审计由原有确定性领域引擎维护。</p></details></article>}
      </div>
    </section>

    <EvidenceTimeChain />

    <section className="case-route" aria-label="1602事件生命线">
      {chapters.map((chapter, chapterIndex) => {
        const available = chapterIndex <= index || isResolved;
        return <article key={chapter.id} className={chapterIndex === index ? "active" : chapterIndex < index || isResolved ? "done" : ""} aria-current={chapterIndex === index ? "step" : undefined}>
          <i>{chapterIndex < index || isResolved ? <CheckCircle2 size={16} /> : available ? <CircleDot size={15} /> : <LockKeyhole size={14} />}</i><span>{chapter.label}</span><strong>{chapter.title}</strong>
          {available ? <Link href={chapterIndex === index ? currentHref : chapter.href} aria-label={chapterIndex === index ? currentAction : chapter.action}><ExternalLink size={15} /></Link> : <button type="button" disabled aria-label={`${chapter.label}尚未解锁`}><LockKeyhole size={14} /></button>}
        </article>;
      })}
    </section>

    <section className="case-boundary"><LockKeyhole size={19} /><div><strong>这是一件有边界的建筑生命事件</strong><p>模型不批准授权，授权不自动执行阀门，维修记录不自动关闭事件，单次经验不自动成为企业标准。</p></div><Wrench size={19} /></section>
  </div>;
}
