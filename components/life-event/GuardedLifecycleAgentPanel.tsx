"use client";

import Link from "next/link";
import { ArrowRight, Bot, Box, CircleDot, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { BuildingIntelligenceWorkspace } from "@/components/BuildingIntelligenceWorkspace";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import type { BuildingAgentTurnResult, QueryVisualDirective, QueryVisualMode } from "@/lib/building-intelligence/types.ts";
import { deriveGuardedLifecycleProjection, deriveGuardedProposalGate } from "@/lib/life-event-engine/guarded-lifecycle.ts";
import { hasFreshEvidenceAfterReopen } from "@/lib/life-event-lab/reopened-cycle.ts";
import type { VisualDirective } from "@/lib/life-event-engine/types.ts";
import styles from "./GuardedLifecycleAgentPanel.module.css";

const phaseLabels = {
  EVIDENCE: "EVIDENCE",
  DIAGNOSIS: "DIAGNOSIS",
  AUTHORIZATION: "HUMAN GATE",
  ISOLATION: "ISOLATION",
  REPAIR: "REPAIR",
  VERIFICATION: "VERIFY",
  COMPLETE: "CLOSED LOOP"
} as const;

function lifecycleViewForQuery(mode: QueryVisualMode): VisualDirective["view"] {
  if (mode === "CONSTRUCTION_MEMORY") return "VIEW_CONSTRUCTION_MEMORY";
  return "VIEW_DIAGNOSTIC";
}

function focusTask(focus: string) {
  const target = document.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  requestAnimationFrame(() => target.focus({ preventScroll: true }));
}

type Props = {
  onQueryVisualChange?(visual: QueryVisualDirective | null): void;
};

export function GuardedLifecycleAgentPanel({ onQueryVisualChange }: Props) {
  const { session, setSession } = useLifecycleJourney();
  const [agentResult, setAgentResult] = useState<BuildingAgentTurnResult | null>(null);
  const hasResidentEvidence = hasFreshEvidenceAfterReopen(
    session.result,
    (session.residentSubmissions ?? []).map((item) => item.submittedAt)
  );
  const projection = useMemo(
    () => deriveGuardedLifecycleProjection(session.result, { hasResidentEvidence }),
    [hasResidentEvidence, session.result]
  );

  function handleAgentResult(next: BuildingAgentTurnResult | null) {
    setAgentResult(next);
    onQueryVisualChange?.(next?.visualDirective ?? null);
    if (!next) return;
    const visual = next.visualDirective;
    const visualTarget = visual?.targetBusinessIds[0]
      ?? visual?.revealBusinessIds[0]
      ?? next.selectedBusinessId
      ?? null;
    setSession((current) => ({
      ...current,
      selectedBusinessId: visualTarget ?? current.selectedBusinessId,
      selectedView: visual ? lifecycleViewForQuery(visual.mode) : current.selectedView
    }));
  }

  const proposedAction = agentResult?.proposedAction;
  const proposalGate = useMemo(
    () => deriveGuardedProposalGate(proposedAction?.type ?? null, session.result),
    [proposedAction?.type, session.result]
  );
  const physical = projection.physicalTruth;
  const destination = projection.nextAction.destination;

  return <section className={styles.shell} aria-label="筑生受控生命周期智能体">
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}><Bot size={14} /> STEP 4 · AGENT APPLICATION</span>
        <h1>问建筑，也能沿着受控闭环继续处理</h1>
        <p>查询层可以理解建筑并提出建议；事件状态、授权、阀门、维修与复验仍由同一确定性引擎掌控。</p>
      </div>
      <div className={styles.truthBadge}><CircleDot size={13} /><span>Single lifecycle truth</span><strong>{projection.state}</strong></div>
    </header>

    <div className={styles.grid}>
      <div className={styles.queryPane}>
        <BuildingIntelligenceWorkspace
          selectedBusinessId={session.selectedBusinessId}
          result={agentResult}
          onResult={handleAgentResult}
        />
      </div>

      <aside className={styles.guardPane}>
        <div className={styles.phaseRow}>
          <span>{phaseLabels[projection.phase]}</span>
          <strong>{projection.stateLabel}</strong>
        </div>

        <div className={styles.summary}>
          <span>确定性事件引擎</span>
          <h2>{projection.headline}</h2>
          <p>{projection.summary}</p>
        </div>

        <dl className={styles.truthGrid}>
          <div><dt>阀门物理状态</dt><dd>{physical.valvePosition}</dd></div>
          <div><dt>空间状态</dt><dd>{physical.moistureState}</dd></div>
          <div><dt>审计记录</dt><dd>{physical.auditCount}</dd></div>
          <div><dt>3D选中构件</dt><dd>{session.selectedBusinessId ?? "NONE"}</dd></div>
        </dl>

        <div className={styles.agentBoundary} data-has-proposal={Boolean(proposedAction)} data-gate-status={proposalGate.status}>
          <div><ShieldCheck size={16} /><strong>AI 建议 → 确定性门禁</strong></div>
          {!proposedAction ? <p>{projection.safetyBoundary}</p> : null}
          {proposedAction && proposalGate.status === "PROPOSAL_ONLY" ? <p>AI 当前只提出 <code>{proposedAction.type}</code>。该建议不会写入事件状态，也不会创建授权或执行设备动作。</p> : null}
          {proposedAction && proposalGate.status === "AWAITING_DOMAIN_VALIDATION" ? <p>AI 当前提出 <code>{proposedAction.type}</code>，但确定性事件引擎尚未独立验证该动作。当前不能进入授权或执行；先完成“{projection.nextAction.label}”。</p> : null}
          {proposedAction && proposalGate.status === "VERIFIED" ? <p>AI 提议 <code>{proposedAction.type}</code> 已被确定性事件结果独立匹配为 <code>{proposalGate.expectedAction}</code>{proposalGate.matchedTargetBusinessId ? <>，目标 <code>{proposalGate.matchedTargetBusinessId}</code></> : null}。{proposalGate.humanGateReady ? "下一步仍必须由人工授权。" : "它不会因此重复授权或自动执行。"}</p> : null}
          {proposedAction && proposalGate.status === "REJECTED" ? <p>AI 提议 <code>{proposedAction.type}</code> 与当前确定性事件结果不一致，已在动作门禁处阻断，不进入授权，也不改变阀门。</p> : null}
        </div>

        <div className={styles.nextAction}>
          <span><Route size={14} />唯一下一步 · {projection.nextAction.actor}</span>
          <strong>{projection.nextAction.label}</strong>
          {destination.kind === "ROUTE"
            ? <Link className={styles.primaryAction} href={destination.href}>
                {projection.phase === "AUTHORIZATION" ? <LockKeyhole size={16} /> : <ArrowRight size={16} />}
                {projection.nextAction.label}
              </Link>
            : <button className={styles.primaryAction} type="button" onClick={() => focusTask(destination.focus)}>
                <Box size={16} />定位当前任务<ArrowRight size={15} />
              </button>}
        </div>

        <small className={styles.syncNote}>建筑查询命中后会把 FOCUS / SYSTEM_TRACE / XRAY / CONSTRUCTION_MEMORY 等完整视觉指令同步到下方 3D；生命周期 state、阀门状态和维修结果不会被查询结果覆盖。</small>
      </aside>
    </div>
  </section>;
}