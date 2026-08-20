"use client";

import { Check, CheckCircle2, ChevronDown, FileImage, Mic, Pause, Play, QrCode, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SceneStage } from "@/components/scene-stage";
import { EvidenceStrip } from "@/components/evidence-viewer";
import { useDemo } from "@/components/demo-provider";
import { LocalEvidenceUpload } from "@/components/LocalEvidenceUpload";

const WORKER_SPACE_ID = "SPACE-1602-BATHROOM";
const WORKER_SPACE_LABEL = "1602卫生间";
const WORKER_COMPONENT_ID = "J-1602-CW-03";
const WORKER_COMPONENT_LABEL = "1602卫生间重点冷水接头";

export default function WorkerPage() {
  const router = useRouter();
  const { state, next, confirmWorkerEvidence } = useDemo();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("1602卫生间北侧墙冷水接头已经做完，打压没有掉压，照片和房间码都拍了。");
  const [fields, setFields] = useState({ room: WORKER_SPACE_ID, component: WORKER_COMPONENT_ID, process: "冷水支管接头复核", pressure: "无掉压" });
  const latest = state.evidence.find((item) => item.id === "EV-2848");
  const stage = state.currentStep >= 2 ? 4 : state.workerSubstep || 1;
  const workerDraftReady = Boolean(transcript.trim() && fields.process.trim() && fields.pressure.trim());

  useEffect(() => {
    if (!recording || paused) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused, recording]);

  const duration = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);

  function startRecording() {
    setRecorded(false);
    setRecording(true);
    setPaused(false);
    setSeconds(0);
  }

  function finishRecording() {
    setRecording(false);
    setPaused(false);
    setRecorded(true);
  }

  function submitWorkerDraft() {
    if (!workerDraftReady) return;
    confirmWorkerEvidence({ transcript, ...fields });
  }

  function enterResidentTask() {
    // Switching roles must not advance the legacy scripted demo or seed a
    // pre-baked life-event result. The resident starts from their own facts.
    router.push("/resident");
  }

  return (
    <SceneStage view="worker" scene="bathroomConstruction" preload={["bathroomMoisture"]} focus="pipe-joint" activeFlow={recording && !paused} cues={[{ id: "component", label: WORKER_COMPONENT_ID, detail: "冷水系统重点接头", x: 30, y: 45, tone: stage >= 4 ? "safe" : "water" }]}>
      <header className="stage-heading compact worker-stage-heading">
        <span className="stage-kicker">BUILDING MEMORY / 建造阶段</span>
        <h1>冷水支管接头复核</h1>
        <div className="context-line"><span>{WORKER_SPACE_LABEL}</span><i /><span>{WORKER_COMPONENT_ID}</span><i /><span>今日工序 03 / 06</span></div>
      </header>

      <ol className="stage-progress" aria-label="工友提交证据，本章共3个子步骤">
        {["现场口述", "AI整理", "品质核验"].map((label, index) => (
          <li key={label} className={stage > index + 1 ? "done" : stage === index + 1 ? "active" : ""} aria-current={stage === index + 1 ? "step" : undefined}>
            <i>{stage > index + 1 ? <Check size={11} /> : index + 1}</i><span>{label}</span>
          </li>
        ))}
      </ol>

      <section className={`field-recorder ${stage >= 2 ? "compact" : "drawer"}`}>
        <header className="instrument-header">
          <div><small>现场记录</small><strong>{stage === 4 ? "建筑记忆写入完成" : stage === 3 ? "品质核验已提交" : stage === 2 ? "AI已整理施工记录" : "现场口述采集"}</strong></div>
          <span className="instrument-mode"><i />{state.runtimeMode === "ai" ? "AI在线整理" : "示例数据"}</span>
        </header>

        {stage === 1 ? (
          <div className="capture-instrument">
            <div className="room-safety-line"><QrCode size={15} /><span><small>当前记录对象</small><strong>{WORKER_SPACE_LABEL} · {WORKER_COMPONENT_ID}</strong></span><em>扫码/BIM已绑定</em></div>
            <button className={recording ? "record-orbit recording" : "record-orbit"} onClick={() => recording ? setPaused((value) => !value) : startRecording()} aria-label={recording ? paused ? "继续口述" : "暂停口述" : "开始口述记录"}>
              <span className="orbit-ring" />{recording && paused ? <Play size={27} /> : recording ? <Pause size={27} /> : <Mic size={28} />}
            </button>
            <div className={recording && !paused ? "waveform live" : "waveform"} aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -38}ms` }} />)}</div>
            <div className="capture-copy"><strong>{recorded ? "口述已完成" : recording ? paused ? "口述已暂停" : `正在口述 · ${duration}` : "开始口述施工情况"}</strong><small>{recorded ? "可整理为结构化施工记录" : "说明施工状态、保压结果与照片情况"}</small></div>
            {recording ? <div className="recording-actions"><button onClick={() => setPaused((value) => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? "继续" : "暂停"}</button><button onClick={finishRecording}><Check size={15} />完成口述</button></div> : null}
            <button className="stage-decision" onClick={recorded ? next : startRecording}>{recorded ? "整理为施工记录" : "开始口述记录"}</button>
            {!recorded && !recording ? <p className="disabled-reason">完成口述后才能生成施工记录；引导演示可使用示例口述继续。</p> : null}
            <LocalEvidenceUpload label="选择施工现场照片" help="原图只在本机预览，人工确认后再进入正式记录" syntheticExample="/assets/v6/evidence/construction-pipe-install.webp" />
            <div className="capture-tools"><button className="tertiary"><QrCode size={16} />重扫房间码</button></div>
            <details className="evidence-vault"><summary>示例口述原文 <ChevronDown size={15} /></summary><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} aria-label="工友原始口述" /></details>
          </div>
        ) : stage === 2 ? (
          <div className="structured-record">
            <div className="record-lead"><small>AI已整理 · 请人工确认</small><h2>已识别关键施工事实</h2><p>空间与构件身份来自扫码/BIM任务上下文，不作为自由文本修改；工序、保压结果与原始口述可由现场人员修正，确认后的内容才写入 EV-2848。</p></div>
            <div className="record-fields editable">
              <label><span>空间 <em>扫码/BIM绑定</em></span><input value={`${WORKER_SPACE_LABEL} · ${fields.room}`} readOnly aria-readonly="true" /></label>
              <label><span>构件 <em>扫码/BIM绑定</em></span><input value={`${WORKER_COMPONENT_LABEL} · ${fields.component}`} readOnly aria-readonly="true" /></label>
              <label><span>工序 <em>AI提取 · 可修正</em></span><input value={fields.process} onChange={(e) => setFields({ ...fields, process: e.target.value })} /></label>
              <label><span>保压结果 <em>AI提取 · 可修正</em></span><input value={fields.pressure} onChange={(e) => setFields({ ...fields, pressure: e.target.value })} /></label>
            </div>
            <details className="evidence-vault"><summary>原始口述与整理依据 <ChevronDown size={15} /></summary><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} aria-label="人工确认后的工友原始口述" /></details>
            <EvidenceStrip ids={["joint", "pressure"]} label="AI整理关联的现场证据" />
            <div className="evidence-row"><span><FileImage size={15} />现场照片 <strong>2张</strong></span><span><ShieldCheck size={15} />结构化身份 <strong>2/2 已绑定</strong></span></div>
            <button className="stage-decision" disabled={!workerDraftReady} onClick={submitWorkerDraft}>确认内容并提交品质核验</button>
          </div>
        ) : stage === 3 ? (
          <div className="quality-submitted">
            <span className="seal-mark"><ShieldCheck size={28} /></span><small>品质核验已提交</small><h2>记录 EV-2848 等待写入建筑记忆</h2><p>品质智能体已核对人工确认后的口述、工序、保压结果与现场影像；空间和构件继续使用扫码/BIM绑定的结构化 BusinessId。当前工友记录只证明本次冷水管线工序，不替防水或闭水试验记录背书。</p>
            <EvidenceStrip ids={["joint", "pressure"]} label="品质核验现场证据" />
            <dl><div><dt>空间</dt><dd>{WORKER_SPACE_ID}</dd></div><div><dt>构件</dt><dd>{WORKER_COMPONENT_ID}</dd></div><div><dt>下一步</dt><dd>写入建筑生命记忆</dd></div></dl>
            <button className="stage-decision" onClick={next}>写入建筑记忆</button>
          </div>
        ) : (
          <div className="memory-seal compact-success">
            <span className="seal-mark"><CheckCircle2 size={30} /></span><small>BUILDING MEMORY · 已写入</small><h2>这次施工经历不会在封板后消失</h2><p>{latest?.id || "EV-2848"} 已作为当前确认的冷水施工证据留在建筑记忆视图中；空间、系统和构件使用统一 BusinessId，防水、闭水等其他记录继续保持各自来源。</p>
            <EvidenceStrip ids={["joint", "pressure"]} label="EV-2848建筑记忆证据" />
            <dl className="memory-object"><div><dt>空间</dt><dd>{WORKER_SPACE_LABEL} · {fields.room}</dd></div><div><dt>构件</dt><dd>{WORKER_COMPONENT_LABEL} · {fields.component}</dd></div><div><dt>工序</dt><dd>{fields.process}</dd></div><div><dt>保压结果</dt><dd>{fields.pressure}</dd></div></dl>
            <div className="contribution-line"><span>当前已接入</span><strong>建筑记忆检索 · 构件身份追溯 · 3D定位</strong></div>
            <div className="success-links"><button className="stage-decision" onClick={enterResidentTask}>进入住户服务</button><Link href="/memory?record=EV-2848">查看这条建筑记忆</Link><Link href="/">返回建筑总览</Link></div>
          </div>
        )}
      </section>
    </SceneStage>
  );
}
