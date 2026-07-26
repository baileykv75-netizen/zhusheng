"use client";

import { Activity, Check, ChevronRight, Layers3, MapPin, Radio, Waves, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SceneStage } from "@/components/scene-stage";
import { useDemo } from "@/components/demo-provider";
import type { VisualCue } from "@/lib/stage";

const layers = ["空间", "给排水", "设备"] as const;
type Layer = (typeof layers)[number];

const layerData: Record<Layer, {
  title: string;
  subtitle: string;
  cues: VisualCue[];
  metrics: [string, string, string][];
  legend: string[];
}> = {
  空间: {
    title: "1602 · 空间记忆",
    subtitle: "16F / MiC卫生间模块",
    cues: [
      { id: "room", label: "1602卫生间", detail: "空间边界已定位", x: 48, y: 39, tone: "water" },
      { id: "module", label: "MIC-BATH-1602", detail: "模块身份完整", x: 42, y: 29, tone: "neutral" }
    ],
    metrics: [["空间证据", "4", "条"], ["交付记忆", "100", "%"], ["关联构件", "8", "个"]],
    legend: ["房间边界", "MiC模块"]
  },
  给排水: {
    title: "1602 · 给排水系统",
    subtitle: "冷热水立管 / 支管 / 局部阀门",
    cues: [
      { id: "joint", label: "W-1602-B7", detail: "PPR DN20支管接头", x: 48, y: 39, tone: "water" },
      { id: "valve", label: "V-16F-02-B", detail: "局部进水阀 · 开启", x: 43, y: 56, tone: "safe" }
    ],
    metrics: [["生命记忆", "94.2", "%"], ["关联证据", "3", "条"], ["水系统状态", "正常", ""]],
    legend: ["冷热水管线", "局部阀门"]
  },
  设备: {
    title: "1602 · 设备状态",
    subtitle: "传感器 / 水表 / 阀门",
    cues: [
      { id: "moisture", label: "S-M1602-04", detail: "湿度传感器 · 在线", x: 50, y: 46, tone: "safe" },
      { id: "flow", label: "F-1602-01", detail: "微流量计 · 0 L/min", x: 42, y: 62, tone: "water" },
      { id: "valve-device", label: "V-16F-02-B", detail: "智能阀门 · 在线", x: 45, y: 55, tone: "neutral" }
    ],
    metrics: [["在线设备", "3", "台"], ["异常设备", "0", "台"], ["最近更新", "16:30", ""]],
    legend: ["感知设备", "执行设备"]
  }
};

export default function BuildingWorkbench() {
  const { state } = useDemo();
  const [layer, setLayer] = useState<Layer>("给排水");
  const [lensOpen, setLensOpen] = useState(false);
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latestTrace = state.agentTrace.at(-1);
  const hasOpenIncident = Boolean(state.incident && state.incident.status !== "resolved");
  const config = layerData[layer];

  useEffect(() => {
    if (lensOpen) closeRef.current?.focus();
  }, [lensOpen]);

  function closeLens() {
    setLensOpen(false);
    requestAnimationFrame(() => hotspotRef.current?.focus());
  }

  return (
    <SceneStage view="building" focus={lensOpen ? "room-1602" : "overview"} activeFlow={layer === "给排水" && hasOpenIncident} cues={config.cues}>
      <header className="stage-heading building-heading">
        <span className="stage-kicker">建筑生命 · 运营第1684天</span>
        <h1>一栋楼，<br />正在工作。</h1>
        <p>建造记录没有在交付时消失。它正在成为今天每一次判断与行动的依据。</p>
      </header>

      <div className="layer-console" role="group" aria-label="建筑图层">
        {layers.map((item) => (
          <button key={item} className={layer === item ? "active" : ""} aria-pressed={layer === item} onClick={() => setLayer(item)}>
            {item === "空间" ? <MapPin size={14} /> : item === "给排水" ? <Waves size={14} /> : <Layers3 size={14} />}{item}
          </button>
        ))}
      </div>

      <div className={`layer-overlay layer-${layer}`} aria-hidden="true">
        <span className="space-boundary" /><span className="water-riser" /><span className="device-node node-a" /><span className="device-node node-b" /><span className="device-node node-c" />
      </div>

      <button ref={hotspotRef} className="focus-trigger" onClick={() => setLensOpen(true)} aria-label={`查看${config.title}`}>
        <i /><span>16F · 1602</span><ChevronRight size={14} />
      </button>

      {!lensOpen ? (
        <button className="building-lens-peek" onClick={() => setLensOpen(true)}>
          <span><small>{config.subtitle}</small><strong>{config.title}</strong><em>{hasOpenIncident ? "事件处置中" : "运行平稳 · 6个专业智能体在线"}</em></span>
          <b>查看<ChevronRight size={14} /></b>
        </button>
      ) : null}

      <aside className={lensOpen ? "building-lens open" : "building-lens"} aria-hidden={!lensOpen} aria-label="建筑检查器">
        <header>
          <div><small>建筑检查器</small><strong>{config.title}</strong><em>{config.subtitle}</em></div>
          <button ref={closeRef} onClick={closeLens} aria-label="关闭建筑检查器"><X size={18} /></button>
        </header>
        <section className="lens-state">
          <span className={hasOpenIncident ? "state-orbit risk" : "state-orbit"}><Activity size={21} /></span>
          <div><small>当前状态</small><strong>{hasOpenIncident ? "事件处置中" : state.incident?.status === "resolved" ? "维修验证完成" : "运行平稳"}</strong><p>{state.incident?.diagnosis || "最近巡检 16:30，关键设备在线，过去24小时未发现需要人工介入的异常。"}</p></div>
        </section>
        <div className="lens-metrics">
          {config.metrics.map(([label, value, unit]) => <div key={label}><small>{label}</small><strong>{value}<em>{unit}</em></strong></div>)}
        </div>
        <div className="layer-legend" aria-label="当前图层图例">
          <span>当前图层</span>{config.legend.map((item, index) => <em key={item}><i className={index ? "secondary" : ""} />{item}</em>)}
        </div>
        <section className="lens-trace">
          <div className="lens-section-title"><span>{latestTrace ? "智能体协作链" : "最近一次活动"}</span><em>{latestTrace ? `${state.agentTrace.length}条协作记录` : "今天 16:30"}</em></div>
          {latestTrace ? (
            <div className="trace-brief"><small>{latestTrace.from} → {latestTrace.to}</small><strong>{latestTrace.task}</strong><p>{latestTrace.output}</p><span>依据 {latestTrace.refs.join(" / ")}</span></div>
          ) : (
            <div className="recent-activity"><Radio size={16} /><span><strong>设备状态巡检完成</strong><small>3台水系统设备在线，最新建筑记忆写入于2025.06.30。</small></span></div>
          )}
        </section>
      </aside>

      <section className="life-film" aria-label="建筑生命周期：建造、验收、交付、入住和持续运营">
        <div className="life-film-title"><Radio size={14} /><span>建筑生命线</span></div>
        {[["2025.03.18", "建造", "管线证据"], ["2025.03.21", "验收", "闭水试验"], ["2025.06.30", "交付", "记忆移交"], ["2026.07.25", "入住", state.incident ? "事件闭环" : "持续感知"]].map(([date, phase, note], index) => (
          <div className={index === 3 ? "life-film-node current" : "life-film-node"} key={date}><i><Check size={9} /></i><span>{date}</span><strong>{phase}</strong><small>{note}</small></div>
        ))}
      </section>
    </SceneStage>
  );
}
