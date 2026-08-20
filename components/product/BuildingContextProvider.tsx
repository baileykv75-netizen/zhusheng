"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BUILDING_PRODUCT_ID,
  BUILDING_PRODUCT_LABEL,
  deriveBuildingRouteContext,
  type BuildingRouteContext
} from "@/lib/product/building-context";
import type { BuildingAgentTurnResult, QueryVisualDirective } from "@/lib/building-intelligence/types.ts";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { residentEvidenceNeedsAssessment } from "@/lib/product/resident-assessment";

type BuildingProductContextValue = BuildingRouteContext & {
  buildingId: typeof BUILDING_PRODUCT_ID;
  buildingLabel: typeof BUILDING_PRODUCT_LABEL;
  /** Actual active lifecycle event. The case route may still carry canonicalEventId separately. */
  eventId: string | null;
  selectedBusinessId: string | null;
  agentResult: BuildingAgentTurnResult | null;
  queryVisual: QueryVisualDirective | null;
  setSelectedBusinessId(value: string | null): void;
  setAgentResult(value: BuildingAgentTurnResult | null): void;
};

const BuildingProductContext = createContext<BuildingProductContextValue | null>(null);

export function BuildingContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, setSession } = useLifecycleJourney();
  const [agentResult, setAgentResultState] = useState<BuildingAgentTurnResult | null>(null);
  const route = useMemo(() => deriveBuildingRouteContext(pathname), [pathname]);
  const pendingResidentAssessment = residentEvidenceNeedsAssessment(session.result, session.residentSubmissions);
  const eventId = session.result?.eventId
    ?? (route.currentPath === "/case-1602" ? route.canonicalEventId : null);

  useEffect(() => {
    if (!pendingResidentAssessment) return;
    // A new resident evidence cycle invalidates only the previous visual/query focus,
    // not the lifecycle result or audit history. This prevents "这个构件" follow-ups
    // from silently inheriting the previous cycle's candidate before reassessment.
    setAgentResultState(null);
    setSession((current) => {
      if (current.selectedBusinessId === null && current.selectedView === "VIEW_RESIDENT") return current;
      return {
        ...current,
        selectedBusinessId: null,
        selectedView: "VIEW_RESIDENT"
      };
    });
  }, [pendingResidentAssessment, setSession]);

  const value = useMemo<BuildingProductContextValue>(() => ({
    ...route,
    buildingId: BUILDING_PRODUCT_ID,
    buildingLabel: BUILDING_PRODUCT_LABEL,
    eventId,
    selectedBusinessId: session.selectedBusinessId,
    agentResult,
    queryVisual: agentResult?.visualDirective ?? null,
    setSelectedBusinessId(value) {
      setSession((current) => ({ ...current, selectedBusinessId: value }));
    },
    setAgentResult(value) {
      setAgentResultState(value);
      if (!value) return;
      const visual = value.visualDirective;
      const target = visual?.targetBusinessIds[0]
        ?? visual?.revealBusinessIds[0]
        ?? value.selectedBusinessId
        ?? null;
      if (target) {
        setSession((current) => ({ ...current, selectedBusinessId: target }));
      }
    }
  }), [agentResult, eventId, route, session.selectedBusinessId, setSession]);

  return <BuildingProductContext.Provider value={value}>{children}</BuildingProductContext.Provider>;
}

export function useBuildingProductContext() {
  const value = useContext(BuildingProductContext);
  if (!value) throw new Error("useBuildingProductContext must be used inside BuildingContextProvider");
  return value;
}