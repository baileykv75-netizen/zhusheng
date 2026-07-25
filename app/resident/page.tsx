"use client";

import { AlertTriangle, Check, FileCheck2, Gauge, ImagePlus, LockKeyhole, ShieldAlert, Waves } from "lucide-react";
import { TelemetryChart } from "@/components/telemetry-chart";
import { useDemo } from "@/components/demo-provider";

export default function ResidentPage() {
  const { state, next, approve } = useDemo();
  const incident = state.incident;
  const pendingAction = state.actions.find((action) => action.status === "pending");

  return (
    <div className="page resident-page">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">INCIDENT RESPONSE / 1602</span>
          <h1>住户事件处置</h1>
        </div>
        <div className={incident ? "incident-state active" : "incident-state"}>
          <i />
          <span><small>事件状态</small><strong>{incident ? incident.id : "暂无异常"}</strong></span>
        </div>
      </div>

      {!incident ? (
        <section className="resident-empty">
          <Waves size={26} />
          <strong>建筑健康智能体持续感知中</strong>
          <span>短时洗浴潮湿不会直接触发渗漏结论</span>
          <button className="primary-action" onClick={next}>模拟持续异常</button>
        </section>
      ) : (
        <section className="incident-workspace">
          <div className="incident-journal">
            <header className="incident-title">
              <AlertTriangle size={21} />
              <div>
                <span>MEDIUM · 16F / 1602</span>
                <h2>卫生间墙体持续潮湿</h2>
              </div>
              <em>{incident.status === "resolved" ? "已恢复" : incident.status === "dispatched" ? "维修中" : "分析中"}</em>
            </header>
            <div className="event-timeline">
              {incident.timeline.map((item, index) => (
                <div key={`${item.time}-${index}`}>
                  <time>{item.time}</time>
                  <i className={index === incident.timeline.length - 1 ? "current" : ""} />
                  <span><strong>{item.actor}</strong><small>{item.text}</small></span>
                </div>
              ))}
            </div>
            {incident.missing.length > 0 ? (
              <section className="resident-inputs">
                <div className="subheading"><span>住户补充信息</span><em>{incident.missing.length}项待补充</em></div>
                <label className="meter-answer">
                  <Gauge size={18} />
                  <span><strong>停用水后水表状态</strong><small>水表仍在缓慢转动</small></span>
                  <input type="checkbox" defaultChecked aria-label="确认停用水后水表仍转动" />
                </label>
                <button className="photo-upload"><ImagePlus size={18} />补充墙面潮湿区域照片</button>
                <button className="record-submit" onClick={next}>提交并继续联合诊断</button>
              </section>
            ) : null}
          </div>

          <div className="incident-analysis">
            <section className="analysis-block">
              <div className="subheading"><span>传感趋势</span><em>S-M1602-04 / F-1602-01</em></div>
              <TelemetryChart />
            </section>
            <section className="analysis-block diagnosis-block">
              <div className="subheading"><span>联合诊断</span><em>{incident.confidence}% CONF.</em></div>
              <p>{incident.diagnosis}</p>
              <div className="confidence"><i style={{ width: `${incident.confidence}%` }} /><span>{incident.confidence}%</span></div>
              <div className="evidence-register">
                {["EV-2845 管线影像", "EV-2846 防水记录", "EV-2847 闭水试验", "BIM-1602-WATER"].map((ref) => (
                  <span key={ref}><FileCheck2 size={13} />{ref}</span>
                ))}
              </div>
            </section>

            {pendingAction ? (
              <section className="authorization-panel">
                <div className="auth-heading"><ShieldAlert size={21} /><span><strong>需要人工授权</strong><small>中等影响设备动作 · 未授权不得执行</small></span></div>
                <dl>
                  <div><dt>动作</dt><dd>{pendingAction.title}</dd></div>
                  <div><dt>设备</dt><dd>V-16F-02-B</dd></div>
                  <div><dt>影响</dt><dd>仅停止1602卫生间局部供水</dd></div>
                </dl>
                <button className="authorize-button" onClick={approve}><LockKeyhole size={17} />确认授权并执行关阀</button>
              </section>
            ) : null}

            {state.valve.status === "closed" ? (
              <section className="action-result">
                <Check size={18} />
                <span><strong>局部阀门已关闭，流量降至0</strong><small>授权人：{state.valve.authorizedBy} · 工单WO-260725-08已派发</small></span>
              </section>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
