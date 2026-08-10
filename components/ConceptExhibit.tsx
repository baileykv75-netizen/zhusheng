"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, CornerDownRight } from "lucide-react";
import { BuildingHeroTwin, type HeroDrillPhase } from "@/components/v6/BuildingHeroTwin";

const phaseCopy: Record<HeroDrillPhase, { index: string; label: string }> = {
  building: { index: "01", label: "华章新筑 · 2号楼" },
  floor: { index: "02", label: "16F" },
  unit: { index: "03", label: "1602" },
  space: { index: "04", label: "卫生间" }
};

export function ConceptExhibit() {
  const router = useRouter();
  const [phase, setPhase] = useState<HeroDrillPhase>("building");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function enterBuilding() {
    if (phase !== "building") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.push("/case-1602");
      return;
    }
    setPhase("floor");
    timers.current.push(window.setTimeout(() => setPhase("unit"), 760));
    timers.current.push(window.setTimeout(() => setPhase("space"), 1520));
    timers.current.push(window.setTimeout(() => router.push("/case-1602"), 2450));
  }

  return <div className="v6-home">
    <section className="v6-hero" id="concept">
      <div className="v6-hero-copy">
        <p className="v6-eyebrow">LIVING BUILDING OS / 筑生</p>
        <h1>一栋房子一生的<br /><em>AI 智能体</em></h1>
        <p className="v6-hero-lead">它记得自己如何被建造，<br />也理解入住之后发生的每一件事。</p>
        <button type="button" className="v6-enter-building" onClick={enterBuilding} disabled={phase !== "building"}>
          {phase === "building" ? "进入建筑" : "正在进入1602"}<ArrowRight size={18} />
        </button>
      </div>

      <div className="v6-hero-visual">
        <BuildingHeroTwin phase={phase} onEnter={enterBuilding} />
        <div className="v6-drill-breadcrumb" aria-live="polite">
          {(Object.keys(phaseCopy) as HeroDrillPhase[]).map((item, index) => {
            const phases = Object.keys(phaseCopy) as HeroDrillPhase[];
            const currentIndex = phases.indexOf(phase);
            return <span key={item} className={index <= currentIndex ? "active" : ""}>{phaseCopy[item].label}</span>;
          })}
        </div>
      </div>

      <aside className="v6-building-pulse">
        <span>BUILDING PULSE / 此刻</span>
        <strong>16层 · 1602卫生间</strong>
        <p>住户发现持续潮湿，建筑智能体正在重新调用这个空间的建造记忆。</p>
        <button type="button" onClick={enterBuilding}>走进这件事 <CornerDownRight size={15} /></button>
      </aside>

      <div className="v6-hero-meta"><span>126 SPACES</span><span>750 OBJECTS</span><span><i />MEMORY ONLINE</span></div>
      <a className="v6-scroll-cue" href="#memory"><ArrowDown size={15} />建筑的一生，从记忆开始</a>
    </section>

    <main className="v6-story">
      <section className="v6-story-chapter" id="memory">
        <div className="v6-chapter-index"><span>01</span><small>THE MEMORY</small></div>
        <div className="v6-chapter-copy"><p>建造，不失忆</p><h2>墙封起来以后，<br />过去仍在原来的位置。</h2><div><span>施工口述</span><i /><span>人工确认</span><i /><span>构件记忆</span></div></div>
        <p className="v6-chapter-note">工友留下的记录不在交付时结束。它继续和空间、管线、接头与检验结果保持关联，等待未来真正需要它的那一天。</p>
      </section>

      <section className="v6-story-chapter event" id="event">
        <div className="v6-chapter-index"><span>02</span><small>THE EVENT</small></div>
        <div className="v6-chapter-copy"><p>居住，有回应</p><h2>今天，16层的身体里<br />发生了一件事。</h2><Link href="/case-1602">进入1602建筑生命事件 <ArrowRight size={17} /></Link></div>
        <div className="v6-human-boundary"><small>AI 建议</small><i /><small>人类授权</small><i /><small>物业执行</small><i /><small>维修复验</small></div>
      </section>

      <section className="v6-story-chapter learning" id="learning">
        <div className="v6-chapter-index"><span>03</span><small>THE LEARNING</small></div>
        <div className="v6-chapter-copy"><p>经验，会生长</p><h2>一栋房子的经历，<br />成为下一栋房子的经验。</h2></div>
        <p className="v6-chapter-note">经过验证的个案只形成待人工评审的经验候选。它可以成为试点，但不会被 AI 轻率地写成企业标准。</p>
      </section>

      <section className="v6-manifesto">
        <p>筑生不是在给建筑加一个聊天机器人。</p>
        <h2>它是在让一栋房子，<br />拥有一生不会中断的记忆。</h2>
        <Link href="/case-1602">查看1602完整事件 <ArrowRight size={17} /></Link>
      </section>
    </main>
  </div>;
}
