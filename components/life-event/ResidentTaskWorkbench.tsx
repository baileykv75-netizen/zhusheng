"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ClipboardCheck, FileSearch, Gauge, LockKeyhole, Play, ShieldCheck, Wrench } from "lucide-react";
import { deriveJourneyView } from "@/lib/journey/index.ts";
import type { LabAuthorizationDraft, LabSession } from "@/lib/life-event-lab/types.ts";
import { repairTaskForResult } from "@/lib/life-event-lab/model.ts";
import type { VisualDirective } from "@/lib/life-event-engine/types.ts";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { BathroomTwinViewport } from "./BathroomTwinViewport";

const defaultDirective: VisualDirective = {
  view: "VIEW_RESIDENT",
  highlightBusinessIds: [],
  moistureState: "DRY",
  valvePosition: "OPEN",
  evidenceAnchorIds: [],
  allowedActions: [],
  authorizationRequired: false
};

const hypothesisLabels: Record<string, string> = {
  COLD_WATER_JOINT_LEAK: "冷水系统接头渗漏",
  WATERPROOFING_FAILURE: "防水层失效",
  CONDENSATION_OR_AMBIENT_HUMIDITY: "冷凝或环境潮湿",
  UNRESOLVED: "尚未收敛"
};

function TaskNumber({ label, value, unit, min, max, step = 1, onChange }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange(value: number): void }) {
  return <label className="task-number"><span>{label}</span><div><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{unit}</em></div></label>;
}

export function ResidentTaskWorkbench({ onOpenAdvanced }: { onOpenAdvanced(): void }) {
  const {
    session, setSession, assets, assetError, engine, busy, evaluate, decideAuthorization,
    executeValveAction, submitIsolation, submitRepair, submitPostRepair
  } = useLifecycleJourney();
  const result = session.result;
  const directive = result?.visualDirective ?? defaultDirective;
  const journey = result
    ? deriveJourneyView({ source: "LIFE_EVENT", state: result.state })
    : deriveJourneyView({ source: "LIFE_EVENT", state: "COLLECTING_EVIDENCE" });
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [authorization, setAuthorization] = useState<LabAuthorizationDraft>({
    actorType: "RESIDENT",
    actorId: "DEMO-RESIDENT-1602",
    decision: "APPROVED",
    reason: "同意本次脱敏模拟设备动作"
  });
  const repairTask = useMemo(() => {
    if (!engine || !result || !["REPAIR_PENDING", "REPAIR_RECORDED", "AUTHORIZATION_PENDING", "AUTHORIZED", "POST_REPAIR_VERIFYING", "RESOLVED", "REOPENED"].includes(result.state)) return null;
    try { return repairTaskForResult(engine, result); } catch { return null; }
  }, [engine, result]);

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (!focus) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-focus="${focus}"]`)?.focus({ preventScroll: false }));
  }, [result?.state]);

  function openAuthorization() {
    const reopening = result?.authorizationRequirement?.action === "SIMULATE_REOPEN_VALVE";
    setAuthorization({
      actorType: reopening ? "PROPERTY" : "RESIDENT",
      actorId: reopening ? "PROPERTY-DEMO-01" : "DEMO-RESIDENT-1602",
      decision: "APPROVED",
      reason: reopening ? "维修记录已核验，同意模拟恢复供水并开展复验" : "同意模拟关闭1602卫生间局部进水阀"
    });
    setAuthorizationOpen(true);
  }

  function submitAuthorization() {
    decideAuthorization(authorization);
    setAuthorizationOpen(false);
  }

  function patch<K extends keyof LabSession>(key: K, value: LabSession[K]) {
    setSession((current) => ({ ...current, [key]: value, notice: null }));
  }

  const leader = result?.rankedHypotheses[0];
  const reopening = result?.authorizationRequirement?.action === "SIMULATE_REOPEN_VALVE" || result?.authorizedActions.some((item) => item.action === "SIMULATE_REOPEN_VALVE");
  const isFactCheck = !result || ["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE", "REOPENED"].includes(result.state);
  const photoConfirmed = session.controls.residentPhoto === "PRESENT" && session.controls.photoFinding !== "UNREADABLE";
  const meterConfirmed = session.controls.meterReading === "PRESENT" && session.controls.meterFinding !== "UNREADABLE";

  return <div className="professional-workspace resident-task-workspace">
    <section className="professional-scene" aria-label="1602卫生间数字孪生">
      <div className="professional-scene-heading">
        <small>筑生样板楼A座 / 16层 / 1602户</small>
        <h1>1602卫生间</h1>
        <p>{result ? `事件 ${result.eventId}` : "等待现场观察进入真实事件引擎"}</p>
      </div>
      <BathroomTwinViewport
        assets={assets}
        externalError={assetError}
        directive={directive}
        view={session.selectedView}
        selectedBusinessId={session.selectedBusinessId}
        onViewChange={(selectedView) => setSession((current) => ({ ...current, selectedView }))}
        onSelect={(selectedBusinessId) => setSession((current) => ({ ...current, selectedBusinessId }))}
      />
    </section>

    <aside className="professional-task-pane">
      <header className="task-pane-header">
        <div className="resident-task-utility">
          <Link href="/case-1602">返回1602验证舱</Link>
          <button onClick={onOpenAdvanced}>高级验证</button>
        </div>
        <small>1602验证舱 / {isFactCheck ? "02 潮湿发现" : `当前处置 · ${journey.stateLabel}`}</small>
        <h2>{isFactCheck ? "1602卫生间出现潮湿" : journey.headline}</h2>
        <p>{isFactCheck ? "先把现场事实与建造记忆放在一起核对，再决定是否需要隔离验证。" : journey.summary}</p>
      </header>

      {session.notice ? <div className="task-notice" role="status"><AlertTriangle size={15} /><span>{session.notice}</span><button aria-label="关闭提示" onClick={() => setSession((current) => ({ ...current, notice: null }))}>×</button></div> : null}
      {assetError ? <div className="task-notice error"><AlertTriangle size={15} />三维资产降级：{assetError}</div> : null}

      <div className="task-pane-body">
        {isFactCheck ? <section className="active-task resident-guided-task" data-focus="evidence" tabIndex={-1}>
          <div className="task-section-heading"><Gauge size={18} /><div><strong>此刻只需要核对现场事实</strong><small>系统会调用同一份建筑记忆；不会替人操作阀门。</small></div></div>
          <div className="resident-fact-groups">
            <article className="resident-fact known"><span>已发现</span><strong>卫生间持续潮湿</strong><p>湿度 {session.controls.humidity.value}%（基线 {session.controls.humidity.baseline ?? "—"}%），持续 {session.controls.humidity.durationMinutes} 分钟。</p></article>
            <article className="resident-fact known"><span>已发现</span><strong>无人用水仍有微流量</strong><p>{session.controls.microFlow.value} L/min，已持续 {session.controls.microFlow.durationMinutes} 分钟。</p></article>
            <article className="resident-fact memory"><span>已调取</span><strong>建造期管线与闭水记录</strong><p>施工接头、闭水试验和防水记录已关联至1602卫生间。</p></article>
            <article className="resident-fact gap"><span>{photoConfirmed && meterConfirmed ? "已核对" : "还需确认"}</span><strong>{photoConfirmed && meterConfirmed ? "住户照片与水表复核已齐全" : "补齐现场人工证据"}</strong><p>{photoConfirmed ? "墙面照片已判读。" : "需要住户确认墙面是否可见潮湿。"}{meterConfirmed ? " 水表观察已确认。" : " 需要确认停用水后水表是否仍变化。"}</p></article>
          </div>
          <details className="resident-fact-controls">
            <summary>修正或补充现场事实 <ChevronDown size={15} /></summary>
            <div className="task-field-grid">
              <TaskNumber label="当前湿度" value={session.controls.humidity.value} unit="%" min={0} max={100} onChange={(value) => setSession((current) => ({ ...current, controls: { ...current.controls, humidity: { ...current.controls.humidity, value } } }))} />
              <TaskNumber label="无人用水微流量" value={session.controls.microFlow.value} unit="L/min" min={0} max={0.2} step={0.01} onChange={(value) => setSession((current) => ({ ...current, controls: { ...current.controls, microFlow: { ...current.controls.microFlow, value } } }))} />
              <label><span>住户墙面照片</span><select value={session.controls.photoFinding} onChange={(event) => setSession((current) => ({ ...current, controls: { ...current.controls, residentPhoto: event.target.value === "UNREADABLE" ? "MISSING" : "PRESENT", photoFinding: event.target.value as typeof current.controls.photoFinding } }))}><option value="MOISTURE_VISIBLE">可见潮湿</option><option value="NO_VISIBLE_MOISTURE">未见潮湿</option><option value="UNREADABLE">尚未提供</option></select></label>
              <label><span>人工水表观察</span><select value={session.controls.meterFinding} onChange={(event) => setSession((current) => ({ ...current, controls: { ...current.controls, meterReading: event.target.value === "UNREADABLE" ? "MISSING" : "PRESENT", meterFinding: event.target.value as typeof current.controls.meterFinding } }))}><option value="FLOW_CONFIRMED_NO_USE">停用水仍变化</option><option value="NO_CHANGE">无变化</option><option value="UNREADABLE">尚未确认</option></select></label>
            </div>
          </details>
          {result?.contradictions.length ? <p className="task-blocked"><AlertTriangle size={13} />{result.contradictions[0].explanation}</p> : null}
          <button className="task-primary" disabled={busy || !assets} onClick={evaluate}><FileSearch size={16} />{busy ? "正在核对建筑记忆…" : "核对现场事实，给出下一步"}</button>
        </section> : null}

        {result && !["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE", "REOPENED"].includes(result.state) ? <section className="task-decision-summary" data-focus="diagnosis" tabIndex={-1}>
          <span>当前判断</span><strong>{leader ? hypothesisLabels[leader.hypothesis] : "尚未形成"}</strong>
          <p>{result.decisionConfidence}：{result.nextSteps[0] ?? "请继续核对现场信息。"}</p>
          <small>这是可解释的候选判断，不是真实故障概率；规则分值与证据覆盖率已收进验证详情。</small>
        </section> : null}

        {result?.state === "AUTHORIZATION_PENDING" && result.authorizationRequirement ? <section className="active-task safety" data-focus="authorization" tabIndex={-1}>
          <div className="task-section-heading"><ShieldCheck size={19} /><div><strong>{reopening ? "恢复供水需要独立授权" : "等待人工授权"}</strong><small>当前阀门保持 {result.valvePosition}</small></div></div>
          <dl className="task-facts"><div><dt>模拟动作</dt><dd>{result.authorizationRequirement.action}</dd></div><div><dt>目标阀门</dt><dd>{result.authorizationRequirement.targetBusinessId}</dd></div><div><dt>有效范围</dt><dd>仅当前事件</dd></div></dl>
          <button className="task-primary" onClick={openAuthorization}><LockKeyhole size={16} />提交人工授权</button>
        </section> : null}

        {result?.state === "AUTHORIZED" ? <section className="active-task" data-focus="execute-valve" tabIndex={-1}>
          <div className="task-section-heading"><Check size={19} /><div><strong>授权已记录，动作尚未执行</strong><small>批准记录不会自动改变阀门</small></div></div>
          <p className="task-control-note">当前阀门仍为 {result.valvePosition}。需要用户明确执行本次脱敏模拟动作。</p>
          <button className="task-primary" disabled={busy} onClick={executeValveAction}><Play size={16} />{reopening ? "模拟执行恢复供水" : "模拟执行关阀"}</button>
        </section> : null}

        {result?.state === "VERIFYING" ? <section className="active-task" data-focus="isolation" tabIndex={-1}>
          <div className="task-section-heading"><Gauge size={18} /><div><strong>提交关阀后的新观察</strong><small>自动关联本次关阀审计sequence</small></div></div>
          <div className="task-field-grid">
            <TaskNumber label="微流量" value={session.isolation.microFlow} unit="L/min" min={0} max={0.2} step={0.01} onChange={(microFlow) => patch("isolation", { ...session.isolation, microFlow })} />
            <TaskNumber label="湿度" value={session.isolation.humidity} unit="%" min={0} max={100} onChange={(humidity) => patch("isolation", { ...session.isolation, humidity })} />
            <TaskNumber label="持续时间" value={session.isolation.durationMinutes} unit="min" min={0} max={120} step={5} onChange={(durationMinutes) => patch("isolation", { ...session.isolation, durationMinutes })} />
          </div>
          <button className="task-primary" disabled={busy} onClick={submitIsolation}><Gauge size={16} />提交隔离后观察</button>
        </section> : null}

        {result?.state === "REPAIR_PENDING" ? <section className="active-task" data-focus="repair" tabIndex={-1}>
          <div className="task-section-heading"><Wrench size={18} /><div><strong>填写人工维修记录</strong><small>事件已临时控制，尚未完成维修</small></div></div>
          {repairTask ? <div className="repair-task-brief"><span>精准维修目标</span><strong>{repairTask.target.displayName}</strong><code>{repairTask.target.businessId}</code><p>{repairTask.recommendedScope.join("；")}</p></div> : null}
          <div className="task-form-stack">
            <label><span>维修方式</span><select value={session.repairDraft.method} onChange={(event) => patch("repairDraft", { ...session.repairDraft, method: event.target.value as typeof session.repairDraft.method })}><option value="JOINT_RETIGHTEN">接头复紧</option><option value="SEAL_REPLACEMENT">密封件更换</option><option value="JOINT_REPLACEMENT">接头更换</option><option value="LOCAL_PIPE_REPLACEMENT">局部管段更换</option><option value="INSPECTION_ONLY">仅检查、未维修</option></select></label>
            <label><span>维修人员 / 班组</span><input value={session.repairDraft.crewId} onChange={(event) => patch("repairDraft", { ...session.repairDraft, crewId: event.target.value })} /></label>
            <label><span>维修说明</span><textarea value={session.repairDraft.description} onChange={(event) => patch("repairDraft", { ...session.repairDraft, description: event.target.value })} /></label>
          </div>
          <button className="task-primary" disabled={busy || !session.repairDraft.crewId || !session.repairDraft.description} onClick={submitRepair}><ClipboardCheck size={16} />提交不可变维修记录</button>
        </section> : null}

        {result?.state === "POST_REPAIR_VERIFYING" ? <section className="active-task" data-focus="post-repair" tabIndex={-1}>
          <div className="task-section-heading"><Gauge size={18} /><div><strong>维修后复验</strong><small>只接受恢复供水后的新观察</small></div></div>
          <div className="task-field-grid">
            <TaskNumber label="微流量" value={session.postRepair.microFlow} unit="L/min" min={0} max={0.2} step={0.01} onChange={(microFlow) => patch("postRepair", { ...session.postRepair, microFlow })} />
            <TaskNumber label="湿度" value={session.postRepair.humidity} unit="%" min={0} max={100} onChange={(humidity) => patch("postRepair", { ...session.postRepair, humidity })} />
            <TaskNumber label="持续时间" value={session.postRepair.durationMinutes} unit="min" min={0} max={120} step={5} onChange={(durationMinutes) => patch("postRepair", { ...session.postRepair, durationMinutes })} />
          </div>
          <button className="task-primary" disabled={busy} onClick={submitPostRepair}><Gauge size={16} />提交维修后复验</button>
        </section> : null}

        {result?.state === "RESOLVED" ? <section className="active-task final resolved">
          <Check size={25} /><h3>维修闭环完成</h3><p>维修后微流量与湿度观察满足恢复条件，审计重放结果为RESOLVED。</p>
          <Link className="task-primary" href="/group?mode=task"><span>形成集团经验建议</span></Link>
        </section> : null}

        <details className="task-verification-details">
          <summary>查看验证详情 <ChevronDown size={15} /></summary>
          <div><p>事件状态：<code>{result?.state ?? "NOT_STARTED"}</code></p><p>阀门状态：<code>{result?.valvePosition ?? "OPEN"}</code></p><p>审计记录：<code>{result?.auditLog.length ?? 0}</code></p><p>选中构件：<code>{session.selectedBusinessId ?? "无"}</code></p></div>
        </details>
      </div>
    </aside>

    {authorizationOpen && result?.authorizationRequirement ? <div className="authorization-modal" role="dialog" aria-modal="true" aria-labelledby="task-authorization-title">
      <div><header><ShieldCheck size={22} /><span><small>HUMAN IN THE LOOP</small><h2 id="task-authorization-title">人工授权记录</h2></span><button aria-label="关闭授权窗口" onClick={() => setAuthorizationOpen(false)}>×</button></header>
        <dl><div><dt>模拟动作</dt><dd>{result.authorizationRequirement.action}</dd></div><div><dt>目标阀门</dt><dd>{result.authorizationRequirement.targetBusinessId}</dd></div><div><dt>当前事件</dt><dd>{result.eventId}</dd></div></dl>
        <label><span>授权人类型</span><select value={authorization.actorType} onChange={(event) => setAuthorization((current) => ({ ...current, actorType: event.target.value as LabAuthorizationDraft["actorType"] }))}><option value="RESIDENT">住户</option><option value="PROPERTY">物业</option></select></label>
        <label><span>授权人演示ID</span><input value={authorization.actorId} onChange={(event) => setAuthorization((current) => ({ ...current, actorId: event.target.value }))} /></label>
        <label><span>决定</span><select value={authorization.decision} onChange={(event) => setAuthorization((current) => ({ ...current, decision: event.target.value as LabAuthorizationDraft["decision"] }))}><option value="APPROVED">批准</option><option value="REJECTED">拒绝</option></select></label>
        <label><span>原因或备注</span><textarea value={authorization.reason} onChange={(event) => setAuthorization((current) => ({ ...current, reason: event.target.value }))} /></label>
        <p><LockKeyhole size={14} />授权不会直接改变阀门，仍需用户明确执行。</p>
        <footer><button onClick={() => setAuthorizationOpen(false)}>取消</button><button className="lab-primary" disabled={!authorization.actorId.trim()} onClick={submitAuthorization}>提交人工决定</button></footer>
      </div>
    </div> : null}
  </div>;
}
