"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ClipboardPenLine,
  House,
  RotateCcw,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";
import { demoSteps } from "@/lib/demo-engine";
import { useDemo } from "./demo-provider";

const navigation = [
  { href: "/", label: "建筑生命", icon: Building2 },
  { href: "/worker", label: "工友记录", icon: ClipboardPenLine },
  { href: "/resident", label: "住户处置", icon: House },
  { href: "/group", label: "集团管理", icon: UsersRound }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, start, next, previous, reset } = useDemo();
  const activeStep = state.currentStep ? demoSteps[state.currentStep - 1] : null;
  const demoActive = state.currentStep > 0;

  return (
    <div className={demoActive ? "app-shell demo-active" : "app-shell"}>
      <header className="project-bar">
        <Link href="/" className="identity" aria-label="筑生建筑生命工作台">
          <span className="identity-mark" aria-hidden="true">筑</span>
          <span>
            <strong>筑生</strong>
            <small>建筑全生命周期智能体</small>
          </span>
        </Link>
        <div className="project-context">
          <span>华章新筑 · 2号楼</span>
          <span className="project-code">BLD-HZZ-02</span>
          <span className={`runtime ${state.runtimeMode}`}>
            <i />
            {state.runtimeMode === "ai" ? "AI在线" : state.runtimeMode === "degraded" ? "降级运行" : "演示回退"}
          </span>
        </div>
        <button className="primary-action" onClick={start}>
          <ArrowRight size={16} />
          开始2分钟演示
        </button>
      </header>

      <nav className="section-nav" aria-label="产品视角">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <main>{children}</main>

      {demoActive && activeStep ? (
        <aside className="demo-command" aria-label="引导演示控制器">
          <div className="demo-index">
            <span>{String(state.currentStep).padStart(2, "0")}</span>
            <small>/ 07</small>
          </div>
          <div className="demo-task">
            <strong>{activeStep.label}</strong>
            <span>{activeStep.task}</span>
          </div>
          <div className="demo-progress" aria-label={`演示进度 ${state.currentStep}/7`}>
            {demoSteps.map((step, index) => (
              <i key={step.id} className={index < state.currentStep ? "done" : ""} />
            ))}
          </div>
          <div className="demo-buttons">
            <button className="icon-action" onClick={previous} aria-label="上一步" title="上一步">
              <ArrowLeft size={17} />
            </button>
            <button className="demo-next" onClick={next} disabled={state.currentStep === 7}>
              {state.currentStep === 7 ? "演示完成" : "下一步"}
              <ArrowRight size={16} />
            </button>
            <button className="icon-action" onClick={reset} aria-label="重置演示" title="重置演示">
              <RotateCcw size={16} />
            </button>
            <button className="icon-action close" onClick={reset} aria-label="退出演示" title="退出演示">
              <X size={17} />
            </button>
          </div>
        </aside>
      ) : null}

      <footer className="site-footer">
        <span><ShieldCheck size={14} /> 演示数据 · 不含真实住户与工友信息</span>
        <span>筑生 v2.0</span>
      </footer>
    </div>
  );
}
