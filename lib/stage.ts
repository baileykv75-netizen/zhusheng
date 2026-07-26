export type StageView = "building" | "worker" | "resident" | "group";

export type SceneFocus = "overview" | "room-1602" | "pipe-joint" | "portfolio";

export type VisualCue = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  tone?: "water" | "risk" | "safe" | "neutral";
};

export type SceneAsset = {
  desktopAvif: string;
  desktopWebp: string;
  mobileAvif: string;
  mobileWebp: string;
  fallback: string;
  alt: string;
};

export const sceneAssets: Record<StageView, SceneAsset> = {
  building: {
    desktopAvif: "/assets/v4/building-stage.avif",
    desktopWebp: "/assets/v4/building-stage.webp",
    mobileAvif: "/assets/v4/building-stage-mobile.avif",
    mobileWebp: "/assets/v4/building-stage-mobile.webp",
    fallback: "/assets/building-digital-twin.png",
    alt: "华章新筑2号楼脱敏建筑数字孪生剖面"
  },
  worker: {
    desktopAvif: "/assets/v4/bathroom-stage.avif",
    desktopWebp: "/assets/v4/bathroom-stage.webp",
    mobileAvif: "/assets/v4/bathroom-stage-mobile.avif",
    mobileWebp: "/assets/v4/bathroom-stage-mobile.webp",
    fallback: "/assets/building-digital-twin.png",
    alt: "1602卫生间脱敏管线与防水构造剖面"
  },
  resident: {
    desktopAvif: "/assets/v4/bathroom-stage.avif",
    desktopWebp: "/assets/v4/bathroom-stage.webp",
    mobileAvif: "/assets/v4/bathroom-stage-mobile.avif",
    mobileWebp: "/assets/v4/bathroom-stage-mobile.webp",
    fallback: "/assets/building-digital-twin.png",
    alt: "1602卫生间水系统事件处置剖面"
  },
  group: {
    desktopAvif: "/assets/v4/portfolio-stage.avif",
    desktopWebp: "/assets/v4/portfolio-stage.webp",
    mobileAvif: "/assets/v4/portfolio-stage-mobile.avif",
    mobileWebp: "/assets/v4/portfolio-stage-mobile.webp",
    fallback: "/assets/building-digital-twin.png",
    alt: "集团脱敏建筑项目群数字资产矩阵"
  }
};
