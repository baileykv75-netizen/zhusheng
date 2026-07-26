"use client";

import { ArrowRight, Check, ChevronDown, Database, FileSearch, Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SceneStage } from "@/components/scene-stage";
import { useDemo } from "@/components/demo-provider";

export default function GroupPage() {
  const { state } = useDemo();
  const [submitted, setSubmitted] = useState(false);
  const feedback = state.feedback[0];
  const workOrder = state.workOrders[0];

  return (
    <SceneStage
      view="group"
      focus="portfolio"
      activeFlow={Boolean(feedback)}
      cues={[
        { id: "hzz", label: "BLD-HZZ-02", detail: state.incident?.status === "resolved" ? "运营 · 已恢复" : "运营 · 样板事件", x: 30, y: 69, tone: feedback ? "safe" : "risk" },
        { id: "mic", label: "MiC项目群", detail: "下一批卫生间模块", x: 66, y: 42, tone: "water" }
      ]}
    >
      <header className="stage-heading compact group-stage-heading">
        <span className="stage-kicker">集团建筑质量运行</span>
        <h1>一栋楼的经验，<br />成为下一批楼的标准。</h1>
        <p>运营结果与建造证据被重新连接，形成可审计、可复用的企业质量资产。</p>
      </header>

      <section className="portfolio-orbit" aria-label="项目群摘要">
        <div><small>在管建筑</small><strong>12</strong><span>5在建 / 7运营</span></div>
        <div><small>关键证据完整率</small><strong>94.2<em>%</em></strong><span>较上月 +1.8%</span></div>
        <div><small>本月标准建议</small><strong>{feedback ? "04" : "03"}</strong><span>{feedback ? "+1 新增" : "2项进入评审"}</span></div>
      </section>

      <aside className={`knowledge-feedback ${feedback ? "feedback-ready" : "compact"}`}>
        <header><span><Database size={15} />知识反馈</span><em>{feedback ? "FB-001" : "等待闭环"}</em></header>
        {feedback ? (
          <div className="recommendation-focus">
            <span className="new-recommendation">本次维修验证新增</span><small>建议适用于下一批MiC卫生间模块</small>
            <h2>{feedback.title}</h2>
            <div className="feedback-chain" aria-label="运营事件、建造证据、维修验证、企业标准四阶段均已完成">
              {["运营事件", "建造证据", "维修验证", "企业标准"].map((item, index) => <span key={item} className={index === 3 ? "active" : "done"}><i>{index < 3 ? <Check size={10} /> : "4"}</i>{item}{index < 3 ? <ArrowRight size={13} /> : null}</span>)}
            </div>
            <dl><div><dt>证据链</dt><dd>WO-260725-08 / W-1602-B7 / EV-2848</dd></div><div><dt>建议动作</dt><dd>修订工序卡与交付前抽检标准</dd></div></dl>
            {submitted ? <div className="review-complete"><ShieldCheck size={16} /><span><strong>已提交企业工艺标准评审</strong><small>评审记录 SR-2026-041</small></span></div> : <button className="stage-decision review-action" onClick={() => setSubmitted(true)}>提交企业工艺标准评审</button>}
          </div>
        ) : (
          <div className="recommendation-waiting compact-waiting">
            {workOrder ? <Network size={25} /> : <FileSearch size={25} />}
            <small>样板事件处理中 · INC-260725-01</small><h2>{workOrder ? "等待维修验证" : "等待样板事件闭环"}</h2><p>{workOrder ? "当前工单已派发。验证恢复后，将生成可进入评审的工艺标准建议。" : "完成异常诊断、人工授权和维修验证后，系统将形成跨项目改进建议。"}</p>
            <div className="waiting-chain"><span className="done"><Check size={11} />建造证据</span><ArrowRight size={13} /><span className={workOrder ? "done" : "current"}>{workOrder ? <Check size={11} /> : "2"}运营事件</span><ArrowRight size={13} /><span className={workOrder ? "current" : ""}>3 维修验证</span><ArrowRight size={13} /><span>4 企业标准</span></div>
          </div>
        )}
        <details className="portfolio-vault"><summary>项目群与审计详情 <span>12个项目</span><ChevronDown size={15} /></summary><div className="portfolio-table"><div className="table-head"><span>项目</span><span>阶段</span><span>记忆</span><span>状态</span></div>{[["华章新筑 · 2号楼", "运营", "95.0%", "稳定"], ["湾区智造社区", "施工", "92.8%", "关注"], ["海滨人才公寓", "运营", "96.1%", "稳定"]].map((row) => <div key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}</div></details>
      </aside>
    </SceneStage>
  );
}
