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
 * 1602 currently validates one bathroom dampness event, not every possible
 * resident complaint. The resident is never asked to guess a cause. We first
 * collect the observed symptom and photo, then request a meter observation only
 * when the submitted facts actually support the moisture / water branch.
 *
 * Returning null is intentional: unsupported symptoms must not be forced into
 * the leak workflow just because they occurred in the bathroom.
 */
export function derive1602ResidentFollowUp(input: {
  description: string;
  photoFinding: Exclude<ResidentPhotoFinding, "UNCONFIRMED">;
}): ResidentFollowUpRequest | null {
  const descriptionSuggestsMoisture = moisturePattern.test(input.description.trim());
  const photoSuggestsMoisture = input.photoFinding === "MOISTURE_VISIBLE";
  if (!descriptionSuggestsMoisture && !photoSuggestsMoisture) return null;

  const triggeredBy: ResidentFollowUpRequest["triggeredBy"] = ["SPACE_CONTEXT"];
  if (descriptionSuggestsMoisture) triggeredBy.push("DESCRIPTION");
  if (photoSuggestsMoisture) triggeredBy.push("PHOTO");

  return {
    id: "METER_READING",
    title: "无人用水时，水表是否仍变化？",
    reason: "你刚刚提交的是潮湿或水迹类现象。确认无人用水时水表是否仍变化，可以帮助区分供水侧持续微流量与防水、冷凝等其他方向。",
    boundary: "这只是为了缩小排查范围，不代表筑生已经判断为管道漏水。看不清时可以直接选择“看不清”，由物业改用其他证据补充。",
    triggeredBy
  };
}
