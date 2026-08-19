"use client";

import Link from "next/link";
import { Database, FileSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { GroupLearningWorkbench } from "@/components/group-learning/GroupLearningWorkbench";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { publicAssetPath } from "@/lib/site-path";
import styles from "./GroupPage.module.css";

export default function GroupPage() {
  const { currentPackage, session } = useLifecycleJourney();
  const [mode, setMode] = useState<"task" | "advanced">("task");
  const currentResolved = currentPackage?.finalState === "RESOLVED";
  const currentEventId = session.result?.eventId ?? "EVT-1602";
  const currentState = session.result?.state ?? "NOT_STARTED";

  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("mode") === "advanced" ? "advanced" : "task");
  }, []);

  function selectMode(nextMode: "task" | "advanced") {
    setMode(nextMode);
    window.history.replaceState(null, "", publicAssetPath(`/group?mode=${nextMode}`));
  }

  return <div className="group-workspace-shell">
    <nav className="workspace-inline-mode" aria-label="集团治理模式">
      <button className={mode === "task" ? "active" : ""} onClick={() => selectMode("task")}><Database size={14} />经验决策</button>
      <button className={mode === "advanced" ? "active" : ""} onClick={() => selectMode("advanced")}><FileSearch size={14} />高级治理</button>
    </nav>

    {mode === "task" ? <section className={styles.intro}>
      <span className={styles.eyebrow}>{currentResolved ? "EXPERIENCE GOVERNANCE · FROM ONE VERIFIED EVENT" : "EXPERIENCE GOVERNANCE · WAITING FOR VERIFIED EVENT"}</span>
      <h1>{currentResolved ? "一件被验证的经历先成为可以继续验证的经验" : "当前事件还没有资格进入经验治理"}</h1>
      <p>{currentResolved
        ? "单个案例不会被直接包装成集团规律。这里依次回答：经验从哪个事件来、形成了什么候选、证据覆盖到哪里，以及最终由谁决定是否进入试点。"
        : `当前 ${currentEventId} 仍处于 ${currentState}。维修记录、授权或单次隔离都不能提前生成集团经验；必须先完成维修后的独立复验并形成 RESOLVED 成果包。`}</p>
      <div className={styles.flow} aria-label="经验治理链">
        <div><span>01 / SOURCE EVENT</span><strong>{currentEventId}</strong><small>{currentResolved ? "来源事件已通过完整闭环与成果包验证。" : `当前状态 ${currentState} · 尚未满足来源条件。`}</small></div>
        <div><span>02 / EXPERIENCE</span><strong>{currentResolved ? "单事件经验候选" : "等待事件闭环"}</strong><small>{currentResolved ? "从维修目标、验证结果与工友证据中提取可复用检查假设。" : "没有最终复验结果时，不生成经验候选。"}</small></div>
        <div><span>03 / COVERAGE</span><strong>{currentResolved ? "证据覆盖与缺口" : "尚未开始"}</strong><small>{currentResolved ? "明确已经知道什么、尚未证明什么，不用单案例冒充企业规律。" : "证据覆盖只在来源事件验证完成后计算。"}</small></div>
        <div><span>04 / HUMAN DECISION</span><strong>{currentResolved ? "PILOT_ONLY 或退回" : "治理门禁关闭"}</strong><small>{currentResolved ? "集团人员决定采纳为试点、退回补证或暂不采纳。" : "当前没有可供集团人员评审的经验对象。"}</small></div>
      </div>
      <div className={styles.boundary}>{currentResolved
        ? <><span>当前只有一个完整来源事件；跨项目规律仍需后续样本继续验证。</span><strong>单事件 ≠ 企业标准</strong></>
        : <><span>先回到物业工作台完成当前事件；这里不会用预制结果替代真实闭环。</span><strong><Link href="/property?mode=task">继续当前事件</Link></strong></>}</div>
    </section> : null}

    {mode === "advanced" && !currentResolved ? <section className={styles.boundary}><span>高级治理模式将展示独立脱敏示例包，用于验证治理工具本身；它不是当前 {currentEventId} 的结果。</span><strong>示例 ≠ 当前事件</strong></section> : null}

    {mode === "task" && !currentResolved ? null : <GroupLearningWorkbench compact={mode === "task"} />}
  </div>;
}
