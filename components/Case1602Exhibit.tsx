"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, CircleDot, ExternalLink, LockKeyhole, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";
import { BathroomTwinViewport } from "@/components/life-event/BathroomTwinViewport";
import { EvidenceTimeChain } from "@/components/EvidenceTimeChain";
import { derivePropertyEventViewModel } from "@/lib/product/property-event-view-model";
import type { LifeEventState, VisualDirective } from "@/lib/life-event-engine/types";
import styles from "./Case1602Exhibit.module.css";

const emptyDirective: VisualDirective = { view: "VIEW_CONSTRUCTION_MEMORY", highlightBusinessIds: ["J-1602-CW-03"], moistureState: "DRY", valvePosition: "OPEN", evidenceAnchorIds: ["EVIDENCE-ANCHOR-PIPE-INSTALL"], allowedActions: [], authorizationRequired: false };

type StoryStageId = "past" | "present" | "action" | "result";
type StoryStage = {
  id: StoryStageId;
  label: string;
  shortLabel: string;
  title: string;
  fact: string;
  why: string;
  action: string;
  href: string;
  view: VisualDirective["view"];
};

const stageOrder: StoryStageId[] = ["past", "present", "action", "result"];

function lifecycleStage(state?: LifeEventState): StoryStageId {
  if (!state) return "past";
  if (["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE", "ASSESSED", "ACTION_PROPOSED"].includes(state)) return "present";
  if (["AUTHORIZATION_PENDING", "AUTHORIZED", "SIMULATED_ACTION_APPLIED", "VERIFYING", "ISOLATION_CONFIRMED", "REPAIR_PENDING", "REPAIR_RECORDED", "POST_REPAIR_VERIFYING", "REOPENED"].includes(state)) return "action";
  return "result";
}

function actionHref(destination: ReturnType<typeof derivePropertyEventViewModel>["projection"]["nextAction"]["destination"]) {
  if (destination.kind === "ROUTE") return destination.href;
  return `/property?mode=task&focus=${destination.focus}`;
}

export function Case1602Exhibit() {
  const { session, assets, assetError } = useLifecycleJourney();
  const product = useBuildingProductContext();
  const model = useMemo(() => derivePropertyEventViewModel(session), [session]);
  const result = session.result;
  const directive = result?.visualDirective ?? emptyDirective;
  const presentView = directive.view === "VIEW_CONSTRUCTION_MEMORY" ? "VIEW_RESIDENT" : directive.view;
  const currentLifecycleStage = lifecycleStage(result?.state);
  const [storyStage, setStoryStage] = useState<StoryStageId>(currentLifecycleStage);
  const [view, setView] = useState<VisualDirective["view"]>(directive.view);

  useEffect(() => {
    const nextStage = lifecycleStage(result?.state);
    setStoryStage(nextStage);
    setView(result?.state ? presentView : "VIEW_CONSTRUCTION_MEMORY");
  }, [presentView, result?.state]);

  const stages = useMemo<Record<StoryStageId, StoryStage>>(() => {
    const observationText = model.observations.map((item) => `${item.label} ${item.value}`).join("；");
    const next = model.projection.nextAction;
    const resolved = result?.state === "RESOLVED";
    return {
      past: {
        id: "past",
        label: "过去 / 建造记忆",
        shortLabel: "过去",
        title: "墙封起来以后 施工经历没有消失",
        fact: "1602的施工、现场调整、返工和验收边界仍然按构件与系统留在 Building Memory 中。",
        why: "这些历史会改变今天的排查顺序，但历史相关性不等于当前故障结论。",
        action: "打开完整建筑记忆",
        href: "/memory?record=REC-CONST-CW-J03-REWORK-01",
        view: "VIEW_CONSTRUCTION_MEMORY"
      },
      present: {
        id: "present",
        label: "此刻 / 当前事件",
        shortLabel: "此刻",
        title: model.assessment.title,
        fact: observationText,
        why: model.assessment.explanation,
        action: "进入物业当前判断",
        href: "/property?mode=task",
        view: presentView
      },
      action: {
        id: "action",
        label: "处置 / 人工门禁",
        shortLabel: "处置",
        title: next.label,
        fact: model.projection.summary,
        why: model.projection.safetyBoundary,
        action: next.label,
        href: actionHref(next.destination),
        view: directive.view === "VIEW_CONSTRUCTION_MEMORY" ? "VIEW_DIAGNOSTIC" : directive.view
      },
      result: {
        id: "result",
        label: "结果 / 验证与留下经验",
        shortLabel: "结果",
        title: resolved ? "事件已经闭环 经历继续留下" : "结果不会被提前写好",
        fact: resolved
          ? `EVT-1602 已通过确定性复验闭环，当前事件链保留 ${result.auditLog.length} 条审计记录与 ${result.repairRecords.length} 条维修记录。`
          : `当前仍处于“${model.projection.stateLabel}”；维修记录、授权或单次动作都不能提前替代最终复验。`,
        why: resolved
          ? "事件经历可以进入企业经验候选，但单个案例仍不能自动升级成企业标准。"
          : "只有维修后的新观察满足验证条件，事件才能进入 RESOLVED；否则继续保持未完成或重新打开。",
        action: resolved ? "查看经验如何被治理" : "继续完成当前事件",
        href: resolved ? "/group?mode=task" : "/property?mode=task",
        view: "VIEW_MAINTENANCE"
      }
    };
  }, [directive.view, model, presentView, result]);

  const current = stages[storyStage];
  const currentIndex = stageOrder.indexOf(currentLifecycleStage);

  function selectStoryStage(id: StoryStageId) {
    setStoryStage(id);
    setView(stages[id].view);
  }

  return <div className="case-exhibit">
    <section className="case-intro">
      <div><p className="concept-kicker">筑生 / 1602建筑生命事件</p><h1 className="display-headline"><span className="display-headline-line">一件潮湿异常</span><span className="display-headline-line">唤醒一栋房子的记忆</span></h1><p>从建造时留下的现场经历，到入住后的异常、判断、人工动作与最终验证，一件事始终沿着同一栋房子的生命线向前推进。</p></div>
      <aside><span>当前真实阶段</span><strong>{stages[currentLifecycleStage].label}</strong><p>{result ? `事件：${result.eventId} · ${model.projection.stateLabel}` : "尚未开启1602事件；先查看它在建造期留下了什么"}</p><Link href={actionHref(model.projection.nextAction.destination)}>继续当前任务 <ArrowRight size={15} /></Link></aside>
    </section>

    <section className="case-stage" aria-label="1602卫生间数字样间">
      <div className="case-model">
        <div className="case-time-switch" role="group" aria-label="数字样间时间视图">
          <button type="button" className={view === presentView ? "active" : ""} aria-pressed={view === presentView} onClick={() => setView(presentView)}>此刻</button>
          <button type="button" className={view === "VIEW_CONSTRUCTION_MEMORY" ? "active" : ""} aria-pressed={view === "VIEW_CONSTRUCTION_MEMORY"} onClick={() => setView("VIEW_CONSTRUCTION_MEMORY")}>建造时</button>
        </div>
        <BathroomTwinViewport
          assets={assets}
          externalError={assetError}
          directive={directive}
          view={view}
          selectedBusinessId={product.selectedBusinessId ?? directive.highlightBusinessIds[0] ?? null}
          onViewChange={setView}
          onSelect={product.setSelectedBusinessId}
          queryVisual={product.queryVisual}
        />
      </div>

      <div className="case-workspace">
        <nav aria-label="1602事件时间导航">
          {stageOrder.map((id) => <button type="button" key={id} className={storyStage === id ? "active" : ""} onClick={() => selectStoryStage(id)}>{stages[id].shortLabel}</button>)}
        </nav>
        <article className="case-current-card">
          <p>{current.label}</p>
          <h2 className="display-headline">{current.title}</h2>
          {storyStage === "past" ? <div className={styles.memoryList}>{model.relevantMemories.slice(0, 3).map((memory) => <div className={styles.memoryItem} key={memory.recordId}><span>{memory.occurredAt.slice(0, 10).replaceAll("-", ".")} · {memory.historicalSignal}</span><strong>{memory.title}</strong><p>{memory.summary}</p></div>)}</div> : null}
          <div><span>这一阶段发生什么</span><strong>{current.fact}</strong></div>
          <div><span>为什么重要</span><strong>{current.why}</strong></div>
          <div className={styles.storyMeta}>
            <div><span>事件真相</span><strong>{model.projection.stateLabel}</strong></div>
            <div><span>当前下一步</span><strong>{model.projection.nextAction.label}</strong></div>
            <div><span>Ask Building</span><strong>{product.agentResult ? "已保留最近一次建筑查询，可从顶部继续追问" : "可从顶部“问这栋房子”发起只读建筑查询"}</strong></div>
          </div>
          <Link href={current.href} className="case-primary">{current.action} <ArrowRight size={17} /></Link>
          <details><summary>查看事实边界 <ChevronDown size={15} /></summary><p>空间与构件来自1602数字样间；建筑记忆由确定性相关性规则参与排序；事件状态、授权、阀门与维修结果仍由原有确定性领域引擎维护。</p></details>
        </article>
      </div>
    </section>

    <details className={styles.evidenceDetails}>
      <summary><span>展开证据时间链</span><small>住户观察、系统事实与事件证据仍完整保留，但不占据默认主叙事</small></summary>
      <EvidenceTimeChain />
    </details>

    <section className="case-route" aria-label="1602事件生命线">
      {stageOrder.map((id, stageIndex) => {
        const stage = stages[id];
        const isCurrent = id === currentLifecycleStage;
        const completed = stageIndex < currentIndex || result?.state === "RESOLVED";
        const status = isCurrent ? "当前真实阶段" : completed ? "事件已经过" : "工作流后续阶段";
        return <article key={id} className={isCurrent ? "active" : completed ? "done" : ""} aria-current={isCurrent ? "step" : undefined}>
          <i>{completed ? <CheckCircle2 size={16} /> : isCurrent ? <CircleDot size={15} /> : <LockKeyhole size={14} />}</i>
          <span>{stage.label}</span>
          <strong>{stage.title}</strong>
          <small className={styles.routeStatus}>{status}</small>
          <a href={`#case-${id}`} onClick={(event) => { event.preventDefault(); selectStoryStage(id); }} aria-label={`查看${stage.label}`}><ExternalLink size={15} /></a>
        </article>;
      })}
    </section>

    <section className="case-boundary"><LockKeyhole size={19} /><div><strong>这是一件有边界的建筑生命事件</strong><p>模型不批准授权，授权不自动执行阀门，维修记录不自动关闭事件，单次经验不自动成为企业标准。</p></div><Wrench size={19} /></section>
  </div>;
}
