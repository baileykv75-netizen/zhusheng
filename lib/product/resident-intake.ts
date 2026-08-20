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
 * when the resident has manually confirmed visible moisture in the submitted
 * image. Text alone cannot push the user into the water-meter branch when the
 * photo is unreadable or explicitly shows no visible moisture.
 *
 * Returning null is intentional: unsupported or internally inconsistent
 * symptoms must stop at the observed-fact layer instead of being forced into
 * the leak workflow just because they occurred in the bathroom.
 */
export function derive1602ResidentFollowUp(input: {
  description: string;
  photoFinding: Exclude<ResidentPhotoFinding, "UNCONFIRMED">;
}): ResidentFollowUpRequest | null {
  const descriptionSuggestsMoisture = moisturePattern.test(input.description.trim());
  const photoSuggestsMoisture = input.photoFinding === "MOISTURE_VISIBLE";
  if (!photoSuggestsMoisture) return null;

  const triggeredBy: ResidentFollowUpRequest["triggeredBy"] = ["SPACE_CONTEXT"];
  if (descriptionSuggestsMoisture) triggeredBy.push("DESCRIPTION");
  triggeredBy.push("PHOTO");

  return {
    id: "METER_READING",
    title: "无人用水时，水表是否仍变化？",
    reason: descriptionSuggestsMoisture
      ? "你的文字描述与照片人工确认都支持存在潮湿或水迹。确认无人用水时水表是否仍变化，可以帮助区分供水侧持续微流量与防水、冷凝等其他方向。"
      : "你虽然暂时说不清原因，但已经人工确认照片中存在潮湿或水迹。确认无人用水时水表是否仍变化，可以帮助区分供水侧持续微流量与防水、冷凝等其他方向。",
    boundary: "这只是为了缩小排查范围，不代表筑生已经判断为管道漏水。若照片看不清或人工确认未见潮湿，系统会停在现场事实层，不会继续要求水表或关阀。",
    triggeredBy
  };
}
