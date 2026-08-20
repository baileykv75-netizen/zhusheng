"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Expand, X } from "lucide-react";
import { evidenceAssets, type EvidenceAssetId } from "@/lib/evidence";

export function EvidenceStrip({ ids, label = "脱敏参考素材" }: { ids: EvidenceAssetId[]; label?: string }) {
  const [active, setActive] = useState<EvidenceAssetId | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!active) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeViewer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  function openViewer(id: EvidenceAssetId, event: MouseEvent<HTMLButtonElement>) {
    triggerRef.current = event.currentTarget;
    setActive(id);
  }

  function closeViewer() {
    setActive(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const selected = active ? evidenceAssets[active] : null;

  return (
    <>
      <section className="evidence-strip" aria-label={label}>
        {ids.map((id) => {
          const item = evidenceAssets[id];
          return (
            <button className="evidence-card" key={id} onClick={(event) => openViewer(id, event)} aria-label={`查看${item.type}`}>
              <img src={item.src} alt="" loading="lazy" />
              <span><small>{item.type}</small><strong>{item.object}</strong><em>{item.dataClass} · {item.status}</em></span>
              <Expand size={14} />
            </button>
          );
        })}
      </section>
      {selected && typeof document !== "undefined" ? createPortal(
        <div className="evidence-viewer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeViewer(); }}>
          <section role="dialog" aria-modal="true" aria-label={`${selected.type}详情`}>
            <header><div><small>DEMO_SYNTHETIC · 脱敏合成参考</small><strong>{selected.type}</strong></div><button ref={closeRef} onClick={closeViewer} aria-label="关闭证据查看器"><X size={18} /></button></header>
            <img src={selected.src} alt={selected.alt} />
            <p>{selected.disclosure}</p>
            <dl><div><dt>关联对象</dt><dd>{selected.object}</dd></div><div><dt>示例时间</dt><dd>{selected.capturedAt}</dd></div><div><dt>示例状态</dt><dd>{selected.status}</dd></div><div><dt>数据身份</dt><dd>{selected.dataClass}</dd></div></dl>
          </section>
        </div>, document.body) : null}
    </>
  );
}
