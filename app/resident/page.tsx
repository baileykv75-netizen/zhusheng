"use client";

import { Check, ChevronDown, FileCheck2, Gauge, ImagePlus, LockKeyhole, ShieldAlert, Undo2, Waves } from "lucide-react";
import { useState } from "react";
import { SceneStage } from "@/components/scene-stage";
import { TelemetryChart } from "@/components/telemetry-chart";
import { useDemo } from "@/components/demo-provider";

const changeByStep: Record<number, { title: string; items: string[] }> = {
  3: { title: "本步新增", items: ["发现持续湿度异常", "初始诊断置信度 56%", "需要补充2项现场信息"] },
  4: { title: "跨阶段协作已启动", items: ["品质智能体调取建造证据", "找到EV-2848管线复核记录", "协作链增加至4条"] },
  5: { title: "诊断结果已更新", items: ["收到停水后水表状态", "收到潮湿区域照片", "诊断置信度由56%提升至86%"] },
  6: { title: "授权动作已完成", items: ["住户确认局部关阀", "微流量已降至0", "工单WO-260725-08已生成"] }
};

export default function ResidentPage() {
  const { state, next, approve } = useDemo();
  const [meterConfirmed, setMeterConfirmed] = useState(false);
  const [photoAdded, setPhotoAdded] = useState(false);
  const [executing, setExecuting] = useState(false);
  const incident = state.incident;
  const pendingAction = state.actions.find((action) => action.status === "pending");
  const completedTasks = Number(meterConfirmed) + Number(photoAdded);
  const stepChange = changeByStep[state.currentStep];

  function executeAuthorization() {
    setExecuting(true);
    window.setTimeout(() => { approve(); setExecuting(false); }, 720);
  }

  return (
    <SceneStage
      view="resident"
      focus="pipe-joint"
      activeFlow={Boolean(incident && incident.status !== "resolved")}
      cues={incident ? [
        { id: "joint", label: "W-1602-B7", detail: `${incident.confidence}% 疑似漏点`, x: 29, y: 44, tone: state.currentStep >= 6 ? "safe" : "risk" },
        { id: "sensor", label: "S-M1602-04", detail: `墙体湿度 ${state.currentStep >= 6 ? "38" : "41"}%`, x: 42, y: 58, tone: state.currentStep >= 6 ? "safe" : "water" }
      ] : []}
    >
      <header className="stage-heading compact resident-stage-heading">
        <span className="stage-kicker">住户事件处置 · 1602卫生间</span>
        <h1>让问题停在<br />最小影响范围。</h1>
        <p>AI负责调取证据并提出建议；设备动作仍由住户或物业授权。</p>
      </header>

      {!incident ? (
        <section className="resident-idle compact-panel">
          <span className="idle-sensor"><Waves size={26} /></span><small>建筑健康感知</small><h2>空间持续感知中</h2><p>当前未发现需要人工介入的异常。</p><div className="last-updated">最近更新：今天 16:30</div><button className="stage-decision" onClick={next}>模拟持续异常</button>
        </section>
      ) : (
        <>
          <section className="sensor-overlay">
            <header><span>水系统趋势</span><em>湿度 % / 微流量 L/min · 当前16:30</em></header><TelemetryChart />
          </section>

          <aside className="response-dossier drawer adaptive">
            <header className="dossier-header"><div><small>{incident.id} · 16F / 1602</small><h2>墙体持续潮湿</h2></div><span>{state.currentStep >= 6 ? "已执行" : state.currentStep >= 5 ? "待授权" : "诊断中"}</span></header>

            {stepChange ? <section className={`step-change step-${state.currentStep}`}><div><strong>{stepChange.title}</strong><em>第{state.currentStep}章</em></div><ul>{stepChange.items.map((item) => <li key={item}><Check size={12} />{item}</li>)}</ul></section> : null}

            <section className="diagnosis-card">
              <div className="dossier-section-title"><span>联合诊断结论</span><em>诊断置信度 {incident.confidence}%</em></div>
              <p>{incident.diagnosis}</p>
              <div className="confidence-rail" aria-label={`诊断置信度${incident.confidence}%`}><i style={{ width: `${incident.confidence}%` }} /></div>
              {state.currentStep >= 5 ? <div className="confidence-reason"><strong>置信度由56%提升至86%</strong><span>原因：停水后仍有微流量，且潮湿位置与支管接头空间关系吻合。</span></div> : null}
              <details className="reference-vault"><summary>关联证据 <span>{state.evidence.length}条</span><ChevronDown size={14} /></summary><div>{state.evidence.map((record) => <span key={record.id}><FileCheck2 size={12} />{record.id} · {record.type}</span>)}</div></details>
            </section>

            {state.currentStep === 3 ? <section className="chapter-action"><p>下一步将调用建造阶段的品质证据，判断异常是否与隐蔽管线有关。</p><button className="stage-decision" onClick={next}>启动跨阶段诊断</button></section> : null}

            {state.currentStep === 4 ? (
              <section className="resident-supplement">
                <div className="dossier-section-title"><span>待补充任务</span><em>已完成 {completedTasks}/2</em></div>
                <button className={meterConfirmed ? "supplement-task complete" : "supplement-task"} onClick={() => setMeterConfirmed((value) => !value)}><Gauge size={17} /><span><strong>确认停用水后水表状态</strong><small>{meterConfirmed ? "已确认仍缓慢转动 · 有助于排除生活用水" : "待住户确认"}</small></span><i>{meterConfirmed ? <Check size={12} /> : "1"}</i></button>
                <button className={photoAdded ? "supplement-task complete" : "supplement-task"} onClick={() => setPhotoAdded(true)}><ImagePlus size={17} /><span><strong>补充墙面潮湿区域照片</strong><small>{photoAdded ? "照片已选择 · 用于比对构件空间位置" : "待添加照片"}</small></span><i>{photoAdded ? <Check size={12} /> : "2"}</i></button>
                <button className="stage-decision" disabled={completedTasks < 2} onClick={next}>提交信息并更新诊断</button>
                {completedTasks < 2 ? <p className="disabled-reason">完成两项现场信息后才能更新诊断；引导演示可使用示例信息继续。</p> : null}
              </section>
            ) : null}

            {pendingAction ? (
              <section className="safety-gate">
                <div className="safety-heading"><ShieldAlert size={21} /><span><strong>人工授权边界</strong><small>AI已冻结设备自主动作</small></span></div>
                <dl><div><dt>执行动作</dt><dd>关闭1602局部进水阀</dd></div><div><dt>影响范围</dt><dd>仅本户卫生间供水</dd></div><div><dt>是否可恢复</dt><dd>物业复核后可重新开启</dd></div><div><dt>当前授权人</dt><dd>1602住户</dd></div></dl>
                <button className="authorize-decision" disabled={executing} onClick={executeAuthorization}><LockKeyhole size={16} />{executing ? "正在执行关阀并验证流量…" : "确认授权并执行关阀"}</button>
              </section>
            ) : null}

            {state.currentStep >= 6 && state.valve.status === "closed" ? (
              <section className="action-confirmed detailed"><Check size={20} /><div><strong>阀门已关闭，微流量降至0</strong><dl><div><dt>影响范围</dt><dd>仅1602卫生间</dd></div><div><dt>维修工单</dt><dd>WO-260725-08</dd></div></dl><p><Undo2 size={13} />演示模式不执行撤销；真实系统需由物业复核后重新开启。</p></div></section>
            ) : null}

            <details className="trace-vault"><summary>智能体协作记录 <span>{incident.timeline.length}条</span><ChevronDown size={15} /></summary><div className="agent-chain">{incident.timeline.map((item, index) => <div key={`${item.time}-${index}`}><time>{item.time}</time><i /><span><strong>{item.actor}</strong><small>{item.text}</small></span></div>)}</div></details>
          </aside>
        </>
      )}
    </SceneStage>
  );
}
