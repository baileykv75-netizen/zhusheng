"use client";

import { Camera, CheckCircle2, FileImage, Mic, QrCode, SquarePen, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";

export default function WorkerPage() {
  const { state, next } = useDemo();
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("1602卫生间北侧墙冷热水接头已经做完，打压没有掉压，照片和房间码都拍了。");
  const latest = state.evidence.at(-1);
  const structured = state.currentStep >= 1;

  return (
    <div className="page worker-page">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">SITE RECORD / MOBILE FIRST</span>
          <h1>工友现场记录</h1>
        </div>
        <div className="room-context">
          <QrCode size={18} />
          <span><small>当前空间</small><strong>1602卫生间 · MIC-BATH-1602</strong></span>
        </div>
      </div>

      <section className="worker-layout">
        <div className="field-task">
          <header>
            <span>今日工序 03 / 06</span>
            <strong>冷热水支管接头复核</strong>
            <small>构件 W-1602-B7 · 验收前留痕</small>
          </header>
          <div className="requirement-list">
            <div><i className="done"><CheckCircle2 size={13} /></i><span>房间码与构件码已识别</span></div>
            <div><i className={structured ? "done" : ""}>{structured ? <CheckCircle2 size={13} /> : "2"}</i><span>口述施工状态与保压结果</span></div>
            <div><i className={state.currentStep >= 2 ? "done" : ""}>{state.currentStep >= 2 ? <CheckCircle2 size={13} /> : "3"}</i><span>品质智能体完成核验</span></div>
          </div>
          <button
            className={recording ? "voice-control recording" : "voice-control"}
            onClick={() => setRecording((value) => !value)}
          >
            <Mic size={28} />
            <strong>{recording ? "正在记录现场口述" : "按下口述记录"}</strong>
            <span>{recording ? "再次按下结束" : "保留原始口述，自动整理工序字段"}</span>
          </button>
          <div className="quick-evidence">
            <button><Camera size={18} />拍摄现场</button>
            <button><QrCode size={18} />重扫房间码</button>
          </div>
        </div>

        <div className="record-workbench">
          <div className="record-tabs">
            <span className="active">本次记录</span>
            <span>证据清单 {state.evidence.length}</span>
          </div>
          <section className="record-section original">
            <div className="record-label"><span>01</span><strong>原始口述</strong><em>保留原文</em></div>
            <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} aria-label="工友原始口述" />
          </section>
          <section className="record-section structured">
            <div className="record-label"><span>02</span><strong>AI结构化记录</strong><em>{state.runtimeMode === "ai" ? "AI在线" : "演示回退"}</em></div>
            <div className="structured-grid">
              <label><span>空间</span><input value="1602卫生间" readOnly /></label>
              <label><span>构件</span><input value="W-1602-B7" readOnly /></label>
              <label><span>工序</span><input value="冷热水支管接头复核" readOnly /></label>
              <label><span>保压结果</span><input value={structured ? "无掉压" : "待整理"} readOnly /></label>
              <label className="wide"><span>记录摘要</span><input value={structured ? "接头施工完成，打压无掉压，照片及房间码齐全。" : "完成口述后生成"} readOnly /></label>
            </div>
          </section>
          <section className="record-section verification">
            <div className="record-label"><span>03</span><strong>品质核验</strong><em>{state.currentStep >= 2 ? "已核验" : "待核验"}</em></div>
            <div className="evidence-checks">
              <div><FileImage size={17} /><span><strong>现场照片</strong><small>本地预览 · 不上传云端</small></span><em>2张</em></div>
              <div><SquarePen size={17} /><span><strong>字段完整性</strong><small>房间 / 构件 / 工序 / 结果</small></span><em>{structured ? "完整" : "待整理"}</em></div>
              <div><TriangleAlert size={17} /><span><strong>缺失项</strong><small>系统不补写不存在的证据</small></span><em>无</em></div>
            </div>
          </section>
          {state.currentStep < 2 ? (
            <button className="record-submit" onClick={next}>
              {state.currentStep === 0 ? "整理并形成施工记录" : "提交品质核验"}
            </button>
          ) : (
            <div className="record-confirmed">
              <CheckCircle2 size={18} />
              <span><strong>{latest?.id} 已写入建筑生命记忆</strong><small>关联1602卫生间 / MIC-BATH-1602 / W-1602-B7</small></span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
