import type { ResidentPhotoFinding } from "./evidence.ts";

export type ResidentFollowUpRequest = {
  id: "METER_READING";
  title: string;
  reason: string;
  boundary: string;
  triggeredBy: Array<"DESCRIPTION" | "PHOTO" | "SPACE_CONTEXT">;
};

const moisturePattern = /(潮|湿|渗|漏|水迹|水印|返潮|霉|发黑|积水|滴水)/;

/**
 * 1602 currently validates the bathroom dampness event. The resident is never
 * asked to guess a cause. We first collect the observed symptom and photo, then
 * choose the cheapest discriminating follow-up evidence for this event.
 *
 * This is deterministic product triage, not an AI diagnosis: asking for a
 * meter observation only narrows the next branch and never proves a pipe leak.
 */
export function derive1602ResidentFollowUp(input: {
  description: string;
  photoFinding: Exclude<ResidentPhotoFinding, "UNCONFIRMED">;
}): ResidentFollowUpRequest {
  const descriptionSuggestsMoisture = moisturePattern.test(input.description.trim());
  const photoSuggestsMoisture = input.photoFinding === "MOISTURE_VISIBLE";
  const triggeredBy: ResidentFollowUpRequest["triggeredBy"] = ["SPACE_CONTEXT"];
  if (descriptionSuggestsMoisture) triggeredBy.push("DESCRIPTION");
  if (photoSuggestsMoisture) triggeredBy.push("PHOTO");

  const reason = descriptionSuggestsMoisture || photoSuggestsMoisture
    ? "你刚刚提交的是潮湿或水迹类现象。确认无人用水时水表是否仍变化，可以帮助区分供水侧持续微流量与防水、冷凝等其他方向。"
    : "当前照片没有直接确认潮湿，但异常位置位于1602卫生间。补充一次无人用水水表观察，是为了先确认是否存在持续用水侧信号，再决定是否需要转向防水、环境或其他排查路径。";

  return {
    id: "METER_READING",
    title: "无人用水时，水表是否仍变化？",
    reason,
    boundary: "这只是为了缩小排查范围，不代表筑生已经判断为管道漏水。看不清时可以直接选择“看不清”，由物业改用其他证据补充。",
    triggeredBy
  };
}
