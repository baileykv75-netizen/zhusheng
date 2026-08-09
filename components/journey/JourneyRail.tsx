import { Check } from "lucide-react";
import { JOURNEY_STAGES, type JourneyStage } from "@/lib/journey/index.ts";

const stageLabels: Record<JourneyStage, string> = {
  REPORT: "描述问题",
  CONFIRM: "核对事实",
  MEMORY: "调取建造记忆",
  DIAGNOSIS: "联合诊断",
  AUTHORIZATION: "授权与隔离验证",
  REPAIR: "维修与复验",
  GROUP_FEEDBACK: "集团经验回流"
};

export function JourneyRail({ current }: { current: JourneyStage }) {
  const currentIndex = JOURNEY_STAGES.indexOf(current);
  return <ol className="journey-rail" aria-label={`建筑生命任务线，当前阶段：${stageLabels[current]}`}>
    {JOURNEY_STAGES.map((stage, index) => <li key={stage} className={index < currentIndex ? "done" : index === currentIndex ? "active" : ""} aria-current={index === currentIndex ? "step" : undefined}>
      <i>{index < currentIndex ? <Check size={11} /> : String(index + 1).padStart(2, "0")}</i>
      <span><small>阶段 {index + 1}</small><strong>{stageLabels[stage]}</strong></span>
    </li>)}
  </ol>;
}
