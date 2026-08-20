"use client";

import Link from "next/link";
import { ArrowRight, Building2, Clock3, MapPin } from "lucide-react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { buildingLifeEventExamples, buildingLifeEvents } from "@/lib/product/building-life-events";
import { buildingTasks } from "@/lib/product/building-tasks";
import styles from "./BuildingEventCenter.module.css";

export function BuildingEventCenter() {
  const { session } = useLifecycleJourney();
  const pending1602Evidence = !session.result && Boolean(session.residentSubmissions?.length);
  const events = buildingLifeEvents(session.result, pending1602Evidence);
  const tasks = buildingTasks(events, session.result);
  const residentOwned = events.filter((event) => event.ownerRole === "住户").length;
  const propertyOwned = events.filter((event) => event.ownerRole.startsWith("物业")).length;
  const resolved = events.filter((event) => event.displayStatus.includes("解决")).length;
  const deepEventVisible = events.some((event) => event.id === "EVT-1602");

  return <div className={`event-center ${styles.center}`}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>BUILDING SITUATION · 华章新筑 2号楼</span>
        <h1>这栋楼今天需要处理什么</h1>
        <p>当前统计只计算这个会话里真正存在的事件或待物业接入的住户事实。脱敏事件结构示例不会参与数量、责任人与任务队列。</p>
      </div>
      <div className={styles.metrics} aria-label="建筑事件摘要">
        <div><strong>{events.length}</strong><span>当前事项</span></div>
        <div><strong>{residentOwned}</strong><span>等待住户</span></div>
        <div><strong>{propertyOwned}</strong><span>物业处理中</span></div>
        <div><strong>{resolved}</strong><span>已解决</span></div>
      </div>
    </header>

    <div className={styles.context}>
      <div><Building2 size={15} /><strong>18层 MiC 住宅</strong><span>当前会话真实事项</span></div>
      <div><span>1602深度链</span><strong>{deepEventVisible ? "EVT-1602" : "尚未进入事件"}</strong><span>{deepEventVisible ? "住户事实 / 事件状态按当前会话展示" : "案例结构可查看，但不冒充当前事件"}</span></div>
    </div>

    <main className={styles.layout}>
      <section className={`event-floor-map ${styles.buildingMap}`} aria-label="建筑事件空间分布">
        <header className={styles.mapHeader}>
          <div><span className={styles.sectionLabel}>BUILDING MAP</span><strong>当前事项分布</strong></div>
          <small>只显示当前会话已经存在的事件或待接入事实。</small>
        </header>
        <div className={`event-floor-stack ${styles.floorStack}`}>
          {events.length ? events.slice().sort((a, b) => b.floor - a.floor).map((event) => <div key={event.id} className={`${styles.floor} ${event.isDeepDemo ? styles.deepFloor : ""}`}>
            <span className={styles.floorNumber}>{String(event.floor).padStart(2, "0")}F</span>
            <i className={styles.dot} />
            <div className={styles.floorBody}>
              <div><strong>{event.unitId} · {event.title}</strong><em>{event.displayStatus}</em></div>
              <p>{event.space} · 下一步：{event.nextAction}</p>
            </div>
          </div>) : <p className={styles.overviewOnly}>当前会话还没有活动事件。住户提交现场事实后，1602会先以“待物业接入”出现；第一次确定性评估后才进入正式事件状态。</p>}
        </div>
      </section>

      <section className={`event-list ${styles.list}`} aria-label="建筑生命事件列表">
        <header className={styles.listHeader}>
          <div><span className={styles.sectionLabel}>ACTIVE LIFE EVENTS</span><h2>当前真正存在的事</h2></div>
          <span>不含结构示例</span>
        </header>

        {events.length ? events.map((event, eventIndex) => <article key={event.id} className={`${event.isDeepDemo ? "deep" : ""} ${styles.eventCard}`}>
          <div className={styles.eventCardMain}>
            <div className={styles.eventTop}><span>{event.id}</span><em>{event.category}</em><b>{session.result ? "完整深度事件" : "待接入深度事件"}</b></div>
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
          <Link className={styles.deepAction} href={session.result ? "/case-1602" : "/property?mode=task"}>{session.result ? "进入1602完整事件" : "进入物业接入"} <ArrowRight size={14} /></Link>
        </article>) : <p className={styles.overviewOnly}>没有活动事件时，这里保持为空，而不是用脱敏样例填满建筑态势。</p>}

        <details className={styles.boundary}>
          <summary>查看四个脱敏事件结构示例</summary>
          <p>下面四条只验证“空间—状态—责任人—下一步”的建筑级组织方式，ID 统一使用 EXAMPLE 前缀；它们不是这栋楼今天发生的事件，不参与上方任何统计或任务队列。</p>
          {buildingLifeEventExamples.map((event) => <article key={event.id} className={styles.eventCard}>
            <div className={styles.eventCardMain}>
              <div className={styles.eventTop}><span>{event.id}</span><em>{event.category}</em><b>结构示例</b></div>
              <h3>{event.title}</h3>
              <div className={styles.meta}><span><MapPin size={13} />{event.floor}层 · {event.unitId} · {event.space}</span></div>
            </div>
            <p className={styles.overviewOnly}>{event.displayStatus} · {event.nextAction}</p>
          </article>)}
        </details>
      </section>
    </main>
  </div>;
}
