export type StageView = "building" | "worker" | "resident" | "group";

export type SceneFocus = "overview" | "room-1602" | "pipe-joint" | "portfolio";

export type SceneId =
  | "buildingOverview"
  | "buildingSpace"
  | "buildingWater"
  | "buildingDevices"
  | "bathroomConstruction"
  | "bathroomMoisture"
  | "valveOpen"
  | "valveClosed"
  | "repairValidation"
  | "groupNetwork";

export type SceneOverlay = "none" | "moisture" | "memory-xray" | "evidence-link" | "knowledge-transfer";

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
  placeholder: string;
  fallback: string;
  alt: string;
  focalPoint: { x: number; y: number };
  mobileFocalPoint: { x: number; y: number };
};

function asset(name: string, alt: string, focalPoint = { x: 50, y: 50 }, mobileFocalPoint = focalPoint): SceneAsset {
  const base = `/assets/v5/scenes/${name}`;
  return {
    desktopAvif: `${base}.avif`,
    desktopWebp: `${base}.webp`,
    mobileAvif: `${base}-mobile.avif`,
    mobileWebp: `${base}-mobile.webp`,
    placeholder: `/assets/v5/placeholders/${name}-blur.webp`,
    fallback: "/assets/building-digital-twin.png",
    alt,
    focalPoint,
    mobileFocalPoint
  };
}

export const sceneAssets: Record<SceneId, SceneAsset> = {
  buildingOverview: asset("building-overview", "华章新筑2号楼建筑运营全景", { x: 50, y: 48 }, { x: 55, y: 44 }),
  buildingSpace: asset("building-space-cutaway", "华章新筑2号楼16层与1602空间剖切视图", { x: 50, y: 48 }, { x: 56, y: 44 }),
  buildingWater: asset("building-water-xray", "华章新筑2号楼给排水立管与1602支管透视视图", { x: 50, y: 48 }, { x: 56, y: 44 }),
  buildingDevices: asset("building-device-sensing", "华章新筑2号楼设备感知网络视图", { x: 50, y: 48 }, { x: 56, y: 44 }),
  bathroomConstruction: asset("bathroom-construction", "1602卫生间管线与防水构造施工剖面", { x: 50, y: 50 }, { x: 32, y: 50 }),
  bathroomMoisture: asset("bathroom-moisture-surface", "1602卫生间完成墙面的局部潮湿区域", { x: 50, y: 50 }, { x: 42, y: 50 }),
  valveOpen: asset("valve-component-open", "1602卫生间局部进水阀与支管接头开启状态特写", { x: 50, y: 50 }, { x: 35, y: 48 }),
  valveClosed: asset("valve-component-closed", "1602卫生间局部进水阀关闭且微流量归零状态特写", { x: 50, y: 50 }, { x: 35, y: 48 }),
  repairValidation: asset("repair-validation", "1602卫生间支管接头维修后压力复核场景", { x: 50, y: 50 }, { x: 38, y: 50 }),
  groupNetwork: asset("group-network", "集团脱敏建筑项目群知识反馈网络", { x: 50, y: 50 }, { x: 50, y: 50 })
};

export const defaultSceneByView: Record<StageView, SceneId> = {
  building: "buildingWater",
  worker: "bathroomConstruction",
  resident: "bathroomMoisture",
  group: "groupNetwork"
};

export const sceneSequence: SceneId[] = [
  "buildingOverview",
  "buildingSpace",
  "buildingWater",
  "buildingDevices",
  "bathroomConstruction",
  "bathroomMoisture",
  "valveOpen",
  "valveClosed",
  "repairValidation",
  "groupNetwork"
];
