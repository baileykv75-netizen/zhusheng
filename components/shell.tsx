"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Building2, ChevronDown, ClipboardPenLine, House, Menu, UsersRound } from "lucide-react";
import { deriveJourneyView } from "@/lib/journey/index.ts";
import { useDemo } from "./demo-provider";
import { useLifecycleJourney } from "./lifecycle-journey-provider";

const workspaces = [
  { href: "/worker", label: "施工证据采集", icon: ClipboardPenLine },
  { href: "/resident?mode=task", label: "住户事件处置", icon: House },
  { href: "/group?mode=task", label: "集团人工治理", icon: UsersRound }
] as const;

const workspaceLabels: Record<string, string> = {
  "/": "筑生总智能体",
  "/case-1602": "1602验证舱",
  "/worker": "施工证据采集",
  "/resident": "住户事件处置",
  "/group": "集团人工治理"
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  const { state } = useDemo();
  const { session: lifecycleSession } = useLifecycleJourney();
  const isHome = currentPath === "/";
  const isExhibit = isHome || currentPath === "/case-1602";
  const workspaceLabel = workspaceLabels[currentPath] ?? "专业工作台";
  const journey = lifecycleSession.result
    ? deriveJourneyView({ source: "LIFE_EVENT", state: lifecycleSession.result.state })
    : deriveJourneyView({ source: "DEMO", snapshot: state });

  if (isExhibit) return <div className="exhibit-shell">
    <header className="exhibit-header">
      <Link href="/" className="exhibit-brand"><span>筑</span><strong>筑生</strong></Link>
      <nav aria-label="筑生展演导航"><Link href="/#concept">概念</Link><Link href="/#continuum">生命线</Link><Link href="/case-1602">1602验证舱</Link></nav>
      <Link href={isHome ? "/case-1602" : "/"} className="exhibit-header-action">{isHome ? "查看验证" : "返回概念"}<ArrowRight size={15} /></Link>
    </header>
    <main>{children}</main>
  </div>;

  return <div className="app-shell journey-shell">
    <aside className="brand-rail compact-brand-rail">
      <Link href="/" className="brand-signature" aria-label="返回筑生总智能体">
        <span>筑</span><strong>筑生</strong>
      </Link>
      <div className="brand-life-mark"><i /><small>ONE BUILDING<br />ONE AGENT</small></div>
    </aside>

    <header className="floating-project-bar journey-project-bar">
      <Link href="/" className="project-identity" aria-label="筑生总智能体首页">
        <span className="project-pulse" />
        <div><small>BUILDING LIFE / 02</small><strong>华章新筑 · 2号楼</strong></div>
      </Link>
      <div className="workspace-context"><span>{workspaceLabel}</span><em>{journey.stateLabel}</em></div>
      <div className="project-meta"><span>BLD-HZZ-02</span><span className="runtime-mode"><i />脱敏演示数据</span></div>
      {!isHome ? <Link className="return-agent" href="/case-1602"><Building2 size={15} />返回1602验证舱</Link> : null}
      <details className="workspace-menu">
        <summary aria-label="打开专业工作台菜单"><Menu size={17} /><span>专业工具</span><ChevronDown size={13} /></summary>
        <nav aria-label="专业工作台">
          {workspaces.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={15} /><span>{label}</span></Link>)}
        </nav>
      </details>
    </header>

    <main data-journey-stage={journey.stage}>{children}</main>

    <nav className="mobile-task-nav" aria-label="移动端工作台导航">
      <Link href="/case-1602"><Building2 size={17} /><span>1602验证舱</span></Link>
      <details><summary><Menu size={17} /><span>{isHome ? "专业工具" : workspaceLabel}</span></summary><div>{workspaces.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={15} />{label}</Link>)}</div></details>
    </nav>
  </div>;
}
