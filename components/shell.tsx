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
  const currentPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  const { state, start, next, previous, reset, exit, goToChapter } = useDemo();
  const chapter = state.currentStep === 1 ? 1 : state.currentStep;
  const activeStep = chapter ? demoSteps[chapter - 1] : null;
  const demoActive = state.currentStep > 0;
  const workerSubstepLabels = ["", "现场口述", "AI整理", "品质核验"];
  const nextGoal = state.currentStep === 1
    ? ["", "生成结构化记录", "提交品质核验", "写入建筑记忆"][state.workerSubstep]
    : ["", "", "进入住户处置", "启动跨阶段诊断", "查看住户补充信息", "完成人工授权", "查看企业知识反馈", "演示完成"][state.currentStep];
  const authorizationBlocked = state.currentStep === 5 && state.incident?.status === "awaiting_authorization";

  function confirmReset() {
    if (window.confirm("确定重置引导演示并清除当前进度吗？")) reset();
  }

  return (
    <div className={demoActive ? "app-shell demo-active" : "app-shell"}>
      <aside className="brand-rail">
        <Link href="/" className="brand-signature" aria-label="筑生建筑生命工作台">
          <span>筑</span><strong>筑生</strong>
        </Link>
        <nav className="rail-nav" aria-label="产品视角">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={currentPath === href ? "active" : ""} title={label} aria-current={currentPath === href ? "page" : undefined}>
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
          <span className="runtime-mode"><i />脱敏演示数据</span>
        </div>
        {!demoActive ? (
          <button className="stage-primary" onClick={start}><Play size={15} fill="currentColor" /><span>开始2分钟演示</span></button>
        ) : (
          <span className="demo-live"><Pause size={13} />引导演示中</span>
        )}
      </header>

      <main>{children}</main>

      {demoActive && activeStep ? (
        <aside className="cinema-timeline" aria-label="引导演示控制器">
          <div className="timeline-copy">
            <span>{String(chapter).padStart(2, "0")}<small>/07</small></span>
            <div>
              <strong>第{chapter}章 · {activeStep.label}</strong>
              <small>{state.currentStep === 1 ? `本章进度 ${state.workerSubstep}/3：${workerSubstepLabels[state.workerSubstep]}` : `下一动作：${nextGoal}`}</small>
            </div>
          </div>
          <div className="timeline-track" aria-label={`当前第${state.currentStep}步，共7步`}>
            {demoSteps.map((step, index) => (
              <button
                key={step.id}
                className={index + 1 < chapter ? "done" : index + 1 === chapter ? "active" : ""}
                aria-label={`${index + 1}. ${step.label}`}
                disabled={index + 1 >= chapter}
                onClick={() => goToChapter(index + 1)}
              />
            ))}
          </div>
          <div className="timeline-actions">
            <button onClick={previous} aria-label="上一步" title="上一步"><ArrowLeft size={17} /></button>
            {state.currentStep === 7 ? (
              <>
                <button className="timeline-next" onClick={start}><RotateCcw size={15} />重新播放</button>
                <Link className="timeline-link" href="/">返回建筑生命</Link>
              </>
            ) : (
              <button className="timeline-next" onClick={next} disabled={authorizationBlocked}>
                {authorizationBlocked ? "等待授权" : "继续引导"}<ArrowRight size={16} />
              </button>
            )}
            <button onClick={confirmReset} aria-label="重置演示" title="重置演示"><RotateCcw size={16} /></button>
            <button onClick={exit} aria-label="退出演示" title="退出演示"><X size={17} /></button>
          </div>
        </aside>
      ) : null}

      <nav className="mobile-nav" aria-label="移动端产品视角">
        {navigation.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} className={currentPath === href ? "active" : ""} aria-current={currentPath === href ? "page" : undefined}>
            <Icon size={18} /><span>{short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
