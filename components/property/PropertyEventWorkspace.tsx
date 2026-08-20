"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Database, ShieldCheck, Wrench } from "lucide-react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";
import { BathroomTwinViewport } from "@/components/life-event/BathroomTwinViewport";
import { PropertyWorkbench } from "@/components/life-event/ResidentTaskWorkbench";
import { derivePropertyEventViewModel } from "@/lib/product/property-event-view-model";
import type { VisualDirective } from "@/lib/life-event-engine/types.ts";
import styles from "./PropertyEventWorkspace.module.css";

const defaultDirective: VisualDirective = {
  view: "VIEW_RESIDENT",
  highlightBusinessIds: [],
  moistureState: "DRY",
  valvePosition: "OPEN",
  evidenceAnchorIds: [],
  allowedActions: [],
  authorizationRequired: false
};

const signalLabels = {
  ELEVATED_HISTORY: "历史特殊节点",
  SCOPE_LIMIT: "检查边界",
  RUNTIME_CONTEXT: "运行记录",
  BACKGROUND: "背景记录"
} as const;

export function PropertyEventWorkspace({ onOpenAdvanced }: { onOpenAdvanced(): void }) {
  const { session, setSession, assets, assetError } = useLifecycleJourney();
  const product = useBuildingProductContext();
  const [taskOpen, setTaskOpen] = useState(false);
  const model = useMemo(() => derivePropertyEventViewModel(session), [session]);
  const sourceDirective = session.result?.visualDirective ?? defaultDirective;
  const directive: VisualDirective = model.pendingResidentAssessment && session.result
    ? {
        ...sourceDirective,
        view: "VIEW_RESIDENT",
        highlightBusinessIds: [],
        evidenceAnchorIds: [],
        allowedActions: [],
        authorizationRequired: false
      }
    : sourceDirective;
  const next = model.projection.nextAction;

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (!focus) return;
    setTaskOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }));
  }, []);

  function openTask(focus?: string) {
    setTaskOpen(true);
    if (!focus) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }));
  }

  function selectMemory(businessIds: string[]) {
    const target = businessIds[0] ?? null;
    setSession((current) => ({
      ...current,
      selectedBusinessId: target,
      selectedView: "VIEW_CONSTRUCTION_MEMORY"
    }));
  }

  const focusTarget = next.destination.kind === "FOCUS" ? next.destination.focus : null;
  const contextLine = model.pendingResidentAssessment
    ? model.result
      ? `事件 ${model.result.eventId} 保留上一轮状态；新住户事实等待本轮物业确认`
      : "现场事实已受理但尚未形成正式 Life Event；等待物业确认本轮系统观测"
    : model.result
      ? "当前事件与建筑记忆连续可追溯"
      : "当前没有正式生命事件；模板值不会作为现场事实展示";

  return <section className={styles.workspace} aria-label="1602物业事件工作台">
    <header className={styles.eventHeader}>
      <div>
        <span className={styles.eyebrow}>PROPERTY OPERATIONS · {model.eventId}</span>
        <h1>{model.spaceLabel}</h1>
        <p>{product.buildingLabel} / 16F / 1602 · {contextLine}</p>
      </div>
      <div className={styles.headerActions}>
        <span className={styles.stateBadge}><i />{model.projection.stateLabel}</span>
        <button className={styles.advancedButton} type="button" onClick={onOpenAdvanced}>高级验证</button>
      </div>
    </header>

    <div className={styles.primaryGrid}>
      <section className={styles.scene} aria-label="1602卫生间建筑上下文">
        <div className={styles.sceneHead}>
          <div>
            <span className={styles.sectionLabel}>BUILDING CONTEXT</span>
            <strong>定位当前空间、系统与隐蔽历史</strong>
          </div>
          <small>{product.queryVisual ? `已按最近一次建筑查询定位 ${product.queryVisual.mode} 视图` : model.pendingResidentAssessment ? "本轮新事实尚未评估，不自动沿用上一轮候选高亮" : "点击建筑记忆可回到对应施工阶段"}</small>
        </div>
        <div className={styles.sceneViewport}>
          <BathroomTwinViewport
            assets={assets}
            externalError={assetError}
            directive={directive}
            view={model.pendingResidentAssessment ? "VIEW_RESIDENT" : session.selectedView}
            selectedBusinessId={model.pendingResidentAssessment ? null : session.selectedBusinessId}
            queryVisual={product.queryVisual}
            onViewChange={(selectedView) => setSession((current) => ({ ...current, selectedView }))}
            onSelect={(selectedBusinessId) => product.setSelectedBusinessId(selectedBusinessId)}
          />
        </div>
      </section>

      <aside className={styles.decisionPane}>
        <section className={styles.assessment}>
          <span className={styles.sectionLabel}>{model.pendingResidentAssessment ? "CURRENT INTAKE" : "CURRENT ASSESSMENT"}</span>
          <h2>{model.assessment.title}</h2>
          <p>{model.assessment.explanation}</p>
          <div className={styles.confidence}>
            <ShieldCheck size={14} />
            <span>{model.pendingResidentAssessment ? "本轮状态" : "当前判断置信度"}：{model.assessment.confidence}</span>
            {model.assessment.targetBusinessIds[0] ? <span>· {model.assessment.targetBusinessIds[0]}</span> : null}
          </div>
        </section>

        <div className={styles.observations}>
          {model.observations.length ? model.observations.map((item) => <div className={styles.observation} key={item.id}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>) : <div className={styles.observation}><span>当前观测</span><strong>尚未形成事件观测</strong></div>}
        </div>

        <section className={styles.memorySection} aria-label="当前相关建筑记忆">
          <div className={styles.sectionHead}>
            <strong><Database size={14} /> 这栋房子记得什么</strong>
            <small>{model.pendingResidentAssessment ? "本轮评估前仅按空间浏览，不沿用上一轮诊断排序" : model.result ? "按当前事件事实相关性排序" : "仅按当前空间浏览，不代表诊断优先级"}</small>
          </div>
          <div className={styles.memoryList}>
            {model.relevantMemories.slice(0, 3).map((memory) => <button
              type="button"
              className={styles.memoryButton}
              key={memory.recordId}
              onClick={() => selectMemory(memory.relatedBusinessIds)}
            >
              <div className={styles.memoryTop}>
                <strong>{memory.occurredAt.slice(0, 10).replaceAll("-", ".")} · {memory.title}</strong>
                <span className={styles.memorySignal} data-signal={memory.historicalSignal}>{signalLabels[memory.historicalSignal]}</span>
              </div>
              <p>{memory.summary}</p>
              <div className={styles.memoryReasons}>{memory.reasons.slice(0, 4).map((reason) => <span key={`${memory.recordId}-${reason.code}-${reason.detail ?? ""}`}>{reason.label}{reason.detail ? ` · ${reason.detail}` : ""}</span>)}</div>
            </button>)}
          </div>
        </section>

        <section className={styles.gapSection} aria-label="当前证据缺口">
          <div className={styles.sectionHead}>
            <strong><Clock3 size={14} /> 当前还缺什么</strong>
            <small>{model.evidenceGaps.length ? `${model.evidenceGaps.length} 项` : "当前阶段已齐"}</small>
          </div>
          <div className={styles.gapList}>
            {model.evidenceGaps.slice(0, 2).map((gap) => <div className={styles.gapItem} key={gap.id}>
              <div className={styles.gapMeta}><span>{gap.actor}</span><span>待补证</span></div>
              <strong>{gap.label}</strong>
              <p>{gap.reason}</p>
            </div>)}
            {!model.evidenceGaps.length ? <div className={styles.gapItem}><strong>当前阶段没有新增证据缺口</strong><p>继续按当前下一步推进。</p></div> : null}
          </div>
        </section>

        <section className={styles.nextAction}>
          <span className={styles.sectionLabel}><Wrench size={13} /> UNIQUE NEXT ACTION · {next.actor}</span>
          <strong>{next.label}</strong>
          <p>{model.projection.summary}</p>
          {next.destination.kind === "ROUTE"
            ? <Link className={styles.primaryAction} href={next.destination.href}>{next.label}<ArrowRight size={15} /></Link>
            : <button className={styles.primaryAction} type="button" onClick={() => openTask(focusTarget ?? undefined)}>{next.label}<ArrowRight size={15} /></button>}
        </section>
      </aside>
    </div>

    <div className={styles.detailsStrip}>
      <div>
        <strong>完整处理记录</strong>
        <p>住户原始证据、物业复核、授权、阀门执行、维修与复验按当前事件阶段展开。</p>
      </div>
      <div className={styles.detailsActions}>
        <Link className={styles.secondaryButton} href="/memory">查看完整建筑记忆</Link>
        <Link className={styles.secondaryButton} href="/events">返回事件中心</Link>
        <button className={styles.secondaryButton} type="button" onClick={() => setTaskOpen((value) => !value)}>{taskOpen ? "收起处理任务" : "展开处理任务"}</button>
      </div>
    </div>

    <details className={styles.taskDetails} open={taskOpen} onToggle={(event) => setTaskOpen(event.currentTarget.open)}>
      <summary>物业完整事件处理</summary>
      {taskOpen ? <PropertyWorkbench queryVisual={product.queryVisual} onOpenAdvanced={onOpenAdvanced} /> : null}
    </details>

    <details className={styles.technical}>
      <summary>数据与技术详情</summary>
      <div className={styles.technicalBody}>
        <div><span>事件真相</span><strong>{model.projection.state}</strong><p>事件状态来自确定性生命周期引擎。</p></div>
        <div><span>阀门物理状态</span><strong>{model.projection.physicalTruth.valvePosition}</strong><p>授权记录本身不会执行阀门动作。</p></div>
        <div><span>审计记录</span><strong>{model.projection.physicalTruth.auditCount}</strong><p>{model.projection.safetyBoundary}</p></div>
      </div>
    </details>
  </section>;
}