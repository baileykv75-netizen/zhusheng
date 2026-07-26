"use client";

import { ArrowUpRight, ClipboardCheck, Database, Factory, FileSearch, ShieldCheck } from "lucide-react";
import { useDemo } from "@/components/demo-provider";

export default function GroupPage() {
  const { state, next } = useDemo();
  const feedback = state.feedback[0];
  const workOrder = state.workOrders[0];
  const canResolve = state.currentStep === 6;

  return (
    <div className="page group-page">
      <div className="group-heading">
        <div>
          <span className="eyebrow">集团质量运行 · 12个项目</span>
          <h1>让一栋楼的经验，成为下一批楼的标准</h1>
          <p>5个在建项目与7个运营项目正在共享可追溯的质量经验。</p>
        </div>
        <div className="group-mark">CSCI<span>示范样板</span></div>
      </div>

      <section className="portfolio-summary">
        <div><span>在管建筑</span><strong>12</strong><small>5在建 / 7运营</small></div>
        <div><span>建筑生命记忆</span><strong>94.2%</strong><small>关键证据完整率</small></div>
        <div><span>本月标准建议</span><strong>{feedback ? "04" : "03"}</strong><small>2项进入评审</small></div>
      </section>

      <section className="group-primary">
        <div className="enterprise-panel project-register">
          <header><span>项目群质量摘要</span><em>PORTFOLIO / 12</em></header>
          <table>
            <thead><tr><th>项目</th><th>阶段</th><th>记忆完整度</th><th>开放事件</th><th>趋势</th></tr></thead>
            <tbody>
              <tr className="selected"><td><strong>华章新筑 · 2号楼</strong><small>BLD-HZZ-02</small></td><td>运营</td><td>95.0%</td><td>{state.incident?.status === "resolved" ? "0" : state.incident ? "1" : "0"}</td><td><span className="trend good">稳定</span></td></tr>
              <tr><td><strong>湾区智造社区</strong><small>BLD-WQ-04</small></td><td>施工</td><td>92.8%</td><td>2</td><td><span className="trend watch">关注</span></td></tr>
              <tr><td><strong>海滨人才公寓</strong><small>BLD-HB-01</small></td><td>运营</td><td>96.1%</td><td>1</td><td><span className="trend good">稳定</span></td></tr>
              <tr><td><strong>新城保障房三期</strong><small>BLD-XC-07</small></td><td>交付</td><td>91.4%</td><td>3</td><td><span className="trend watch">关注</span></td></tr>
            </tbody>
          </table>
        </div>

        <div className="enterprise-panel feedback-panel">
          <header><span>标准化改进建议</span><em>KNOWLEDGE FEEDBACK</em></header>
          {feedback ? (
            <div className="feedback-detail">
              <div className="feedback-code"><Database size={18} />FB-001</div>
              <h2>{feedback.title}</h2>
              <dl>
                <div><dt>适用范围</dt><dd>{feedback.target}</dd></div>
                <div><dt>证据链</dt><dd>建造记录 → 运营异常 → 维修验证</dd></div>
                <div><dt>建议动作</dt><dd>修订工序卡与交付前抽检标准</dd></div>
              </dl>
              <div className="feedback-status"><ShieldCheck size={16} />{feedback.status}<ArrowUpRight size={15} /></div>
            </div>
          ) : (
            <div className="panel-empty"><Database size={22} /><span>维修验证后形成下一项目改进建议</span></div>
          )}
        </div>
      </section>

      <section className="group-disclosures">
        <details className="enterprise-disclosure">
          <summary><span>跨项目共性问题</span><em>过去90天 · 待处理 {state.incident && state.incident.status !== "resolved" ? "07" : "06"}</em></summary>
          <div className="issue-panel">
            <div className="issue-bars">
              {[
                ["管线接口", 68, "18"],
                ["防水收口", 47, "12"],
                ["门窗密封", 32, "08"],
                ["设备调试", 24, "06"]
              ].map(([name, width, count]) => (
                <div key={name}><span>{name}</span><i><b style={{ width: `${width}%` }} /></i><em>{count}</em></div>
              ))}
            </div>
            <div className="quality-note"><Factory size={17} /><span><strong>PPR支管接口</strong><small>在3个MiC项目出现相似定位成本，建议统一影像采集要求。</small></span></div>
          </div>
        </details>

        <details className="enterprise-disclosure" open={Boolean(workOrder && canResolve)}>
          <summary><span>样板事件审计链</span><em>INC-260725-01</em></summary>
          <div className="workorder-panel">
            {workOrder ? (
              <>
                <div className="workorder-summary">
                  <ClipboardCheck size={19} />
                  <span><strong>{workOrder.id} · 1602卫生间隐蔽管线检修</strong><small>{workOrder.location}</small></span>
                  <em>{workOrder.status === "completed" ? "已完成" : "已派发"}</em>
                </div>
                <table className="audit-table">
                  <tbody>
                    <tr><th>构件</th><td>{workOrder.component}</td></tr>
                    <tr><th>维修指令</th><td>{workOrder.instruction}</td></tr>
                    <tr><th>依据</th><td>{workOrder.refs.join(" / ")}</td></tr>
                    <tr><th>授权</th><td>{state.valve.authorizedBy || "未授权"}</td></tr>
                  </tbody>
                </table>
                {canResolve ? <button className="record-submit group-resolve" onClick={next}>模拟维修完成并验证恢复</button> : null}
              </>
            ) : (
              <div className="panel-empty"><FileSearch size={22} /><span>样板事件完成关阀后生成审计链</span></div>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
