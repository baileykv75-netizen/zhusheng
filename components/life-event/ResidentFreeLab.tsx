"use client";

import { Activity, AlertTriangle, Check, ChevronRight, ClipboardCheck, Download, FileSearch, FileText, Gauge, History, LockKeyhole, Play, RotateCcw, ShieldCheck, SlidersHorizontal, Wrench } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { BathroomTwinViewport } from "./BathroomTwinViewport";
import type { EvidenceItem, LifeEventResult, RepairTask, VisualDirective } from "@/lib/life-event-engine/types.ts";
import { repairTaskForResult } from "@/lib/life-event-lab/model.ts";
import { type EvidenceStatus, type LabAuthorizationDraft, type LabControls, type LabSession, type LabTemplateId } from "@/lib/life-event-lab/types.ts";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";

const defaultDirective: VisualDirective = {
  view: "VIEW_RESIDENT", highlightBusinessIds: [], moistureState: "DRY", valvePosition: "OPEN",
  evidenceAnchorIds: [], allowedActions: [], authorizationRequired: false
};

const hypothesisLabels: Record<string, string> = {
  COLD_WATER_JOINT_LEAK: "冷水系统接头渗漏",
  WATERPROOFING_FAILURE: "防水层失效",
  CONDENSATION_OR_AMBIENT_HUMIDITY: "冷凝或环境潮湿",
  UNRESOLVED: "尚未收敛"
};

const stateLabels: Record<string, string> = {
  INCONCLUSIVE: "证据不足 / 矛盾",
  AUTHORIZATION_PENDING: "等待人工授权",
  AUTHORIZED: "已授权，待执行",
  VERIFYING: "关阀后验证中",
  REOPENED: "异常未恢复，重新评估",
  ISOLATION_CONFIRMED: "隔离效果已确认",
  REPAIR_PENDING: "事件已控制，待维修",
  REPAIR_RECORDED: "维修已记录，待恢复供水授权",
  POST_REPAIR_VERIFYING: "维修后复验中",
  RESOLVED: "维修闭环完成"
};

const templateLabels: Array<{ id: LabTemplateId; label: string }> = [
  { id: "joint-supported", label: "接头证据充分" },
  { id: "humidity-only", label: "仅湿度异常" },
  { id: "missing-evidence", label: "关键证据缺失" },
  { id: "contradictory-evidence", label: "证据矛盾" }
];

const evidenceOptions: EvidenceStatus[] = ["PRESENT", "MISSING", "CONTRADICTORY", "UNVERIFIED"];

function evidenceLabel(value: EvidenceStatus) {
  return ({ PRESENT: "有效", MISSING: "缺失", CONTRADICTORY: "矛盾", UNVERIFIED: "未核验" } as const)[value];
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 19);
}

function downloadText(filename: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function NumericField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange(value: number): void }) {
  return <label className="lab-numeric"><span>{label}<em>{value} {unit}</em></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><input aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function EvidenceSelect({ label, value, onChange }: { label: string; value: EvidenceStatus; onChange(value: EvidenceStatus): void }) {
  return <label className="evidence-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value as EvidenceStatus)}>{evidenceOptions.map((item) => <option key={item} value={item}>{evidenceLabel(item)}</option>)}</select></label>;
}

export function ResidentFreeLab() {
  const {
    session, setSession, assets, assetError, engine, busy, patchControls, applyTemplate, evaluate,
    attemptUnauthorized, decideAuthorization: commitAuthorization, executeValveAction,
    submitIsolation, submitRepair, submitPostRepair, resetLab, buildProductEvidenceBundle
  } = useLifecycleJourney();
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [authorization, setAuthorization] = useState<LabAuthorizationDraft>({ actorType: "RESIDENT", actorId: "DEMO-RESIDENT-1602", decision: "APPROVED", reason: "同意进行本次脱敏模拟关阀验证" });
  const result = session.result;
  const directive = result?.visualDirective ?? defaultDirective;
  const repairTask = useMemo(() => {
    if (!engine || !result || !["REPAIR_PENDING", "REPAIR_RECORDED", "ACTION_PROPOSED", "AUTHORIZATION_PENDING", "AUTHORIZED", "SIMULATED_ACTION_APPLIED", "POST_REPAIR_VERIFYING", "RESOLVED", "REOPENED"].includes(result.state)) return null;
    try { return repairTaskForResult(engine, result); } catch { return null; }
  }, [engine, result]);

  function reset() {
    if (!window.confirm("重置只会清除本标签页的自由实验状态，是否继续？")) return;
    resetLab();
  }

  function submitAuthorization() {
    if (!result) return;
    commitAuthorization(authorization);
    setAuthorizationOpen(false);
  }

  function requestAuthorization() {
    const reopening = result?.authorizationRequirement?.action === "SIMULATE_REOPEN_VALVE";
    setAuthorization({
      actorType: reopening ? "PROPERTY" : "RESIDENT",
      actorId: reopening ? "PROPERTY-DEMO-01" : "DEMO-RESIDENT-1602",
      decision: "APPROVED",
      reason: reopening ? "维修记录已核验，同意本次脱敏模拟恢复供水并开展维修后复验" : "同意进行本次脱敏模拟关阀验证"
    });
    setAuthorizationOpen(true);
  }

  function downloadPackage() {
    try {
      const bundle = buildProductEvidenceBundle();
      downloadText(`${bundle.verifiedEventPackage.eventId}.package.json`, JSON.stringify(bundle, null, 2));
      setSession((current) => ({ ...current, notice: "事件成果包已通过领域校验，并附带独立的产品证据来源附录。" }));
    } catch (reason) {
      setSession((current) => ({ ...current, notice: reason instanceof Error ? reason.message : "成果包生成失败" }));
    }
  }

  function downloadAudit() {
    if (!result) return;
    downloadText(`${result.eventId}.audit.jsonl`, result.auditLog.map((item) => JSON.stringify(item)).join("\n"), "application/x-ndjson");
  }

  const selectNode = useCallback((businessId: string | null) => setSession((current) => ({ ...current, selectedBusinessId: businessId })), []);

  return (
    <div className="resident-free-lab">
      <header className="lab-header">
        <div className="space-path"><span>筑生样板楼A座</span><ChevronRight size={13} /><span>16层</span><ChevronRight size={13} /><span>1602户</span><ChevronRight size={13} /><strong>1602卫生间</strong></div>
        <div className="lab-title"><div><small>1602 VERIFICATION DETAIL / STAGE 4B</small><h1>高级验证与事件重放</h1></div><div className="lab-runtime"><i className={assets ? "ready" : assetError ? "failed" : ""} />{assets ? "资产已校验 · 本地计算" : assetError ? "确定性降级" : "正在校验资产"}</div><button className="lab-reset" onClick={reset}><RotateCcw size={15} />重置验证</button></div>
      </header>

      <div className="lab-workspace">
        <BathroomTwinViewport assets={assets} externalError={assetError} directive={directive} view={session.selectedView} selectedBusinessId={session.selectedBusinessId} onViewChange={(selectedView) => setSession((current) => ({ ...current, selectedView }))} onSelect={selectNode} />

        <section className="lab-console">
          <nav className="lab-tabs" aria-label="自由实验面板">
            {([ ["input", SlidersHorizontal, "输入"], ["diagnosis", FileSearch, "诊断"], ["actions", LockKeyhole, "动作"], ["audit", History, "审计"] ] as const).map(([id, Icon, label]) => <button key={id} className={session.activeTab === id ? "active" : ""} onClick={() => setSession((current) => ({ ...current, activeTab: id }))}><Icon size={15} />{label}{id === "audit" && result ? <em>{result.auditLog.length}</em> : null}</button>)}
          </nav>

          {session.notice ? <div className="lab-notice" role="status"><AlertTriangle size={16} /><span>{session.notice}</span><button aria-label="关闭提示" onClick={() => setSession((current) => ({ ...current, notice: null }))}>×</button></div> : null}
          {assetError ? <div className="lab-error"><AlertTriangle size={16} /><span>资产或哈希校验失败：{assetError}</span></div> : null}

          <div className="lab-panel-scroll">
            {session.activeTab === "input" ? (
              <div className="lab-input-panel">
                <section className="template-picker"><header><span>输入模板</span><small>仅填充控件，不设置结论</small></header><div>{templateLabels.map((item) => <button key={item.id} onClick={() => applyTemplate(item.id)}>{item.label}</button>)}</div></section>
                <section className="sensor-editor"><header><Activity size={15} /><span>传感器观察</span></header>
                  <div className="sensor-block"><strong>相对湿度</strong><NumericField label="当前" value={session.controls.humidity.value} min={0} max={100} step={1} unit="%" onChange={(value) => patchControls({ humidity: { ...session.controls.humidity, value } })} /><NumericField label="基线" value={session.controls.humidity.baseline ?? 0} min={0} max={100} step={1} unit="%" onChange={(baseline) => patchControls({ humidity: { ...session.controls.humidity, baseline } })} /><NumericField label="持续" value={session.controls.humidity.durationMinutes} min={0} max={120} step={5} unit="min" onChange={(durationMinutes) => patchControls({ humidity: { ...session.controls.humidity, durationMinutes } })} /><label><span>质量</span><select value={session.controls.humidity.quality} onChange={(event) => patchControls({ humidity: { ...session.controls.humidity, quality: event.target.value as LabControls["humidity"]["quality"] } })}><option>GOOD</option><option>DEGRADED</option><option>UNKNOWN</option></select></label></div>
                  <div className="sensor-block"><strong>无人用水微流量</strong><NumericField label="当前" value={session.controls.microFlow.value} min={0} max={0.2} step={0.01} unit="L/min" onChange={(value) => patchControls({ microFlow: { ...session.controls.microFlow, value } })} /><NumericField label="基线" value={session.controls.microFlow.baseline ?? 0} min={0} max={0.1} step={0.01} unit="L/min" onChange={(baseline) => patchControls({ microFlow: { ...session.controls.microFlow, baseline } })} /><NumericField label="持续" value={session.controls.microFlow.durationMinutes} min={0} max={120} step={5} unit="min" onChange={(durationMinutes) => patchControls({ microFlow: { ...session.controls.microFlow, durationMinutes } })} /><label><span>质量</span><select value={session.controls.microFlow.quality} onChange={(event) => patchControls({ microFlow: { ...session.controls.microFlow, quality: event.target.value as LabControls["microFlow"]["quality"] } })}><option>GOOD</option><option>DEGRADED</option><option>UNKNOWN</option></select></label></div>
                </section>
                <section className="evidence-editor"><header><ClipboardCheck size={15} /><span>人工与建造证据</span></header><div className="evidence-grid">
                  <EvidenceSelect label="管线施工记录" value={session.controls.pipeInstallation} onChange={(pipeInstallation) => patchControls({ pipeInstallation })} />
                  <EvidenceSelect label="防水施工记录" value={session.controls.waterproofing} onChange={(waterproofing) => patchControls({ waterproofing })} />
                  <EvidenceSelect label="闭水试验" value={session.controls.closedWaterTest} onChange={(closedWaterTest) => patchControls({ closedWaterTest })} />
                  <EvidenceSelect label="住户墙面照片" value={session.controls.residentPhoto} onChange={(residentPhoto) => patchControls({ residentPhoto })} />
                  <label className="evidence-select"><span>照片判读</span><select value={session.controls.photoFinding} onChange={(event) => patchControls({ photoFinding: event.target.value as LabControls["photoFinding"] })}><option value="MOISTURE_VISIBLE">可见潮湿</option><option value="NO_VISIBLE_MOISTURE">未见潮湿</option><option value="UNREADABLE">不可读</option></select></label>
                  <EvidenceSelect label="人工水表观察" value={session.controls.meterReading} onChange={(meterReading) => patchControls({ meterReading })} />
                  <label className="evidence-select"><span>水表判读</span><select value={session.controls.meterFinding} onChange={(event) => patchControls({ meterFinding: event.target.value as LabControls["meterFinding"] })}><option value="FLOW_CONFIRMED_NO_USE">停用水仍缓慢变化</option><option value="NO_CHANGE">无变化</option><option value="UNREADABLE">不可读</option></select></label>
                </div></section>
                <button className="lab-primary" disabled={busy || !assets} onClick={evaluate}><Play size={15} fill="currentColor" />{busy ? "正在运行透明规则…" : "重新评估"}</button>
              </div>
            ) : null}

            {session.activeTab === "diagnosis" ? <DiagnosisPanel result={result} onSelect={selectNode} /> : null}
            {session.activeTab === "actions" ? (
              <ActionPanel
                result={result} busy={busy} isolation={session.isolation} repairTask={repairTask}
                repairDraft={session.repairDraft} postRepair={session.postRepair}
                onIsolationChange={(isolation) => setSession((current) => ({ ...current, isolation }))}
                onRepairDraftChange={(repairDraft) => setSession((current) => ({ ...current, repairDraft }))}
                onPostRepairChange={(postRepair) => setSession((current) => ({ ...current, postRepair }))}
                onUnauthorized={attemptUnauthorized}
                onRequestAuthorization={requestAuthorization}
                onExecute={executeValveAction}
                onVerify={submitIsolation}
                onSubmitRepair={submitRepair}
                onPostRepairVerify={submitPostRepair}
              />
            ) : null}
            {session.activeTab === "audit" ? <AuditPanel result={result} canPackage={Boolean(result && ["RESOLVED", "REOPENED"].includes(result.state))} onDownloadPackage={downloadPackage} onDownloadAudit={downloadAudit} onPrint={() => window.print()} /> : null}
          </div>
        </section>
      </div>

      {authorizationOpen && result?.authorizationRequirement ? (
        <div className="authorization-modal" role="dialog" aria-modal="true" aria-labelledby="authorization-title">
          <div><header><ShieldCheck size={22} /><span><small>HUMAN IN THE LOOP</small><h2 id="authorization-title">人工授权记录</h2></span><button aria-label="关闭授权窗口" onClick={() => setAuthorizationOpen(false)}>×</button></header>
            <dl><div><dt>模拟动作</dt><dd>{result.authorizationRequirement.action}</dd></div><div><dt>目标阀门</dt><dd>{result.authorizationRequirement.targetBusinessId}</dd></div><div><dt>有效范围</dt><dd>仅当前事件 {result.eventId}</dd></div></dl>
            <label><span>授权人类型</span><select value={authorization.actorType} onChange={(event) => setAuthorization((current) => ({ ...current, actorType: event.target.value as LabAuthorizationDraft["actorType"] }))}><option value="RESIDENT">住户</option><option value="PROPERTY">物业</option></select></label>
            <label><span>授权人演示ID</span><input value={authorization.actorId} onChange={(event) => setAuthorization((current) => ({ ...current, actorId: event.target.value }))} /></label>
            <label><span>决定</span><select value={authorization.decision} onChange={(event) => setAuthorization((current) => ({ ...current, decision: event.target.value as LabAuthorizationDraft["decision"] }))}><option value="APPROVED">批准</option><option value="REJECTED">拒绝</option></select></label>
            <label><span>原因或备注</span><textarea value={authorization.reason} onChange={(event) => setAuthorization((current) => ({ ...current, reason: event.target.value }))} /></label>
             <p><LockKeyhole size={14} />这是模拟动作。授权不会直接改变阀门，当前仍保持{result.valvePosition}，仍需用户再次执行。</p>
            <footer><button onClick={() => setAuthorizationOpen(false)}>取消</button><button className="lab-primary" disabled={!authorization.actorId.trim()} onClick={submitAuthorization}>提交人工决定</button></footer>
          </div>
        </div>
      ) : null}
      <PrintableEventReport result={result} task={repairTask} />
    </div>
  );
}

function DiagnosisPanel({ result, onSelect }: { result: LifeEventResult | null; onSelect(id: string | null): void }) {
  if (!result) return <div className="lab-empty"><FileSearch size={28} /><strong>尚未运行诊断</strong><p>在输入页调整观察与证据后运行同一事件引擎。</p></div>;
  const leader = result.rankedHypotheses[0];
  return <div className="diagnosis-panel">
    <section className="decision-summary"><header><span>当前第一候选</span><em>{stateLabels[result.state] ?? result.state}</em></header><h2>{hypothesisLabels[leader.hypothesis]}</h2><div className="decision-metrics"><div><small>决策可信等级</small><strong>{result.decisionConfidence}</strong></div><div><small>规则原始分值</small><strong>{leader.rawScore}</strong></div><div><small>证据覆盖率</small><strong>{Math.round(leader.evidenceCoverage * 100)}%</strong></div><div><small>领先差值</small><strong>{leader.gapFromLeader}</strong></div></div><p>规则分值用于透明排序，不是真实故障概率。</p></section>
    <section className="candidate-list"><header>候选原因排序</header>{result.rankedHypotheses.map((item, index) => <button key={item.hypothesis} onClick={() => onSelect(item.candidateBusinessIds[0] ?? null)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{hypothesisLabels[item.hypothesis]}</strong><small>{item.candidateBusinessIds.join(" · ") || "无特定候选构件"}</small></div><em>{item.rawScore}<small>{item.confidence}</small></em></button>)}</section>
    <section className="rule-contributions"><header>规则贡献</header>{leader.contributions.map((item) => <details key={item.ruleId} onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) onSelect(leader.candidateBusinessIds[0] ?? null); }}><summary><span>{item.ruleId}</span><strong>{item.contribution > 0 ? "+" : ""}{item.contribution}</strong></summary><p>{item.explanation}</p><small>引用：{item.evidenceIds.join(" · ") || "派生事实"}</small></details>)}</section>
    <div className="evidence-outcome-grid"><Outcome title="支持证据" items={result.supportingEvidence} tone="support" /><Outcome title="反驳证据" items={result.contradictingEvidence} tone="risk" /><Outcome title="缺失证据" items={result.missingEvidence.map((item) => `${item.evidenceType} · ${item.reason}`)} tone="missing" /><Outcome title="矛盾项" items={result.contradictions.map((item) => item.explanation)} tone="risk" /></div>
    <section className="next-step-list"><header>下一步建议</header>{result.nextSteps.map((item) => <p key={item}><ChevronRight size={13} />{item}</p>)}</section>
    <footer className="engine-meta"><span>规则 {result.ruleSetVersion}</span><span>记忆 {result.memoryVersion}</span><span>{result.eventId}</span></footer>
  </div>;
}

function Outcome({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return <section className={`outcome ${tone}`}><header>{title}<em>{items.length}</em></header>{items.length ? items.map((item) => <p key={item}>{item}</p>) : <small>无</small>}</section>;
}

function ActionPanel({ result, busy, isolation, repairTask, repairDraft, postRepair, onIsolationChange, onRepairDraftChange, onPostRepairChange, onUnauthorized, onRequestAuthorization, onExecute, onVerify, onSubmitRepair, onPostRepairVerify }: {
  result: LifeEventResult | null;
  busy: boolean;
  isolation: LabSession["isolation"];
  repairTask: RepairTask | null;
  repairDraft: LabSession["repairDraft"];
  postRepair: LabSession["postRepair"];
  onIsolationChange(value: LabSession["isolation"]): void;
  onRepairDraftChange(value: LabSession["repairDraft"]): void;
  onPostRepairChange(value: LabSession["postRepair"]): void;
  onUnauthorized(): void;
  onRequestAuthorization(): void;
  onExecute(): void;
  onVerify(): void;
  onSubmitRepair(): void;
  onPostRepairVerify(): void;
}) {
  if (!result) return <div className="lab-empty"><LockKeyhole size={28} /><strong>尚无动作建议</strong><p>只有事件引擎产生动作建议后，才能进入人工授权。</p></div>;
  const requirement = result.authorizationRequirement;
  const reopening = requirement?.action === "SIMULATE_REOPEN_VALVE" || result.authorizedActions.some((item) => item.action === "SIMULATE_REOPEN_VALVE");
  const latestRepair = result.repairRecords.at(-1);
  return <div className="action-panel">
    <section className="event-state-banner"><span>当前生命事件状态</span><strong>{stateLabels[result.state] ?? result.state}</strong><small>阀门视觉状态由事件引擎指令决定：{result.visualDirective.valvePosition}</small></section>
    {result.state === "AUTHORIZATION_PENDING" && requirement ? <section className="safety-action"><ShieldCheck size={24} /><h2>{reopening ? "恢复供水需要独立授权" : "人工授权边界生效"}</h2><p>{reopening ? "关阀授权不能复用于开阀。当前未授权，阀门继续保持CLOSED。" : "系统只提出模拟隔离建议。当前未授权，阀门保持OPEN。"}</p><dl><div><dt>动作</dt><dd>{requirement.action}</dd></div><div><dt>目标</dt><dd>{requirement.targetBusinessId}</dd></div></dl><button className="lab-primary" onClick={onRequestAuthorization}><LockKeyhole size={15} />请求人工授权</button><button className="guard-test" onClick={onUnauthorized}>测试未授权动作守卫</button></section> : null}
    {result.state === "AUTHORIZED" ? <section className="safety-action approved"><Check size={24} /><h2>授权已通过，动作尚未执行</h2><p>批准记录不会自动改变阀门。当前仍为{result.valvePosition}，需要用户明确执行。</p><button className="lab-primary" disabled={busy} onClick={onExecute}><Play size={15} />{reopening ? "模拟执行恢复供水" : "模拟执行关阀"}</button></section> : null}
    {result.state === "VERIFYING" ? <section className="isolation-editor"><header><Gauge size={17} /><span>关阀后新观察</span><em>自动关联关阀审计sequence</em></header><NumericField label="微流量" value={isolation.microFlow} min={0} max={0.2} step={0.01} unit="L/min" onChange={(microFlow) => onIsolationChange({ ...isolation, microFlow })} /><NumericField label="湿度" value={isolation.humidity} min={0} max={100} step={1} unit="%" onChange={(humidity) => onIsolationChange({ ...isolation, humidity })} /><NumericField label="持续" value={isolation.durationMinutes} min={0} max={120} step={5} unit="min" onChange={(durationMinutes) => onIsolationChange({ ...isolation, durationMinutes })} /><button className="lab-primary" disabled={busy} onClick={onVerify}><Gauge size={15} />提交关阀后观察</button></section> : null}
    {repairTask ? <section className="repair-task-card"><header><Wrench size={18} /><div><small>精准维修任务</small><h2>{repairTask.target.displayName}</h2></div><em>{repairTask.taskId}</em></header><div className="repair-task-path"><span>{repairTask.building.displayName}</span><ChevronRight size={12} /><span>{repairTask.storey.displayName}</span><ChevronRight size={12} /><span>{repairTask.unit.displayName}</span><ChevronRight size={12} /><strong>{repairTask.space.displayName}</strong></div><dl><div><dt>目标构件</dt><dd>{repairTask.target.businessId}</dd></div><div><dt>上游阀门</dt><dd>{repairTask.isolationValve.businessId}</dd></div><div><dt>透明排序</dt><dd>{repairTask.rawScore} / {repairTask.decisionConfidence}</dd></div><div><dt>引用证据</dt><dd>{repairTask.evidenceIds.length}项</dd></div></dl><ul>{repairTask.recommendedScope.map((item) => <li key={item}>{item}</li>)}</ul><p>{repairTask.scoreDisclaimer}</p><small>{repairTask.disclaimer}</small></section> : null}
    {result.state === "REPAIR_PENDING" ? <section className="repair-record-form"><header><ClipboardCheck size={17} /><span>人工维修记录</span><em>提交后不可覆盖</em></header><h2>事件已临时控制，尚未完成维修</h2><p className="repair-control-note">疑似供水链得到进一步支持，阀门保持CLOSED。</p><label><span>实际维修目标</span><input value={repairDraft.targetBusinessId} onChange={(event) => onRepairDraftChange({ ...repairDraft, targetBusinessId: event.target.value })} /></label><label><span>维修方式</span><select value={repairDraft.method} onChange={(event) => onRepairDraftChange({ ...repairDraft, method: event.target.value as LabSession["repairDraft"]["method"] })}><option value="JOINT_RETIGHTEN">接头复紧</option><option value="SEAL_REPLACEMENT">密封件更换</option><option value="JOINT_REPLACEMENT">接头更换</option><option value="LOCAL_PIPE_REPLACEMENT">局部管段更换</option><option value="INSPECTION_ONLY">仅检查、未维修</option></select></label><div className="repair-time-grid"><label><span>开始时间</span><input type="datetime-local" step="1" value={toDateTimeLocal(repairDraft.startedAt)} onChange={(event) => onRepairDraftChange({ ...repairDraft, startedAt: new Date(event.target.value).toISOString() })} /></label><label><span>完成时间</span><input type="datetime-local" step="1" value={toDateTimeLocal(repairDraft.completedAt)} onChange={(event) => onRepairDraftChange({ ...repairDraft, completedAt: new Date(event.target.value).toISOString() })} /></label></div><label><span>维修人员 / 班组</span><input value={repairDraft.crewId} onChange={(event) => onRepairDraftChange({ ...repairDraft, crewId: event.target.value })} /></label><label><span>维修说明</span><textarea value={repairDraft.description} onChange={(event) => onRepairDraftChange({ ...repairDraft, description: event.target.value })} /></label><label><span>维修结果</span><select value={repairDraft.result} onChange={(event) => onRepairDraftChange({ ...repairDraft, result: event.target.value as LabSession["repairDraft"]["result"] })}><option value="COMPLETED">已完成维修</option><option value="INSPECTION_ONLY">仅检查、未维修</option><option value="UNSUCCESSFUL">维修未成功</option></select></label><label className="repair-check"><input type="checkbox" checked={repairDraft.restoreSupplyVerificationRequired} onChange={(event) => onRepairDraftChange({ ...repairDraft, restoreSupplyVerificationRequired: event.target.checked })} /><span>需要恢复供水并进行维修后验证</span></label><button className="lab-primary" disabled={busy || !repairDraft.targetBusinessId || !repairDraft.crewId || !repairDraft.description} onClick={onSubmitRepair}><ClipboardCheck size={15} />提交不可变维修记录</button></section> : null}
    {latestRepair ? <section className="repair-record-summary"><header><Check size={16} /><span>维修记录已进入事件链</span><code>{latestRepair.repairRecordId}</code></header><dl><div><dt>目标</dt><dd>{latestRepair.targetBusinessId}</dd></div><div><dt>方式</dt><dd>{latestRepair.method}</dd></div><div><dt>班组</dt><dd>{latestRepair.crewId}</dd></div><div><dt>结果</dt><dd>{latestRepair.result}</dd></div></dl></section> : null}
    {result.state === "POST_REPAIR_VERIFYING" ? <section className="post-repair-editor"><header><Gauge size={17} /><span>维修后新观察</span><em>发生在维修完成和恢复供水之后</em></header><NumericField label="微流量" value={postRepair.microFlow} min={0} max={0.2} step={0.01} unit="L/min" onChange={(microFlow) => onPostRepairChange({ ...postRepair, microFlow })} /><label><span>微流量质量</span><select value={postRepair.microFlowQuality} onChange={(event) => onPostRepairChange({ ...postRepair, microFlowQuality: event.target.value as LabSession["postRepair"]["microFlowQuality"] })}><option>GOOD</option><option>DEGRADED</option><option>UNKNOWN</option></select></label><NumericField label="湿度" value={postRepair.humidity} min={0} max={100} step={1} unit="%" onChange={(humidity) => onPostRepairChange({ ...postRepair, humidity })} /><label><span>湿度质量</span><select value={postRepair.humidityQuality} onChange={(event) => onPostRepairChange({ ...postRepair, humidityQuality: event.target.value as LabSession["postRepair"]["humidityQuality"] })}><option>GOOD</option><option>DEGRADED</option><option>UNKNOWN</option></select></label><NumericField label="持续" value={postRepair.durationMinutes} min={0} max={120} step={5} unit="min" onChange={(durationMinutes) => onPostRepairChange({ ...postRepair, durationMinutes })} /><label><span>现场说明</span><textarea value={postRepair.observationNote} onChange={(event) => onPostRepairChange({ ...postRepair, observationNote: event.target.value })} /></label><button className="lab-primary" disabled={busy} onClick={onPostRepairVerify}><Gauge size={15} />提交维修后复验</button></section> : null}
    {result.state === "RESOLVED" ? <section className="repair-final resolved"><Check size={26} /><h2>维修闭环完成</h2><p>维修后微流量和湿度观察均满足恢复条件，事件重放结果为RESOLVED，三维状态由引擎输出REPAIRED。</p><dl><div><dt>最终状态</dt><dd>RESOLVED</dd></div><div><dt>阀门</dt><dd>{result.valvePosition}</dd></div><div><dt>视觉状态</dt><dd>{result.visualDirective.moistureState}</dd></div></dl></section> : null}
    {result.state === "REOPENED" ? <section className="repair-final failed"><AlertTriangle size={25} /><h2>维修后仍有异常，事件已重新打开</h2><p>新观察未满足关闭条件。系统保留异常高亮和完整审计链，不生成“已修复”结论。</p><dl><div><dt>最终状态</dt><dd>REOPENED</dd></div><div><dt>视觉状态</dt><dd>{result.visualDirective.moistureState}</dd></div></dl></section> : null}
    {result.state === "INCONCLUSIVE" ? <section className="action-reopened"><AlertTriangle size={23} /><h2>当前证据不足，不允许继续设备动作</h2><p>{result.contradictions[0]?.explanation ?? "维修或复验信息不足，需要补充有效证据。"}</p></section> : null}
    <section className="action-taxonomy"><header>动作语义</header><div><span>建议</span><strong>{result.proposedActions.length}</strong></div><div><span>授权请求</span><strong>{result.authorizationRequests.length}</strong></div><div><span>已授权</span><strong>{result.authorizedActions.length}</strong></div><div><span>已完成</span><strong>{result.completedActions.length}</strong></div></section>
  </div>;
}

function AuditPanel({ result, canPackage, onDownloadPackage, onDownloadAudit, onPrint }: { result: LifeEventResult | null; canPackage: boolean; onDownloadPackage(): void; onDownloadAudit(): void; onPrint(): void }) {
  if (!result) return <div className="lab-empty"><History size={28} /><strong>尚无审计记录</strong><p>每次状态转换由事件引擎追加到顺序哈希链。</p></div>;
  return <div className="audit-panel"><header><span>事件审计链</span><small>演示级防篡改链，不是数字签名。</small></header>{canPackage ? <section className="event-package-actions"><header><FileText size={17} /><div><strong>1602建筑生命事件包</strong><small>下载前自动校验哈希链、事件重放和引用完整性</small></div></header><div><button className="lab-primary" onClick={onDownloadPackage}><Download size={15} />下载验证成果包</button><button onClick={onDownloadAudit}><Download size={15} />审计JSONL</button><button onClick={onPrint}><FileText size={15} />打印中文闭环报告</button></div><p>{result.state === "RESOLVED" ? "当前事件已通过维修后复验，可生成有效闭环成果。" : "复验失败事件也可下载审计成果，但不会标记为维修完成。"}</p></section> : <section className="event-package-locked"><LockKeyhole size={18} /><div><strong>成果包尚未解锁</strong><p>完成恢复供水后的新观察，进入RESOLVED或REOPENED后才能验证和下载。</p></div></section>}{result.auditLog.map((item) => <article key={item.sequence}><span>{String(item.sequence).padStart(2, "0")}</span><i /><div><header><strong>{item.actionType}</strong><time>{new Date(item.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</time></header><p>{item.previousState} <ChevronRight size={12} /> {item.nextState}</p><small>{item.actorType}{item.actorId ? ` / ${item.actorId}` : ""}</small><footer><em>证据 {item.evidenceRefs.length}</em><em>构件 {item.componentRefs.length}</em><em>维修记录 {item.repairRecordIds.length}</em><code>{item.entryHash.slice(0, 12)}</code></footer></div></article>)}</div>;
}

function PrintableEventReport({ result, task }: { result: LifeEventResult | null; task: RepairTask | null }) {
  if (!result || !task || !["RESOLVED", "REOPENED"].includes(result.state)) return null;
  const repair = result.repairRecords.at(-1);
  return <article className="life-event-print-report">
    <header><span>筑生 / 建筑生命事件</span><h1>1602卫生间渗漏维修闭环报告</h1><p>脱敏合成演示模型，不作为施工依据，不是真实物业工单。</p></header>
    <section><h2>事件摘要</h2><dl><div><dt>事件ID</dt><dd>{result.eventId}</dd></div><div><dt>空间</dt><dd>{task.building.displayName} / {task.storey.displayName} / {task.unit.displayName} / {task.space.displayName}</dd></div><div><dt>最终状态</dt><dd>{result.state}</dd></div><div><dt>审计根哈希</dt><dd>{result.auditLog.at(-1)?.entryHash}</dd></div></dl></section>
    <section><h2>诊断与任务</h2><p>第一候选：{task.target.displayName}（{task.target.businessId}）</p><p>规则原始分值：{task.rawScore}，可信等级：{task.decisionConfidence}。{task.scoreDisclaimer}</p><p>隔离阀：{task.isolationValve.displayName}（{task.isolationValve.businessId}）</p></section>
    {repair ? <section><h2>维修记录</h2><dl><div><dt>记录ID</dt><dd>{repair.repairRecordId}</dd></div><div><dt>维修方式</dt><dd>{repair.method}</dd></div><div><dt>维修班组</dt><dd>{repair.crewId}</dd></div><div><dt>完成时间</dt><dd>{repair.completedAt}</dd></div><div><dt>维修结果</dt><dd>{repair.result}</dd></div></dl><p>{repair.description}</p></section> : null}
    <section><h2>复验结论</h2><p>{result.state === "RESOLVED" ? "维修后新微流量和湿度观察满足恢复条件，事件闭环完成。" : "维修后观察仍异常，事件已重新打开，未标记为修复完成。"}</p><p>阀门最终状态：{result.valvePosition}；三维视觉状态：{result.visualDirective.moistureState}。</p></section>
    <footer>规则版本 {result.ruleSetVersion} · 建筑记忆版本 {result.memoryVersion} · 演示级防篡改链，不是数字签名。</footer>
  </article>;
}
