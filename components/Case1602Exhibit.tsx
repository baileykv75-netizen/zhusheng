"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, ChevronDown, CircleDot, ExternalLink, LockKeyhole, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";
import { BathroomTwinViewport } from "@/components/life-event/BathroomTwinViewport";
import { EvidenceTimeChain } from "@/components/EvidenceTimeChain";
import { building1602Dataset, entityById } from "@/lib/building-intelligence/catalog";
import { traceSystem } from "@/lib/building-intelligence/queries";
import type { RelevantBuildingMemory } from "@/lib/building-intelligence/memory-relevance";
import type { QueryVisualDirective } from "@/lib/building-intelligence/types";
import { derivePropertyEventViewModel } from "@/lib/product/property-event-view-model";
import type { ProductEvidenceRecord } from "@/lib/product/evidence";
import type { LifeEventState, VisualDirective } from "@/lib/life-event-engine/types";
import styles from "./Case1602Exhibit.module.css";

const emptyDirective: VisualDirective = { view: "VIEW_CONSTRUCTION_MEMORY", highlightBusinessIds: [], moistureState: "DRY", valvePosition: "OPEN", evidenceAnchorIds: [], allowedActions: [], authorizationRequired: false };

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

type SpaceFocusReason = {
  status: string;
  title: string;
  detail: string;
};

type SpatialFocusState = {
  kind: "MEMORY" | "EVIDENCE" | "CANDIDATE" | "SYSTEM" | "MODEL";
  label: string;
  businessId: string | null;
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

function hasCompletedActionHistory(result: ReturnType<typeof derivePropertyEventViewModel>["result"]) {
  if (!result) return false;
  return result.auditLog.some((entry) => [
    "SIMULATED_VALVE_CLOSED",
    "ISOLATION_CONFIRMED",
    "REPAIR_RESULT_RECORDED",
    "SIMULATED_VALVE_REOPENED",
    "POST_REPAIR_VERIFICATION_FAILED"
  ].includes(entry.actionType));
}

function firstSpecificBusinessId(ids: readonly string[]) {
  return ids.find((id) => !id.startsWith("SPACE-") && !id.startsWith("SYS-"))
    ?? ids[0]
    ?? null;
}

export function Case1602Exhibit() {
  const searchParams = useSearchParams();
  const { session, assets, assetError } = useLifecycleJourney();
  const product = useBuildingProductContext();
  const enteredFromBuilding = searchParams.get("entry") === "building";
  const model = useMemo(() => derivePropertyEventViewModel(session), [session]);
  const result = session.result;
  const latestResidentSubmission = session.residentSubmissions?.at(-1) ?? null;
  const sourceDirective = result?.visualDirective ?? emptyDirective;
  const directive: VisualDirective = model.pendingResidentAssessment && result
    ? {
        ...sourceDirective,
        view: "VIEW_RESIDENT",
        highlightBusinessIds: [],
        evidenceAnchorIds: [],
        allowedActions: [],
        authorizationRequired: false
      }
    : sourceDirective;
  const presentView = directive.view === "VIEW_CONSTRUCTION_MEMORY" ? "VIEW_RESIDENT" : directive.view;
  const currentLifecycleStage = model.pendingResidentAssessment ? "present" : lifecycleStage(result?.state);
  const previousActionCompleted = hasCompletedActionHistory(result);
  const [storyStage, setStoryStage] = useState<StoryStageId>(currentLifecycleStage);
  const [view, setView] = useState<VisualDirective["view"]>(directive.view);
  const [spatialSelectionId, setSpatialSelectionId] = useState<string | null>(null);
  const [caseQueryVisual, setCaseQueryVisual] = useState<QueryVisualDirective | null>(null);
  const [spatialFocus, setSpatialFocus] = useState<SpatialFocusState | null>(null);

  useEffect(() => {
    const nextStage = model.pendingResidentAssessment ? "present" : lifecycleStage(result?.state);
    setStoryStage(nextStage);
    setView(result?.state || model.pendingResidentAssessment ? presentView : "VIEW_CONSTRUCTION_MEMORY");
  }, [model.pendingResidentAssessment, presentView, result?.state]);

  useEffect(() => {
    setSpatialSelectionId(null);
    setCaseQueryVisual(null);
    setSpatialFocus(null);
  }, [model.latestResidentSubmissionId, result?.eventId, result?.state]);

  const focusReason: SpaceFocusReason = model.pendingResidentAssessment
    ? result
      ? {
          status: "NEW FACTS / REASSESS",
          title: "新的住户事实把这个空间重新带回调查焦点",
          detail: `${result.eventId} 的历史与上一轮处置仍然保留；当前只说明存在新的可评估现场事实，本轮系统观测还需要物业重新确认。`
        }
      : {
          status: "INTAKE / NOT YET EVENT",
          title: "住户现场事实已经把1602卫生间带入受理流程",
          detail: "当前尚未形成正式事件。这个空间被定位，是因为这里存在待物业确认的领域可用住户事实，而不是因为系统已经证明了故障。"
        }
    : result
      ? result.state === "RESOLVED"
        ? {
            status: "VERIFIED EVENT / RESOLVED",
            title: "这个空间保留着一次已经验证闭环的建筑生命事件",
            detail: `${result.eventId} 已完成确定性复验。继续定位到这里，是为了查看同一空间中的建造记忆、事件证据、人工动作和最终结果如何保持连续。`
          }
        : {
            status: `LIFE EVENT / ${result.state}`,
            title: "当前正式事件正在这个空间的生命线上推进",
            detail: `${result.eventId} 当前处于“${model.projection.stateLabel}”。空间定位来自实际事件上下文，后续判断和动作仍由受控流程决定。`
          }
      : latestResidentSubmission?.domainAdapterStatus === "PRODUCT_ONLY"
        ? {
            status: "PRODUCT EVIDENCE / NOT EVENT",
            title: "这里有住户事实，但它没有被冒充成漏水事件",
            detail: "最近一条住户提交只属于 Product Evidence，不进入漏水领域评估。1602卫生间仍作为当前深度案例空间展示，但当前会话没有因此形成正式事件。"
          }
        : {
            status: "FEATURED CASE / NOT LIVE",
            title: "这是当前产品的深度案例空间，不代表此刻已经发生故障",
            detail: "筑生用1602卫生间串起建造记忆、住户协作、物业判断与事件闭环。只有当前会话产生真实事实并满足规则时，案例空间才会成为正式事件空间。"
          };

  const stages = useMemo<Record<StoryStageId, StoryStage>>(() => {
    const observationText = model.observations.length
      ? model.observations.map((item) => `${item.label} ${item.value}`).join("；")
      : model.pendingResidentAssessment
        ? "新的住户现场事实已经受理；本轮系统观测尚未由物业确认，因此不展示上一轮候选作为当前判断。"
        : "当前还没有形成可用于事件判断的观测；先收集住户实际看到的现场事实。";
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
        action: model.pendingResidentAssessment ? "进入物业确认本轮观测" : "进入物业当前判断",
        href: "/property?mode=task",
        view: presentView
      },
      action: {
        id: "action",
        label: "处置 / 人工门禁",
        shortLabel: "处置",
        title: model.pendingResidentAssessment && previousActionCompleted ? "上一轮处置完整保留，本轮尚未重新进入动作阶段" : next.label,
        fact: model.pendingResidentAssessment && previousActionCompleted ? "上一轮授权、阀门动作、维修与复验仍在原事件审计链中；新的住户事实不会覆盖这些历史，也不会自动复用上一轮动作。" : model.projection.summary,
        why: model.projection.safetyBoundary,
        action: model.pendingResidentAssessment ? "先完成本轮重新评估" : next.label,
        href: model.pendingResidentAssessment ? "/property?mode=task" : actionHref(next.destination),
        view: directive.view === "VIEW_CONSTRUCTION_MEMORY" ? "VIEW_DIAGNOSTIC" : directive.view
      },
      result: {
        id: "result",
        label: "结果 / 验证与留下经验",
        shortLabel: "结果",
        title: resolved ? "事件已经闭环 经历继续留下" : "结果不会被提前写好",
        fact: resolved
          ? `${result.eventId} 已通过确定性复验闭环，当前事件链保留 ${result.auditLog.length} 条审计记录与 ${result.repairRecords.length} 条维修记录。`
          : model.pendingResidentAssessment
            ? `当前正式事件仍是 ${result?.eventId ?? "未形成"}；新住户事实正在等待本轮评估，上一轮结果不会被当作本轮结论。`
            : `当前仍处于“${model.projection.stateLabel}”；维修记录、授权或单次动作都不能提前替代最终复验。`,
        why: resolved
          ? "事件经历可以进入企业经验候选，但单个案例仍不能自动升级成企业标准。"
          : "只有维修后的新观察满足验证条件，事件才能进入 RESOLVED；否则继续保持未完成或重新打开。",
        action: resolved ? "查看经验如何被治理" : "继续完成当前事件",
        href: resolved ? "/group?mode=task" : "/property?mode=task",
        view: "VIEW_MAINTENANCE"
      }
    };
  }, [directive.view, model, presentView, previousActionCompleted, result]);

  const spatialEvidence = [...(session.productEvidenceTimeline ?? [])].reverse().slice(0, 4);
  const systemSourceBusinessIds = [
    ...model.assessment.targetBusinessIds,
    ...model.relevantMemories.flatMap((memory) => [...memory.subjectBusinessIds, ...memory.relatedBusinessIds]),
    ...spatialEvidence.flatMap((evidence) => evidence.relatedBusinessIds)
  ];
  const relatedSystemIds = new Set(systemSourceBusinessIds.flatMap((businessId) => {
    const directSystem = building1602Dataset.systems.find((system) => system.businessId === businessId);
    if (directSystem) return [directSystem.businessId];
    const entity = entityById(businessId);
    return entity?.systemId ? [entity.systemId] : [];
  }));
  const relatedSystems = building1602Dataset.systems.filter((system) => relatedSystemIds.has(system.businessId)).slice(0, 4);

  const current = stages[storyStage];
  const currentIndex = stageOrder.indexOf(currentLifecycleStage);
  const selectedSceneBusinessId = spatialSelectionId
    ?? (model.pendingResidentAssessment
      ? null
      : product.selectedBusinessId ?? (result ? directive.highlightBusinessIds[0] ?? null : null));
  const activeQueryVisual = caseQueryVisual ?? product.queryVisual;

  function selectStoryStage(id: StoryStageId) {
    setStoryStage(id);
    setView(stages[id].view);
  }

  function applyDirectSpatialFocus(input: {
    kind: SpatialFocusState["kind"];
    label: string;
    businessId: string;
    nextView: VisualDirective["view"];
    nextStage: StoryStageId;
  }) {
    setCaseQueryVisual(null);
    setSpatialSelectionId(input.businessId);
    product.setSelectedBusinessId(input.businessId);
    setSpatialFocus({ kind: input.kind, label: input.label, businessId: input.businessId });
    setStoryStage(input.nextStage);
    setView(input.nextView);
  }

  function focusMemory(memory: RelevantBuildingMemory) {
    const businessId = firstSpecificBusinessId(memory.relatedBusinessIds.length ? memory.relatedBusinessIds : memory.subjectBusinessIds);
    if (!businessId) return;
    applyDirectSpatialFocus({
      kind: "MEMORY",
      label: `建筑记忆 · ${memory.title}`,
      businessId,
      nextView: "VIEW_CONSTRUCTION_MEMORY",
      nextStage: "past"
    });
  }

  function focusEvidence(evidence: ProductEvidenceRecord) {
    const businessId = firstSpecificBusinessId(evidence.relatedBusinessIds) ?? evidence.spaceId;
    applyDirectSpatialFocus({
      kind: "EVIDENCE",
      label: `Product Evidence · ${evidence.type}`,
      businessId,
      nextView: "VIEW_RESIDENT",
      nextStage: "present"
    });
  }

  function focusCandidate(businessId: string) {
    const entity = entityById(businessId);
    applyDirectSpatialFocus({
      kind: "CANDIDATE",
      label: `当前候选 · ${entity?.displayName ?? businessId}`,
      businessId,
      nextView: "VIEW_DIAGNOSTIC",
      nextStage: "present"
    });
  }

  function focusSystem(systemId: string) {
    const system = building1602Dataset.systems.find((item) => item.businessId === systemId);
    if (!system) return;
    const trace = traceSystem(systemId);
    if (trace.status !== "OK") return;
    const targetBusinessIds = system.memberIds.filter((businessId) => Boolean(entityById(businessId)));
    const primaryBusinessId = targetBusinessIds[0] ?? null;
    const visual: QueryVisualDirective = {
      mode: "SYSTEM_TRACE",
      targetBusinessIds,
      revealBusinessIds: trace.businessIds,
      sourceTool: "trace_system"
    };
    setCaseQueryVisual(visual);
    setSpatialSelectionId(primaryBusinessId);
    product.setSelectedBusinessId(primaryBusinessId);
    setSpatialFocus({ kind: "SYSTEM", label: `系统追踪 · ${system.displayName}`, businessId: system.businessId });
    setStoryStage("present");
    setView("VIEW_DIAGNOSTIC");
  }

  function handleTwinSelect(businessId: string | null) {
    setCaseQueryVisual(null);
    setSpatialSelectionId(businessId);
    product.setSelectedBusinessId(businessId);
    setSpatialFocus(businessId ? { kind: "MODEL", label: `3D直接选择 · ${businessId}`, businessId } : null);
  }

  function clearSpatialFocus() {
    setCaseQueryVisual(null);
    setSpatialSelectionId(null);
    product.setSelectedBusinessId(null);
    setSpatialFocus(null);
  }

  return <div className="case-exhibit">
    <nav className={styles.spatialHandoff} aria-label="从建筑进入1602卫生间的空间路径">
      <div className={styles.spatialIdentity}>
        <span>{enteredFromBuilding ? "FROM BUILDING / 空间下钻完成" : "CURRENT SPACE / 当前空间身份"}</span>
        <strong>{product.spaceLabel ?? "1602卫生间"}</strong>
        <small>{product.spaceId ?? "SPACE-1602-BATHROOM"}</small>
      </div>
      <div className={styles.spatialTrail} aria-label="当前建筑空间层级">
        <span>{product.buildingLabel}</span><ArrowRight size={13} aria-hidden="true" /><span>{product.floorId ?? "16F"}</span><ArrowRight size={13} aria-hidden="true" /><span>{product.unitId ?? "1602"}</span><ArrowRight size={13} aria-hidden="true" /><strong>卫生间</strong>
      </div>
      <div className={styles.spatialReverse} role="group" aria-label="返回上级空间">
        <Link href="/?drill=unit">查看1602整户</Link>
        <Link href="/?drill=floor">查看16F</Link>
        <Link href="/?drill=building">返回整栋建筑</Link>
      </div>
    </nav>

    <section className={styles.focusReason} aria-label="为什么定位到1602卫生间">
      <div className={styles.focusCopy}>
        <span>{focusReason.status}</span>
        <h2>{focusReason.title}</h2>
        <p>{focusReason.detail}</p>
      </div>
      <dl className={styles.focusFacts}>
        <div><dt>空间主键</dt><dd>{product.spaceId ?? "SPACE-1602-BATHROOM"}</dd></div>
        <div><dt>当前事件</dt><dd>{result?.eventId ?? "未形成正式事件"}</dd></div>
        <div><dt>相关建筑记忆</dt><dd>{model.relevantMemories.length} 条</dd></div>
        <div><dt>当前流程状态</dt><dd>{model.projection.stateLabel}</dd></div>
      </dl>
    </section>

    <section className="case-intro">
      <div><p className="concept-kicker">筑生 / 当前空间生命页</p><h1 className="display-headline"><span className="display-headline-line">1602卫生间</span><span className="display-headline-line">从建造记忆走到今天</span></h1><p>这里不是一个脱离建筑的事件页面。空间身份、建造经历、住户事实、物业判断、人工动作与最终验证，都沿着同一个卫生间的生命线继续向前。</p></div>
      <aside><span>当前真实阶段</span><strong>{stages[currentLifecycleStage].label}</strong><p>{model.pendingResidentAssessment
        ? result ? `事件：${result.eventId} · 新住户事实待本轮评估` : "INTAKE-1602 · 住户现场事实已受理，正式事件尚未形成"
        : result ? `事件：${result.eventId} · ${model.projection.stateLabel}` : "尚未开启1602事件；先查看它在建造期留下了什么"}</p><Link href={actionHref(model.projection.nextAction.destination)}>继续当前任务 <ArrowRight size={15} /></Link></aside>
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
          selectedBusinessId={selectedSceneBusinessId}
          onViewChange={setView}
          onSelect={handleTwinSelect}
          queryVisual={activeQueryVisual}
        />
      </div>

      <div className="case-workspace">
        <section className={styles.spatialLinkage} aria-label="空间事实与3D联动">
          <header>
            <div>
              <span>SPACE LINKAGE / 事实与数字样间</span>
              <strong data-spatial-focus>{spatialFocus?.label ?? "选择一条已有事实，在同一空间里定位它"}</strong>
            </div>
            {spatialFocus ? <button type="button" onClick={clearSpatialFocus}>清除3D联动</button> : null}
          </header>

          <div className={styles.linkageGroups}>
            <section>
              <h3>当前候选</h3>
              <p>只显示确定性事件引擎当前允许展示的候选；待重新评估时不会复用上一轮候选。</p>
              <div className={styles.linkageButtons}>
                {model.assessment.targetBusinessIds.length
                  ? model.assessment.targetBusinessIds.map((businessId) => {
                      const entity = entityById(businessId);
                      return <button type="button" key={businessId} data-spatial-kind="candidate" data-business-id={businessId} onClick={() => focusCandidate(businessId)}>
                        <strong>{entity?.displayName ?? businessId}</strong><small>{businessId}</small>
                      </button>;
                    })
                  : <small>当前没有可安全展示的领域候选。</small>}
              </div>
            </section>

            <section>
              <h3>建筑记忆</h3>
              <p>历史记录只负责把过去定位回构件；点击不会把历史相关性升级成当前故障证据。</p>
              <div className={styles.linkageButtons}>
                {model.relevantMemories.slice(0, 3).map((memory) => {
                  const businessId = firstSpecificBusinessId(memory.relatedBusinessIds.length ? memory.relatedBusinessIds : memory.subjectBusinessIds);
                  return <button type="button" key={memory.recordId} disabled={!businessId} data-spatial-kind="memory" data-business-id={businessId ?? undefined} onClick={() => focusMemory(memory)}>
                    <strong>{memory.title}</strong><small>{businessId ?? "仅空间级历史记录"}</small>
                  </button>;
                })}
              </div>
            </section>

            <section>
              <h3>Product Evidence</h3>
              <p>只按已经保存的 relatedBusinessIds 定位，不从住户文字自行猜测构件或故障原因。</p>
              <div className={styles.linkageButtons}>
                {spatialEvidence.length
                  ? spatialEvidence.map((evidence) => {
                      const businessId = firstSpecificBusinessId(evidence.relatedBusinessIds) ?? evidence.spaceId;
                      return <button type="button" key={evidence.id} data-spatial-kind="evidence" data-business-id={businessId} onClick={() => focusEvidence(evidence)}>
                        <strong>{evidence.type}</strong><small>{evidence.sourceActor} · {evidence.status} · {businessId}</small>
                      </button>;
                    })
                  : <small>当前会话还没有 Product Evidence。</small>}
              </div>
            </section>

            <section>
              <h3>可追溯系统</h3>
              <p>系统入口来自候选、记忆或证据已经关联的构件；点击后由 Building Intelligence 的 trace_system 真查询驱动整条系统可视化。</p>
              <div className={styles.linkageButtons}>
                {relatedSystems.length
                  ? relatedSystems.map((system) => <button type="button" key={system.businessId} data-spatial-kind="system" data-business-id={system.businessId} onClick={() => focusSystem(system.businessId)}>
                      <strong>{system.displayName}</strong><small>{system.businessId} · {system.memberIds.length} 个成员</small>
                    </button>)
                  : <small>当前事实尚未建立到具体系统的结构化关联。</small>}
              </div>
            </section>
          </div>

          <small className={styles.linkageBoundary}>3D 联动只改变“看哪里”，不改变事件状态、证据身份、候选排序或人工授权。</small>
        </section>

        <nav aria-label="1602事件时间导航">
          {stageOrder.map((id) => <button type="button" key={id} className={storyStage === id ? "active" : ""} onClick={() => selectStoryStage(id)}>{stages[id].shortLabel}</button>)}
        </nav>
        <article className="case-current-card">
          <p>{current.label}</p>
          <h2 className="display-headline">{current.title}</h2>
          {storyStage === "past" ? <div className={styles.memoryList}>{model.relevantMemories.slice(0, 3).map((memory) => <button type="button" className={styles.memoryItem} key={memory.recordId} onClick={() => focusMemory(memory)}><span>{memory.occurredAt.slice(0, 10).replaceAll("-", ".")} · {memory.historicalSignal}</span><strong>{memory.title}</strong><p>{memory.summary}</p><small>定位到3D构件</small></button>)}</div> : null}
          <div><span>这一阶段发生什么</span><strong>{current.fact}</strong></div>
          <div><span>为什么重要</span><strong>{current.why}</strong></div>
          <div className={styles.storyMeta}>
            <div><span>事件状态</span><strong>{model.projection.stateLabel}</strong></div>
            <div><span>当前下一步</span><strong>{model.projection.nextAction.label}</strong></div>
          </div>
          <Link href={current.href} className="case-primary">{current.action} <ArrowRight size={17} /></Link>
          <details><summary>查看事实边界 <ChevronDown size={15} /></summary><p>空间与构件来自1602数字样间；建筑记忆只改变排查优先级。事件状态、人工授权、阀门动作和维修结果仍沿受控流程独立记录。</p></details>
        </article>
      </div>
    </section>

    <details className={styles.evidenceDetails}>
      <summary><span>展开证据时间链</span><small>住户观察、系统事实与事件证据完整保留，按需查看</small></summary>
      <EvidenceTimeChain />
    </details>

    <section className="case-route" aria-label="1602事件生命线">
      {stageOrder.map((id, stageIndex) => {
        const stage = stages[id];
        const isCurrent = id === currentLifecycleStage;
        const previousCycleAction = model.pendingResidentAssessment && id === "action" && previousActionCompleted;
        const completed = stageIndex < currentIndex || result?.state === "RESOLVED" || previousCycleAction;
        const status = isCurrent ? "当前真实阶段" : previousCycleAction ? "上一轮已经过 · 本轮待重新评估" : completed ? "事件已经过" : "工作流后续阶段";
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
