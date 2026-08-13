"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserLifeEventEngine, loadBrowserLifeEventAssets, type BrowserLifeEventAssets } from "@/lib/life-event-engine/adapters/browser/index.ts";
import { createVerifiedEventPackage, verifyEventPackage } from "@/lib/life-event-engine/event-package.ts";
import type { LifeEventResult, VerifiedLifeEventPackage } from "@/lib/life-event-engine/types.ts";
import {
  attemptUnauthorizedAction,
  controlsFromTemplate,
  decideAuthorization,
  DEFAULT_ISOLATION_CONTROLS,
  DEFAULT_POST_REPAIR_CONTROLS,
  defaultRepairDraft,
  evaluateControls,
  executeAuthorizedClose,
  executeAuthorizedReopen,
  submitIsolationObservation,
  submitPostRepairObservation,
  submitRepairRecord
} from "@/lib/life-event-lab/model.ts";
import {
  LAB_SCHEMA_VERSION,
  LAB_SESSION_KEY,
  type LabAuthorizationDraft,
  type LabControls,
  type LabSession,
  type LabTemplateId,
  withProductEvidenceDefaults
} from "@/lib/life-event-lab/types.ts";
import type { DraftFields } from "@/lib/building-agent/types.ts";
import {
  createProductEvidenceAppendix,
  createPropertyEvidenceReview,
  createResidentEvidenceSubmission,
  type PropertyReviewDraft,
  type ResidentEvidenceDraft,
  type VerifiedProductEvidenceBundle
} from "@/lib/product/evidence.ts";
import { residentDomainEvidenceRefs, residentEvidenceToDomainControls } from "@/lib/product/evidence-adapter.ts";
import { useDemo } from "./demo-provider";

export const LIFE_EVENT_PACKAGE_KEY = "zhusheng.life-event-package.v1";

function initialSession(): LabSession {
  return {
    schemaVersion: LAB_SCHEMA_VERSION,
    controls: controlsFromTemplate("joint-supported"),
    isolation: structuredClone(DEFAULT_ISOLATION_CONTROLS),
    repairDraft: defaultRepairDraft(),
    postRepair: structuredClone(DEFAULT_POST_REPAIR_CONTROLS),
    eventCounter: 0,
    result: null,
    selectedView: "VIEW_RESIDENT",
    selectedBusinessId: null,
    activeTab: "input",
    notice: null,
    residentSubmissions: [],
    propertyReviews: [],
    productEvidenceTimeline: [],
    photoObservationConfirmation: "UNCONFIRMED"
  };
}

function repairDraftForResult(result: LifeEventResult) {
  const isolation = [...result.auditLog].reverse().find((item) => item.actionType === "ISOLATION_CONFIRMED");
  const base = isolation ? Date.parse(isolation.timestamp) : Date.now() - 2_000;
  const draft = defaultRepairDraft(base + 500);
  draft.startedAt = new Date(base + 100).toISOString();
  draft.completedAt = new Date(base + 300).toISOString();
  draft.targetBusinessId = result.rankedHypotheses[0]?.candidateBusinessIds[0] ?? "";
  return draft;
}

function controlsFromDraft(fields: DraftFields): LabControls {
  const defaults = controlsFromTemplate("joint-supported");
  return {
    ...defaults,
    humidity: {
      value: fields.humidity ?? defaults.humidity.value,
      baseline: fields.humidityBaseline,
      durationMinutes: fields.durationMinutes ?? defaults.humidity.durationMinutes,
      quality: fields.dataQuality
    },
    microFlow: {
      value: fields.microFlow ?? defaults.microFlow.value,
      baseline: fields.microFlowBaseline,
      durationMinutes: fields.durationMinutes ?? defaults.microFlow.durationMinutes,
      quality: fields.dataQuality
    },
    residentPhoto: fields.photoPresent === false ? "MISSING" : fields.photoFinding ? "PRESENT" : "UNVERIFIED",
    photoFinding: fields.photoFinding ?? "UNREADABLE",
    meterReading: fields.meterFinding ? "PRESENT" : "UNVERIFIED",
    meterFinding: fields.meterFinding ?? "UNREADABLE"
  };
}

function loadStoredSession(): { session: LabSession; found: boolean } {
  try {
    const value = JSON.parse(sessionStorage.getItem(LAB_SESSION_KEY) ?? "null") as LabSession | null;
    if (value?.schemaVersion === LAB_SCHEMA_VERSION) return { session: withProductEvidenceDefaults(value), found: true };
  } catch {
    sessionStorage.removeItem(LAB_SESSION_KEY);
  }
  return { session: initialSession(), found: false };
}

function loadStoredPackage(): VerifiedLifeEventPackage | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(LIFE_EVENT_PACKAGE_KEY) ?? "null") as VerifiedLifeEventPackage | null;
    return value && verifyEventPackage(value).valid ? value : null;
  } catch {
    sessionStorage.removeItem(LIFE_EVENT_PACKAGE_KEY);
    return null;
  }
}

type LifecycleJourneyValue = {
  session: LabSession;
  setSession: React.Dispatch<React.SetStateAction<LabSession>>;
  hydrated: boolean;
  assets: BrowserLifeEventAssets | null;
  assetError: string | null;
  engine: ReturnType<typeof createBrowserLifeEventEngine> | null;
  busy: boolean;
  currentPackage: VerifiedLifeEventPackage | null;
  patchControls(patch: Partial<LabControls>): void;
  applyTemplate(id: LabTemplateId): void;
  evaluate(): void;
  submitResidentEvidence(draft: ResidentEvidenceDraft): void;
  submitPropertyReview(draft: PropertyReviewDraft): void;
  attemptUnauthorized(): void;
  decideAuthorization(draft: LabAuthorizationDraft): void;
  executeValveAction(): void;
  submitIsolation(): void;
  submitRepair(): void;
  submitPostRepair(): void;
  seedFromAgent(fields: DraftFields, result: LifeEventResult): void;
  markWorkerEvidenceReady(): void;
  resetLab(): void;
  buildVerifiedPackage(): VerifiedLifeEventPackage;
  buildProductEvidenceBundle(): VerifiedProductEvidenceBundle<VerifiedLifeEventPackage>;
};

const LifecycleJourneyContext = createContext<LifecycleJourneyValue | null>(null);

export function LifecycleJourneyProvider({ children }: { children: React.ReactNode }) {
  const { state: demoState, hydrated: demoHydrated } = useDemo();
  const [session, setSession] = useState<LabSession>(initialSession);
  const [hydrated, setHydrated] = useState(false);
  const [assets, setAssets] = useState<BrowserLifeEventAssets | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPackage, setCurrentPackage] = useState<VerifiedLifeEventPackage | null>(null);
  const hadStoredSession = useRef(false);
  const migratedLegacy = useRef(false);
  const engine = useMemo(() => assets ? createBrowserLifeEventEngine(assets) : null, [assets]);

  useEffect(() => {
    const stored = loadStoredSession();
    hadStoredSession.current = stored.found;
    setSession(stored.session);
    setCurrentPackage(loadStoredPackage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) sessionStorage.setItem(LAB_SESSION_KEY, JSON.stringify(session));
  }, [hydrated, session]);

  useEffect(() => {
    let active = true;
    loadBrowserLifeEventAssets().then((value) => {
      if (active) setAssets(value);
    }).catch((reason) => {
      if (active) setAssetError(reason instanceof Error ? reason.message : "生命事件资产加载失败");
    });
    return () => { active = false; };
  }, []);

  const commit = useCallback((nextResult: LifeEventResult, tab: LabSession["activeTab"], notice?: string) => {
    setSession((current) => ({
      ...current,
      result: nextResult,
      activeTab: tab,
      selectedView: nextResult.visualDirective.view,
      selectedBusinessId: nextResult.visualDirective.highlightBusinessIds[0] ?? current.selectedBusinessId,
      repairDraft: nextResult.state === "REPAIR_PENDING" && current.result?.state !== "REPAIR_PENDING"
        ? repairDraftForResult(nextResult)
        : current.repairDraft,
      notice: notice ?? null
    }));
  }, []);

  const run = useCallback((action: () => LifeEventResult, tab: LabSession["activeTab"], notice?: string) => {
    setBusy(true);
    try {
      commit(action(), tab, notice);
    } catch (reason) {
      setSession((current) => ({ ...current, notice: reason instanceof Error ? reason.message : "事件引擎拒绝了本次操作" }));
    } finally {
      setBusy(false);
    }
  }, [commit]);

  useEffect(() => {
    if (!engine || !demoHydrated || migratedLegacy.current || hadStoredSession.current || session.result || demoState.currentStep < 3) return;
    migratedLegacy.current = true;
    try {
      const template: LabTemplateId = demoState.currentStep === 3 ? "humidity-only" : demoState.currentStep === 4 ? "missing-evidence" : "joint-supported";
      const controls = controlsFromTemplate(template);
      let result = evaluateControls(engine, controls, 1);
      if (demoState.currentStep >= 6 && result.state === "AUTHORIZATION_PENDING") {
        result = decideAuthorization(engine, result, {
          actorType: "RESIDENT",
          actorId: "DEMO-RESIDENT-1602",
          decision: "APPROVED",
          reason: "从旧引导演示迁移的脱敏人工授权"
        });
        result = executeAuthorizedClose(engine, result);
        result = submitIsolationObservation(engine, result, structuredClone(DEFAULT_ISOLATION_CONTROLS));
      }
      setSession((current) => ({
        ...current,
        controls,
        eventCounter: 1,
        result,
        activeTab: result.state === "INCONCLUSIVE" ? "input" : "actions",
        selectedView: result.visualDirective.view,
        selectedBusinessId: result.visualDirective.highlightBusinessIds[0] ?? null,
        repairDraft: result.state === "REPAIR_PENDING" ? repairDraftForResult(result) : current.repairDraft,
        notice: demoState.currentStep >= 7
          ? "旧演示已安全迁移到待维修状态；不会依据旧快照直接标记为已解决。"
          : "已将旧引导演示迁移到真实生命事件会话。"
      }));
    } catch (reason) {
      setSession((current) => ({ ...current, notice: reason instanceof Error ? reason.message : "旧演示迁移失败" }));
    }
  }, [demoHydrated, demoState.currentStep, engine, session.result]);

  const patchControls = useCallback((patch: Partial<LabControls>) => {
    setSession((current) => ({ ...current, controls: { ...current.controls, ...patch }, notice: null }));
  }, []);

  const applyTemplate = useCallback((id: LabTemplateId) => {
    setSession((current) => ({
      ...current,
      controls: controlsFromTemplate(id),
      result: null,
      repairDraft: defaultRepairDraft(),
      postRepair: structuredClone(DEFAULT_POST_REPAIR_CONTROLS),
      activeTab: "input",
      selectedView: "VIEW_RESIDENT",
      selectedBusinessId: null,
      residentSubmissions: [],
      propertyReviews: [],
      productEvidenceTimeline: [],
      photoObservationConfirmation: "UNCONFIRMED",
      notice: "输入模板已载入，请重新评估。"
    }));
  }, []);

  const evaluate = useCallback(() => {
    if (!engine) {
      setSession((current) => ({ ...current, notice: assetError ?? "正在验证建筑记忆和数字样间资产" }));
      return;
    }
    const counter = session.eventCounter + 1;
    setBusy(true);
    try {
      const result = evaluateControls(engine, session.controls, counter);
      setSession((current) => ({
        ...current,
        eventCounter: counter,
        result,
        activeTab: result.state === "INCONCLUSIVE" ? "input" : "diagnosis",
        selectedView: result.visualDirective.view,
        selectedBusinessId: result.visualDirective.highlightBusinessIds[0] ?? null,
        repairDraft: defaultRepairDraft(),
        postRepair: structuredClone(DEFAULT_POST_REPAIR_CONTROLS),
        notice: null
      }));
    } catch (reason) {
      setSession((current) => ({ ...current, notice: reason instanceof Error ? reason.message : "输入校验失败" }));
    } finally {
      setBusy(false);
    }
  }, [assetError, engine, session.controls, session.eventCounter]);

  const submitResidentEvidence = useCallback((draft: ResidentEvidenceDraft) => {
    if (!engine) {
      setSession((current) => ({ ...current, notice: assetError ?? "正在验证建筑记忆和数字样间资产" }));
      return;
    }
    const counter = session.eventCounter + 1;
    const nowMs = Date.now();
    const controls = residentEvidenceToDomainControls(session.controls, draft);
    setBusy(true);
    try {
      const result = evaluateControls(engine, controls, counter, nowMs);
      const refs = residentDomainEvidenceRefs(result);
      const product = createResidentEvidenceSubmission({
        draft,
        eventId: result.eventId,
        submittedAt: new Date(nowMs).toISOString(),
        domainPhotoEvidenceId: refs.photoEvidenceId,
        domainMeterEvidenceId: refs.meterEvidenceId
      });
      setSession((current) => ({
        ...current,
        controls,
        eventCounter: counter,
        result,
        residentSubmissions: [...(current.residentSubmissions ?? []), product.submission],
        productEvidenceTimeline: [...(current.productEvidenceTimeline ?? []), ...product.evidence],
        photoObservationConfirmation: draft.photo.finding,
        activeTab: result.state === "INCONCLUSIVE" ? "input" : "diagnosis",
        selectedView: result.visualDirective.view,
        selectedBusinessId: result.visualDirective.highlightBusinessIds[0] ?? null,
        repairDraft: defaultRepairDraft(),
        postRepair: structuredClone(DEFAULT_POST_REPAIR_CONTROLS),
        notice: "住户原始描述与人工观察已形成不可变产品证据；只有确认后的照片和水表观察进入确定性判断。"
      }));
    } catch (reason) {
      setSession((current) => ({ ...current, notice: reason instanceof Error ? reason.message : "住户证据提交失败" }));
    } finally {
      setBusy(false);
    }
  }, [assetError, engine, session.controls, session.eventCounter]);

  const submitPropertyReview = useCallback((draft: PropertyReviewDraft) => {
    setSession((current) => {
      const submission = (current.residentSubmissions ?? []).find((item) => item.submissionId === draft.residentSubmissionId);
      if (!submission) return { ...current, notice: "找不到可复核的住户原始证据；物业不能代替住户补写。" };
      if (!draft.reviewedBy.trim() || !draft.note.trim()) return { ...current, notice: "请填写复核人员和独立复核意见。" };
      const product = createPropertyEvidenceReview({
        draft,
        eventId: current.result?.eventId ?? submission.eventId,
        reviewedAt: new Date().toISOString(),
        relatedEvidenceIds: submission.evidenceIds,
        sequence: (current.propertyReviews ?? []).length + 1
      });
      return {
        ...current,
        propertyReviews: [...(current.propertyReviews ?? []), product.review],
        productEvidenceTimeline: [...(current.productEvidenceTimeline ?? []), product.evidence],
        notice: "物业独立复核已追加；住户原始证据未被修改，也不会因此自动改变诊断评分。"
      };
    });
  }, []);

  const attemptUnauthorized = useCallback(() => {
    if (engine && session.result) {
      run(
        () => attemptUnauthorizedAction(engine, session.result!),
        "actions",
        "安全守卫已拒绝未授权关阀，阀门保持 OPEN。"
      );
    }
  }, [engine, run, session.result]);

  const decide = useCallback((draft: LabAuthorizationDraft) => {
    if (engine && session.result) run(() => decideAuthorization(engine, session.result!, draft), "actions", draft.decision === "APPROVED" ? "人工授权已记录，设备动作仍需用户明确执行。" : "人工授权已拒绝，阀门状态保持不变。");
  }, [engine, run, session.result]);

  const executeValveAction = useCallback(() => {
    if (!engine || !session.result) return;
    const reopen = session.result.authorizedActions.some((item) => item.action === "SIMULATE_REOPEN_VALVE");
    run(() => reopen ? executeAuthorizedReopen(engine, session.result!) : executeAuthorizedClose(engine, session.result!), "actions");
  }, [engine, run, session.result]);

  const submitIsolation = useCallback(() => {
    if (engine && session.result) run(() => submitIsolationObservation(engine, session.result!, session.isolation), "actions");
  }, [engine, run, session.isolation, session.result]);

  const submitRepair = useCallback(() => {
    if (engine && session.result) run(() => submitRepairRecord(engine, session.result!, session.repairDraft), "actions", "维修记录已进入不可变事件链；恢复供水需要新的人工授权。");
  }, [engine, run, session.repairDraft, session.result]);

  const submitPostRepair = useCallback(() => {
    if (engine && session.result) run(() => submitPostRepairObservation(engine, session.result!, session.postRepair), "actions");
  }, [engine, run, session.postRepair, session.result]);

  const seedFromAgent = useCallback((fields: DraftFields, result: LifeEventResult) => {
    setSession((current) => ({
      ...current,
      controls: controlsFromDraft(fields),
      eventCounter: Math.max(1, current.eventCounter),
      result,
      activeTab: result.state === "INCONCLUSIVE" ? "input" : "diagnosis",
      selectedView: result.visualDirective.view,
      selectedBusinessId: result.visualDirective.highlightBusinessIds[0] ?? null,
      repairDraft: result.state === "REPAIR_PENDING" ? repairDraftForResult(result) : current.repairDraft,
      notice: "总智能体确认的观察与同一事件结果已进入任务处置。"
    }));
  }, []);

  const markWorkerEvidenceReady = useCallback(() => {
    setSession((current) => ({
      ...current,
      controls: {
        ...current.controls,
        pipeInstallation: "PRESENT",
        waterproofing: "PRESENT",
        closedWaterTest: "PRESENT"
      },
      notice: "工友核验记录已作为本次事件的建造阶段证据输入。"
    }));
  }, []);

  const buildVerifiedPackage = useCallback(() => {
    if (!assets || !session.result) throw new Error("事件资产或结果尚未就绪");
    const sourceAssetHashes = Object.fromEntries(Object.entries(assets.integrity.files).map(([name, item]) => [name, item.sha256]));
    const packageValue = createVerifiedEventPackage({ result: session.result, memory: assets.memory, manifest: assets.manifest, sourceAssetHashes });
    const verification = verifyEventPackage(packageValue);
    if (!verification.valid) throw new Error("事件成果包校验失败");
    return packageValue;
  }, [assets, session.result]);

  const buildProductEvidenceBundle = useCallback(() => {
    const verifiedEventPackage = buildVerifiedPackage();
    return {
      schemaVersion: 1,
      verifiedEventPackage,
      evidenceAppendix: createProductEvidenceAppendix({
        eventId: verifiedEventPackage.eventId,
        residentSubmissions: session.residentSubmissions,
        propertyReviews: session.propertyReviews,
        evidence: session.productEvidenceTimeline
      })
    } satisfies VerifiedProductEvidenceBundle<VerifiedLifeEventPackage>;
  }, [buildVerifiedPackage, session.productEvidenceTimeline, session.propertyReviews, session.residentSubmissions]);

  useEffect(() => {
    if (!assets || !session.result || !["RESOLVED", "REOPENED"].includes(session.result.state)) {
      if (session.result && !["RESOLVED", "REOPENED"].includes(session.result.state)) {
        setCurrentPackage(null);
        sessionStorage.removeItem(LIFE_EVENT_PACKAGE_KEY);
      }
      return;
    }
    try {
      const packageValue = buildVerifiedPackage();
      setCurrentPackage(packageValue);
      sessionStorage.setItem(LIFE_EVENT_PACKAGE_KEY, JSON.stringify(packageValue));
    } catch {
      setCurrentPackage(null);
    }
  }, [assets, buildVerifiedPackage, session.result]);

  const resetLab = useCallback(() => {
    sessionStorage.removeItem(LAB_SESSION_KEY);
    sessionStorage.removeItem(LIFE_EVENT_PACKAGE_KEY);
    setCurrentPackage(null);
    setSession(initialSession());
  }, []);

  const value = useMemo<LifecycleJourneyValue>(() => ({
    session,
    setSession,
    hydrated,
    assets,
    assetError,
    engine,
    busy,
    currentPackage,
    patchControls,
    applyTemplate,
    evaluate,
    submitResidentEvidence,
    submitPropertyReview,
    attemptUnauthorized,
    decideAuthorization: decide,
    executeValveAction,
    submitIsolation,
    submitRepair,
    submitPostRepair,
    seedFromAgent,
    markWorkerEvidenceReady,
    resetLab,
    buildVerifiedPackage,
    buildProductEvidenceBundle
  }), [applyTemplate, assetError, assets, attemptUnauthorized, buildProductEvidenceBundle, buildVerifiedPackage, busy, currentPackage, decide, engine, evaluate, executeValveAction, hydrated, markWorkerEvidenceReady, patchControls, resetLab, seedFromAgent, session, submitIsolation, submitPostRepair, submitPropertyReview, submitRepair, submitResidentEvidence]);

  return <LifecycleJourneyContext.Provider value={value}>{children}</LifecycleJourneyContext.Provider>;
}

export function useLifecycleJourney() {
  const value = useContext(LifecycleJourneyContext);
  if (!value) throw new Error("useLifecycleJourney must be used inside LifecycleJourneyProvider");
  return value;
}
