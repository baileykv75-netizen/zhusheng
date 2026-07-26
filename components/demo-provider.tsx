"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createInitialSnapshot, DemoEngine, DemoSnapshot, demoSteps, RuntimeMode } from "@/lib/demo-engine";

const STORAGE_KEY = "zhusheng.demo.v2";

type DemoContextValue = {
  state: DemoSnapshot;
  hydrated: boolean;
  start: () => void;
  next: () => void;
  previous: () => void;
  reset: () => void;
  approve: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(() => createInitialSnapshot());
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as DemoSnapshot;
        if (parsed.schemaVersion === 2) setState(parsed);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    fetch("/api/health")
      .then((response) => response.json())
      .then((body: { mode?: RuntimeMode }) => {
        if (body.mode) setState((current) => ({ ...current, runtimeMode: body.mode as RuntimeMode }));
      })
      .catch(() => setState((current) => ({ ...current, runtimeMode: "fallback" })))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    if (hydrated && search.get("demo") === "1" && state.currentStep === 0) {
      const started = DemoEngine.start(state.runtimeMode);
      setState(started);
      router.replace("/worker");
    }
  }, [hydrated, router, search, state.currentStep, state.runtimeMode]);

  const navigate = useCallback((snapshot: DemoSnapshot) => {
    const step = demoSteps[Math.max(0, snapshot.currentStep - 1)];
    if (step && pathname !== step.route) router.push(step.route);
  }, [pathname, router]);

  const start = useCallback(() => {
    const snapshot = DemoEngine.start(state.runtimeMode);
    setState(snapshot);
    navigate(snapshot);
  }, [navigate, state.runtimeMode]);

  const next = useCallback(() => {
    const snapshot = DemoEngine.next(state);
    setState(snapshot);
    navigate(snapshot);
  }, [navigate, state]);

  const previous = useCallback(() => {
    const snapshot = DemoEngine.previous(state);
    setState(snapshot);
    if (snapshot.currentStep === 0) router.push("/");
    else navigate(snapshot);
  }, [navigate, router, state]);

  const reset = useCallback(() => {
    setState(DemoEngine.reset(state.runtimeMode));
    sessionStorage.removeItem(STORAGE_KEY);
    router.push("/");
  }, [router, state.runtimeMode]);

  const approve = useCallback(() => {
    const snapshot = DemoEngine.approve(state);
    setState(snapshot);
    navigate(snapshot);
  }, [navigate, state]);

  const value = useMemo(
    () => ({ state, hydrated, start, next, previous, reset, approve }),
    [approve, hydrated, next, previous, reset, start, state]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider");
  return value;
}
