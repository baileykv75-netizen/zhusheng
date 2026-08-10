"use client";

import { useEffect, useState } from "react";
import { PropertyWorkbench } from "@/components/life-event/ResidentTaskWorkbench";
import { ResidentFreeLab } from "@/components/life-event/ResidentFreeLab";
import { publicAssetPath } from "@/lib/site-path";

export default function PropertyPage() {
  const [mode, setMode] = useState<"task" | "lab">("task");

  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("mode") === "lab" ? "lab" : "task");
  }, []);

  function selectMode(nextMode: "task" | "lab") {
    setMode(nextMode);
    window.history.replaceState(null, "", publicAssetPath(`/property?mode=${nextMode}`));
  }

  return mode === "task"
    ? <PropertyWorkbench onOpenAdvanced={() => selectMode("lab")} />
    : <div className="advanced-workspace-shell"><div className="advanced-mode-bar"><button onClick={() => selectMode("task")}>返回物业任务</button><span><strong>高级验证</strong><small>规则贡献、参数重放和审计只在这里出现，不占用物业主任务。</small></span></div><ResidentFreeLab /></div>;
}
