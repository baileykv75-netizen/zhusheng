import { ArrowDown } from "lucide-react";
import { publicAssetPath } from "@/lib/site-path";
import { syntheticEvidenceCatalog, syntheticEvidenceTimelineIds } from "@/lib/product/evidence";

const labels = [
  ["施工", "接头安装留痕"],
  ["入住异常", "北侧墙角潮湿"],
  ["人工观察", "无人用水水表观察"],
  ["维修", "局部接头维修记录"],
  ["复验", "恢复供水后的新观察"]
] as const;

export function EvidenceTimeChain() {
  const items = syntheticEvidenceTimelineIds.map((id) => syntheticEvidenceCatalog.find((item) => item.id === id)!);
  return <section className="evidence-time-chain" aria-labelledby="evidence-time-chain-title">
    <header><p>REALITY ↔ SPACE ↔ BIM ↔ MEMORY</p><h2 id="evidence-time-chain-title">证据不是图库，<br />它们发生在同一条时间线上。</h2><span>以下图片全部为 AI_GENERATED · DEMO_SYNTHETIC，用于表达产品关系，不是真实项目照片。</span></header>
    <ol>
      {items.map((item, index) => <li key={item.id}>
        <figure><img src={publicAssetPath(item.assetPath!)} alt={`${labels[index][1]}的AI生成脱敏合成演示`} /><figcaption>{item.disclosure}</figcaption></figure>
        <div><small>{String(index + 1).padStart(2, "0")} / {labels[index][0]}</small><strong>{labels[index][1]}</strong><p>{item.spaceId}<br />{item.componentId ?? "未关联构件"}</p><code>{item.type}</code><details><summary>证据身份</summary><dl><div><dt>事件</dt><dd>{item.eventId}</dd></div><div><dt>提交者</dt><dd>{item.submittedBy}</dd></div><div><dt>时间</dt><dd>{new Date(item.capturedAt).toLocaleString("zh-CN", { hour12: false })}</dd></div><div><dt>来源</dt><dd>{item.source}</dd></div><div><dt>数据</dt><dd>{item.dataClass}</dd></div></dl></details></div>
        {index < items.length - 1 ? <ArrowDown aria-hidden="true" /> : null}
      </li>)}
    </ol>
  </section>;
}
