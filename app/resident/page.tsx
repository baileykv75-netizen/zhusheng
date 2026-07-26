"use client";

import { AlertTriangle, Check, ChevronDown, FileCheck2, Gauge, ImagePlus, LockKeyhole, ShieldAlert, Waves } from "lucide-react";
import { SceneStage } from "@/components/scene-stage";
import { TelemetryChart } from "@/components/telemetry-chart";
import { useDemo } from "@/components/demo-provider";

export default function ResidentPage() {
  const { state, next, approve } = useDemo();
  const incident = state.incident;
  const pendingAction = state.actions.find((action) => action.status === "pending");
  const riskTone = incident && incident.status !== "resolved" ? "risk" : "water";

  return (
    <SceneStage
      view="resident"
      focus="pipe-joint"
      activeFlow={Boolean(incident && incident.status !== "resolved")}
      cues={incident ? [
        { id: "joint", label: "W-1602-B7", detail: `${incident.confidence}%疑似漏点`, x: 29, y: 44, tone: riskTone },
        { id: "sensor", label: "S-M1602-04", detail: "墙体湿度 41%", x: 42, y: 58, tone: "water" }
      ] : []}
    >
      <header className="stage-heading compact resident-stage-heading">
        <span className="stage-kicker">RESIDENT RESPONSE / INC-260725-01</span>
        <h1>让问题停在<br />最小影响范围。</h1>
        <p>诊断引用真实空间、构件与建造证据；设备动作仍由人决定。</p>
      </header>

      {!incident ? (
        <section className="resident-idle">
          <span className="idle-sensor"><Waves size={26} /></span>
          <small>BUILDING HEALTH / LIVE</small>
          <h2>空间持续感知中</h2>
          <p>短时洗浴潮湿不会直接触发渗漏结论。</p>
          <button className="stage-decision" onClick={next}>模拟持续异常</button>
        </section>
      ) : (
        <>
          <section className="sensor-overlay">
            <header><span>WATER SYSTEM TELEMETRY</span><em>S-M1602-04 / F-1602-01</em></header>
            <TelemetryChart />
          </section>

          <aside className="response-dossier">
            <header className="dossier-header">
              <div><small>MEDIUM · 16F / 1602</small><h2>墙体持续潮湿</h2></div>
              <span>{incident.status === "resolved" ? "已恢复" : incident.status === "dispatched" ? "维修中" : "分析中"}</span>
            </header>

            <section className="diagnosis-card">
              <div className="dossier-section-title"><span>联合诊断</span><em>{incident.confidence}% CONF.</em></div>
              <p>{incident.diagnosis}</p>
              <div className="confidence-rail"><i style={{ width: `${incident.confidence}%` }} /></div>
              <div className="reference-strip">
                {state.evidence.slice(0, 4).map((record) => <span key={record.id}><FileCheck2 size={12} />{record.id}</span>)}
              </div>
            </section>

            {incident.missing.length > 0 ? (
              <section className="resident-supplement">
                <div className="dossier-section-title"><span>住户补充</span><em>{incident.missing.length}项待确认</em></div>
                <label><Gauge size={17} /><span><strong>停用水后水表仍缓慢转动</strong><small>用于排除生活用水影响</small></span><input type="checkbox" defaultChecked /></label>
                <button className="attachment-action"><ImagePlus size={16} />墙面潮湿区域照片 <strong>已选择</strong></button>
                <button className="stage-decision" onClick={next}>提交并继续联合诊断</button>
              </section>
            ) : null}

            {pendingAction ? (
              <section className="safety-gate">
                <div className="safety-heading"><ShieldAlert size={21} /><span><strong>人工授权边界</strong><small>AI已冻结设备自主动作</small></span></div>
                <dl><div><dt>动作</dt><dd>关闭1602局部进水阀</dd></div><div><dt>影响</dt><dd>仅停止本户卫生间供水</dd></div></dl>
                <button className="authorize-decision" onClick={approve}><LockKeyhole size={16} />确认授权并执行关阀</button>
              </section>
            ) : null}

            {state.valve.status === "closed" ? (
              <section className="action-confirmed"><Check size={18} /><span><strong>阀门已关闭，流量降至0</strong><small>WO-260725-08 已精准派发</small></span></section>
            ) : null}

            <details className="trace-vault">
              <summary>智能体协作链 <span>{incident.timeline.length}条</span><ChevronDown size={15} /></summary>
              <div className="agent-chain">
                {incident.timeline.map((item, index) => (
                  <div key={`${item.time}-${index}`}><time>{item.time}</time><i /><span><strong>{item.actor}</strong><small>{item.text}</small></span></div>
                ))}
              </div>
            </details>
          </aside>
        </>
      )}
    </SceneStage>
  );
}
