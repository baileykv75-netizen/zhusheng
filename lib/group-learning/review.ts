import { hashPayload } from "../life-event-engine/canonical.ts";
import { derivePilotGuidance } from "./rules.ts";
import type { GroupLearningCard, GroupReviewAuditEntry, GroupReviewDecisionInput, GroupReviewReplay, GroupReviewResubmission, GroupReviewState, PilotQualityChecklistItem } from "./types.ts";

export const GROUP_REVIEW_GENESIS_HASH = hashPayload("ZHUSHENG_GROUP_REVIEW_GENESIS_V1");

const nextStateByDecision = {
  APPROVE_AS_PILOT_CHECK: "APPROVED_AS_PILOT",
  RETURN_FOR_EVIDENCE: "RETURNED_FOR_EVIDENCE",
  HOLD_WITHOUT_ADOPTION: "HELD_WITHOUT_ADOPTION"
} as const;

function transitionAllowed(previous: GroupReviewState, next: GroupReviewState): boolean {
  if (previous === "APPROVED_AS_PILOT") return false;
  return ["APPROVED_AS_PILOT", "RETURNED_FOR_EVIDENCE", "HELD_WITHOUT_ADOPTION"].includes(next);
}

function validateResubmission(value: GroupReviewResubmission, previous: GroupReviewAuditEntry, decidedAt: string): void {
  if (!value.resubmissionId.trim() || !value.submittedBy.trim()) throw new Error("补证重新提交必须记录提交人与提交ID");
  if (!value.revisionReason.trim()) throw new Error("补证重新提交必须说明原因");
  if (!Number.isFinite(Date.parse(value.submittedAt))) throw new Error("补证重新提交时间无效");
  if (Date.parse(value.submittedAt) <= Date.parse(previous.decidedAt)) throw new Error("补证重新提交必须发生在上一轮评审之后");
  if (Date.parse(value.submittedAt) > Date.parse(decidedAt)) throw new Error("补证重新提交不能晚于新一轮评审");
  if (!value.newEvidence.length) throw new Error("退回或暂不采纳后必须补充新证据才能重新评审");
  const ids = new Set<string>();
  for (const evidence of value.newEvidence) {
    if (!evidence.evidenceId.trim() || !evidence.summary.trim() || !evidence.provenance.trim() || evidence.syntheticDemo !== true) {
      throw new Error("补充证据必须包含ID、摘要、来源和脱敏演示标识");
    }
    if (ids.has(evidence.evidenceId)) throw new Error(`补充证据ID重复 ${evidence.evidenceId}`);
    ids.add(evidence.evidenceId);
  }
}

export function hashReviewEntry(value: Omit<GroupReviewAuditEntry, "entryHash">): string {
  return hashPayload(value);
}

export function appendGroupReviewDecision(
  card: GroupLearningCard,
  log: readonly GroupReviewAuditEntry[],
  input: GroupReviewDecisionInput
): GroupReviewAuditEntry[] {
  verifyGroupReviewAudit(card, log);
  if (input.cardId !== card.cardId) throw new Error("评审决定不能跨经验卡复用");
  if (!input.reviewerId.trim() || ["SYSTEM", "AGENT", "AI"].includes(input.reviewerId.trim().toUpperCase())) throw new Error("集团建议必须由明确的人工评审人决定");
  if (!input.reviewComment.trim()) throw new Error("人工评审意见不能为空");
  if (!Number.isFinite(Date.parse(input.decidedAt))) throw new Error("评审时间无效");
  for (const reference of input.evidenceRefs) if (!card.sourceReferenceIds.includes(reference)) throw new Error(`评审引用不存在来源 ${reference}`);
  const duplicate = log.find((item) => item.decisionId === input.decisionId);
  const replay = replayGroupReview(card, log);
  const previousDecision = replay.lastDecision;
  const isNewRound = replay.state === "RETURNED_FOR_EVIDENCE" || replay.state === "HELD_WITHOUT_ADOPTION";
  const reviewRound = input.reviewRound ?? duplicate?.reviewRound ?? (isNewRound ? 0 : 1);
  const resubmission = input.resubmission ?? duplicate?.resubmission ?? null;
  const normalized = { ...input, reviewRound, resubmission };
  if (duplicate) {
    const expected = { ...duplicate };
    delete (expected as Partial<GroupReviewAuditEntry>).sequence;
    delete (expected as Partial<GroupReviewAuditEntry>).actorType;
    delete (expected as Partial<GroupReviewAuditEntry>).previousState;
    delete (expected as Partial<GroupReviewAuditEntry>).nextState;
    delete (expected as Partial<GroupReviewAuditEntry>).previousHash;
    delete (expected as Partial<GroupReviewAuditEntry>).entryHash;
    if (hashPayload(expected) === hashPayload(normalized)) return [...log];
    throw new Error(`人工评审决定 ${input.decisionId} 不可覆盖，只能追加新决定`);
  }
  if (!Number.isInteger(reviewRound) || reviewRound < 1) throw new Error("评审轮次无效");
  if (isNewRound) {
    if (!previousDecision || reviewRound !== previousDecision.reviewRound + 1) throw new Error("退回或暂不采纳后必须进入新的评审轮次");
    if (!resubmission) throw new Error("退回或暂不采纳后必须先补证并重新提交");
    validateResubmission(resubmission, previousDecision, input.decidedAt);
  } else if (resubmission) {
    throw new Error("首轮评审不能伪装成补证重新提交");
  }
  const nextState = nextStateByDecision[input.decisionType];
  if (!transitionAllowed(replay.state, nextState)) throw new Error(`禁止从 ${replay.state} 追加评审决定 ${input.decisionType}`);
  const base: Omit<GroupReviewAuditEntry, "entryHash"> = {
    ...normalized,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    sequence: log.length + 1,
    actorType: "GROUP_REVIEWER",
    previousState: replay.state,
    nextState,
    previousHash: log.at(-1)?.entryHash ?? GROUP_REVIEW_GENESIS_HASH
  };
  return [...log, Object.freeze({ ...base, entryHash: hashReviewEntry(base) })];
}

export function verifyGroupReviewAudit(card: GroupLearningCard, log: readonly GroupReviewAuditEntry[]): void {
  let state: GroupReviewState = card.initialReviewState;
  let previousHash = GROUP_REVIEW_GENESIS_HASH;
  const ids = new Set<string>();
  const resubmissionIds = new Set<string>();
  for (let index = 0; index < log.length; index += 1) {
    const item = log[index];
    if (item.sequence !== index + 1) throw new Error(`评审审计sequence不连续：${item.sequence}`);
    if (item.cardId !== card.cardId) throw new Error("评审审计引用了其他经验卡");
    if (ids.has(item.decisionId)) throw new Error(`评审决定ID重复 ${item.decisionId}`);
    ids.add(item.decisionId);
    if (item.previousHash !== previousHash) throw new Error(`评审审计前序哈希错误：${item.sequence}`);
    if (item.previousState !== state || !transitionAllowed(state, item.nextState)) throw new Error(`评审状态转换非法：${state} -> ${item.nextState}`);
    const previous = index > 0 ? log[index - 1] : null;
    const requiresResubmission = state === "RETURNED_FOR_EVIDENCE" || state === "HELD_WITHOUT_ADOPTION";
    if (!previous && (item.reviewRound !== 1 || item.resubmission !== null)) throw new Error("首轮评审轮次或补证记录无效");
    if (requiresResubmission) {
      if (!previous || item.reviewRound !== previous.reviewRound + 1 || !item.resubmission) throw new Error("评审缺少补证、重新提交或新轮次");
      validateResubmission(item.resubmission, previous, item.decidedAt);
      if (resubmissionIds.has(item.resubmission.resubmissionId)) throw new Error(`补证重新提交ID重复 ${item.resubmission.resubmissionId}`);
      resubmissionIds.add(item.resubmission.resubmissionId);
    } else if (index > 0 && item.reviewRound !== previous!.reviewRound) {
      throw new Error("未发生补证重新提交时不能改变评审轮次");
    }
    const { entryHash, ...base } = item;
    if (hashReviewEntry(base) !== entryHash) throw new Error(`评审审计内容或哈希被修改：${item.sequence}`);
    if (nextStateByDecision[item.decisionType] !== item.nextState) throw new Error(`评审决定与状态不一致：${item.decisionId}`);
    for (const reference of item.evidenceRefs) if (!card.sourceReferenceIds.includes(reference)) throw new Error(`评审审计引用不存在来源 ${reference}`);
    state = item.nextState;
    previousHash = item.entryHash;
  }
}

export function replayGroupReview(card: GroupLearningCard, log: readonly GroupReviewAuditEntry[]): GroupReviewReplay {
  verifyGroupReviewAudit(card, log);
  return { state: log.at(-1)?.nextState ?? card.initialReviewState, lastDecision: log.at(-1) ?? null, rootHash: log.at(-1)?.entryHash ?? GROUP_REVIEW_GENESIS_HASH };
}

export function createPilotChecklistItem(card: GroupLearningCard, log: readonly GroupReviewAuditEntry[]): PilotQualityChecklistItem | null {
  const replay = replayGroupReview(card, log);
  const decision = replay.lastDecision;
  if (replay.state !== "APPROVED_AS_PILOT" || !decision || decision.decisionType !== "APPROVE_AS_PILOT_CHECK") return null;
  const guidance = derivePilotGuidance(card.targetComponent.ifcClass, card.actualRepair.method);
  const draft: Omit<PilotQualityChecklistItem, "contentHash"> = {
    checklistItemId: `PILOT-${card.cardId}-${decision.decisionId}`,
    sourceCardId: card.cardId,
    sourceEventIds: card.sourceEventIds,
    applicableProjectTypes: ["下一批MiC住宅试点项目"],
    applicableSpaces: ["MiC卫生间模块", card.location.space.businessId],
    targetComponentType: guidance.targetComponentType,
    targetBusinessId: card.targetComponent.businessId,
    inspectionProcess: guidance.inspectionProcess,
    requiredEvidence: guidance.requiredEvidence,
    passConditions: guidance.passConditions,
    failureHandling: guidance.failureHandling,
    status: "PILOT_ONLY",
    reviewerId: decision.reviewerId,
    reviewedAt: decision.decidedAt,
    reviewDecisionId: decision.decisionId,
    syntheticDemo: true,
    disclaimer: "脱敏合成演示试点检查项。仅用于下一批项目试点验证，不是企业标准。"
  };
  return { ...draft, contentHash: hashPayload(draft) };
}
