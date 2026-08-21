"use client";

import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { useBuildingProductContext } from "@/components/product/BuildingContextProvider";
import { derivePropertyEventViewModel } from "@/lib/product/property-event-view-model";
import { deriveObjectHandoffs } from "@/lib/product/object-handoff";
import styles from "./ObjectHandoffBar.module.css";

export function ObjectHandoffBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useLifecycleJourney();
  const product = useBuildingProductContext();
  const model = useMemo(() => derivePropertyEventViewModel(session), [session]);
  const memoryRecordId = searchParams.get("record");
  const handoffs = useMemo(() => deriveObjectHandoffs({
    pathname,
    memoryRecordId,
    selectedBusinessId: product.selectedBusinessId,
    result: session.result,
    currentCandidateIds: model.assessment.targetBusinessIds,
    pendingResidentAssessment: model.pendingResidentAssessment,
    agentResult: product.agentResult
  }), [memoryRecordId, model.assessment.targetBusinessIds, model.pendingResidentAssessment, pathname, product.agentResult, product.selectedBusinessId, session.result]);

  if (!handoffs.length) return null;

  return <aside className={styles.bar} aria-label="跨角色对象交接">
    <header>
      <div><Link2 size={14} aria-hidden="true" /><span>OBJECT HANDOFF / 对象身份交接</span></div>
      <strong>继续查看同一个建筑对象</strong>
    </header>
    <div className={styles.links}>
      {handoffs.slice(0, 4).map((item) => <Link
        key={`${item.source}:${item.businessId}`}
        href={item.href}
        className={styles.link}
        data-object-handoff-source={item.source}
        data-business-id={item.businessId}
      >
        <span>{item.label}</span>
        <strong>{item.displayName}</strong>
        <small>{item.businessId}</small>
        <ArrowRight size={14} aria-hidden="true" />
      </Link>)}
    </div>
    <p>{model.pendingResidentAssessment
      ? "本轮事实仍待评估：不展示上一轮候选、授权对象或维修目标。对象交接只保留可验证的身份上下文。"
      : "只交接对象身份与来源；不会创建或改变事件、候选、授权、设备动作和维修状态。"}</p>
  </aside>;
}
