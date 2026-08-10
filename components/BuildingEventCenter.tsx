"use client";

import Link from "next/link";
import { ArrowRight, Building2, Clock3, MapPin, UserRound } from "lucide-react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { buildingLifeEvents } from "@/lib/product/building-life-events";

export function BuildingEventCenter() {
  const { session } = useLifecycleJourney();
  const events = buildingLifeEvents(session.result?.state);
  const activeFloors = new Map(events.map((event) => [event.floor, event]));

  return <div className="event-center">
    <header className="event-center-hero">
      <div><p>BUILDING LIFE EVENTS / 02</p><h1>一栋楼，正在发生的事。</h1><span>1602是唯一完整验证的深度事件；其余卡片只用于建立建筑尺度，不复制领域闭环。</span></div>
      <aside><strong>{events.length}</strong><span>个脱敏合成事件</span><small>所有数据均为 DEMO_SYNTHETIC</small></aside>
    </header>

    <main className="event-center-main">
      <section className="event-floor-map" aria-label="18层建筑事件分布">
        <header><Building2 size={18} /><div><strong>华章新筑 · 2号楼</strong><small>18层 MiC 住宅 · 建筑事件分布</small></div></header>
        <div className="event-floor-stack">
          {Array.from({ length: 18 }, (_, index) => 18 - index).map((floor) => {
            const event = activeFloors.get(floor);
            return <div key={floor} className={event ? event.isDeepDemo ? "has-event deep" : "has-event" : ""}>
              <span>{String(floor).padStart(2, "0")}F</span><i />
              {event ? <em>{event.unitId} · {event.displayStatus}</em> : <small>暂无事件</small>}
            </div>;
          })}
        </div>
      </section>

      <section className="event-list" aria-label="建筑生命事件列表">
        <header><div><small>当前需要处理</small><h2>事件不是状态，它必须指向下一项工作。</h2></div><span>按最近更新</span></header>
        {events.map((event) => <article key={event.id} className={event.isDeepDemo ? "deep" : ""}>
          <div className="event-card-top"><span>{event.id}</span><em>{event.dataClass === "DEMO_SYNTHETIC" ? "脱敏合成" : "真实数据"}</em>{event.isDeepDemo ? <b>深度事件</b> : null}</div>
          <h3>{event.title}</h3>
          <div className="event-card-meta"><span><MapPin size={13} />{event.floor}层 · {event.space}</span><span><Clock3 size={13} />{event.updatedAt}</span></div>
          <dl><div><dt>当前状态</dt><dd>{event.displayStatus}</dd></div><div><dt>当前责任人</dt><dd><UserRound size={13} />{event.ownerRole}</dd></div><div><dt>唯一下一步</dt><dd>{event.nextAction}</dd></div></dl>
          {event.isDeepDemo
            ? <Link href="/case-1602">进入1602深度事件 <ArrowRight size={15} /></Link>
            : <p>本事件仅用于展示建筑事件中心，暂未实现完整领域闭环。</p>}
        </article>)}
      </section>
    </main>
  </div>;
}
