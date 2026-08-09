import { hashPayload } from "../life-event-engine/canonical.ts";
import { validateDraftFields } from "./schemas.ts";
import type { DraftFields, DraftRevision, ObservationDraft, ProviderAnalysis } from "./types.ts";

export function defaultDraftFields(): DraftFields {
  return { spaceId: "SPACE-1602-BATHROOM", humidity: null, humidityBaseline: 55, durationMinutes: null, microFlow: null, microFlowBaseline: 0, meterFinding: null, photoFinding: null, photoPresent: null, dataQuality: "GOOD", sourceActor: "RESIDENT" };
}

export function extractDeterministicFields(input: string): Partial<DraftFields> {
  const humidity = input.match(/湿度(?:大约|约|为|是)?\s*(\d{1,3}(?:\.\d+)?)\s*%?/);
  const flow = input.match(/(?:微流量|流量)(?:大约|约|为|是)?\s*(\d+(?:\.\d+)?)\s*(?:L\/min|升\/分)?/i);
  const days = input.match(/连续\s*(\d+(?:\.\d+)?|一|二|两|三|四|五|六|七)\s*天/);
  const hours = input.match(/连续\s*(\d+(?:\.\d+)?)\s*(?:小时|时)/);
  const fields: Partial<DraftFields> = {};
  if (humidity) fields.humidity = Number(humidity[1]);
  if (flow) fields.microFlow = Number(flow[1]);
  if (days) fields.durationMinutes = ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 }[days[1]] ?? Number(days[1])) * 24 * 60;
  if (hours) fields.durationMinutes = Number(hours[1]) * 60;
  if (/停水.*水表.*(?:缓慢|还在|走)|无人用水.*(?:水表|流量).*(?:变化|走)/.test(input)) fields.meterFinding = "FLOW_CONFIRMED_NO_USE";
  if (/水表.*(?:不动|无变化|没有变化)/.test(input)) fields.meterFinding = "NO_CHANGE";
  if (/照片/.test(input)) fields.photoPresent = true;
  if (/(?:墙面|墙脚).*(?:发潮|潮湿|水渍)|(?:发潮|潮湿).*(?:墙面|墙脚)/.test(input)) fields.photoFinding = "MOISTURE_VISIBLE";
  return fields;
}

export function createObservationDraft(input: string, analysis: ProviderAnalysis, now = new Date().toISOString()): ObservationDraft {
  const fields = validateDraftFields({ ...defaultDraftFields(), ...analysis.fields });
  const uncertainties = [...analysis.uncertainties];
  if (fields.humidity === null) uncertainties.push("当前湿度值尚未确认");
  if (fields.durationMinutes === null) uncertainties.push("异常持续时间尚未确认");
  if (fields.microFlow === null && fields.meterFinding === null) uncertainties.push("无人用水时微流量或水表观察尚未确认");
  if (fields.photoPresent === null) uncertainties.push("住户墙面照片是否存在尚未确认");
  const seed = { input, now, fields };
  return { draftId: `DRAFT-${hashPayload(seed).slice(0, 12)}`, originalText: input, extractedFields: fields, inferences: analysis.inferences, uncertainties: [...new Set(uncertainties)], revisions: [], status: "DRAFT", createdAt: now, syntheticDemo: true };
}

export function confirmObservationDraft(draft: ObservationDraft, corrections: Partial<DraftFields>, revisionReason: string, now = new Date().toISOString()): ObservationDraft {
  if (draft.status !== "DRAFT") throw new Error("已确认草稿不可覆盖，请创建新草稿");
  const fields = validateDraftFields({ ...draft.extractedFields, ...corrections });
  const changed = Object.keys(corrections).some((key) => JSON.stringify(draft.extractedFields[key as keyof DraftFields]) !== JSON.stringify(corrections[key as keyof DraftFields]));
  const revisions: DraftRevision[] = changed ? [...draft.revisions, { revisionId: `REV-${draft.draftId}-${draft.revisions.length + 1}`, revisedAt: now, correctedFields: corrections, revisionReason: revisionReason.trim() || "用户确认时修正字段" }] : [...draft.revisions];
  return { ...draft, extractedFields: fields, revisions, status: "CONFIRMED", confirmedAt: now };
}
