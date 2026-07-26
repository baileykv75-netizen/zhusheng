"use client";

import { Activity, Check, ChevronRight, Layers3, MapPin, Radio, Waves, X } from "lucide-react";
import { useState } from "react";
import { SceneStage } from "@/components/scene-stage";
import { useDemo } from "@/components/demo-provider";

const layers = ["空间", "给排水", "设备"] as const;

export default function BuildingWorkbench() {
  const { state } = useDemo();
  const [layer, setLayer] = useState<(typeof layers)[number]>("给排水");
  const [lensOpen, setLensOpen] = useState(true);
  const latestTrace = state.agentTrace.at(-1);
  const hasOpenIncident = Boolean(state.incident && state.incident.status !== "resolved");

  return (
    <SceneStage
      view="building"
      focus={lensOpen ? "room-1602" : "overview"}
      activeFlow={layer === "给排水" && hasOpenIncident}
      cues={[{
        id: "room-1602",
        label: "MIC-BATH-1602",
        detail: hasOpenIncident ? "事件处置中" : "水系统记忆完整",
        x: 48,
        y: 39,
        tone: hasOpenIncident ? "risk" : "water"
      }]}
    >
      <header className="stage-heading building-heading">
        <span className="stage-kicker">BUILDING LIFE / DAY 1684</span>
        <h1>一栋楼，<br />正在工作。</h1>
        <p>建造记录没有在交付时消失。它正在成为今天每一次判断与行动的依据。</p>
      </header>

      <div className="layer-console" role="group" aria-label="建筑图层">
        {layers.map((item) => (
          <button key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>
            {item === "空间" ? <MapPin size={14} /> : item === "给排水" ? <Waves size={14} /> : <Layers3 size={14} />}
            {item}
          </button>
        ))}
      </div>

      <button className="focus-trigger" onClick={() => setLensOpen(true)} aria-label="打开1602空间检查器">
        <i /><span>16F</span><ChevronRight size={14} />
      </button>

      <aside className={lensOpen ? "building-lens open" : "building-lens"} aria-hidden={!lensOpen}>
        <header>
          <div><small>BUILDING LENS</small><strong>1602 · 水系统</strong></div>
          <button onClick={() => setLensOpen(false)} aria-label="关闭建筑镜头"><X size={18} /></button>
        </header>
        <section className="lens-state">
          <span className={hasOpenIncident ? "state-orbit risk" : "state-orbit"}><Activity size={21} /></span>
          <div>
            <small>当前状态</small>
            <strong>{hasOpenIncident ? "事件处置中" : state.incident?.status === "resolved" ? "维修验证完成" : "运行平稳"}</strong>
            <p>{state.incident?.diagnosis || "186个空间感知节点在线，未发现需要人工介入的异常。"}</p>
          </div>
        </section>
        <div className="lens-metrics">
          <div><small>生命记忆</small><strong>{state.evidence.length > 3 ? "95.0" : "94.2"}<em>%</em></strong></div>
          <div><small>关联证据</small><strong>{state.evidence.length}<em>条</em></strong></div>
          <div><small>专业智能体</small><strong>06<em>在线</em></strong></div>
        </div>
        <section className="lens-trace">
          <div className="lens-section-title"><span>最近协作</span><em>{state.agentTrace.length} TRACE</em></div>
          {latestTrace ? (
            <div className="trace-brief">
              <small>{latestTrace.from} → {latestTrace.to}</small>
              <strong>{latestTrace.task}</strong>
              <p>{latestTrace.output}</p>
              <span>依据 {latestTrace.refs.join(" / ")}</span>
            </div>
          ) : (
            <div className="trace-empty"><Radio size={16} />等待建筑事件</div>
          )}
        </section>
      </aside>

      <section className="life-film" aria-label="建筑生命周期">
        <div className="life-film-title"><Radio size={14} /><span>建筑生命线</span></div>
        {[
          ["2025.03.18", "建造", "管线证据"],
          ["2025.03.21", "验收", "闭水试验"],
          ["2025.06.30", "交付", "记忆移交"],
          ["2026.07.25", "入住", state.incident ? "事件闭环" : "持续感知"]
        ].map(([date, phase, note], index) => (
          <div className={index === 3 ? "life-film-node current" : "life-film-node"} key={date}>
            <i><Check size={9} /></i><span>{date}</span><strong>{phase}</strong><small>{note}</small>
          </div>
        ))}
      </section>
    </SceneStage>
  );
}
