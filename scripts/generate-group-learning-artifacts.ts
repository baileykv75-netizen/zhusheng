import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultGroupLearningSource } from "../lib/group-learning/adapters/node/index.ts";
import { appendGroupReviewDecision, createPilotChecklistItem, verifyGroupLearningBundle } from "../lib/group-learning/index.ts";
import type { GroupLearningBundle, GroupReviewDecisionType } from "../lib/group-learning/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts", "stage5");
const args = new Map<string, string>();
const tokens = process.argv.slice(2).filter((item) => item !== "--");
for (let index = 0; index < tokens.length; index += 1) {
  if (tokens[index].startsWith("--") && tokens[index + 1] && !tokens[index + 1].startsWith("--")) {
    args.set(tokens[index], tokens[index + 1]);
    index += 1;
  }
}
const decisionMap: Record<string, GroupReviewDecisionType> = {
  approve: "APPROVE_AS_PILOT_CHECK",
  return: "RETURN_FOR_EVIDENCE",
  hold: "HOLD_WITHOUT_ADOPTION"
};
const decisionType = decisionMap[args.get("--decision") ?? ""];
const reviewerId = args.get("--reviewer")?.trim();
const comment = args.get("--comment")?.trim();
if (!decisionType || !reviewerId || !comment) throw new Error("必须显式提供 --decision approve|return|hold、--reviewer 和 --comment；系统不会自动批准集团建议");

const source = loadDefaultGroupLearningSource();
const reviewAudit = appendGroupReviewDecision(source.card, [], {
  decisionId: `GRD-${source.card.cardId}-EXPORT-01`,
  cardId: source.card.cardId,
  decisionType,
  reviewerId,
  reviewComment: comment,
  decidedAt: args.get("--time") ?? new Date().toISOString(),
  evidenceRefs: [source.packageValue.eventId, source.packageValue.eventMemoryPatch.patchId]
});
const checklist = createPilotChecklistItem(source.card, reviewAudit);
const bundle: GroupLearningBundle = {
  bundleVersion: "1.0.0",
  sourcePackage: source.packageValue,
  sourceVerification: source.sourceVerification,
  evidenceChain: source.evidenceChain,
  card: source.card,
  workerContributions: source.workerContributions,
  reviewAudit,
  pilotChecklistItem: checklist,
  generatedAt: args.get("--time") ?? new Date().toISOString(),
  syntheticDemo: true
};
const verification = verifyGroupLearningBundle(bundle, source.memory);
if (!verification.valid) throw new Error(`阶段5成果验证失败：${verification.checks.filter((item) => !item.passed).map((item) => item.message).join("；")}`);
mkdirSync(output, { recursive: true });
const writeJson = (name: string, value: unknown) => writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
writeJson(`${source.card.cardId}.json`, source.card);
writeJson(`${source.card.cardId}.worker-contributions.json`, source.workerContributions);
writeFileSync(path.join(output, `${source.card.cardId}.review-audit.jsonl`), `${reviewAudit.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
if (checklist) writeJson(`${checklist.checklistItemId}.json`, checklist);
writeJson(`${source.card.cardId}.group-learning-bundle.json`, bundle);
writeJson(`${source.card.cardId}.verification.json`, verification);

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const report = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>1602卫生间单事件经验回流报告</title><style>body{max-width:820px;margin:40px auto;color:#171a1c;font:14px/1.7 Arial,"Microsoft YaHei",sans-serif}header{border-bottom:2px solid #171a1c}section{padding:18px 0;border-bottom:1px solid #ccd0cc}dt{color:#68716d}dd{margin:0;font-family:Consolas,monospace}.grid{display:grid;grid-template-columns:140px 1fr}small{color:#69716d}@media print{body{margin:0}}</style></head><body><header><small>筑生 / 建筑生命经验回流</small><h1>1602卫生间单事件经验回流报告</h1><p>脱敏合成演示项目。当前只有一个完整事件；输出是单事件待验证经验；试点检查项不是企业标准。</p></header><section><h2>来源事件</h2><dl><div class="grid"><dt>事件ID</dt><dd>${escape(source.packageValue.eventId)}</dd></div><div class="grid"><dt>最终状态</dt><dd>${escape(source.packageValue.finalState)}</dd></div><div class="grid"><dt>构件</dt><dd>${escape(source.card.targetComponent.businessId)}</dd></div><div class="grid"><dt>审计根哈希</dt><dd>${escape(source.card.eventAuditRootHash)}</dd></div></dl></section><section><h2>单事件待验证经验</h2><p>维修方式：${escape(source.card.actualRepair.method)}；维修后微流量与湿度复验通过。</p><ol>${source.card.recommendedChecks.map((item) => `<li>${escape(item)}</li>`).join("")}</ol></section><section><h2>工友证据贡献</h2>${source.workerContributions.map((item) => `<p><strong>${escape(item.evidenceId)}</strong>：${escape(item.locatingContribution)}</p>`).join("")}<p>仅作贡献留痕，不进行责任认定。</p></section><section><h2>人工评审</h2><p>${escape(decisionType)} / ${escape(reviewerId)}</p><p>${escape(comment)}</p>${checklist ? `<h3>PILOT_ONLY试点检查项</h3><ol>${checklist.inspectionProcess.map((item) => `<li>${escape(item)}</li>`).join("")}</ol>` : "<p>本次决定未生成试点检查项。</p>"}</section><section><h2>尚未证明</h2>${source.card.unprovenClaims.map((item) => `<p>${escape(item)}</p>`).join("")}</section><footer><small>规则 ${escape(source.card.ruleVersion)} · 记忆 ${escape(source.card.buildingMemoryVersion)} · 评审根哈希 ${escape(verification.reviewRootHash)}</small></footer></body></html>`;
writeFileSync(path.join(output, `${source.card.cardId}.report.html`), report, "utf8");
console.log(`GROUP_LEARNING_EXPORT_OK event=${source.packageValue.eventId} level=${source.card.experienceLevel} review=${verification.reviewState} contributions=${source.workerContributions.length}`);
