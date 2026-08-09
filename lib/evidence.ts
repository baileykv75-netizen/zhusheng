import { publicAssetPath } from "./site-path.ts";

export type EvidenceAssetId = "joint" | "pressure" | "dampWall" | "waterMeter" | "repair";

export type EvidenceAsset = {
  id: EvidenceAssetId;
  src: string;
  type: string;
  object: string;
  capturedAt: string;
  status: string;
  alt: string;
};

export const evidenceAssets: Record<EvidenceAssetId, EvidenceAsset> = {
  joint: {
    id: "joint",
    src: publicAssetPath("/assets/v5/evidence/ev-2848-joint.webp"),
    type: "接头施工影像",
    object: "1602卫生间 · W-1602-B7",
    capturedAt: "2025.03.18 14:26",
    status: "品质核验通过",
    alt: "1602卫生间PPR支管接头施工近照"
  },
  pressure: {
    id: "pressure",
    src: publicAssetPath("/assets/v5/evidence/ev-2848-pressure.webp"),
    type: "保压复核",
    object: "冷热水支管 · W-1602-B7",
    capturedAt: "2025.03.18 14:31",
    status: "人工已确认",
    alt: "1602卫生间冷热水支管压力表复核照片"
  },
  dampWall: {
    id: "dampWall",
    src: publicAssetPath("/assets/v5/evidence/resident-damp-wall.webp"),
    type: "住户补充影像",
    object: "1602卫生间 · 北侧完成墙面",
    capturedAt: "2026.07.25 16:34",
    status: "AI已关联",
    alt: "住户拍摄的1602卫生间墙面潮湿区域"
  },
  waterMeter: {
    id: "waterMeter",
    src: publicAssetPath("/assets/v5/evidence/resident-water-meter.webp"),
    type: "水表状态",
    object: "1602局部供水系统",
    capturedAt: "2026.07.25 16:34",
    status: "人工已确认",
    alt: "停用水后1602局部水表状态照片"
  },
  repair: {
    id: "repair",
    src: publicAssetPath("/assets/v5/evidence/workorder-repair.webp"),
    type: "维修验收影像",
    object: "WO-260725-08 · W-1602-B7",
    capturedAt: "2026.07.25 18:02",
    status: "维修验证通过",
    alt: "1602卫生间支管接头维修完成后的复核照片"
  }
};
