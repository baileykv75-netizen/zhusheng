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
  dataClass: "DEMO_SYNTHETIC";
  disclosure: string;
};

const SYNTHETIC_DISCLOSURE = "脱敏合成参考素材，只用于演示证据结构与查看交互；不代表当前会话已经完成对应采集、核验、维修或复验。";

export const evidenceAssets: Record<EvidenceAssetId, EvidenceAsset> = {
  joint: {
    id: "joint",
    src: publicAssetPath("/assets/v5/evidence/ev-2848-joint.webp"),
    type: "接头施工影像示例",
    object: "SPACE-1602-BATHROOM · J-1602-CW-03",
    capturedAt: "2025.03.18 14:26 · 示例时间",
    status: "示例：品质核验通过",
    alt: "1602卫生间重点冷水接头施工影像脱敏合成示例",
    dataClass: "DEMO_SYNTHETIC",
    disclosure: SYNTHETIC_DISCLOSURE
  },
  pressure: {
    id: "pressure",
    src: publicAssetPath("/assets/v5/evidence/ev-2848-pressure.webp"),
    type: "保压复核影像示例",
    object: "SYS-1602-CW · J-1602-CW-03",
    capturedAt: "2025.03.18 14:31 · 示例时间",
    status: "示例：人工确认通过",
    alt: "1602卫生间冷水支管保压复核脱敏合成示例",
    dataClass: "DEMO_SYNTHETIC",
    disclosure: SYNTHETIC_DISCLOSURE
  },
  dampWall: {
    id: "dampWall",
    src: publicAssetPath("/assets/v5/evidence/resident-damp-wall.webp"),
    type: "住户墙面影像示例",
    object: "SPACE-1602-BATHROOM · WALL-1602-BATHROOM-NORTH",
    capturedAt: "2026.07.25 16:34 · 示例时间",
    status: "示例：已关联空间",
    alt: "1602卫生间墙面潮湿区域脱敏合成示例",
    dataClass: "DEMO_SYNTHETIC",
    disclosure: SYNTHETIC_DISCLOSURE
  },
  waterMeter: {
    id: "waterMeter",
    src: publicAssetPath("/assets/v5/evidence/resident-water-meter.webp"),
    type: "水表观察示例",
    object: "METER-1602-FLOW-01 · SYS-1602-CW",
    capturedAt: "2026.07.25 16:34 · 示例时间",
    status: "示例：人工确认",
    alt: "1602卫生间水表观察脱敏合成示例",
    dataClass: "DEMO_SYNTHETIC",
    disclosure: SYNTHETIC_DISCLOSURE
  },
  repair: {
    id: "repair",
    src: publicAssetPath("/assets/v5/evidence/workorder-repair.webp"),
    type: "维修验收影像示例",
    object: "J-1602-CW-03 · 维修阶段",
    capturedAt: "2026.07.25 18:02 · 示例时间",
    status: "示例：维修复验通过",
    alt: "1602卫生间重点冷水接头维修复核脱敏合成示例",
    dataClass: "DEMO_SYNTHETIC",
    disclosure: SYNTHETIC_DISCLOSURE
  }
};
