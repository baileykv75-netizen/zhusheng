"use client";

import { Database, FileSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { GroupLearningWorkbench } from "@/components/group-learning/GroupLearningWorkbench";

export default function GroupPage() {
  const [mode, setMode] = useState<"task" | "advanced">("task");

  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("mode") === "advanced" ? "advanced" : "task");
  }, []);

  function selectMode(nextMode: "task" | "advanced") {
    setMode(nextMode);
    window.history.replaceState(null, "", `/group?mode=${nextMode}`);
  }

  return <div className="group-workspace-shell">
    <nav className="workspace-inline-mode" aria-label="集团治理模式">
      <button className={mode === "task" ? "active" : ""} onClick={() => selectMode("task")}><Database size={14} />经验决策</button>
      <button className={mode === "advanced" ? "active" : ""} onClick={() => selectMode("advanced")}><FileSearch size={14} />高级治理</button>
    </nav>
    <GroupLearningWorkbench compact={mode === "task"} />
  </div>;
}

