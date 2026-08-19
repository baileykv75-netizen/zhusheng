"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BriefcaseBusiness, Building2, ChevronDown, ClipboardPenLine, Database, House, ListTree, Menu, Sparkles, UsersRound } from "lucide-react";
import { deriveJourneyView } from "@/lib/journey/index.ts";
import { productNavigation } from "@/lib/product/product-navigation";
import { useDemo } from "./demo-provider";
import { useLifecycleJourney } from "./lifecycle-journey-provider";
import { BuildingAgentDrawer } from "./building-agent/BuildingAgentDrawer";
import { useBuildingProductContext } from "./product/BuildingContextProvider";
import { ProductShellFrame } from "./product/ProductShellFrame";

const iconByHref = {
  "/events": ListTree,
  "/memory": Database,
  "/worker": ClipboardPenLine,
  "/resident": House,
  "/property": BriefcaseBusiness,
  "/group?mode=task": UsersRound
} as const;

const workspaceLinks = productNavigation.flatMap((item) => {
  if (!item.available || item.id === "OVERVIEW") return [];
  if (item.children) return item.children.map((child) => ({ ...child, group: item.label, english: item.english }));
  if (!item.href) return [];
  return [{ href: item.href, label: item.label, group: item.label, english: item.english }];
});

export function Shell({ children }: { children: React.ReactNode }) {
  const [agentOpen, setAgentOpen] = useState(false);
  const { state } = useDemo();
  const { session: lifecycleSession } = useLifecycleJourney();
  const product = useBuildingProductContext();
  const isHome = product.currentPath === "/";
  const isCinematic = product.presentationMode === "CINEMATIC";
  const journey = lifecycleSession.result
    ? deriveJourneyView({ source: "LIFE_EVENT", state: lifecycleSession.result.state })
    : deriveJourneyView({ source: "DEMO", snapshot: state });
  const locationContext = [product.floorId, product.unitId, product.spaceLabel].filter(Boolean).join(" / ");

  if (isCinematic) return <><ProductShellFrame mode={product.presentationMode} area={product.area}>
    <header className="exhibit-header">
      <Link href="/" className="exhibit-brand"><span>筑</span><strong>筑生</strong></Link>
      <nav className="exhibit-nav" aria-label="筑生产品导航"><Link href="/#concept">概念</Link><Link href="/events">生命事件</Link><Link href="/case-1602">1602深度事件</Link><button type="button" onClick={() => setAgentOpen(true)}><Sparkles size={13} />问这栋房子</button></nav>
      <Link href={isHome ? "/case-1602" : "/"} className="exhibit-header-action">{isHome ? "进入建筑事件" : "返回产品概念"}<ArrowRight size={15} /></Link>
    </header>
    <main>{children}</main>
  </ProductShellFrame><BuildingAgentDrawer open={agentOpen} onClose={() => setAgentOpen(false)} /></>;

  return <><ProductShellFrame mode={product.presentationMode} area={product.area}>
    <aside className="brand-rail compact-brand-rail" aria-hidden="true">
      <Link href="/" className="brand-signature" tabIndex={-1}>
        <span>筑</span><strong>筑生</strong>
      </Link>
      <div className="brand-life-mark"><i /><small>ONE BUILDING<br />ONE AGENT</small></div>
    </aside>

    <header className="floating-project-bar journey-project-bar product-topbar">
      <Link href="/" className="work-brand" aria-label="返回筑生建筑总览"><span>筑</span><strong>筑生</strong></Link>
      <Link href="/" className="project-identity" aria-label="筑生建筑总览">
        <span className="project-pulse" />
        <div><small>BUILDING LIFE / 02</small><strong>{product.buildingLabel}</strong></div>
      </Link>
      <div className="workspace-context"><span>{product.workspaceLabel}</span><em>{locationContext || journey.stateLabel}</em></div>
      <div className="project-meta"><span>{product.buildingId}</span><span className="runtime-mode"><i />脱敏演示数据</span></div>
      <button className="topbar-agent" type="button" onClick={() => setAgentOpen(true)}><Sparkles size={15} /><span>问这栋房子</span></button>
      <details className="workspace-menu">
        <summary aria-label="打开筑生产品导航"><Menu size={17} /><span>产品导航</span><ChevronDown size={13} /></summary>
        <nav aria-label="筑生产品导航">
          <Link href="/"><Building2 size={15} /><span>建筑总览</span></Link>
          {workspaceLinks.map(({ href, label, group, english }) => {
            const Icon = iconByHref[href as keyof typeof iconByHref] ?? Building2;
            const displayLabel = group === label ? label : `${group} · ${label}`;
            return <Link key={href} href={href} title={`${group} / ${english}`}><Icon size={15} /><span>{displayLabel}</span></Link>;
          })}
        </nav>
      </details>
    </header>

    <main data-journey-stage={journey.stage}>{children}</main>

    <nav className="mobile-task-nav" aria-label="移动端产品导航">
      <Link href="/case-1602"><Building2 size={17} /><span>{product.eventId ? "1602生命事件" : "建筑总览"}</span></Link>
      <details><summary><Menu size={17} /><span>{product.workspaceLabel}</span></summary><div><button type="button" onClick={() => setAgentOpen(true)}><Sparkles size={15} />问这栋房子</button>{workspaceLinks.map(({ href, label, group }) => { const Icon = iconByHref[href as keyof typeof iconByHref] ?? Building2; return <Link key={href} href={href}><Icon size={15} />{group === label ? label : `${group} · ${label}`}</Link>; })}</div></details>
    </nav>
  </ProductShellFrame><BuildingAgentDrawer open={agentOpen} onClose={() => setAgentOpen(false)} /></>;
}
