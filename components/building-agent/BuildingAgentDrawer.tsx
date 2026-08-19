"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Database, LocateFixed, ShieldCheck, Sparkles, X } from "lucide-react";
import { BuildingIntelligenceWorkspace } from "@/components/BuildingIntelligenceWorkspace";
import { building1602Dataset } from "@/lib/building-intelligence/catalog.ts";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";

const memoryTradeCount = new Set(building1602Dataset.records.map((record) => record.memory?.trade).filter(Boolean)).size;

export function BuildingAgentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const product = useBuildingProductContext();

  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);

  if (!open) return null;
  return createPortal(<div className="building-agent-shell" role="dialog" aria-modal="true" aria-label="问这栋房子">
    <button className="building-agent-scrim" aria-label="关闭问这栋房子" onClick={onClose} />
    <aside className="building-agent-drawer">
      <header className="agent-drawer-header">
        <div>
          <span>ASK THE BUILDING</span>
          <h2>问这栋房子</h2>
          <p>直接查询 1602 的施工、验收、交付与运行记忆；原因类问题优先使用这栋房子的历史，而不是通用故障清单。</p>
        </div>
        <div className="agent-header-actions">
          <em className="agent-mode">{building1602Dataset.records.length} 条记忆 · {memoryTradeCount} 类专业/阶段</em>
          <button ref={closeRef} onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
      </header>

      <div className="agent-boundary">
        <ShieldCheck size={15} />
        <span>建筑事实、工程假设和确认诊断严格分层。这里可以查询和推理，但不会替你授权、执行阀门动作、写入维修结果或改变事件状态。</span>
      </div>

      <div className="agent-body">
        <BuildingIntelligenceWorkspace
          idPrefix="global-building-agent"
          selectedBusinessId={product.selectedBusinessId}
          result={product.agentResult}
          onResult={product.setAgentResult}
          showVisualState={Boolean(product.queryVisual)}
        />
      </div>

      <footer className="agent-drawer-footer">
        <span><Database size={13} />{building1602Dataset.records.length} 条生命周期记忆</span>
        <span><LocateFixed size={13} />16F / 1602 / 卫生间</span>
        <span><Sparkles size={13} />LIVE AI + 确定性建筑工具</span>
        <Link href="/property" onClick={onClose}>进入受控事件处理<ArrowRight size={13} /></Link>
      </footer>
    </aside>
  </div>, document.body);
}
