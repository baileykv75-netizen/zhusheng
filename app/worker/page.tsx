"use client";

import { Camera, Check, CheckCircle2, ChevronDown, FileImage, Mic, QrCode, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SceneStage } from "@/components/scene-stage";
import { useDemo } from "@/components/demo-provider";

export default function WorkerPage() {
  const { state, next } = useDemo();
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("1602卫生间北侧墙冷热水接头已经做完，打压没有掉压，照片和房间码都拍了。");
  const latest = state.evidence.at(-1);
  const structured = state.completedSteps.includes(1);
  const verified = state.completedSteps.includes(2);
  const stage = verified ? 3 : structured ? 2 : 1;

  return (
    <SceneStage
      view="worker"
      focus="pipe-joint"
      activeFlow={recording}
      cues={[{ id: "component", label: "W-1602-B7", detail: "PPR DN20支管接头", x: 30, y: 45, tone: verified ? "safe" : "water" }]}
    >
      <header className="stage-heading compact worker-stage-heading">
        <span className="stage-kicker">SITE RECORD / 1602</span>
        <h1>冷热水支管<br />接头复核</h1>
        <div className="context-line"><span>1602卫生间</span><i /><span>MIC-BATH-1602</span><i /><span>03 / 06</span></div>
      </header>

      <ol className="stage-progress" aria-label="施工记录进度">
        {["现场口述", "AI整理", "品质核验"].map((label, index) => (
          <li key={label} className={stage > index + 1 ? "done" : stage === index + 1 ? "active" : ""}>
            <i>{stage > index + 1 ? <Check size={11} /> : index + 1}</i><span>{label}</span>
          </li>
        ))}
      </ol>

      <section className="field-recorder">
        <header className="instrument-header">
          <div><small>FIELD RECORDER</small><strong>{verified ? "建筑记忆签入" : structured ? "结构化施工记录" : "现场口述采集"}</strong></div>
          <span className={`instrument-mode ${state.runtimeMode}`}><i />{state.runtimeMode === "ai" ? "AI在线" : "演示回退"}</span>
        </header>

        {!structured ? (
          <div className="capture-instrument">
            <button className={recording ? "record-orbit recording" : "record-orbit"} onClick={() => setRecording((value) => !value)} aria-label={recording ? "结束口述记录" : "开始口述记录"}>
              <span className="orbit-ring" /><Mic size={28} />
            </button>
            <div className={recording ? "waveform live" : "waveform"} aria-hidden="true">
              {Array.from({ length: 22 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -38}ms` }} />)}
            </div>
            <div className="capture-copy"><strong>{recording ? "正在记录" : "按下口述施工情况"}</strong><small>说明施工状态、保压结果与照片情况</small></div>
            <div className="capture-tools">
              <button><Camera size={17} />拍摄现场</button><button><QrCode size={17} />重扫房间码</button>
            </div>
            <details className="evidence-vault">
              <summary>当前口述原文 <ChevronDown size={15} /></summary>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} aria-label="工友原始口述" />
            </details>
            <button className="stage-decision" onClick={next}>整理为施工记录</button>
          </div>
        ) : !verified ? (
          <div className="structured-record">
            <div className="record-lead"><small>AI STRUCTURED / 待人工确认</small><h2>已识别关键施工事实</h2><p>原始口述始终保留，AI只整理，不补写不存在的证据。</p></div>
            <div className="record-fields">
              <div><small>空间</small><strong>1602卫生间</strong></div>
              <div><small>构件</small><strong>W-1602-B7</strong></div>
              <div><small>工序</small><strong>冷热水支管接头复核</strong></div>
              <div><small>保压结果</small><strong>无掉压</strong></div>
            </div>
            <div className="evidence-row"><span><FileImage size={15} />现场照片 <strong>2张</strong></span><span><ShieldCheck size={15} />字段完整 <strong>4/4</strong></span></div>
            <button className="stage-decision" onClick={next}>提交品质核验</button>
          </div>
        ) : (
          <div className="memory-seal">
            <span className="seal-mark"><CheckCircle2 size={30} /></span>
            <small>QUALITY VERIFIED / 2025.03.18</small>
            <h2>关键事实已写入<br />建筑生命记忆</h2>
            <p>{latest?.id} 已关联空间、构件、班组与验收阶段。</p>
            <div className="contribution-line"><span>本次品质贡献</span><strong>隐蔽工序可信留痕 +1</strong></div>
          </div>
        )}
      </section>
    </SceneStage>
  );
}
