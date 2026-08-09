"use client";

import { useEffect, useState } from "react";
import { ResidentFreeLab } from "@/components/life-event/ResidentFreeLab";
import { ResidentTaskWorkbench } from "@/components/life-event/ResidentTaskWorkbench";

export default function ResidentPage() {
  const [mode, setMode] = useState<"task" | "lab">("task");

  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("mode") === "lab" ? "lab" : "task");
  }, []);

  function selectMode(nextMode: "task" | "lab") {
    setMode(nextMode);
    const focus = new URLSearchParams(window.location.search).get("focus");
    const query = new URLSearchParams({ mode: nextMode });
    if (focus && nextMode === "task") query.set("focus", focus);
    window.history.replaceState(null, "", `/resident?${query.toString()}`);
  }

  return mode === "task"
    ? <ResidentTaskWorkbench onOpenAdvanced={() => selectMode("lab")} />
    : <div className="advanced-workspace-shell"><div className="advanced-mode-bar"><button onClick={() => selectMode("task")}>返回任务处置</button><span><strong>高级验证</strong><small>用于核验参数、重放与审计，不是1602主线的下一步。</small></span></div><ResidentFreeLab /></div>;
}
