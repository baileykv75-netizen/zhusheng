"use client";

import { Camera, CheckCircle2, FileImage, Mic, QrCode, SquarePen, TriangleAlert } from "lucide-react";
import { useState } from "react";
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
    <div className={`page worker-page worker-stage-${stage}`}>
      <div className="page-heading worker-heading">
        <div>
          <span className="eyebrow">现场记录 · 今日工序 03 / 06</span>
          <h1>冷热水支管接头复核</h1>
          <p>为关键隐蔽工序留下可追溯的建造记忆</p>
        </div>
        <div className="room-context">
          <QrCode size={18} />
          <span><small>当前空间</small><strong>1602卫生间</strong><em>MIC-BATH-1602 · W-1602-B7</em></span>
        </div>
      </div>

      <ol className="worker-progress" aria-label="施工记录进度">
        {["现场口述", "AI整理", "品质核验"].map((label, index) => (
          <li key={label} className={stage > index + 1 ? "done" : stage === index + 1 ? "active" : ""}>
            <i>{stage > index + 1 ? <CheckCircle2 size={16} /> : String(index + 1).padStart(2, "0")}</i>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <section className="worker-layout">
        {!structured ? (
          <div className="capture-stage">
            <button className={recording ? "voice-control recording" : "voice-control"} onClick={() => setRecording((value) => !value)}>
              <span className="voice-icon"><Mic size={30} /></span>
              <strong>{recording ? "正在记录现场口述" : "按下口述施工情况"}</strong>
              <span>{recording ? "再次按下结束记录" : "说明施工状态、保压结果与照片情况"}</span>
            </button>
            <div className="quick-evidence">
              <button><Camera size={18} /><span>拍摄现场</span></button>
              <button><QrCode size={18} /><span>重扫房间码</span></button>
            </div>
            <details className="evidence-disclosure">
              <summary>查看当前口述原文</summary>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} aria-label="工友原始口述" />
            </details>
            <button className="record-submit" onClick={next}>整理并形成施工记录</button>
          </div>
        ) : (
          <div className="record-workbench">
            <header className="workbench-heading">
              <div><span>{verified ? "品质核验" : "AI整理完成"}</span><h2>{verified ? "证据完整，可以写入建筑记忆" : "请确认整理后的施工记录"}</h2></div>
              <em>{state.runtimeMode === "ai" ? "AI在线" : "演示回退"}</em>
            </header>
            <div className="structured-grid">
              <label><span>空间</span><input value="1602卫生间" readOnly /></label>
              <label><span>构件</span><input value="W-1602-B7" readOnly /></label>
              <label><span>工序</span><input value="冷热水支管接头复核" readOnly /></label>
              <label><span>保压结果</span><input value={structured ? "无掉压" : "待整理"} readOnly /></label>
              <label className="wide"><span>记录摘要</span><input value={structured ? "接头施工完成，打压无掉压，照片及房间码齐全。" : "完成口述后生成"} readOnly /></label>
            </div>
            <details className="evidence-disclosure original-record">
              <summary>原始口述与AI整理依据</summary>
              <p>{transcript}</p>
            </details>
            <div className="evidence-checks">
              <div><FileImage size={17} /><span><strong>现场照片</strong><small>本地预览 · 不上传云端</small></span><em>2张</em></div>
              <div><SquarePen size={17} /><span><strong>字段完整性</strong><small>房间 / 构件 / 工序 / 结果</small></span><em>{structured ? "完整" : "待整理"}</em></div>
              <div><TriangleAlert size={17} /><span><strong>缺失项</strong><small>系统不补写不存在的证据</small></span><em>无</em></div>
            </div>
          {!verified ? (
            <button className="record-submit" onClick={next}>提交品质核验</button>
          ) : (
            <div className="record-confirmed">
              <CheckCircle2 size={18} />
              <span><strong>{latest?.id} 已写入建筑生命记忆</strong><small>关联1602卫生间 / MIC-BATH-1602 / W-1602-B7</small></span>
            </div>
          )}
          </div>
        )}

        <aside className="worker-context">
          <span className="context-kicker">本次留痕</span>
          <h2>验收前把关键事实说清楚</h2>
          <p>房间码已经识别。请确认施工结果，系统只整理你提供的内容，不补写不存在的证据。</p>
          <dl>
            <div><dt>构件</dt><dd>W-1602-B7</dd></div>
            <div><dt>已有证据</dt><dd>{state.evidence.length}条</dd></div>
            <div><dt>隐私状态</dt><dd>仅本地预览</dd></div>
          </dl>
        </aside>
      </section>
    </div>
  );
}
