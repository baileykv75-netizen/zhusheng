import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  appendGroupReviewDecision,
  createGroupLearningCard,
  createPilotChecklistItem,
  derivePilotGuidance,
  replayGroupReview,
  verifyGroupLearningBundle,
  verifyGroupLearningSource,
  verifyGroupReviewAudit,
  type GroupLearningBundle,
  type GroupReviewAuditEntry,
  type GroupReviewDecisionInput,
  type GroupReviewDecisionType
} from "../lib/group-learning/index.ts";
import { loadDefaultGroupLearningSource } from "../lib/group-learning/adapters/node/index.ts";

const source = () => loadDefaultGroupLearningSource();
const decidedAt = "2026-07-29T11:00:00.000Z";

function decision(cardId: string, decisionType: GroupReviewDecisionType, index = 1): GroupReviewDecisionInput {
  return {
    decisionId: `GRD-TEST-${index}`,
    cardId,
    decisionType,
    reviewerId: "GROUP-REVIEWER-TEST-01",
    reviewComment: "仅作为下一批MiC卫生间试点检查项验证，不升级为企业标准。",
    decidedAt: new Date(Date.parse(decidedAt) + index * 1000).toISOString(),
    evidenceRefs: ["EVT-1602-LAB-001", "PATCH-EVT-1602-LAB-001-16"]
  };
}

function approvedLog(): { card: ReturnType<typeof source>["card"]; log: GroupReviewAuditEntry[] } {
  const { card } = source();
  return { card, log: appendGroupReviewDecision(card, [], decision(card.cardId, "APPROVE_AS_PILOT_CHECK")) };
}

function bundle(log: GroupReviewAuditEntry[] = []): GroupLearningBundle {
  const value = source();
  return {
    bundleVersion: "1.0.0",
    sourcePackage: value.packageValue,
    sourceVerification: value.sourceVerification,
    evidenceChain: value.evidenceChain,
    card: value.card,
    workerContributions: value.workerContributions,
    reviewAudit: log,
    pilotChecklistItem: createPilotChecklistItem(value.card, log),
    generatedAt: decidedAt,
    syntheticDemo: true
  };
}

test("verified RESOLVED package creates a single-case learning card", () => {
  const value = source();
  assert.equal(value.sourceVerification.valid, true);
  assert.equal(value.card.sourceEventCount, 1);
  assert.equal(value.card.experienceLevel, "SINGLE_CASE_HYPOTHESIS");
  assert.equal(value.card.experienceLabel, "单事件待验证经验");
});

test("REOPENED or incomplete event is rejected as a resolved group source", () => {
  const value = source();
  const changed = structuredClone(value.packageValue);
  changed.finalState = "REOPENED";
  assert.equal(verifyGroupLearningSource(changed, value.memory, decidedAt).valid, false);
});

test("tampered package payload is rejected", () => {
  const value = source();
  const changed = structuredClone(value.packageValue);
  changed.repairRecords[0].method = "JOINT_RETIGHTEN";
  assert.equal(verifyGroupLearningSource(changed, value.memory, decidedAt).valid, false);
});

test("deleted or reordered event audit entries are rejected", () => {
  const value = source();
  const deleted = structuredClone(value.packageValue);
  deleted.eventArtifact.auditLog.splice(3, 1);
  assert.equal(verifyGroupLearningSource(deleted, value.memory, decidedAt).valid, false);
  const reordered = structuredClone(value.packageValue);
  [reordered.eventArtifact.auditLog[2], reordered.eventArtifact.auditLog[3]] = [reordered.eventArtifact.auditLog[3], reordered.eventArtifact.auditLog[2]];
  assert.equal(verifyGroupLearningSource(reordered, value.memory, decidedAt).valid, false);
});

test("unknown memory and evidence references are rejected", () => {
  const value = source();
  const changed = structuredClone(value.packageValue);
  changed.eventMemoryPatch.repairedBusinessId = "J-NOT-FOUND";
  changed.eventMemoryPatch.evidenceRefs.push("EVD-NOT-FOUND");
  assert.equal(verifyGroupLearningSource(changed, value.memory, decidedAt).valid, false);
});

test("single event cannot become a group rule or enterprise standard", () => {
  const { card } = source();
  assert.equal(card.initialReviewState, "PENDING_REVIEW");
  assert.equal(card.experienceLevel, "SINGLE_CASE_HYPOTHESIS");
  assert.ok(card.unprovenClaims.some((item) => item.includes("尚未证明属于系统性缺陷或集团规律")));
});

test("recommendations change with component class and repair method", () => {
  const fitting = derivePilotGuidance("IfcPipeFitting", "JOINT_REPLACEMENT");
  const pipe = derivePilotGuidance("IfcPipeSegment", "LOCAL_PIPE_REPLACEMENT");
  assert.notDeepEqual(fitting, pipe);
  assert.match(fitting.requiredEvidence.join(" "), /节点近景/);
  assert.match(pipe.requiredEvidence.join(" "), /替换范围/);
});

test("card target and method come from the verified event instead of UI text", () => {
  const value = source();
  const card = createGroupLearningCard(value.packageValue, value.memory);
  assert.equal(card.targetComponent.businessId, value.packageValue.eventMemoryPatch.repairedBusinessId);
  assert.equal(card.actualRepair.method, value.packageValue.repairRecords.at(-1)?.method);
});

test("worker contributions only include actually used worker construction evidence", () => {
  const value = source();
  assert.deepEqual(value.workerContributions.map((item) => item.evidenceId), ["EVD-PIPE-LAB-001", "EVD-WP-LAB-001"]);
  for (const item of value.workerContributions) {
    assert.equal(item.usedBy.length, 3);
    assert.ok(value.packageValue.repairTask.evidenceIds.includes(item.evidenceId));
  }
});

test("worker evidence contribution never implies blame or performance ranking", () => {
  const { workerContributions } = source();
  assert.ok(workerContributions.every((item) => item.responsibilityInference === "PROHIBITED"));
  assert.ok(workerContributions.every((item) => item.contributorIdentityStatus === "DEMO_ID_NOT_RECORDED"));
});

test("system cannot auto-approve and no checklist exists before human review", () => {
  const { card } = source();
  assert.equal(replayGroupReview(card, []).state, "PENDING_REVIEW");
  assert.equal(createPilotChecklistItem(card, []), null);
  assert.throws(() => appendGroupReviewDecision(card, [], { ...decision(card.cardId, "APPROVE_AS_PILOT_CHECK"), reviewerId: "SYSTEM" }), /人工评审人/);
});

test("return for evidence cannot create a pilot checklist", () => {
  const { card } = source();
  const log = appendGroupReviewDecision(card, [], decision(card.cardId, "RETURN_FOR_EVIDENCE"));
  assert.equal(replayGroupReview(card, log).state, "RETURNED_FOR_EVIDENCE");
  assert.equal(createPilotChecklistItem(card, log), null);
});

test("hold without adoption cannot create a pilot checklist", () => {
  const { card } = source();
  const log = appendGroupReviewDecision(card, [], decision(card.cardId, "HOLD_WITHOUT_ADOPTION"));
  assert.equal(replayGroupReview(card, log).state, "HELD_WITHOUT_ADOPTION");
  assert.equal(createPilotChecklistItem(card, log), null);
});

test("human approval creates only a PILOT_ONLY checklist item", () => {
  const { card, log } = approvedLog();
  const item = createPilotChecklistItem(card, log);
  assert.equal(replayGroupReview(card, log).state, "APPROVED_AS_PILOT");
  assert.equal(item?.status, "PILOT_ONLY");
  assert.match(item?.disclaimer ?? "", /不是企业标准/);
});

test("approval is bound to its card", () => {
  const { card } = source();
  assert.throws(() => appendGroupReviewDecision(card, [], { ...decision("GLC-OTHER", "APPROVE_AS_PILOT_CHECK"), cardId: "GLC-OTHER" }), /跨经验卡/);
});

test("review decision is idempotent only when content is identical", () => {
  const { card } = source();
  const input = decision(card.cardId, "RETURN_FOR_EVIDENCE");
  const once = appendGroupReviewDecision(card, [], input);
  assert.deepEqual(appendGroupReviewDecision(card, once, input), once);
  assert.throws(() => appendGroupReviewDecision(card, once, { ...input, reviewComment: "尝试覆盖" }), /不可覆盖/);
});

test("returned or held card cannot be approved without evidence resubmission and a new round", () => {
  const { card } = source();
  const returned = appendGroupReviewDecision(card, [], decision(card.cardId, "RETURN_FOR_EVIDENCE", 1));
  assert.throws(() => appendGroupReviewDecision(card, returned, decision(card.cardId, "APPROVE_AS_PILOT_CHECK", 2)), /补证|评审轮次/);
  const second = decision(card.cardId, "APPROVE_AS_PILOT_CHECK", 2);
  const approved = appendGroupReviewDecision(card, returned, {
    ...second,
    reviewRound: 2,
    resubmission: {
      resubmissionId: "GRS-TEST-02",
      submittedBy: "PROJECT-QA-DEMO-01",
      submittedAt: new Date(Date.parse(returned[0].decidedAt) + 500).toISOString(),
      revisionReason: "补充封板前接头近景与复核说明后重新提交。",
      newEvidence: [{ evidenceId: "SUPPLEMENT-JOINT-PHOTO-02", summary: "封板前接头双角度近景", provenance: "脱敏演示补证", syntheticDemo: true }]
    }
  });
  assert.equal(replayGroupReview(card, approved).state, "APPROVED_AS_PILOT");
  assert.equal(approved.length, 2);
  assert.equal(approved[1].reviewRound, 2);
  assert.equal(approved[1].resubmission?.newEvidence.length, 1);
});

test("review audit verifies and replays reviewer, state and root hash", () => {
  const { card, log } = approvedLog();
  verifyGroupReviewAudit(card, log);
  const replay = replayGroupReview(card, log);
  assert.equal(replay.lastDecision?.reviewerId, "GROUP-REVIEWER-TEST-01");
  assert.equal(replay.rootHash, log.at(-1)?.entryHash);
});

test("review audit detects deletion, order change and content tampering", () => {
  const { card } = source();
  const first = appendGroupReviewDecision(card, [], decision(card.cardId, "RETURN_FOR_EVIDENCE", 1));
  const second = decision(card.cardId, "HOLD_WITHOUT_ADOPTION", 2);
  const log = appendGroupReviewDecision(card, first, {
    ...second,
    reviewRound: 2,
    resubmission: {
      resubmissionId: "GRS-AUDIT-02", submittedBy: "PROJECT-QA-DEMO-01",
      submittedAt: new Date(Date.parse(first[0].decidedAt) + 500).toISOString(), revisionReason: "补证后重新提交",
      newEvidence: [{ evidenceId: "SUPPLEMENT-AUDIT-02", summary: "补充复核记录", provenance: "脱敏演示补证", syntheticDemo: true }]
    }
  });
  assert.throws(() => verifyGroupReviewAudit(card, log.slice(1)), /sequence|前序哈希|状态转换/);
  assert.throws(() => verifyGroupReviewAudit(card, [log[1], log[0]]), /sequence|前序哈希/);
  for (const field of ["reviewerId", "reviewComment", "entryHash"] as const) {
    const changed = structuredClone(log);
    (changed[0] as unknown as Record<string, string>)[field] = "TAMPERED";
    assert.throws(() => verifyGroupReviewAudit(card, changed), /修改|哈希/);
  }
});

test("verified downloadable bundle keeps source, card, contribution and pilot references complete", () => {
  const value = source();
  const { log } = approvedLog();
  const verification = verifyGroupLearningBundle(bundle(log), value.memory);
  assert.equal(verification.valid, true);
  assert.equal(verification.reviewState, "APPROVED_AS_PILOT");
});

test("tampered group card or pilot checklist makes bundle invalid", () => {
  const value = source();
  const { log } = approvedLog();
  const changedCard = bundle(log);
  changedCard.card.recommendedChecks[0] = "加强质量管理";
  assert.equal(verifyGroupLearningBundle(changedCard, value.memory).valid, false);
  const changedPilot = bundle(log);
  changedPilot.pilotChecklistItem!.status = "PILOT_ONLY";
  changedPilot.pilotChecklistItem!.reviewerId = "TAMPERED";
  assert.equal(verifyGroupLearningBundle(changedPilot, value.memory).valid, false);
});

test("browser group-learning dependency graph contains no node fs or node crypto", () => {
  const browser = readFileSync("lib/group-learning/adapters/browser/index.ts", "utf8");
  const imports = readFileSync("components/group-learning/GroupLearningWorkbench.tsx", "utf8");
  assert.doesNotMatch(browser + imports, /node:fs|node:crypto/);
});

test("public group-learning asset matches the Stage 4B source hash", () => {
  const integrity = JSON.parse(readFileSync("public/assets/group-learning/assets-integrity.json", "utf8"));
  const sourceBytes = readFileSync("artifacts/stage4b/EVT-1602-LAB-001.package.json");
  const publicBytes = readFileSync("public/assets/group-learning/EVT-1602-LAB-001.package.json");
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest(sourceBytes), digest(publicBytes));
  assert.equal(integrity.files["EVT-1602-LAB-001.package.json"].sha256, digest(sourceBytes));
});

test("group UI contains no scenario-name diagnosis branch and preserves stage boundary language", () => {
  const ui = readFileSync(path.join("components", "group-learning", "GroupLearningWorkbench.tsx"), "utf8");
  assert.doesNotMatch(ui, /if\s*\(\s*scenario/);
  assert.match(ui, /单事件待验证经验/);
  assert.match(ui, /不是企业标准/);
});
