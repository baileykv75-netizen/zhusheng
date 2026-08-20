import { ArrowDown } from "lucide-react";
import { publicAssetPath } from "@/lib/site-path";
import { syntheticEvidenceCatalog } from "@/lib/product/evidence";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";

const constructionMemory = syntheticEvidenceCatalog.find((item) => item.type === "CONSTRUCTION_MEMORY")!;
const baselineEvidenceTypes = new Set(["PIPE_INSTALLATION_RECORD", "WATERPROOFING_RECORD", "CLOSED_WATER_TEST"]);

const domainEvidenceLabels: Record<string, string> = {
  RESIDENT_WALL_PHOTO: "住户墙面观察进入领域证据",
  METER_READING: "住户水表观察进入领域证据",
  VALVE_ISOLATION_OBSERVATION: "隔离后的新观察",
  REPAIR_RESULT: "维修结果证据"
};

const metricLabels: Record<string, string> = {
  RELATIVE_HUMIDITY: "湿度系统观测",
  MICRO_FLOW: "微流量系统观测"
};

type TimelineRow =
  | { kind: "construction"; id: string; capturedAt: string }
  | { kind: "product"; id: string; capturedAt: string; index: number }
  | { kind: "domain"; id: string; capturedAt: string; index: number }
  | { kind: "observation"; id: string; capturedAt: string; index: number }
  | { kind: "repair"; id: string; capturedAt: string; index: number };

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function EvidenceTimeChain() {
  const { session } = useLifecycleJourney();
  const result = session.result;
  const productItems = session.productEvidenceTimeline ?? [];
  const domainEvidence = result
    ? result.input.evidence.filter((item) => !baselineEvidenceTypes.has(item.type))
    : [];
  const observations = result?.input.observations ?? [];
  const repairs = result?.repairRecords ?? [];

  const rows: TimelineRow[] = [
    { kind: "construction", id: constructionMemory.id, capturedAt: constructionMemory.capturedAt },
    ...productItems.map((item, index) => ({ kind: "product" as const, id: item.id, capturedAt: item.capturedAt, index })),
    ...domainEvidence.map((item, index) => ({ kind: "domain" as const, id: item.id, capturedAt: item.capturedAt ?? result!.input.evaluatedAt, index })),
    ...observations.map((item, index) => ({ kind: "observation" as const, id: item.id, capturedAt: item.observedAt, index })),
    ...repairs.map((item, index) => ({ kind: "repair" as const, id: item.repairRecordId, capturedAt: item.submittedAt, index }))
  ].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));

  return <section className="evidence-time-chain" aria-labelledby="evidence-time-chain-title">
    <header>
      <p>REALITY ↔ SPACE ↔ BIM ↔ MEMORY</p>
      <h2 id="evidence-time-chain-title">证据不是图库，<br />只显示已经发生的记录。</h2>
      <span>建造期图片为 AI_GENERATED · DEMO_SYNTHETIC；住户、系统、维修与复验项只有在当前会话实际形成后才会出现在时间线中。</span>
    </header>
    <ol>
      {rows.map((row, rowIndex) => {
        const connector = rowIndex < rows.length - 1 ? <ArrowDown aria-hidden="true" /> : null;

        if (row.kind === "construction") return <li key={row.id}>
          <figure><img src={publicAssetPath(constructionMemory.assetPath!)} alt="接头安装留痕的AI生成脱敏合成演示" /><figcaption>{constructionMemory.disclosure}</figcaption></figure>
          <div><small>{String(rowIndex + 1).padStart(2, "0")} / 建造记忆</small><strong>接头安装留痕</strong><p>{constructionMemory.spaceId}<br />{constructionMemory.componentId ?? "未关联构件"}</p><code>{constructionMemory.type}</code><details><summary>证据身份</summary><dl><div><dt>事件</dt><dd>建造期历史，不代表当前故障</dd></div><div><dt>提交者</dt><dd>{constructionMemory.submittedBy}</dd></div><div><dt>时间</dt><dd>{formatTime(constructionMemory.capturedAt)}</dd></div><div><dt>数据</dt><dd>{constructionMemory.dataClass}</dd></div></dl></details></div>
          {connector}
        </li>;

        if (row.kind === "product") {
          const item = productItems[row.index];
          return <li key={row.id} className="product-evidence-entry">
            <figure><div><span>{item.sourceActor}</span><strong>不可变产品证据</strong><small>{item.dataClass}</small></div><figcaption>{item.disclosure}</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 产品证据</small><strong>{item.type}</strong><p>{item.observedValue}</p><code>{item.id}</code><details><summary>证据身份</summary><dl><div><dt>{result ? "事件" : "受理关联"}</dt><dd>{item.eventId}</dd></div>{!result ? <div><dt>边界</dt><dd>预分配关联 ID，用于后续确定性评估对齐；此刻不代表已经形成 Life Event。</dd></div> : null}<div><dt>角色</dt><dd>{item.sourceActor}</dd></div><div><dt>时间</dt><dd>{formatTime(item.capturedAt)}</dd></div><div><dt>领域引用</dt><dd>{item.domainEvidenceRefs.join(" · ") || "尚未进入领域评分"}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        if (row.kind === "domain") {
          const item = domainEvidence[row.index];
          return <li key={row.id} className="product-evidence-entry">
            <figure><div><span>DOMAIN EVIDENCE</span><strong>确定性事件证据</strong><small>{item.status}</small></div><figcaption>{item.provenance}</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 领域证据</small><strong>{domainEvidenceLabels[item.type] ?? item.type}</strong><p>{String(item.observedValue ?? "已记录")}</p><code>{item.id}</code><details><summary>证据身份</summary><dl><div><dt>事件</dt><dd>{result!.eventId}</dd></div><div><dt>来源</dt><dd>{item.sourceActor}</dd></div><div><dt>时间</dt><dd>{formatTime(row.capturedAt)}</dd></div><div><dt>关联对象</dt><dd>{item.relatedBusinessIds.join(" · ")}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        if (row.kind === "observation") {
          const item = observations[row.index];
          return <li key={row.id} className="product-evidence-entry">
            <figure><div><span>SYSTEM OBSERVATION</span><strong>已进入事件的观测</strong><small>{item.quality}</small></div><figcaption>只有物业明确确认并运行确定性评估后才出现</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 系统观测</small><strong>{metricLabels[item.metric] ?? item.metric}</strong><p>{item.value} {item.unit}{item.durationMinutes !== undefined ? ` · ${item.durationMinutes} min` : ""}</p><code>{item.id}</code><details><summary>观测身份</summary><dl><div><dt>事件</dt><dd>{result!.eventId}</dd></div><div><dt>传感器</dt><dd>{item.sensorBusinessId}</dd></div><div><dt>时间</dt><dd>{formatTime(item.observedAt)}</dd></div><div><dt>基线</dt><dd>{item.baseline ?? "未记录"}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        const item = repairs[row.index];
        return <li key={row.id} className="product-evidence-entry">
          <figure><div><span>REPAIR RECORD</span><strong>不可变维修记录</strong><small>{item.result}</small></div><figcaption>只有物业实际提交维修记录后才出现</figcaption></figure>
          <div><small>{String(rowIndex + 1).padStart(2, "0")} / 维修</small><strong>{item.method}</strong><p>{item.description}</p><code>{item.repairRecordId}</code><details><summary>维修身份</summary><dl><div><dt>事件</dt><dd>{item.eventId}</dd></div><div><dt>目标构件</dt><dd>{item.targetBusinessId}</dd></div><div><dt>班组</dt><dd>{item.crewId}</dd></div><div><dt>提交时间</dt><dd>{formatTime(item.submittedAt)}</dd></div></dl></details></div>
          {connector}
        </li>;
      })}
    </ol>
  </section>;
}
