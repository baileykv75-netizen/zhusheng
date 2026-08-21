"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BUILDING_PRODUCT_ID,
  BUILDING_PRODUCT_LABEL,
  deriveBuildingRouteContext,
  type BuildingRouteContext
} from "@/lib/product/building-context";
import type { BuildingAgentTurnResult, QueryVisualDirective } from "@/lib/building-intelligence/types.ts";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { residentEvidenceNeedsAssessment } from "@/lib/product/resident-assessment";
import { isCase1602Path, resolveComponentLifeObjectId } from "@/lib/product/component-life-link";

type BuildingProductContextValue = BuildingRouteContext & {
  buildingId: typeof BUILDING_PRODUCT_ID;
  buildingLabel: typeof BUILDING_PRODUCT_LABEL;
  /** Actual active lifecycle event only. Route identity remains canonicalEventId. */
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, setSession } = useLifecycleJourney();
  const [agentResult, setAgentResultState] = useState<BuildingAgentTurnResult | null>(null);
  const route = useMemo(() => deriveBuildingRouteContext(pathname), [pathname]);
  const pendingResidentAssessment = residentEvidenceNeedsAssessment(session.result, session.residentSubmissions);
  const eventId = session.result?.eventId ?? null;
  const onCase1602 = isCase1602Path(pathname);
  const searchText = searchParams.toString();
  const objectParam = searchParams.get("object");
  const requestedObjectId = onCase1602 ? resolveComponentLifeObjectId(objectParam) : null;

  const syncSelectedObjectUrl = useCallback((value: string | null) => {
    if (!onCase1602) return;
    const params = new URLSearchParams(searchText);
    const currentRaw = params.get("object");
    const currentResolved = resolveComponentLifeObjectId(currentRaw);
    const nextResolved = value ? resolveComponentLifeObjectId(value) : null;

    if (currentResolved === nextResolved && (currentRaw === null || currentResolved !== null)) return;

    if (nextResolved) params.set("object", nextResolved);
    else params.delete("object");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [onCase1602, pathname, router, searchText]);

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

  useEffect(() => {
    if (!onCase1602 || !objectParam || requestedObjectId) return;
    // Unknown / out-of-space object ids are presentation input only. They may not
    // create a Building Intelligence entity, lifecycle event or candidate identity,
    // and they may not silently fall back to a previously selected valid object.
    setSession((current) => current.selectedBusinessId === null
      ? current
      : { ...current, selectedBusinessId: null });
    syncSelectedObjectUrl(null);
  }, [objectParam, onCase1602, requestedObjectId, setSession, syncSelectedObjectUrl]);

  useEffect(() => {
    if (!requestedObjectId || pendingResidentAssessment) return;
    // A valid object deep link restores only shared spatial identity. During a
    // pending assessment/reassessment the existing truth guard keeps 3D candidate
    // focus cleared; the object-life overlay may still explain the requested object.
    setSession((current) => current.selectedBusinessId === requestedObjectId
      ? current
      : { ...current, selectedBusinessId: requestedObjectId });
  }, [pendingResidentAssessment, requestedObjectId, setSession]);

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
      syncSelectedObjectUrl(value);
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
        syncSelectedObjectUrl(target);
      }
    }
  }), [agentResult, eventId, route, session.selectedBusinessId, setSession, syncSelectedObjectUrl]);

  return <BuildingProductContext.Provider value={value}>{children}</BuildingProductContext.Provider>;
}

export function useBuildingProductContext() {
  const value = useContext(BuildingProductContext);
  if (!value) throw new Error("useBuildingProductContext must be used inside BuildingContextProvider");
  return value;
}
