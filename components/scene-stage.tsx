"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ScanLine } from "lucide-react";
import {
  defaultSceneByView,
  sceneAssets,
  type SceneFocus,
  type SceneId,
  type SceneOverlay,
  type StageView,
  type VisualCue
} from "@/lib/stage";

type SceneStageProps = {
  view: StageView;
  scene?: SceneId;
  focus: SceneFocus;
  overlay?: SceneOverlay;
  preload?: SceneId[];
  cues?: VisualCue[];
  activeFlow?: boolean;
  children: ReactNode;
};

const decodedScenes = new Set<SceneId>();

function preloadScene(scene: SceneId) {
  if (decodedScenes.has(scene)) return Promise.resolve();
  const asset = sceneAssets[scene];
  const source = window.matchMedia("(max-width: 700px)").matches ? asset.mobileAvif : asset.desktopAvif;
  const image = new Image();
  image.src = source;
  return (image.decode ? image.decode() : new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
  })).then(() => { decodedScenes.add(scene); });
}

export function SceneStage({
  view,
  scene,
  focus,
  overlay = "none",
  preload = [],
  cues = [],
  activeFlow = false,
  children
}: SceneStageProps) {
  const requestedScene = scene || defaultSceneByView[view];
  const stageRef = useRef<HTMLElement>(null);
  const activeSceneRef = useRef<SceneId>(requestedScene);
  const transitionTimer = useRef<number | null>(null);
  const pointerFrame = useRef<number | null>(null);
  const [activeScene, setActiveScene] = useState<SceneId>(requestedScene);
  const [previousScene, setPreviousScene] = useState<SceneId | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const asset = sceneAssets[activeScene];
  const acceptedCues = useRef(cues);
  const acceptedOverlay = useRef(overlay);

  if (activeScene === requestedScene) {
    acceptedCues.current = cues;
    acceptedOverlay.current = overlay;
  }

  useEffect(() => {
    if (requestedScene === activeSceneRef.current) return;
    let cancelled = false;
    preloadScene(requestedScene).then(() => {
      if (cancelled) return;
      const oldScene = activeSceneRef.current;
      activeSceneRef.current = requestedScene;
      setPreviousScene(oldScene);
      setActiveScene(requestedScene);
      setFallbackAttempted(false);
      setImageFailed(false);
      setImageLoaded(true);
      setTransitioning(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitioning(false)));
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(() => setPreviousScene(null), 360);
    }).catch(() => {
      // Keep the current decoded scene when the target cannot be loaded.
    });
    return () => { cancelled = true; };
  }, [requestedScene]);

  useEffect(() => {
    if (!imageLoaded || preload.length === 0) return;
    const timer = window.setTimeout(() => {
      preload.filter((id) => id !== activeSceneRef.current).forEach((id) => { void preloadScene(id).catch(() => undefined); });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [imageLoaded, preload]);

  useEffect(() => {
    const image = stageRef.current?.querySelector<HTMLImageElement>(".scene-picture.current img");
    if (image?.complete && image.naturalWidth > 0) {
      decodedScenes.add(activeScene);
      setImageLoaded(true);
    }
  }, [activeScene, fallbackAttempted]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    if (pointerFrame.current) cancelAnimationFrame(pointerFrame.current);
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" || pointerFrame.current !== null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
    pointerFrame.current = requestAnimationFrame(() => {
      stageRef.current?.style.setProperty("--scene-x", `${x.toFixed(2)}px`);
      stageRef.current?.style.setProperty("--scene-y", `${y.toFixed(2)}px`);
      pointerFrame.current = null;
    });
  }

  function resetPointer() {
    stageRef.current?.style.setProperty("--scene-x", "0px");
    stageRef.current?.style.setProperty("--scene-y", "0px");
  }

  function renderPicture(sceneId: SceneId, role: "current" | "previous") {
    const sceneAsset = sceneAssets[sceneId];
    const style = {
      "--scene-focus-x": `${sceneAsset.focalPoint.x}%`,
      "--scene-focus-y": `${sceneAsset.focalPoint.y}%`,
      "--scene-mobile-focus-x": `${sceneAsset.mobileFocalPoint.x}%`,
      "--scene-mobile-focus-y": `${sceneAsset.mobileFocalPoint.y}%`
    } as CSSProperties;
    const isCurrent = role === "current";

    if (isCurrent && fallbackAttempted) {
      return <picture className={`scene-picture ${role}`} style={style} key={`${sceneId}-fallback`}><img src={sceneAsset.fallback} alt={sceneAsset.alt} onLoad={() => setImageLoaded(true)} onError={() => setImageFailed(true)} /></picture>;
    }

    return (
      <picture className={`scene-picture ${role}`} style={style} key={`${sceneId}-${role}`} aria-hidden={!isCurrent}>
        <source media="(max-width: 700px)" type="image/avif" srcSet={sceneAsset.mobileAvif} />
        <source media="(max-width: 700px)" type="image/webp" srcSet={sceneAsset.mobileWebp} />
        <source type="image/avif" srcSet={sceneAsset.desktopAvif} />
        <source type="image/webp" srcSet={sceneAsset.desktopWebp} />
        <img
          src={sceneAsset.desktopWebp}
          alt={isCurrent ? sceneAsset.alt : ""}
          loading={isCurrent ? "eager" : "lazy"}
          onLoad={isCurrent ? () => { decodedScenes.add(sceneId); setImageLoaded(true); } : undefined}
          onError={isCurrent ? () => setFallbackAttempted(true) : undefined}
        />
      </picture>
    );
  }

  return (
    <section
      ref={stageRef}
      data-scene={activeScene}
      className={`scene-stage view-${view} focus-${focus} overlay-${acceptedOverlay.current}${activeFlow ? " flow-active" : ""}${imageLoaded ? " image-ready" : " image-loading"}${imageFailed ? " image-failed" : ""}${transitioning ? " scene-transitioning" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      style={{ "--scene-x": "0px", "--scene-y": "0px", "--scene-placeholder": `url(${asset.placeholder})` } as CSSProperties}
    >
      <div className="scene-placeholder" aria-hidden="true"><i /><i /><i /><i /></div>
      {previousScene ? renderPicture(previousScene, "previous") : null}
      {renderPicture(activeScene, "current")}
      <div className="scene-vignette" aria-hidden="true" />
      <div className="scene-grid" aria-hidden="true" />
      <div className="scene-business-overlay" aria-hidden="true"><i /><span /></div>
      {!imageFailed && imageLoaded ? acceptedCues.current.map((cue) => (
        <div className={`scene-cue tone-${cue.tone || "neutral"}`} style={{ left: `${cue.x}%`, top: `${cue.y}%` }} key={`${activeScene}-${cue.id}`}>
          <i /><span><strong>{cue.label}</strong><small>{cue.detail}</small></span>
        </div>
      )) : null}
      {imageFailed ? <div className="scene-load-error" role="status">建筑图像未能加载，已暂停空间热点。<button onClick={() => window.location.reload()}>重新加载</button></div> : null}
      <div className="demo-model-stamp"><ScanLine size={13} />脱敏演示模型</div>
      <div className="stage-content">{children}</div>
    </section>
  );
}
