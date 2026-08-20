"use client";

import { useEffect, useRef, useState } from "react";
import { PropertyEventWorkspace } from "@/components/property/PropertyEventWorkspace";
import { ResidentFreeLab } from "@/components/life-event/ResidentFreeLab";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { LAB_SCHEMA_VERSION, LAB_SESSION_KEY, type LabSession } from "@/lib/life-event-lab/types.ts";
import { publicAssetPath } from "@/lib/site-path";

const LAB_SNAPSHOT_KEY = "zhusheng.property.advanced.snapshot.v1";

function readLabSnapshot(): LabSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(LAB_SNAPSHOT_KEY) ?? "null") as LabSession | null;
    if (!value) return null;
    if (value.schemaVersion !== LAB_SCHEMA_VERSION) {
      sessionStorage.removeItem(LAB_SNAPSHOT_KEY);
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(LAB_SNAPSHOT_KEY);
    return null;
  }
}

function persistTaskTruth(snapshot: LabSession) {
  sessionStorage.setItem(LAB_SESSION_KEY, JSON.stringify(snapshot));
}

export default function PropertyPage() {
  const { session, setSession, hydrated } = useLifecycleJourney();
  const [mode, setMode] = useState<"task" | "lab">("task");
  const labSnapshotRef = useRef<LabSession | null>(null);
  const modeRef = useRef<"task" | "lab">("task");

  function rememberTaskTruth() {
    if (labSnapshotRef.current) return;
    const existing = readLabSnapshot();
    if (existing) {
      labSnapshotRef.current = existing;
      return;
    }
    const snapshot = structuredClone(session);
    labSnapshotRef.current = snapshot;
    sessionStorage.setItem(LAB_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }

  function restoreTaskTruth() {
    const snapshot = labSnapshotRef.current ?? readLabSnapshot();
    if (snapshot) {
      const restored = structuredClone(snapshot);
      persistTaskTruth(restored);
      setSession(restored);
    }
    labSnapshotRef.current = null;
    sessionStorage.removeItem(LAB_SNAPSHOT_KEY);
  }

  useEffect(() => {
    if (!hydrated) return;
    const requestedMode = new URLSearchParams(window.location.search).get("mode") === "lab" ? "lab" : "task";
    if (requestedMode === "lab") {
      // A surviving snapshot means the previous lab session ended abruptly.
      // Keep that original task truth as the rollback target while the user is
      // still explicitly inside the sandbox.
      rememberTaskTruth();
    } else if (readLabSnapshot()) {
      // If the browser crashed or was killed inside Advanced Lab, React cleanup
      // may never have run. Returning to the normal task route must therefore
      // recover the pre-lab task truth before rendering the work surface.
      restoreTaskTruth();
    }
    setMode(requestedMode);
    modeRef.current = requestedMode;
    // This intentionally runs once after lifecycle hydration. The task snapshot
    // must represent the hydrated product truth, not the provider's initial draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => () => {
    if (modeRef.current !== "lab") return;
    const snapshot = labSnapshotRef.current ?? readLabSnapshot();
    if (snapshot) {
      const restored = structuredClone(snapshot);
      // Persist synchronously as well as restoring React state so refresh/hard
      // navigation cannot leave sandbox mutations as the next product session.
      persistTaskTruth(restored);
      setSession(restored);
    }
    sessionStorage.removeItem(LAB_SNAPSHOT_KEY);
  }, [setSession]);

  function selectMode(nextMode: "task" | "lab") {
    if (nextMode === modeRef.current) return;
    if (nextMode === "lab") {
      rememberTaskTruth();
    } else {
      restoreTaskTruth();
    }
    modeRef.current = nextMode;
    setMode(nextMode);
    window.history.replaceState(null, "", publicAssetPath(`/property?mode=${nextMode}`));
  }

  return mode === "task"
    ? <PropertyEventWorkspace onOpenAdvanced={() => selectMode("lab")} />
    : <div className="advanced-workspace-shell"><div className="advanced-mode-bar"><button onClick={() => selectMode("task")}>退出沙盒并恢复物业任务</button><span><strong>高级验证沙盒</strong><small>规则贡献、参数重放和审计只在隔离沙盒中运行；退出、刷新、异常中断后重新进入正式任务，都会恢复进入前的物业会话，不写回任务真相。</small></span></div><ResidentFreeLab /></div>;
}
