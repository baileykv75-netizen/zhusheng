"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, CircleDot, ExternalLink, LockKeyhole, Wrench } from "lucide-react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { BathroomTwinViewport } from "@/components/life-event/BathroomTwinViewport";
import type { VisualDirective } from "@/lib/life-event-engine/types";

const emptyDirective: VisualDirective = { view: "VIEW_CONSTRUCTION_MEMORY", highlightBusinessIds: ["J-1602-CW-03"], moistureState: "DRY", valvePosition: "OPEN", evidenceAnchorIds: ["EVIDENCE-ANCHOR-PIPE-INSTALL"], allowedActions: [], authorizationRequired: false };

type Chapter = { id: string; label: string; title: string; fact: string; why: string; href: string; action: string };

const chapters: Chapter[] = [
  { id: "memory", label: "01 / 施工留痕", title: "一份工友记录，后来真的被用上了。", fact: "冷热水支管接头的施工口述、照片和保压结果已关联至1602卫生间。", why: "建造不是交付时被归档的过去，它是未来定位问题的第一份证据。", href: "/worker?from=case", action: "查看施工记忆" },
  { id: "observe", label: "02 / 潮湿发现", title: "住户只需描述眼前的异常。", fact: "潮湿、微流量和水表变化进入同一栋房子的事件上下文。", why: "住户无需理解管线；系统先回到空间、构件和已经留下的记忆。", href: "/resident?mode=task", action: "进入联合诊断" },
  { id: "authorize", label: "03 / 人工授权", title: "关键动作，始终由人决定。", fact: "关阀与恢复供水分别需要住户或物业的独立人工授权。", why: "智能体可以解释和编排，不能代替住户批准设备动作。", href: "/resident?mode=task&focus=authorization", action: "查看人工授权" },
  { id: "verify", label: "04 / 维修复验", title: "维修记录不是结论，新观察才是。", fact: "维修后必须恢复供水，并以新的湿度和微流量观察验证结果。", why: "只有可重放的复验通过，事件才会被标记为已解决。", href: "/resident?mode=task", action: "查看维修复验" },
  { id: "feedback", label: "05 / 经验回流", title: "一件事，不会被轻率地写成企业标准。", fact: "已验证事件只生成单事件经验，经人工评审后最多形成PILOT_ONLY试点项。", why: "让经验生长，但不让系统用单个案例替人下结论。", href: "/group?mode=task", action: "进入人工评审" }
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

  return <div className="case-exhibit">
    <section className="case-intro">
      <div><p className="concept-kicker">筑生 / 1602验证舱</p><h1>概念是否成立，<br />要回到一间真实的卫生间。</h1><p>这是一个脱敏合成样板，却使用同一份建筑记忆、构件拓扑、授权守卫和维修复验规则。它不是另一套故事，而是“房子不该失忆”的一次完整证明。</p></div>
      <aside><span>当前验证位置</span><strong>{current.label}</strong><p>{result ? `当前事件：${result.eventId}` : "尚未开启当前事件"}</p><Link href={current.href}>继续当前验证 <ArrowRight size={15} /></Link></aside>
    </section>

    <section className="case-stage" aria-label="1602卫生间数字样间">
      <div className="case-model"><BathroomTwinViewport assets={assets} externalError={assetError} directive={directive} view={directive.view} selectedBusinessId={directive.highlightBusinessIds[0] ?? null} onViewChange={() => undefined} onSelect={() => undefined} /></div>
      <article className="case-current-card"><p>{current.label}</p><h2>{current.title}</h2><div><span>此刻发生了什么</span><strong>{current.fact}</strong></div><div><span>为什么重要</span><strong>{current.why}</strong></div><Link href={current.href} className="case-primary">{current.action} <ArrowRight size={17} /></Link><details><summary>查看验证详情 <ChevronDown size={15} /></summary><p>模型来自1602卫生间GLB；业务状态、授权与审计仍由原有确定性领域引擎维护。</p></details></article>
    </section>

    <section className="case-route" aria-label="1602验证路径">
      {chapters.map((chapter, chapterIndex) => <article key={chapter.id} className={chapterIndex === index ? "active" : chapterIndex < index || isResolved ? "done" : ""}>
        <i>{chapterIndex < index || isResolved ? <CheckCircle2 size={16} /> : <CircleDot size={15} />}</i><span>{chapter.label}</span><strong>{chapter.title}</strong><Link href={chapter.href} aria-label={chapter.action}><ExternalLink size={15} /></Link>
      </article>)}
    </section>

    <section className="case-boundary"><LockKeyhole size={19} /><div><strong>这是一个有边界的验证舱。</strong><p>模型不批准授权，授权不自动执行阀门，维修记录不自动关闭事件，单次经验不自动成为企业标准。</p></div><Wrench size={19} /></section>
  </div>;
}
