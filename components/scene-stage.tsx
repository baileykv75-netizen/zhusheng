"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
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
      className={`scene-stage view-${view} focus-${focus}${activeFlow ? " flow-active" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      style={{ "--scene-x": "0px", "--scene-y": "0px" } as CSSProperties}
    >
      <picture className="scene-picture">
        <source media="(max-width: 700px)" type="image/avif" srcSet={asset.mobileAvif} />
        <source media="(max-width: 700px)" type="image/webp" srcSet={asset.mobileWebp} />
        <source type="image/avif" srcSet={asset.desktopAvif} />
        <source type="image/webp" srcSet={asset.desktopWebp} />
        <img
          src={asset.desktopWebp}
          alt={asset.alt}
          onError={(event) => {
            if (!event.currentTarget.src.endsWith(asset.fallback)) event.currentTarget.src = asset.fallback;
          }}
        />
      </picture>
      <div className="scene-vignette" aria-hidden="true" />
      <div className="scene-grid" aria-hidden="true" />
      {cues.map((cue) => (
        <div
          className={`scene-cue tone-${cue.tone || "neutral"}`}
          style={{ left: `${cue.x}%`, top: `${cue.y}%` }}
          key={cue.id}
        >
          <i />
          <span><strong>{cue.label}</strong><small>{cue.detail}</small></span>
        </div>
      ))}
      <div className="demo-model-stamp"><ScanLine size={13} />脱敏演示模型</div>
      <div className="stage-content">{children}</div>
    </section>
  );
}
