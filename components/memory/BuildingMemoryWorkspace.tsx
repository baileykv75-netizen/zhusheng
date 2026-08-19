"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Database, Focus, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { BathroomTwinViewport } from "@/components/life-event/BathroomTwinViewport";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { useDemo } from "@/components/demo-provider";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";
import type { BuildingQueryToolName, QueryVisualDirective } from "@/lib/building-intelligence/types.ts";
import type { VisualDirective } from "@/lib/life-event-engine/types.ts";
import {
  MEMORY_CLASS_LABELS,
  MEMORY_FILTERS,
  MEMORY_TRADE_LABELS,
  deriveBuildingMemoryViewModel,
  filterBuildingMemoryEntries,
  groupBuildingMemoryEntries,
  type BuildingMemoryEntry,
  type MemoryFilterId
} from "@/lib/product/building-memory-view-model";
import styles from "./BuildingMemoryWorkspace.module.css";

const defaultDirective: VisualDirective = {
  view: "VIEW_CONSTRUCTION_MEMORY",
  highlightBusinessIds: [],
  moistureState: "DRY",
  valvePosition: "OPEN",
  evidenceAnchorIds: [],
  allowedActions: [],
  authorizationRequired: false
};

const relevanceLabel = {
  HIGH: "当前事件强相关",
  MEDIUM: "当前事件相关",
  CONTEXT: "建筑背景"
} as const;

const signalLabel = {
  ELEVATED_HISTORY: "历史特殊节点",
  SCOPE_LIMIT: "检查边界",
  RUNTIME_CONTEXT: "运行记录",
  BACKGROUND: "背景记录"
} as const;

function visualTool(entry: BuildingMemoryEntry): BuildingQueryToolName {
  if (entry.recordType === "INSPECTION") return "get_inspection_history";
  if (entry.recordType === "MAINTENANCE") return "get_maintenance_history";
  if (entry.recordType === "OBSERVATION") return "get_current_observations";
  return "get_construction_history";
}

function memoryVisual(entry: BuildingMemoryEntry | null): QueryVisualDirective | null {
  if (!entry?.visualTargetBusinessId) return null;
  return {
    mode: "CONSTRUCTION_MEMORY",
    targetBusinessIds: [entry.visualTargetBusinessId],
    revealBusinessIds: entry.subjectBusinessIds.filter((id) => !id.startsWith("SPACE-")).slice(0, 8),
    sourceTool: visualTool(entry)
  };
}

function recordSearchText(entry: BuildingMemoryEntry) {
  return [
    entry.title,
    entry.summary,
    entry.recordId,
    entry.trade ? MEMORY_TRADE_LABELS[entry.trade] : "",
    entry.memoryClass ? MEMORY_CLASS_LABELS[entry.memoryClass] : "",
    entry.memory.phase,
    entry.memory.originalDesign,
    entry.memory.actualCondition,
    entry.memory.reason,
    entry.memory.fieldDecision,
    entry.memory.workerStatement,
    ...entry.subjectBusinessIds
  ].filter(Boolean).join(" ").toLowerCase();
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div className={styles.detailRow}><span>{label}</span><p>{value}</p></div>;
}

export function BuildingMemoryWorkspace() {
  const { session, setSession, assets, assetError } = useLifecycleJourney();
  const { state: demoState } = useDemo();
  const product = useBuildingProductContext();
  const model = useMemo(() => deriveBuildingMemoryViewModel(session, demoState.evidence), [demoState.evidence, session]);
  const [filter, setFilter] = useState<MemoryFilterId>("ALL");
  const [search, setSearch] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(model.defaultRecordId);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("record");
    if (requested && model.entries.some((entry) => entry.recordId === requested)) setSelectedRecordId(requested);
  }, [model.entries]);

  const visibleEntries = useMemo(() => {
    const filtered = filterBuildingMemoryEntries(model.entries, filter);
    const query = search.trim().toLowerCase();
    return query ? filtered.filter((entry) => recordSearchText(entry).includes(query)) : filtered;
  }, [filter, model.entries, search]);
  const groups = useMemo(() => groupBuildingMemoryEntries(visibleEntries), [visibleEntries]);
  const selected = model.entries.find((entry) => entry.recordId === selectedRecordId) ?? model.entries.find((entry) => entry.recordId === model.defaultRecordId) ?? null;
  const queryVisual = memoryVisual(selected);
  const directive: VisualDirective = session.result?.visualDirective ?? defaultDirective;

  function selectRecord(entry: BuildingMemoryEntry) {
    setSelectedRecordId(entry.recordId);
    setSession((current) => ({
      ...current,
      selectedBusinessId: entry.visualTargetBusinessId,
      selectedView: "VIEW_CONSTRUCTION_MEMORY"
    }));
    const url = new URL(window.location.href);
    url.searchParams.set("record", entry.recordId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function chooseFilter(nextFilter: MemoryFilterId) {
    setFilter(nextFilter);
    const candidates = filterBuildingMemoryEntries(model.entries, nextFilter);
    if (selected && candidates.some((entry) => entry.recordId === selected.recordId)) return;
    const next = candidates[0];
    if (next) selectRecord(next);
  }

  return <section className={styles.workspace} aria-label="1602建筑记忆">
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>BUILDING MEMORY · 16F / 1602</span>
        <h1>这栋房子记得自己经历过什么</h1>
        <p>{model.hasActiveEvent
          ? `当前处理 ${model.eventId} 时，相关历史会参与排查优先级，但不会被自动升级为故障结论。`
          : "当前没有活动事件。这里先作为建筑生命周期档案浏览；返工、现场调整或检查边界都只是历史事实，不代表今天存在对应故障。"}</p>
      </div>
      <div className={styles.metrics} aria-label="建筑记忆摘要">
        <div><strong>{model.totalRecords}</strong><span>生命周期记忆</span></div>
        <div><strong>{model.specialRecords}</strong><span>特殊历史节点</span></div>
        <div><strong>{model.eventRelatedRecords}</strong><span>当前事件相关</span></div>
        <div><strong>{model.tradeCount}</strong><span>专业 / 阶段</span></div>
      </div>
    </header>

    <div className={styles.contextBar}>
      <div><Database size={15} /><span>{product.buildingLabel}</span><strong>1602卫生间</strong></div>
      <div><span>当前事件</span><strong>{model.eventId}</strong><span className={styles.demoTag}>脱敏演示数据</span></div>
    </div>

    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="建筑记忆筛选">
        {MEMORY_FILTERS.map((item) => <button type="button" key={item.id} className={filter === item.id ? styles.activeFilter : ""} onClick={() => chooseFilter(item.id)}>{item.label}</button>)}
      </div>
      <label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索构件、记录或施工内容" aria-label="搜索建筑记忆" /></label>
    </div>

    <div className={styles.contentGrid}>
      <section className={styles.timeline} aria-label="建筑记忆时间线">
        <div className={styles.timelineHead}>
          <div><span>生命周期时间线</span><strong>{visibleEntries.length} 条记录</strong></div>
          <small>特殊节点提高视觉权重；正常记录仍保留为建筑背景，而不是故障排除证明。</small>
        </div>

        {groups.length ? groups.map((group) => <section className={styles.stage} key={group.id}>
          <header><div><span>{group.english}</span><strong>{group.label}</strong></div><em>{group.entries.length}</em></header>
          <div className={styles.stageRecords}>
            {group.entries.map((entry) => {
              const active = selected?.recordId === entry.recordId;
              const relation = entry.eventRelation;
              return <button type="button" key={entry.recordId} className={`${styles.record} ${active ? styles.activeRecord : ""} ${entry.special ? styles.specialRecord : ""}`} onClick={() => selectRecord(entry)} aria-pressed={active}>
                <span className={styles.recordDate}>{entry.occurredAt.slice(0, 10).replaceAll("-", ".")}</span>
                <span className={styles.recordDot} />
                <span className={styles.recordBody}>
                  <span className={styles.recordMeta}>
                    <em>{entry.trade ? MEMORY_TRADE_LABELS[entry.trade] : "建筑记录"}</em>
                    {entry.memoryClass ? <em data-class={entry.memoryClass}>{MEMORY_CLASS_LABELS[entry.memoryClass]}</em> : null}
                    {relation && relation.relevance !== "CONTEXT" ? <em data-relevance={relation.relevance}>{relevanceLabel[relation.relevance]}</em> : null}
                  </span>
                  <strong>{entry.title}</strong>
                  <small>{entry.summary}</small>
                </span>
                <ArrowRight size={14} />
              </button>;
            })}
          </div>
        </section>) : <div className={styles.empty}><Search size={18} /><strong>没有匹配的建筑记忆</strong><span>换一个专业筛选或搜索词。</span></div>}
      </section>

      <aside className={styles.detailPane} aria-label="建筑记忆详情">
        {selected ? <>
          <section className={styles.twinCard}>
            <div className={styles.twinHead}>
              <div><span>3D CONTEXT</span><strong>{selected.visualTargetBusinessId ?? "空间级记录"}</strong></div>
              <span><Focus size={13} />建造时</span>
            </div>
            <div className={styles.twinViewport}>
              <BathroomTwinViewport
                assets={assets}
                externalError={assetError}
                directive={directive}
                view="VIEW_CONSTRUCTION_MEMORY"
                selectedBusinessId={selected.visualTargetBusinessId ?? product.selectedBusinessId}
                queryVisual={queryVisual}
                onViewChange={() => undefined}
                onSelect={product.setSelectedBusinessId}
              />
            </div>
            {assetError ? <p className={styles.assetWarning}><TriangleAlert size={13} />三维资产当前降级，结构化建筑记忆仍可正常查看。</p> : null}
          </section>

          <section className={styles.recordDetail}>
            <header>
              <span>{selected.occurredAt.slice(0, 10).replaceAll("-", ".")} · {selected.trade ? MEMORY_TRADE_LABELS[selected.trade] : "建筑记录"}</span>
              <h2>{selected.title}</h2>
              <p>{selected.summary}</p>
              <div className={styles.detailBadges}>
                {selected.memoryClass ? <span>{MEMORY_CLASS_LABELS[selected.memoryClass]}</span> : null}
                {selected.eventRelation ? <span data-relevance={selected.eventRelation.relevance}>{relevanceLabel[selected.eventRelation.relevance]}</span> : null}
              </div>
            </header>

            <div className={styles.detailSections}>
              <DetailRow label="原设计 / 原状态" value={selected.memory.originalDesign} />
              <DetailRow label="现场实际情况" value={selected.memory.actualCondition} />
              <DetailRow label="形成原因" value={selected.memory.reason} />
              <DetailRow label="现场处理" value={selected.memory.fieldDecision} />
              <DetailRow label="工友留痕" value={selected.memory.workerStatement} />
            </div>

            {selected.memory.verification ? <section className={styles.verification}>
              <div className={styles.sectionTitle}><CheckCircle2 size={14} /><strong>当时如何验证</strong></div>
              <p><strong>{selected.memory.verification.method}</strong> · {selected.memory.verification.result}</p>
              <div className={styles.checkGrid}>
                <div><span>当时检查了</span>{selected.memory.verification.checkedItems.length ? <ul>{selected.memory.verification.checkedItems.map((item) => <li key={item}>{item}</li>)}</ul> : <small>未单列检查项</small>}</div>
                <div><span>当时没有单独覆盖</span>{selected.memory.verification.uncheckedItems.length ? <ul>{selected.memory.verification.uncheckedItems.map((item) => <li key={item}>{item}</li>)}</ul> : <small>记录中未列出额外未检查项</small>}</div>
              </div>
            </section> : null}

            {selected.eventRelation ? <section className={styles.eventRelation} data-relevance={selected.eventRelation.relevance}>
              <div className={styles.sectionTitle}><ShieldCheck size={14} /><strong>与 {model.eventId} 的当前关系</strong></div>
              <div className={styles.relationHeadline}><strong>{relevanceLabel[selected.eventRelation.relevance]}</strong><span>{signalLabel[selected.eventRelation.historicalSignal]}</span></div>
              <div className={styles.reasonList}>{selected.eventRelation.reasons.map((reason) => <span key={`${reason.code}-${reason.detail ?? ""}`}>{reason.label}{reason.detail ? ` · ${reason.detail}` : ""}</span>)}</div>
              <p>{selected.eventRelation.historicalBoundary}</p>
            </section> : <section className={styles.eventRelation}><div className={styles.sectionTitle}><ShieldCheck size={14} /><strong>{model.hasActiveEvent ? "当前事件关系" : "生命周期背景"}</strong></div><p>{model.hasActiveEvent ? "这条记录目前只作为建筑生命周期背景保存，没有被当前事件相关性规则提升优先级。" : "当前没有活动事件，这条记录只按原始时间、空间和构件身份保存，不参与任何诊断排序。"}</p></section>}

            <div className={styles.businessIds}>
              <span>关联构件 / 系统</span>
              <div>{selected.subjectBusinessIds.map((id) => <code key={id}>{id}</code>)}</div>
            </div>

            <div className={styles.detailActions}>
              <button type="button" onClick={() => selectRecord(selected)} disabled={!selected.visualTargetBusinessId}><Focus size={14} />在 3D 中定位</button>
              <Link href="/property?mode=task">回到当前事件<ArrowRight size={14} /></Link>
            </div>
          </section>
        </> : <div className={styles.empty}><Database size={18} /><strong>选择一条建筑记忆</strong><span>查看它与空间、构件、验证范围和当前事件之间的关系。</span></div>}
      </aside>
    </div>
  </section>;
}
