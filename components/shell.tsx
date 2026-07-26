"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ClipboardPenLine,
  House,
  Pause,
  Play,
  RotateCcw,
  UsersRound,
  X
} from "lucide-react";
import { demoSteps } from "@/lib/demo-engine";
import { useDemo } from "./demo-provider";

const navigation = [
  { href: "/", label: "建筑生命", short: "建筑", icon: Building2 },
  { href: "/worker", label: "工友记录", short: "工友", icon: ClipboardPenLine },
  { href: "/resident", label: "住户处置", short: "住户", icon: House },
  { href: "/group", label: "集团管理", short: "集团", icon: UsersRound }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, start, next, previous, reset } = useDemo();
  const activeStep = state.currentStep ? demoSteps[state.currentStep - 1] : null;
  const demoActive = state.currentStep > 0;
  const modeText = state.runtimeMode === "ai" ? "AI ONLINE" : state.runtimeMode === "degraded" ? "DEGRADED" : "DEMO FALLBACK";

  return (
    <div className={demoActive ? "app-shell demo-active" : "app-shell"}>
      <aside className="brand-rail">
        <Link href="/" className="brand-signature" aria-label="筑生建筑生命工作台">
          <span>筑</span><strong>筑生</strong>
        </Link>
        <nav className="rail-nav" aria-label="产品视角">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""} title={label}>
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <span className="rail-version">V4 / 01</span>
      </aside>

      <header className="floating-project-bar">
        <div className="project-identity">
          <span className="project-pulse" />
          <div><small>BUILDING LIFE / 02</small><strong>华章新筑 · 2号楼</strong></div>
        </div>
        <div className="project-meta">
          <span>BLD-HZZ-02</span>
          <span className={`runtime-mode ${state.runtimeMode}`}><i />{modeText}</span>
        </div>
        {!demoActive ? (
          <button className="stage-primary" onClick={start}><Play size={15} fill="currentColor" />开始2分钟演示</button>
        ) : (
          <span className="demo-live"><Pause size={13} />GUIDED SESSION</span>
        )}
      </header>

      <main>{children}</main>

      {demoActive && activeStep ? (
        <aside className="cinema-timeline" aria-label="引导演示控制器">
          <div className="timeline-copy">
            <span>{String(state.currentStep).padStart(2, "0")}<small>/07</small></span>
            <div><strong>{activeStep.label}</strong><small>{activeStep.task}</small></div>
          </div>
          <div className="timeline-track" aria-label={`当前第${state.currentStep}步，共7步`}>
            {demoSteps.map((step, index) => (
              <i key={step.id} className={index + 1 < state.currentStep ? "done" : index + 1 === state.currentStep ? "active" : ""} />
            ))}
          </div>
          <div className="timeline-actions">
            <button onClick={previous} aria-label="上一步" title="上一步"><ArrowLeft size={17} /></button>
            <button className="timeline-next" onClick={next} disabled={state.currentStep === 7}>
              {state.currentStep === 7 ? "演示完成" : "下一步"}<ArrowRight size={16} />
            </button>
            <button onClick={reset} aria-label="重置演示" title="重置演示"><RotateCcw size={16} /></button>
            <button onClick={reset} aria-label="退出演示" title="退出演示"><X size={17} /></button>
          </div>
        </aside>
      ) : null}

      <nav className="mobile-nav" aria-label="移动端产品视角">
        {navigation.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            <Icon size={18} /><span>{short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
