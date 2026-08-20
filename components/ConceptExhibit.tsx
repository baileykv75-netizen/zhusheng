"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, CornerDownRight } from "lucide-react";
import { BuildingHeroTwin, type HeroDrillPhase } from "@/components/v6/BuildingHeroTwin";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { residentEvidenceNeedsAssessment } from "@/lib/product/resident-assessment";
import styles from "./ConceptExhibit.module.css";

const phaseOrder: HeroDrillPhase[] = ["building", "floor", "unit", "space"];

const phaseCopy: Record<HeroDrillPhase, { index: string; label: string; action: string; detail: string }> = {
  building: {
    index: "01",
    label: "华章新筑 · 2号楼",
    action: "进入16层",
    detail: "从整栋建筑开始。先定位1602所在楼层，再进入户与具体空间。"
  },
  floor: {
    index: "02",
    label: "16F",
    action: "进入1602",
    detail: "已定位到16层。其余楼层暂时退到背景，只保留当前楼层的空间关系。"
  },
  unit: {
    index: "03",
    label: "1602",
    action: "进入卫生间",
    detail: "已进入1602户。下一步进入卫生间，查看这个空间留下的建造记忆与居住事件。"
  },
  space: {
    index: "04",
    label: "卫生间",
    action: "打开这个空间的一生",
    detail: "已到达1602卫生间。这里是建造记忆、住户事实、物业处置与最终验证汇合的空间。"
  }
};

function drillPhaseFromLocation(): HeroDrillPhase | null {
  if (typeof window === "undefined") return null;
  const requested = new URLSearchParams(window.location.search).get("drill");
  return phaseOrder.includes(requested as HeroDrillPhase) ? requested as HeroDrillPhase : null;
}

export function ConceptExhibit() {
  const router = useRouter();
  const { session } = useLifecycleJourney();
  const [phase, setPhase] = useState<HeroDrillPhase>("building");
  const currentIndex = phaseOrder.indexOf(phase);
  const pendingResidentAssessment = residentEvidenceNeedsAssessment(session.result, session.residentSubmissions);
  const result = session.result;

  useEffect(() => {
    const requested = drillPhaseFromLocation();
    if (requested) setPhase(requested);
  }, []);

  const anchorStatus = pendingResidentAssessment
    ? result
      ? "NEW FACTS / REASSESS"
      : "INTAKE / NOT YET EVENT"
    : result
      ? result.state === "RESOLVED"
        ? "VERIFIED EVENT / RESOLVED"
        : `LIFE EVENT / ${result.state}`
      : "FEATURED CASE / NOT LIVE";

  const anchorAriaLabel = pendingResidentAssessment
    ? result
      ? `进入16层1602卫生间，当前事件 ${result.eventId} 有新的住户事实等待重新评估`
      : "进入16层1602卫生间，当前只有住户现场事实，正式事件尚未形成"
    : result
      ? result.state === "RESOLVED"
        ? `进入16层1602卫生间，事件 ${result.eventId} 已完成验证闭环`
        : `进入16层1602卫生间，事件 ${result.eventId} 当前状态 ${result.state}`
      : "进入16层1602卫生间脱敏案例，当前会话尚未形成正式事件";

  function advanceSpatialDrill() {
    if (currentIndex >= phaseOrder.length - 1) {
      router.push("/case-1602?entry=building");
      return;
    }
    setPhase(phaseOrder[currentIndex + 1]);
  }

  function retreatSpatialDrill() {
    if (currentIndex <= 0) return;
    setPhase(phaseOrder[currentIndex - 1]);
  }

  function selectPhase(nextPhase: HeroDrillPhase) {
    setPhase(nextPhase);
  }

  return <div className="v6-home">
    <section className="v6-hero" id="concept">
      <div className="v6-hero-copy">
        <p className="v6-eyebrow">LIVING BUILDING OS / 筑生</p>
        <h1>一栋房子一生的<br /><em>AI 智能体</em></h1>
        <p className="v6-hero-lead">它记得自己如何被建造，<br />也理解入住之后发生的每一件事。</p>
        <div className={styles.drillActions}>
          {phase !== "building" ? <button type="button" className={styles.drillBack} onClick={retreatSpatialDrill}><ArrowLeft size={16} />返回上一级</button> : null}
          <button type="button" className="v6-enter-building" onClick={advanceSpatialDrill}>
            {phaseCopy[phase].action}<ArrowRight size={18} />
          </button>
        </div>
        <div className={styles.drillContext} aria-live="polite">
          <span>{phaseCopy[phase].index} / 04 · 当前空间层级</span>
          <strong>{phaseCopy[phase].label}</strong>
          <p>{phaseCopy[phase].detail}</p>
        </div>
      </div>

      <div className="v6-hero-visual">
        <BuildingHeroTwin phase={phase} onEnter={advanceSpatialDrill} statusLabel={anchorStatus} anchorAriaLabel={anchorAriaLabel} />
        <div className="v6-drill-breadcrumb" aria-label="建筑空间路径">
          {phaseOrder.map((item, index) => (
            <span key={item} className={index <= currentIndex ? "active" : ""}>
              <button
                type="button"
                className={styles.drillCrumb}
                aria-current={phase === item ? "location" : undefined}
                onClick={() => selectPhase(item)}
              >
                {phaseCopy[item].label}
              </button>
            </span>
          ))}
        </div>
      </div>

      <aside className="v6-building-pulse">
        <span>FEATURED LIFE EVENT / 1602案例 · {anchorStatus}</span>
        <strong>16层 · 1602卫生间</strong>
        <p>这个脱敏案例从住户现场观察开始，随后回看同一空间的建造记忆；是否形成事件与最终判断仍由当前会话事实决定。</p>
        <button type="button" onClick={advanceSpatialDrill}>{phase === "space" ? "打开这个空间的生命线" : phaseCopy[phase].action} <CornerDownRight size={15} /></button>
      </aside>

      <div className="v6-hero-meta"><span>126 SPACES</span><span>750 OBJECTS</span><span><i />MEMORY ONLINE</span></div>
      <a className="v6-scroll-cue" href="#memory"><ArrowDown size={15} />建筑的一生，从记忆开始</a>
    </section>

    <main className="v6-story">
      <section className="v6-story-chapter" id="memory">
        <div className="v6-chapter-index"><span>01</span><small>THE MEMORY</small></div>
        <div className="v6-chapter-copy"><p>建造，不失忆</p><h2 className="display-headline"><span className="display-headline-line">墙封起来以后</span><span className="display-headline-line">过去仍在原来的位置</span></h2><div><span>施工口述</span><i /><span>人工确认</span><i /><span>构件记忆</span></div></div>
        <p className="v6-chapter-note">工友留下的记录不在交付时结束。它继续和空间、管线、接头与检验结果保持关联，等待未来真正需要它的那一天。</p>
      </section>

      <section className="v6-story-chapter event" id="event">
        <div className="v6-chapter-index"><span>02</span><small>THE EVENT</small></div>
        <div className="v6-chapter-copy"><p>居住，有回应</p><h2 className="display-headline"><span className="display-headline-line">当一件事发生在16层</span><span className="display-headline-line">它会沿同一条生命线推进</span></h2><Link href="/case-1602">进入1602建筑生命事件 <ArrowRight size={17} /></Link></div>
        <div className="v6-human-boundary"><small>AI 建议</small><i /><small>人类授权</small><i /><small>物业执行</small><i /><small>维修复验</small></div>
      </section>

      <section className="v6-story-chapter learning" id="learning">
        <div className="v6-chapter-index"><span>03</span><small>THE LEARNING</small></div>
        <div className="v6-chapter-copy"><p>经验，会生长</p><h2 className="display-headline"><span className="display-headline-line">一栋房子的经历</span><span className="display-headline-line">成为下一栋房子的经验</span></h2></div>
        <p className="v6-chapter-note">经过验证的个案只形成待人工评审的经验候选。它可以成为试点，但不会被 AI 轻率地写成企业标准。</p>
      </section>

      <section className="v6-manifesto">
        <p>筑生不是在给建筑加一个聊天机器人。</p>
        <h2 className="display-headline"><span className="display-headline-line">它是在让一栋房子</span><span className="display-headline-line">拥有一生不会中断的记忆</span></h2>
        <Link href="/case-1602">查看1602完整事件 <ArrowRight size={17} /></Link>
      </section>
    </main>
  </div>;
}
