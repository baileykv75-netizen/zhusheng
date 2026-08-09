import { hashPayload } from "../life-event-engine/canonical.ts";
import type { BuildingMemory } from "../life-event-engine/types.ts";
import { createGroupLearningCard, createWorkerContributions } from "./generator.ts";
import { createPilotChecklistItem, replayGroupReview, verifyGroupReviewAudit } from "./review.ts";
import { verifyGroupLearningSource } from "./source-validator.ts";
import type { GroupBundleVerification, GroupLearningBundle } from "./types.ts";

export function verifyGroupLearningBundle(bundle: GroupLearningBundle, memory: BuildingMemory): GroupBundleVerification {
  const checks: GroupBundleVerification["checks"] = [];
  const check = (id: string, operation: () => void) => {
    try { operation(); checks.push({ id, passed: true, message: "通过" }); }
    catch (error) { checks.push({ id, passed: false, message: error instanceof Error ? error.message : String(error) }); }
  };
  const source = verifyGroupLearningSource(bundle.sourcePackage, memory, bundle.generatedAt);
  check("SOURCE_EVENT", () => { if (!source.valid) throw new Error(source.checks.filter((item) => !item.passed).map((item) => item.message).join("；")); });
  check("CARD_INTEGRITY", () => {
    const expected = createGroupLearningCard(bundle.sourcePackage, memory);
    if (hashPayload(expected) !== hashPayload(bundle.card)) throw new Error("经验卡内容、引用或哈希不一致");
  });
  check("WORKER_CONTRIBUTIONS", () => {
    const expected = createWorkerContributions(bundle.sourcePackage, memory);
    if (hashPayload(expected) !== hashPayload(bundle.workerContributions)) throw new Error("工友证据贡献记录与来源事件不一致");
    if (bundle.workerContributions.some((item) => item.responsibilityInference !== "PROHIBITED")) throw new Error("证据贡献不得自动转化为责任认定");
  });
  check("REVIEW_AUDIT", () => { verifyGroupReviewAudit(bundle.card, bundle.reviewAudit); });
  check("PILOT_CONSISTENCY", () => {
    const expected = createPilotChecklistItem(bundle.card, bundle.reviewAudit);
    if (hashPayload(expected) !== hashPayload(bundle.pilotChecklistItem)) throw new Error("试点检查项与人工评审决定不一致");
    if (bundle.pilotChecklistItem?.status !== "PILOT_ONLY") throw new Error("检查项不得越级成为企业标准");
  });
  const replay = (() => { try { return replayGroupReview(bundle.card, bundle.reviewAudit); } catch { return { state: bundle.card.initialReviewState, rootHash: "" }; } })();
  return { valid: checks.every((item) => item.passed), checks, reviewState: replay.state, reviewRootHash: replay.rootHash };
}
