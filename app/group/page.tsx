"use client";

import { ArrowRight, Check, ChevronDown, Database, FileSearch, Network, ShieldCheck } from "lucide-react";
import { SceneStage } from "@/components/scene-stage";
import { useDemo } from "@/components/demo-provider";

export default function GroupPage() {
  const { state, next } = useDemo();
  const feedback = state.feedback[0];
  const workOrder = state.workOrders[0];
  const canResolve = state.currentStep === 6;

  return (
    <SceneStage
      view="group"
      focus="portfolio"
      activeFlow={Boolean(feedback)}
      cues={[
        { id: "hzz", label: "BLD-HZZ-02", detail: state.incident?.status === "resolved" ? "运营 / 已恢复" : "运营 / 样板事件", x: 30, y: 69, tone: feedback ? "safe" : "risk" },
        { id: "mic", label: "MIC CLUSTER / 05", detail: "下一批模块", x: 66, y: 42, tone: "water" }
      ]}
    >
      <header className="stage-heading compact group-stage-heading">
        <span className="stage-kicker">ENTERPRISE BUILDING INTELLIGENCE</span>
        <h1>一栋楼的经验，<br />成为下一批楼的标准。</h1>
        <p>运营结果与建造证据被重新连接，形成可审计的企业质量资产。</p>
      </header>

      <section className="portfolio-orbit" aria-label="项目群摘要">
        <div><small>在管建筑</small><strong>12</strong><span>5在建 / 7运营</span></div>
        <div><small>记忆完整度</small><strong>94.2<em>%</em></strong><span>关键证据</span></div>
        <div><small>标准建议</small><strong>{feedback ? "04" : "03"}</strong><span>本月新增</span></div>
      </section>

      <aside className="knowledge-feedback">
        <header><span><Database size={15} />KNOWLEDGE FEEDBACK</span><em>{feedback ? "FB-001" : "WAITING"}</em></header>
        {feedback ? (
          <div className="recommendation-focus">
            <small>建议纳入下一批 MiC 卫生间模块</small>
            <h2>{feedback.title}</h2>
            <div className="feedback-chain">
              {["运营事件", "建造证据", "维修验证", "企业标准"].map((item, index) => (
                <span key={item} className={index === 3 ? "active" : ""}><i>{index < 3 ? <Check size={10} /> : "04"}</i>{item}{index < 3 ? <ArrowRight size={13} /> : null}</span>
              ))}
            </div>
            <dl><div><dt>证据链</dt><dd>WO-260725-08 / W-1602-B7 / EV-2848</dd></div><div><dt>建议动作</dt><dd>修订工序卡与交付前抽检标准</dd></div></dl>
            <button className="review-status"><ShieldCheck size={16} />{feedback.status}<ArrowRight size={15} /></button>
          </div>
        ) : workOrder ? (
          <div className="recommendation-waiting">
            <Network size={25} /><h2>维修验证完成后<br />生成跨项目建议</h2><p>当前已连接建造记录、空间构件与精准工单。</p>
            {canResolve ? <button className="stage-decision" onClick={next}>模拟维修完成并验证恢复</button> : null}
          </div>
        ) : (
          <div className="recommendation-waiting"><FileSearch size={25} /><h2>等待样板事件闭环</h2><p>完成关阀与维修工单后，知识反馈链将在这里形成。</p></div>
        )}
        <details className="portfolio-vault">
          <summary>项目群与审计详情 <span>12 PROJECTS</span><ChevronDown size={15} /></summary>
          <div className="portfolio-table">
            <div className="table-head"><span>项目</span><span>阶段</span><span>记忆</span><span>状态</span></div>
            {[
              ["华章新筑 · 2号楼", "运营", "95.0%", "稳定"],
              ["湾区智造社区", "施工", "92.8%", "关注"],
              ["海滨人才公寓", "运营", "96.1%", "稳定"]
            ].map((row) => <div key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}
          </div>
        </details>
      </aside>
    </SceneStage>
  );
}
