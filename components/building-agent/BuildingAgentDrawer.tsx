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
    <aside className="building-agent-drawer">
      <header className="agent-drawer-header">
        <div>
          <span>ASK THE BUILDING</span>
          <h2>问这栋房子</h2>
          <p>从1602已经留下的施工、验收、交付与运行记忆开始回答，而不是先给一份通用故障清单。</p>
        </div>
        <div className="agent-header-actions">
          <em className="agent-mode">{building1602Dataset.records.length} 条记忆 · {memoryTradeCount} 类专业/阶段</em>
          <button ref={closeRef} onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
      </header>

      <div className="agent-boundary">
        <ShieldCheck size={15} />
        <span>它可以查询、解释和提出验证建议；授权、设备动作和维修结果仍由对应的人与受控流程完成。</span>
      </div>

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
        <span><Database size={13} />{building1602Dataset.records.length} 条生命周期记忆</span>
        <span><LocateFixed size={13} />16F / 1602 / 卫生间</span>
        <span><Sparkles size={13} />本楼事实优先</span>
        {agentObjectHref ? <Link href={agentObjectHref} onClick={onClose} data-agent-object-handoff data-business-id={agentObjectId ?? undefined}>
          查看{agentObject?.displayName ?? "查询对象"}的一生<ArrowRight size={13} />
        </Link> : null}
        <Link href="/property" onClick={onClose}>进入物业事件处理<ArrowRight size={13} /></Link>
      </footer>
    </aside>
  </div>, document.body);
}
