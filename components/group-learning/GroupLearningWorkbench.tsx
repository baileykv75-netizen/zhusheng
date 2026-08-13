"use client";

import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Download, FileCheck2, FileText, History, LoaderCircle, RotateCcw, ShieldCheck, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadBrowserGroupLearningSource, loadBrowserGroupLearningSourceFromPackage } from "@/lib/group-learning/adapters/browser/index.ts";
import { appendGroupReviewDecision, createPilotChecklistItem, replayGroupReview, verifyGroupLearningBundle } from "@/lib/group-learning/index.ts";
import type { GroupLearningBundle, GroupReviewAuditEntry, GroupReviewDecisionType } from "@/lib/group-learning/types.ts";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { groupDecisionTask } from "@/lib/product/group-decision-tasks";

const SESSION_KEY = "zhusheng.group-learning.v2";
const SESSION_SCHEMA = 3;
type LoadedSource = Awaited<ReturnType<typeof loadBrowserGroupLearningSourceFromPackage>>;
type SavedSession = { schemaVersion: 3; cardId: string; reviewAudit: GroupReviewAuditEntry[] };

const decisionLabels: Record<GroupReviewDecisionType, string> = {
  APPROVE_AS_PILOT_CHECK: "采纳为试点",
  RETURN_FOR_EVIDENCE: "退回补证",
  HOLD_WITHOUT_ADOPTION: "暂不采纳"
};
const reviewStateLabels = {
  PENDING_REVIEW: "等待集团人员评审",
  RETURNED_FOR_EVIDENCE: "已退回补充证据",
  HELD_WITHOUT_ADOPTION: "暂不采纳",
  APPROVED_AS_PILOT: "已采纳为试点检查项"
} as const;

function downloadText(filename: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadSavedAudit(): GroupReviewAuditEntry[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as SavedSession | null;
    return saved?.schemaVersion === SESSION_SCHEMA && Array.isArray(saved.reviewAudit) ? saved.reviewAudit : [];
  } catch { return []; }
}

export function GroupLearningWorkbench({ compact = false }: { compact?: boolean }) {
  const { currentPackage } = useLifecycleJourney();
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [reviewAudit, setReviewAudit] = useState<GroupReviewAuditEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [decisionType, setDecisionType] = useState<GroupReviewDecisionType>("APPROVE_AS_PILOT_CHECK");
  const [reviewerId, setReviewerId] = useState("GROUP-REVIEWER-DEMO-01");
  const [comment, setComment] = useState("建议在下一批MiC卫生间模块中作为试点检查项验证，不升级为企业标准。");
  const [supplementId, setSupplementId] = useState("SUPPLEMENT-JOINT-PHOTO-01");
  const [supplementSummary, setSupplementSummary] = useState("补充封板前连接节点双角度近景与复核说明。");
  const [resubmissionReason, setResubmissionReason] = useState("按上一轮意见补充证据后重新提交评审。");
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setReviewAudit(loadSavedAudit());
    setHydrated(true);
    let active = true;
    const loader = currentPackage?.finalState === "RESOLVED"
      ? loadBrowserGroupLearningSourceFromPackage(currentPackage)
      : loadBrowserGroupLearningSource();
    loader.then((value) => { if (active) { setSource(value); setSourceError(null); } }).catch((error) => {
      if (active) setSourceError(error instanceof Error ? error.message : "集团学习来源加载失败");
    });
    return () => { active = false; };
  }, [currentPackage]);

  const auditMatchesSource = !source || reviewAudit.every((item) => item.cardId === source.card.cardId);
  const activeReviewAudit = useMemo(
    () => auditMatchesSource ? reviewAudit : [],
    [auditMatchesSource, reviewAudit]
  );

  useEffect(() => {
    if (hydrated && source) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        schemaVersion: SESSION_SCHEMA,
        cardId: source.card.cardId,
        reviewAudit: activeReviewAudit
      } satisfies SavedSession));
    }
  }, [activeReviewAudit, hydrated, source]);

  useEffect(() => {
    if (!source || !reviewAudit.length || auditMatchesSource) return;
    setReviewAudit([]);
    setNotice("来源事件已经切换；上一张经验卡的评审记录已与当前会话隔离。");
  }, [auditMatchesSource, reviewAudit.length, source]);

  const replay = useMemo(() => {
    if (!source) return null;
    try { return replayGroupReview(source.card, activeReviewAudit); }
    catch (error) { return { state: "PENDING_REVIEW" as const, lastDecision: null, rootHash: "", error: error instanceof Error ? error.message : "评审审计无效" }; }
  }, [source, activeReviewAudit]);
  const checklist = useMemo(() => source ? createPilotChecklistItem(source.card, activeReviewAudit) : null, [source, activeReviewAudit]);
  const decisionTask = useMemo(() => source && replay ? groupDecisionTask(source.card, replay) : null, [source, replay]);

  function buildBundle(): GroupLearningBundle {
    if (!source) throw new Error("集团学习来源尚未就绪");
    return { bundleVersion: "1.0.0", sourcePackage: source.packageValue, sourceVerification: source.sourceVerification, evidenceChain: source.evidenceChain, card: source.card, workerContributions: source.workerContributions, reviewAudit: activeReviewAudit, pilotChecklistItem: checklist, generatedAt: new Date().toISOString(), syntheticDemo: true };
  }
  function verifiedBundle(): GroupLearningBundle {
    const bundle = buildBundle();
    const verification = verifyGroupLearningBundle(bundle, source!.memory);
    if (!verification.valid) throw new Error(`经验回流成果验证失败：${verification.checks.filter((item) => !item.passed).map((item) => item.message).join("；")}`);
    return bundle;
  }
  function submitReview() {
    if (!source) return;
    try {
      const previous = activeReviewAudit.at(-1);
      const needsResubmission = replay?.state === "RETURNED_FOR_EVIDENCE" || replay?.state === "HELD_WITHOUT_ADOPTION";
      const decidedAt = new Date().toISOString();
      const next = appendGroupReviewDecision(source.card, activeReviewAudit, {
        decisionId: `GRD-${source.card.cardId}-${String(activeReviewAudit.length + 1).padStart(2, "0")}`,
        cardId: source.card.cardId,
        decisionType,
        reviewerId,
        reviewComment: comment,
        decidedAt,
        evidenceRefs: [source.packageValue.eventId, source.packageValue.eventMemoryPatch.patchId],
        reviewRound: previous?.reviewRound ? previous.reviewRound + (needsResubmission ? 1 : 0) : 1,
        resubmission: needsResubmission ? {
          resubmissionId: `GRS-${source.card.cardId}-${String(activeReviewAudit.length + 1).padStart(2, "0")}`,
          submittedBy: reviewerId,
          submittedAt: new Date(Math.max(Date.now() - 1000, Date.parse(previous!.decidedAt) + 1)).toISOString(),
          revisionReason: resubmissionReason,
          newEvidence: [{ evidenceId: supplementId, summary: supplementSummary, provenance: "集团人工评审脱敏演示补证", syntheticDemo: true }]
        } : undefined
      });
      setReviewAudit(next);
      setNotice(decisionType === "APPROVE_AS_PILOT_CHECK" ? "人工评审已追加，系统据此生成PILOT_ONLY试点检查项。" : `${decisionLabels[decisionType]}决定已追加，未生成试点检查项。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "评审决定被拒绝"); }
  }
  function resetReview() {
    if (!window.confirm("仅清除本标签页的集团人工评审记录，是否继续？")) return;
    sessionStorage.removeItem(SESSION_KEY);
    setReviewAudit([]);
    setNotice("本标签页评审状态已重置，来源事件与经验卡未改变。");
  }
  function download(kind: "card" | "contribution" | "audit" | "checklist" | "bundle") {
    try {
      const bundle = verifiedBundle();
      if (kind === "card") downloadText(`${bundle.card.cardId}.json`, JSON.stringify(bundle.card, null, 2));
      if (kind === "contribution") downloadText(`${bundle.card.cardId}.worker-contributions.json`, JSON.stringify(bundle.workerContributions, null, 2));
      if (kind === "audit") downloadText(`${bundle.card.cardId}.review-audit.jsonl`, bundle.reviewAudit.map((item) => JSON.stringify(item)).join("\n"), "application/x-ndjson");
      if (kind === "checklist") {
        if (!bundle.pilotChecklistItem) throw new Error("人工批准前不能生成试点检查项");
        downloadText(`${bundle.pilotChecklistItem.checklistItemId}.json`, JSON.stringify(bundle.pilotChecklistItem, null, 2));
      }
      if (kind === "bundle") downloadText(`${bundle.card.cardId}.group-learning-bundle.json`, JSON.stringify(bundle, null, 2));
      setNotice("下载前验证已通过：来源事件、经验卡引用、评审哈希链与试点状态一致。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "下载验证失败"); }
  }

  if (sourceError) return <main className="group-learning-workbench"><div className="group-learning-failure"><AlertTriangle size={24} /><h1>经验回流来源验证失败</h1><p>{sourceError}</p><small>不会回退到预设集团建议。原集团引导演示仍可使用。</small></div></main>;
  if (!source) return <main className="group-learning-workbench"><div className="group-learning-loading"><LoaderCircle className="spin" size={24} /><strong>正在验证阶段4B事件成果包</strong><span>校验审计链、重放、维修后观察与建筑记忆引用</span></div></main>;

  const card = source.card;
  const reviewState = replay?.state ?? card.initialReviewState;
  const needsResubmission = reviewState === "RETURNED_FOR_EVIDENCE" || reviewState === "HELD_WITHOUT_ADOPTION";
  return <main className={`group-learning-workbench ${compact ? "task-mode" : "advanced-mode"} ${detailsOpen ? "details-open" : ""}`}>
    <header className="group-learning-header">
      <div><small>BUILDING LIFE FEEDBACK</small><h1>建筑生命经验回流</h1><p>{card.location.building.displayName} / {card.location.storey.displayName} / {card.location.unit.displayName} / {card.location.space.displayName}</p></div>
      <div className="group-source-status"><ShieldCheck size={18} /><span><strong>来源事件已验证</strong><small>{source.packageValue.eventId} · {source.packageValue.finalState}</small></span></div>
      {compact ? <button className="group-detail-toggle" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? "收起验证详情" : "查看验证详情"}</button> : null}
      <button className="group-reset" onClick={resetReview}><RotateCcw size={14} />重置本标签页评审</button>
    </header>
    {notice ? <div className="group-learning-notice" role="status"><AlertTriangle size={15} /><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></div> : null}
    <div className="group-learning-grid">
      <section className="group-learning-main">
        <section className="source-proof" aria-labelledby="source-proof-title">
          <header><div><span>01 / 来源事件</span><h2 id="source-proof-title">一个真实执行过的演示闭环</h2></div><em>{source.sourceVerification.checks.length}/{source.sourceVerification.checks.length} CHECKS</em></header>
          <div className="source-proof-metrics"><div><small>事件最终状态</small><strong>RESOLVED</strong></div><div><small>维修目标</small><strong>{card.targetComponent.businessId}</strong></div><div><small>审计根哈希</small><code>{card.eventAuditRootHash.slice(0, 14)}</code></div></div>
          <details><summary>查看来源验证明细 <ArrowRight size={13} /></summary><div>{source.sourceVerification.checks.map((item) => <p key={item.id}><Check size={12} />{item.id}<span>{item.message}</span></p>)}</div></details>
        </section>
        <section className="group-evidence-chain" aria-labelledby="evidence-chain-title">
          <header><span>02 / 证据链</span><h2 id="evidence-chain-title">从施工记录到事件记忆补丁</h2></header>
          <div>{source.evidenceChain.map((stage, index) => <article key={stage.stageId}><i>{String(index + 1).padStart(2, "0")}</i><div><small>{new Date(stage.occurredAt).toLocaleString("zh-CN", { hour12: false })}</small><h3>{stage.label}</h3><p>{stage.summary}</p><details><summary>引用 {stage.referenceIds.length} 项</summary><code>{stage.referenceIds.join(" · ")}</code></details></div>{index < source.evidenceChain.length - 1 ? <ArrowRight size={14} /> : null}</article>)}</div>
        </section>
        <article className="group-learning-card" aria-labelledby="learning-card-title">
          <header><div><span>03 / 经验建议卡</span><h2 id="learning-card-title">{card.experienceLabel}</h2></div><em>{card.experienceLevel}</em></header>
          <div className="card-boundary"><span>来源事件 {card.sourceEventCount}</span><strong>只形成试点假设，不自动升级标准</strong></div>
          <div className="learning-card-body"><section><small>实际闭环</small><h3>{card.targetComponent.displayName}</h3><dl><div><dt>第一候选</dt><dd>{card.firstDiagnosis.hypothesis}</dd></div><div><dt>实际维修</dt><dd>{card.actualRepair.method}</dd></div><div><dt>维修后复验</dt><dd>{card.postRepairVerification.map((item) => `${item.metric} ${item.value}${item.unit}`).join(" / ")}</dd></div><div><dt>工友证据</dt><dd>{card.workerRecordIds.length}项被实际引用</dd></div></dl><p>{card.firstDiagnosis.scoreDisclaimer}</p></section><section><small>建议检查项</small><ol>{card.recommendedChecks.map((item) => <li key={item}>{item}</li>)}</ol></section></div>
          <details className="card-source-vault"><summary>查看构件与来源身份 <ArrowRight size={13} /></summary><dl><div><dt>空间</dt><dd>{card.location.space.businessId}</dd></div><div><dt>构件</dt><dd>{card.targetComponent.businessId} / {card.targetComponent.ifcClass}</dd></div><div><dt>GlobalId</dt><dd>{card.targetComponent.ifcGlobalId}</dd></div><div><dt>event-memory-patch</dt><dd>{source.packageValue.eventMemoryPatch.patchId}</dd></div><div><dt>规则 / 记忆</dt><dd>{card.ruleVersion} / {card.buildingMemoryVersion}</dd></div></dl></details>
        </article>
        <section className="known-unknown-grid"><article><header><Check size={15} /><span>系统知道什么</span></header>{card.knownFacts.map((item) => <p key={item}>{item}</p>)}</article><article><header><AlertTriangle size={15} /><span>尚未证明什么</span></header>{card.unprovenClaims.map((item) => <p key={item}>{item}</p>)}</article></section>
        <section className="worker-contribution" aria-labelledby="worker-contribution-title"><header><div><span>04 / 工友证据贡献</span><h2 id="worker-contribution-title">施工记录在入住后继续发挥作用</h2></div><em>{source.workerContributions.length} RECORDS</em></header>{source.workerContributions.map((item) => <article key={item.contributionId}><FileCheck2 size={18} /><div><h3>{item.constructionProcess}</h3><code>{item.evidenceId}</code><p>{item.locatingContribution}</p><small>后续使用：{item.usedBy.map((use) => use.useType).join(" / ")}</small></div><span>贡献留痕<br />不作责任认定</span></article>)}</section>
      </section>
      <aside className="group-governance">
        <header><span>05 / 人工治理</span><h2>{reviewStateLabels[reviewState]}</h2><p>系统只能生成有边界的建议，不能替集团人员采纳。</p></header>
        <div className="review-choice" role="group" aria-label="人工评审选择">{(Object.keys(decisionLabels) as GroupReviewDecisionType[]).map((item) => <button key={item} className={decisionType === item ? "active" : ""} onClick={() => setDecisionType(item)}>{decisionLabels[item]}</button>)}</div>
        <label><span>演示评审人</span><input value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} /></label>
        <label><span>评审意见</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        {needsResubmission ? <section className="group-resubmission"><strong>补证后重新提交 · 第 {(activeReviewAudit.at(-1)?.reviewRound ?? 1) + 1} 轮</strong><p>上一轮决定不能直接改为采纳。请记录新增证据与重新提交原因。</p><label><span>新增证据ID</span><input value={supplementId} onChange={(event) => setSupplementId(event.target.value)} /></label><label><span>证据摘要</span><textarea value={supplementSummary} onChange={(event) => setSupplementSummary(event.target.value)} /></label><label><span>重新提交原因</span><textarea value={resubmissionReason} onChange={(event) => setResubmissionReason(event.target.value)} /></label></section> : null}
        <button className="group-review-submit" disabled={reviewState === "APPROVED_AS_PILOT" || !reviewerId.trim() || !comment.trim() || (needsResubmission && (!supplementId.trim() || !supplementSummary.trim() || !resubmissionReason.trim()))} onClick={submitReview}><UserCheck size={16} />{needsResubmission ? "补证并提交新一轮评审" : "提交人工评审"}</button>
        <p className="governance-boundary">采纳后只生成 <strong>PILOT_ONLY</strong> 检查项，不是企业标准。</p>
        {checklist ? <section className="pilot-checklist" aria-labelledby="pilot-title"><header><ClipboardCheck size={18} /><div><small>PILOT_ONLY</small><h3 id="pilot-title">下一批MiC卫生间试点检查项</h3></div></header><dl><div><dt>目标类型</dt><dd>{checklist.targetComponentType}</dd></div><div><dt>适用空间</dt><dd>{checklist.applicableSpaces.join(" / ")}</dd></div><div><dt>评审人</dt><dd>{checklist.reviewerId}</dd></div></dl><ol>{checklist.inspectionProcess.map((item) => <li key={item}>{item}</li>)}</ol><p>{checklist.disclaimer}</p></section> : null}
        {decisionTask ? <section className={`group-decision-task ${decisionTask.type.toLowerCase()}`} aria-labelledby="group-decision-task-title"><header><ClipboardCheck size={17} /><div><small>人工决定后的任务</small><h3 id="group-decision-task-title">{decisionTask.title}</h3></div><em>{decisionTask.governanceStatus} · {decisionTask.status}</em></header><dl><div><dt>负责人</dt><dd>{decisionTask.owner}</dd></div><div><dt>范围</dt><dd>{decisionTask.scope}</dd></div><div><dt>样本</dt><dd>{decisionTask.sample}</dd></div><div><dt>时间</dt><dd>{decisionTask.dueAt}</dd></div></dl><strong>完成标准 / 补证要求</strong><ul>{[...decisionTask.successCriteria, ...decisionTask.requiredEvidence].map((item) => <li key={item}>{item}</li>)}</ul><p>{decisionTask.reason}</p>{decisionTask.reopenCondition ? <footer>重新开启条件：{decisionTask.reopenCondition}</footer> : null}</section> : null}
        <section className="group-review-audit"><header><History size={15} /><span>评审审计</span><small>演示级哈希链，不是数字签名</small></header>{activeReviewAudit.length ? activeReviewAudit.map((item) => <article key={item.sequence}><i>{String(item.sequence).padStart(2, "0")}</i><div><strong>第{item.reviewRound}轮 · {decisionLabels[item.decisionType]}</strong><p>{item.reviewComment}</p>{item.resubmission ? <small>补证 {item.resubmission.newEvidence.map((evidence) => evidence.evidenceId).join(" / ")} · {item.resubmission.revisionReason}</small> : null}<small>{item.reviewerId} · {new Date(item.decidedAt).toLocaleString("zh-CN", { hour12: false })}</small><code>{item.entryHash.slice(0, 12)}</code></div></article>) : <p>尚无人工评审记录。</p>}</section>
        <section className="group-downloads"><header><Download size={15} /><span>可带走成果</span></header><div><button onClick={() => download("card")}>经验卡 JSON</button><button onClick={() => download("contribution")}>工友贡献 JSON</button><button disabled={!activeReviewAudit.length} onClick={() => download("audit")}>评审审计 JSONL</button><button disabled={!checklist} onClick={() => download("checklist")}>试点检查项 JSON</button><button onClick={() => download("bundle")}>完整经验回流包</button><button onClick={() => window.print()}><FileText size={13} />打印中文报告</button></div><p>下载前重新验证来源事件、引用完整性、人工评审重放与试点状态。</p></section>
      </aside>
    </div>
    <PrintableGroupLearningReport source={source} reviewAudit={activeReviewAudit} checklist={checklist} />
  </main>;
}

function PrintableGroupLearningReport({ source, reviewAudit, checklist }: { source: LoadedSource; reviewAudit: GroupReviewAuditEntry[]; checklist: ReturnType<typeof createPilotChecklistItem> }) {
  const replay = replayGroupReview(source.card, reviewAudit);
  return <article className="group-learning-print-report"><header><span>筑生 / 建筑生命经验回流</span><h1>1602卫生间单事件经验回流报告</h1><p>脱敏合成演示项目。当前只有一个完整事件，输出是单事件待验证经验；试点检查项不是企业标准。</p></header><section><h2>来源事件</h2><dl><div><dt>事件ID</dt><dd>{source.packageValue.eventId}</dd></div><div><dt>最终状态</dt><dd>{source.packageValue.finalState}</dd></div><div><dt>空间</dt><dd>{source.card.location.space.displayName} / {source.card.location.space.businessId}</dd></div><div><dt>审计根哈希</dt><dd>{source.card.eventAuditRootHash}</dd></div></dl></section><section><h2>单事件待验证经验</h2><p>维修目标：{source.card.targetComponent.displayName}（{source.card.targetComponent.businessId}）</p><p>维修方式：{source.card.actualRepair.method}。维修后观察：{source.card.postRepairVerification.map((item) => `${item.metric} ${item.value}${item.unit}`).join("，")}。</p><ol>{source.card.recommendedChecks.map((item) => <li key={item}>{item}</li>)}</ol></section><section><h2>工友证据贡献</h2>{source.workerContributions.map((item) => <p key={item.evidenceId}>{item.evidenceId}：{item.locatingContribution}</p>)}<p>贡献仅用于证明记录的后续使用，不进行责任认定、处罚或绩效评价。</p></section><section><h2>人工治理</h2><p>当前评审状态：{reviewStateLabels[replay.state]}。</p>{checklist ? <><p>已由 {checklist.reviewerId} 采纳为PILOT_ONLY试点检查项。</p><ol>{checklist.inspectionProcess.map((item) => <li key={item}>{item}</li>)}</ol></> : <p>尚未生成试点检查项。</p>}</section><section><h2>边界</h2>{source.card.unprovenClaims.map((item) => <p key={item}>{item}</p>)}</section><footer>规则 {source.card.ruleVersion} · 建筑记忆 {source.card.buildingMemoryVersion} · 评审根哈希 {replay.rootHash}</footer></article>;
}
