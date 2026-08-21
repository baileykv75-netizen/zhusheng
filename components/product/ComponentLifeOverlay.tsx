"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";
import { derivePropertyEventViewModel } from "@/lib/product/property-event-view-model";
import { deriveComponentLifeView, type ComponentCandidateStatus } from "@/lib/product/component-life";
import { componentLifeHref, isCase1602Path, resolveComponentLifeObjectId } from "@/lib/product/component-life-link";
import styles from "./ComponentLifeOverlay.module.css";

const candidateLabels: Record<ComponentCandidateStatus, string> = {
  NO_LIVE_EVENT: "NO LIVE EVENT / 尚无正式事件",
  PENDING_ASSESSMENT: "PENDING ASSESSMENT / 尚未形成事件",
  PENDING_REASSESSMENT: "REASSESSMENT / 不复用旧候选",
  CURRENT_CANDIDATE: "CURRENT CANDIDATE / 当前候选",
  NOT_CURRENT_CANDIDATE: "NOT CURRENT CANDIDATE / 本轮未列入"
};

export function ComponentLifeOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useLifecycleJourney();
  const product = useBuildingProductContext();
  const model = useMemo(() => derivePropertyEventViewModel(session), [session]);
  const onCase1602 = isCase1602Path(pathname);
  const requestedObjectId = onCase1602 ? resolveComponentLifeObjectId(searchParams.get("object")) : null;
  const selectedObjectId = requestedObjectId ?? product.selectedBusinessId;
  const life = useMemo(() => deriveComponentLifeView(selectedObjectId, {
    productEvidence: session.productEvidenceTimeline,
    result: session.result,
    currentCandidateIds: model.assessment.targetBusinessIds,
    pendingResidentAssessment: model.pendingResidentAssessment
  }), [model.assessment.targetBusinessIds, model.pendingResidentAssessment, selectedObjectId, session.productEvidenceTimeline, session.result]);

  if (!onCase1602 || !life) return null;
  const canonicalHref = componentLifeHref(life.entity.businessId);
  const openedFromDeepLink = requestedObjectId === life.entity.businessId;

  return <aside
    className={styles.overlay}
    aria-label="构件生命索引"
    data-component-life-id={life.entity.businessId}
    data-component-life-deep-linked={openedFromDeepLink ? "true" : "false"}
  >
    <header className={styles.header}>
      <span>OBJECT LIFE / 3D 反向空间查询</span>
      <strong>这个对象的一生</strong>
    </header>

    <section className={styles.identity}>
      <small>{life.entity.entityType} · {life.entity.provenance.sourceClass}{life.entity.provenance.synthetic ? " · SYNTHETIC" : ""}</small>
      <h2>{life.entity.displayName}</h2>
      <code>{life.entity.businessId}</code>
      {canonicalHref ? <a className={styles.deepLink} href={canonicalHref} data-component-life-link>
        <span>OBJECT DEEP LINK</span>
        <strong>直接打开这个对象</strong>
        <code>{canonicalHref}</code>
      </a> : null}
    </section>

    <dl className={styles.metrics}>
      <div className={styles.metric}><dt>历史记录</dt><dd>{life.records.length}</dd></div>
      <div className={styles.metric}><dt>Product Evidence</dt><dd>{life.productEvidence.length}</dd></div>
      <div className={styles.metric}><dt>Domain Evidence</dt><dd>{life.domainEvidence.length}</dd></div>
      <div className={styles.metric}><dt>维修记录</dt><dd>{life.repairs.length}</dd></div>
    </dl>

    <section className={styles.section}>
      <span>CURRENT EVENT IDENTITY</span>
      <h3>当前事件身份</h3>
      <strong className={styles.status}>{candidateLabels[life.candidateStatus]}</strong>
      <p>{life.eventId ? `${life.eventId} · ${life.eventState}` : "当前会话没有正式 Life Event。"}</p>
    </section>

    <section className={styles.section}>
      <span>SYSTEM MEMBERSHIP</span>
      <h3>系统归属</h3>
      <div className={styles.list}>
        {life.systems.length ? life.systems.map((system) => <div className={styles.item} key={system.businessId}>
          <strong>{system.displayName}</strong>
          <small>{system.businessId} · {system.systemType}</small>
        </div>) : <small className={styles.empty}>当前 Building Intelligence 没有记录该对象的系统归属。</small>}
      </div>
    </section>

    <section className={styles.section}>
      <span>BUILDING MEMORY</span>
      <h3>建造与历史记忆</h3>
      <div className={styles.list}>
        {life.records.length ? life.records.slice(-5).reverse().map((record) => <div className={styles.item} key={record.recordId}>
          <strong>{record.title}</strong>
          <small>{record.occurredAt.slice(0, 10)} · {record.recordType} · {record.status} · {record.provenance.sourceClass}{record.provenance.synthetic ? " · SYNTHETIC" : ""}</small>
        </div>) : <small className={styles.empty}>当前 Building Memory 没有直接指向该对象的历史记录。</small>}
      </div>
    </section>

    <section className={styles.section}>
      <span>EVIDENCE & OBSERVATION</span>
      <h3>已记录证据关联</h3>
      <div className={styles.list}>
        {life.productEvidence.slice(-3).reverse().map((item) => <div className={styles.item} key={item.id}>
          <strong>Product · {item.type}</strong><small>{item.status} · {item.dataClass} · {item.capturedAt}</small>
        </div>)}
        {life.domainEvidence.slice(-3).reverse().map((item) => <div className={styles.item} key={item.id}>
          <strong>Domain · {item.type}</strong><small>{item.status} · {item.provenance} · {item.capturedAt ?? "时间未记录"}</small>
        </div>)}
        {life.observations.slice(-3).reverse().map((item) => <div className={styles.item} key={item.id}>
          <strong>Observation · {item.metric}</strong><small>{item.value} {item.unit} · DEMO_SYNTHETIC · {item.observedAt}</small>
        </div>)}
        {!life.productEvidence.length && !life.domainEvidence.length && !life.observations.length
          ? <small className={styles.empty}>当前会话没有直接关联到该对象的现场证据或系统观测。</small>
          : null}
      </div>
    </section>

    <section className={styles.section}>
      <span>REPAIR & AUDIT</span>
      <h3>维修与事件留痕</h3>
      <div className={styles.list}>
        {life.repairs.slice(-3).reverse().map((repair) => <div className={styles.item} key={repair.repairRecordId}>
          <strong>{repair.method}</strong><small>{repair.result} · DEMO_SYNTHETIC · {repair.submittedAt}</small>
        </div>)}
        {life.auditEntries.slice(-3).reverse().map((entry) => <div className={styles.item} key={entry.sequence}>
          <strong>{entry.actionType}</strong><small>SEQ {entry.sequence} · {entry.previousState} → {entry.nextState}</small>
        </div>)}
        {!life.repairs.length && !life.auditEntries.length
          ? <small className={styles.empty}>当前事件链没有直接指向该对象的维修或动作留痕。</small>
          : null}
      </div>
    </section>

    <p className={styles.boundary}>{life.boundary}</p>
  </aside>;
}
