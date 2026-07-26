"use client";

import Image from "next/image";
import { Check, Layers3, MapPin, PanelRightOpen, Radio, ScanLine, Waves, X } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";

const layers = ["空间", "给排水", "设备"] as const;

export default function BuildingWorkbench() {
  const { state } = useDemo();
  const [layer, setLayer] = useState<(typeof layers)[number]>("给排水");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const latestTrace = state.agentTrace.at(-1);
  const incidentStatus = state.incident
    ? state.incident.status === "resolved"
      ? "已验证恢复"
      : "事件处置中"
    : "运行平稳";

  return (
    <div className="page building-page">
      <header className="building-intro">
        <div>
          <span className="eyebrow">建筑生命工作台 · BLD-HZZ-02</span>
          <h1>一栋楼正在工作</h1>
          <p>建造记录正在成为这栋建筑今日判断与行动的依据。</p>
        </div>
        <section className="status-strip" aria-label="建筑运行摘要">
          <div><span>生命记忆</span><strong>{state.evidence.length > 3 ? "95.0%" : "94.2%"}</strong></div>
          <div><span>在线空间</span><strong>186</strong></div>
          <div><span>当前状态</span><strong className={state.incident && state.incident.status !== "resolved" ? "attention" : ""}>{incidentStatus}</strong></div>
        </section>
      </header>

      <section className="building-workbench">
        <div className="bim-workspace">
          <div className="workspace-heading">
            <div className="drawing-title">
              <span>建筑剖面 · 16F空间定位</span>
              <small>运营期 DAY 1684 · 给排水系统</small>
            </div>
            <div className="layer-switch" role="group" aria-label="BIM图层">
              {layers.map((item) => (
                <button key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>
                  {item === "空间" ? <MapPin size={14} /> : item === "给排水" ? <Waves size={14} /> : <Layers3 size={14} />}
                  {item}
                </button>
              ))}
              <button className="inspector-trigger" onClick={() => setInspectorOpen(true)}>
                <PanelRightOpen size={14} />任务检查器
              </button>
            </div>
          </div>

          <div className={`bim-canvas layer-${layer}`}>
            <Image
              src="/assets/building-digital-twin.png"
              alt="华章新筑2号楼脱敏建筑剖面样板"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 68vw"
            />
            <div className="drawing-coordinate coordinate-x">X / 07-12</div>
            <div className="drawing-coordinate coordinate-y">Y / B-F</div>
            <button className="component-callout" aria-label="定位1602卫生间" onClick={() => setInspectorOpen(true)}>
              <span className="callout-line" />
              <span className="callout-copy">
                <small>16F · BATHROOM</small>
                <strong>MIC-BATH-1602</strong>
                <em>{state.incident ? "事件 INC-260725-01" : "水系统记忆完整"}</em>
              </span>
            </button>
            <div className="drawing-stamp">
              <ScanLine size={15} />
              脱敏样板 · 真实BIM待替换
            </div>
          </div>

          <div className="life-log">
            <div className="life-log-title">
              <Radio size={15} />
              建筑生命日志
            </div>
            {[
              ["2025.03.18", "建造", "管线证据"],
              ["2025.03.21", "验收", "闭水试验"],
              ["2025.06.30", "交付", "记忆移交"],
              ["2026.07.25", "入住", state.incident ? "事件闭环" : "持续感知"]
            ].map(([date, phase, event], index) => (
              <div className="log-node" key={date}>
                <i className={index === 3 ? "live" : ""}><Check size={10} /></i>
                <span>{date}</span>
                <strong>{phase}</strong>
                <small>{event}</small>
              </div>
            ))}
          </div>
        </div>

        <button
          className={inspectorOpen ? "inspector-backdrop visible" : "inspector-backdrop"}
          aria-label="关闭任务检查器"
          onClick={() => setInspectorOpen(false)}
          tabIndex={inspectorOpen ? 0 : -1}
        />
        <aside className={inspectorOpen ? "building-inspector open" : "building-inspector"} aria-hidden={!inspectorOpen}>
          <div className="inspector-header">
            <span><small>BUILDING / 02</small><strong>总智能体任务检查器</strong></span>
            <button aria-label="关闭任务检查器" onClick={() => setInspectorOpen(false)}><X size={18} /></button>
          </div>
          <section className="inspector-section">
            <div className="section-line">
              <span>当前事件</span>
              <em>{state.incident ? state.incident.id : "NONE"}</em>
            </div>
            {state.incident ? (
              <div className="current-incident">
                <strong>1602卫生间墙体持续潮湿</strong>
                <p>{state.incident.diagnosis}</p>
                <div className="confidence"><i style={{ width: `${state.incident.confidence}%` }} /><span>{state.incident.confidence}%</span></div>
              </div>
            ) : (
              <div className="quiet-state">
                <i />
                <strong>建筑运行平稳</strong>
                <span>186个空间感知节点在线</span>
              </div>
            )}
          </section>

          <section className="inspector-section">
            <div className="section-line"><span>专业智能体</span><em>6 ONLINE</em></div>
            <div className="agent-register">
              {[
                ["Q-01", "品质智能体", "建造证据"],
                ["P-02", "项目协同", "工序接口"],
                ["W-03", "工友服务", "现场留痕"],
                ["H-04", "建筑健康", "空间感知"],
                ["E-05", "设备具身", "动作执行"],
                ["R-06", "居住服务", "住户授权"]
              ].map(([code, name, task]) => (
                <div key={code}>
                  <span>{code}</span><strong>{name}</strong><small>{task}</small><i />
                </div>
              ))}
            </div>
          </section>

          <section className="inspector-section last">
            <div className="section-line"><span>最近协作</span><em>{state.agentTrace.length} TRACE</em></div>
            {latestTrace ? (
              <div className="latest-trace">
                <span>{latestTrace.from} → {latestTrace.to}</span>
                <strong>{latestTrace.task}</strong>
                <p>{latestTrace.output}</p>
                <small>引用 {latestTrace.refs.join(" / ")}</small>
              </div>
            ) : (
              <div className="trace-placeholder">启动演示后，这里将显示可追溯的智能体协作链。</div>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
