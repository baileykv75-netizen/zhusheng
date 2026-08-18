"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  BUILDING_PRODUCT_ID,
  BUILDING_PRODUCT_LABEL,
  deriveBuildingRouteContext,
  type BuildingRouteContext
} from "@/lib/product/building-context";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";

type BuildingProductContextValue = BuildingRouteContext & {
  buildingId: typeof BUILDING_PRODUCT_ID;
  buildingLabel: typeof BUILDING_PRODUCT_LABEL;
  eventId: string | null;
  selectedBusinessId: string | null;
  setSelectedBusinessId(value: string | null): void;
};

const BuildingProductContext = createContext<BuildingProductContextValue | null>(null);

export function BuildingContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, setSession } = useLifecycleJourney();
  const route = useMemo(() => deriveBuildingRouteContext(pathname), [pathname]);
  const eventId = session.result?.eventId ?? route.canonicalEventId;

  const value = useMemo<BuildingProductContextValue>(() => ({
    ...route,
    buildingId: BUILDING_PRODUCT_ID,
    buildingLabel: BUILDING_PRODUCT_LABEL,
    eventId,
    selectedBusinessId: session.selectedBusinessId,
    setSelectedBusinessId(value) {
      setSession((current) => ({ ...current, selectedBusinessId: value }));
    }
  }), [eventId, route, session.selectedBusinessId, setSession]);

  return <BuildingProductContext.Provider value={value}>{children}</BuildingProductContext.Provider>;
}

export function useBuildingProductContext() {
  const value = useContext(BuildingProductContext);
  if (!value) throw new Error("useBuildingProductContext must be used inside BuildingContextProvider");
  return value;
}
