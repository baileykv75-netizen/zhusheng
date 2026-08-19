"use client";

import { Database, FileSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { GroupLearningWorkbench } from "@/components/group-learning/GroupLearningWorkbench";
import { publicAssetPath } from "@/lib/site-path";
import styles from "./GroupPage.module.css";

export default function GroupPage() {
  const [mode, setMode] = useState<"task" | "advanced">("task");

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
      <span className={styles.eyebrow}>EXPERIENCE GOVERNANCE · FROM ONE VERIFIED EVENT</span>
      <h1>一件被验证的经历<br />先成为可以继续验证的经验</h1>
      <p>单个案例不会被直接包装成集团规律。这里依次回答：经验从哪个事件来、形成了什么候选、证据覆盖到哪里，以及最终由谁决定是否进入试点。</p>
      <div className={styles.flow} aria-label="经验治理链">
        <div><span>01 / SOURCE EVENT</span><strong>EVT-1602</strong><small>来源事件必须先通过完整闭环与成果包验证。</small></div>
        <div><span>02 / EXPERIENCE</span><strong>单事件经验候选</strong><small>从维修目标、验证结果与工友证据中提取可复用检查假设。</small></div>
        <div><span>03 / COVERAGE</span><strong>证据覆盖与缺口</strong><small>明确已经知道什么、尚未证明什么，不用单案例冒充企业规律。</small></div>
        <div><span>04 / HUMAN DECISION</span><strong>PILOT_ONLY 或退回</strong><small>集团人员决定采纳为试点、退回补证或暂不采纳。</small></div>
      </div>
      <div className={styles.boundary}><span>当前只有一个完整来源事件；跨项目规律仍需后续样本继续验证。</span><strong>单事件 ≠ 企业标准</strong></div>
    </section> : null}

    <GroupLearningWorkbench compact={mode === "task"} />
  </div>;
}
