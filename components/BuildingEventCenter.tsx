"use client";

import Link from "next/link";
import { ArrowRight, Building2, Clock3, MapPin } from "lucide-react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { buildingLifeEvents } from "@/lib/product/building-life-events";
import { buildingTasks } from "@/lib/product/building-tasks";
import styles from "./BuildingEventCenter.module.css";

export function BuildingEventCenter() {
  const { session } = useLifecycleJourney();
  const events = buildingLifeEvents(session.result?.state);
  const tasks = buildingTasks(events, session.result);
  const residentOwned = events.filter((event) => event.ownerRole === "住户").length;
  const propertyOwned = events.filter((event) => event.ownerRole.startsWith("物业")).length;
  const resolved = events.filter((event) => event.displayStatus.includes("解决")).length;

  return <div className={`event-center ${styles.center}`}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>BUILDING SITUATION · 华章新筑 2号楼</span>
        <h1>这栋楼今天需要处理什么</h1>
        <p>事件中心只展示正在发生的建筑生命事件、责任人和下一项工作。1602保留完整深度闭环，其余事件只提供建筑尺度上的概览，不伪造尚未实现的专业流程。</p>
      </div>
      <div className={styles.metrics} aria-label="建筑事件摘要">
        <div><strong>{events.length}</strong><span>当前事件</span></div>
        <div><strong>{residentOwned}</strong><span>等待住户</span></div>
        <div><strong>{propertyOwned}</strong><span>物业处理中</span></div>
        <div><strong>{resolved}</strong><span>已解决</span></div>
      </div>
    </header>

    <div className={styles.context}>
      <div><Building2 size={15} /><strong>18层 MiC 住宅</strong><span>只显示有事件的位置</span></div>
      <div><span>完整深度事件</span><strong>EVT-1602</strong><span>其余为概览事件</span></div>
    </div>

    <main className={styles.layout}>
      <section className={`event-floor-map ${styles.buildingMap}`} aria-label="建筑事件空间分布">
        <header className={styles.mapHeader}>
          <div><span className={styles.sectionLabel}>BUILDING MAP</span><strong>事件分布</strong></div>
          <small>不再铺满18个空楼层，只保留真正存在事件的位置。</small>
        </header>
        <div className={`event-floor-stack ${styles.floorStack}`}>
          {events.slice().sort((a, b) => b.floor - a.floor).map((event) => <div key={event.id} className={`${styles.floor} ${event.isDeepDemo ? styles.deepFloor : ""}`}>
            <span className={styles.floorNumber}>{String(event.floor).padStart(2, "0")}F</span>
            <i className={styles.dot} />
            <div className={styles.floorBody}>
              <div><strong>{event.unitId} · {event.title}</strong><em>{event.displayStatus}</em></div>
              <p>{event.space} · 下一步：{event.nextAction}</p>
            </div>
          </div>)}
        </div>
      </section>

      <section className={`event-list ${styles.list}`} aria-label="建筑生命事件列表">
        <header className={styles.listHeader}>
          <div><span className={styles.sectionLabel}>ACTIVE LIFE EVENTS</span><h2>每件事都指向下一项工作</h2></div>
          <span>按最近更新</span>
        </header>

        {events.map((event, eventIndex) => <article key={event.id} className={`${event.isDeepDemo ? "deep" : ""} ${styles.eventCard}`}>
          <div className={styles.eventCardMain}>
            <div className={styles.eventTop}><span>{event.id}</span><em>{event.category}</em>{event.isDeepDemo ? <b>完整深度事件</b> : null}</div>
            <h3>{event.title}</h3>
            <div className={styles.meta}><span><MapPin size={13} />{event.floor}层 · {event.unitId} · {event.space}</span><span><Clock3 size={13} />{event.updatedAt}</span></div>
          </div>
          <div className={styles.eventCardSide}>
            <dl>
              <div><dt>当前状态</dt><dd>{event.displayStatus}</dd></div>
              <div><dt>当前责任</dt><dd>{event.ownerRole}</dd></div>
              <div><dt>唯一下一步</dt><dd>{tasks[eventIndex]?.title ?? event.nextAction}</dd></div>
            </dl>
          </div>
          {event.isDeepDemo
            ? <Link className={styles.deepAction} href="/case-1602">进入1602完整事件 <ArrowRight size={14} /></Link>
            : <p className={styles.overviewOnly}>当前仅保留空间、状态、责任人与下一步概览；没有伪造完整领域闭环。</p>}
        </article>)}

        <details className={styles.boundary}>
          <summary>数据与事件深度说明</summary>
          <p>当前五个事件均为脱敏演示数据。只有1602已经实现从住户证据、Building Memory、确定性判断、人工授权、维修到复验的完整闭环；其他四个事件只用于验证建筑级事件组织方式。</p>
        </details>
      </section>
    </main>
  </div>;
}
