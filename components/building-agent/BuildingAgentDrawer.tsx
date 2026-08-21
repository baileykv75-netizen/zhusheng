"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Database, LocateFixed, ShieldCheck, Sparkles, X } from "lucide-react";
import { BuildingIntelligenceWorkspace } from "@/components/BuildingIntelligenceWorkspace";
import { building1602Dataset, entityById } from "@/lib/building-intelligence/catalog.ts";
import { componentLifeHref, resolveComponentLifeObjectId } from "@/lib/product/component-life-link";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";

const memoryTradeCount = new Set(building1602Dataset.records.map((record) => record.memory?.trade).filter(Boolean)).size;

export function BuildingAgentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const product = useBuildingProductContext();
  const hasSharedVisualScene = ["/case-1602", "/property"].includes(product.currentPath) && Boolean(product.queryVisual);
  const visual = product.agentResult?.visualDirective;
  const agentObjectId = product.agentResult
    ? [
        ...(visual?.targetBusinessIds ?? []),
        ...(visual?.revealBusinessIds ?? []),
        product.agentResult.selectedBusinessId ?? null
      ].map((id) => resolveComponentLifeObjectId(id)).find((id): id is string => Boolean(id)) ?? null
    : null;
  const agentObjectHref = agentObjectId ? componentLifeHref(agentObjectId) : null;
  const agentObject = agentObjectId ? entityById(agentObjectId) : null;

  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);

  if (!open) return null;
  return createPortal(<div className="building-agent-shell" role="dialog" aria-modal="true" aria-label="问这栋房子">
    <button className="building-agent-scrim" aria-label="关闭问这栋房子" onClick={onClose} />
    <aside className="building-agent-drawer" data-agent-layout="wide">
      <header className="agent-drawer-header">
        <div className="agent-header-copy">
          <span className="agent-eyebrow">ASK THE BUILDING</span>
          <h2>问这栋房子</h2>
          <p>先查这栋楼已经留下的施工、验收、交付与运行事实，再组织回答。</p>
          <div className="agent-context-meta" aria-label="筑生建筑查询上下文">
            <span><Database size={13} /><strong>{building1602Dataset.records.length}</strong> 条生命周期记忆</span>
            <span><LocateFixed size={13} />16F / 1602 / 卫生间</span>
            <span><Sparkles size={13} /><strong>{memoryTradeCount}</strong> 类专业 / 阶段</span>
          </div>
          <div className="agent-header-boundary">
            <ShieldCheck size={14} />
            <span>可查询、解释和提出验证建议；授权、设备动作与维修结果仍由人员和受控流程完成。</span>
          </div>
        </div>
        <div className="agent-header-actions">
          <button ref={closeRef} onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
      </header>

      <div className="agent-body">
        <BuildingIntelligenceWorkspace
          idPrefix="global-building-agent"
          selectedBusinessId={product.selectedBusinessId}
          result={product.agentResult}
          onResult={product.setAgentResult}
          showVisualState={hasSharedVisualScene}
        />
      </div>

      <footer className="agent-drawer-footer">
        <div className="agent-footer-actions">
          {agentObjectHref ? <Link href={agentObjectHref} onClick={onClose} data-agent-object-handoff data-business-id={agentObjectId ?? undefined}>
            查看{agentObject?.displayName ?? "查询对象"}的一生<ArrowRight size={13} />
          </Link> : null}
          <Link href="/property" onClick={onClose}>进入物业事件处理<ArrowRight size={13} /></Link>
        </div>
      </footer>
    </aside>
  </div>, document.body);
}
