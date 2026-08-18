export type ProductPresentationMode = "CINEMATIC" | "WORK";

export type ProductArea =
  | "OVERVIEW"
  | "EVENTS"
  | "MEMORY"
  | "COLLABORATION"
  | "LEARNING";

export type BuildingRouteContext = {
  currentPath: string;
  presentationMode: ProductPresentationMode;
  area: ProductArea;
  workspaceLabel: string;
  floorId: string | null;
  unitId: string | null;
  spaceId: string | null;
  spaceLabel: string | null;
  canonicalEventId: string | null;
};

export const BUILDING_PRODUCT_ID = "BLD-HZZ-02" as const;
export const BUILDING_PRODUCT_LABEL = "华章新筑 · 2号楼" as const;
export const DEEP_DEMO_EVENT_ID = "EVT-1602" as const;
export const DEEP_DEMO_SPACE_ID = "SPACE-1602-BATHROOM" as const;

const routeContexts: Record<string, Omit<BuildingRouteContext, "currentPath">> = {
  "/": {
    presentationMode: "CINEMATIC",
    area: "OVERVIEW",
    workspaceLabel: "筑生总智能体",
    floorId: null,
    unitId: null,
    spaceId: null,
    spaceLabel: null,
    canonicalEventId: null
  },
  "/case-1602": {
    presentationMode: "CINEMATIC",
    area: "EVENTS",
    workspaceLabel: "1602建筑生命事件",
    floorId: "16F",
    unitId: "1602",
    spaceId: DEEP_DEMO_SPACE_ID,
    spaceLabel: "1602卫生间",
    canonicalEventId: DEEP_DEMO_EVENT_ID
  },
  "/events": {
    presentationMode: "WORK",
    area: "EVENTS",
    workspaceLabel: "建筑生命事件",
    floorId: null,
    unitId: null,
    spaceId: null,
    spaceLabel: null,
    canonicalEventId: null
  },
  "/memory": {
    presentationMode: "WORK",
    area: "MEMORY",
    workspaceLabel: "建筑记忆",
    floorId: "16F",
    unitId: "1602",
    spaceId: DEEP_DEMO_SPACE_ID,
    spaceLabel: "1602卫生间",
    canonicalEventId: DEEP_DEMO_EVENT_ID
  },
  "/worker": {
    presentationMode: "WORK",
    area: "COLLABORATION",
    workspaceLabel: "施工记录",
    floorId: "16F",
    unitId: "1602",
    spaceId: DEEP_DEMO_SPACE_ID,
    spaceLabel: "1602卫生间",
    canonicalEventId: null
  },
  "/resident": {
    presentationMode: "WORK",
    area: "COLLABORATION",
    workspaceLabel: "住户任务",
    floorId: "16F",
    unitId: "1602",
    spaceId: DEEP_DEMO_SPACE_ID,
    spaceLabel: "1602卫生间",
    canonicalEventId: DEEP_DEMO_EVENT_ID
  },
  "/property": {
    presentationMode: "WORK",
    area: "COLLABORATION",
    workspaceLabel: "物业运行",
    floorId: "16F",
    unitId: "1602",
    spaceId: DEEP_DEMO_SPACE_ID,
    spaceLabel: "1602卫生间",
    canonicalEventId: DEEP_DEMO_EVENT_ID
  },
  "/group": {
    presentationMode: "WORK",
    area: "LEARNING",
    workspaceLabel: "经验治理",
    floorId: null,
    unitId: null,
    spaceId: null,
    spaceLabel: null,
    canonicalEventId: DEEP_DEMO_EVENT_ID
  }
};

export function normalizeProductPath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
}

export function deriveBuildingRouteContext(pathname: string): BuildingRouteContext {
  const currentPath = normalizeProductPath(pathname);
  const matched = routeContexts[currentPath];
  if (matched) return { currentPath, ...matched };
  return {
    currentPath,
    presentationMode: "WORK",
    area: "COLLABORATION",
    workspaceLabel: "专业工作台",
    floorId: null,
    unitId: null,
    spaceId: null,
    spaceLabel: null,
    canonicalEventId: null
  };
}
