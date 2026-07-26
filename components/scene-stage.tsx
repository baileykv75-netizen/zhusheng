"use client";

import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ScanLine } from "lucide-react";
import { sceneAssets, type SceneFocus, type StageView, type VisualCue } from "@/lib/stage";

type SceneStageProps = {
  view: StageView;
  focus: SceneFocus;
  cues?: VisualCue[];
  activeFlow?: boolean;
  children: ReactNode;
};

export function SceneStage({ view, focus, cues = [], activeFlow = false, children }: SceneStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const frame = useRef<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const asset = sceneAssets[view];

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" || frame.current !== null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
    frame.current = requestAnimationFrame(() => {
      stageRef.current?.style.setProperty("--scene-x", `${x.toFixed(2)}px`);
      stageRef.current?.style.setProperty("--scene-y", `${y.toFixed(2)}px`);
      frame.current = null;
    });
  }

  function resetPointer() {
    stageRef.current?.style.setProperty("--scene-x", "0px");
    stageRef.current?.style.setProperty("--scene-y", "0px");
  }

  return (
    <section
      ref={stageRef}
      className={`scene-stage view-${view} focus-${focus}${activeFlow ? " flow-active" : ""}${imageLoaded ? " image-ready" : " image-loading"}${imageFailed ? " image-failed" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      style={{ "--scene-x": "0px", "--scene-y": "0px" } as CSSProperties}
    >
      <div className="scene-placeholder" aria-hidden="true"><i /><i /><i /><i /></div>
      <picture className="scene-picture">
        <source media="(max-width: 700px)" type="image/avif" srcSet={asset.mobileAvif} />
        <source media="(max-width: 700px)" type="image/webp" srcSet={asset.mobileWebp} />
        <source type="image/avif" srcSet={asset.desktopAvif} />
        <source type="image/webp" srcSet={asset.desktopWebp} />
        <img
          src={asset.desktopWebp}
          alt={asset.alt}
          onLoad={() => setImageLoaded(true)}
          onError={(event) => {
            if (!fallbackAttempted) {
              setFallbackAttempted(true);
              event.currentTarget.src = asset.fallback;
            } else {
              setImageFailed(true);
            }
          }}
        />
      </picture>
      <div className="scene-vignette" aria-hidden="true" />
      <div className="scene-grid" aria-hidden="true" />
      {!imageFailed && imageLoaded ? cues.map((cue) => (
        <div
          className={`scene-cue tone-${cue.tone || "neutral"}`}
          style={{ left: `${cue.x}%`, top: `${cue.y}%` }}
          key={cue.id}
        >
          <i />
          <span><strong>{cue.label}</strong><small>{cue.detail}</small></span>
        </div>
      )) : null}
      {imageFailed ? <div className="scene-load-error" role="status">建筑图像未能加载，已暂停空间热点。<button onClick={() => window.location.reload()}>重新加载</button></div> : null}
      <div className="demo-model-stamp"><ScanLine size={13} />脱敏演示模型</div>
      <div className="stage-content">{children}</div>
    </section>
  );
}
