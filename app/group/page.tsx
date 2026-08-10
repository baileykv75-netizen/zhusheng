"use client";

import { Database, FileSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { GroupLearningWorkbench } from "@/components/group-learning/GroupLearningWorkbench";
import { publicAssetPath } from "@/lib/site-path";

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
    {mode === "task" ? <section className="group-constellation-intro">
      <div className="group-constellation-visual"><img src={publicAssetPath("/assets/v6/group/learning-constellation.webp")} alt="一栋建筑的已验证事件向多个脱敏演示项目形成有边界经验连接" /><span>AI生成 · 脱敏合成演示</span></div>
      <div className="group-constellation-copy"><p>FROM ONE EVENT TO THE NEXT BUILDING</p><h1>一次被验证的经历，<br />如何抵达下一栋楼。</h1><span>1602只能先形成单事件待验证经验。下方人工评审最多把它放进下一批试点，不能自动写成企业标准。</span><dl><div><dt>相似演示事件</dt><dd>14</dd></div><div><dt>演示项目</dt><dd>5</dd></div><div><dt>演示建筑</dt><dd>9</dd></div></dl><small>以上聚合数字均为 DEMO_SYNTHETIC，仅用于表达产品尺度。</small></div>
    </section> : null}
    <GroupLearningWorkbench compact={mode === "task"} />
  </div>;
}
