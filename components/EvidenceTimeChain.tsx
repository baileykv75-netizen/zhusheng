import { ArrowDown, Crosshair } from "lucide-react";
import { publicAssetPath } from "@/lib/site-path";
import { syntheticEvidenceCatalog } from "@/lib/product/evidence";
import { projectProductEvidenceDomainLinks } from "@/lib/product/evidence-adapter";
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

export type EvidenceSpatialFocusRequest = {
  sourceKind: "CONSTRUCTION_MEMORY" | "PRODUCT_EVIDENCE" | "DOMAIN_EVIDENCE" | "SYSTEM_OBSERVATION" | "REPAIR_RECORD";
  sourceId: string;
  label: string;
  businessIds: string[];
};

type EvidenceTimeChainProps = {
  onSpatialFocus?: (request: EvidenceSpatialFocusRequest) => void;
  activeSpatialSourceId?: string | null;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function spatialRequest(
  sourceKind: EvidenceSpatialFocusRequest["sourceKind"],
  sourceId: string,
  label: string,
  businessIds: Array<string | undefined>
): EvidenceSpatialFocusRequest | null {
  const recordedIds = [...new Set(businessIds.filter((value): value is string => Boolean(value)))];
  return recordedIds.length ? { sourceKind, sourceId, label, businessIds: recordedIds } : null;
}

export function EvidenceTimeChain({ onSpatialFocus, activeSpatialSourceId = null }: EvidenceTimeChainProps = {}) {
  const { session } = useLifecycleJourney();
  const result = session.result;
  const productItems = projectProductEvidenceDomainLinks(session.productEvidenceTimeline ?? [], result);
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

  function spatialAction(request: EvidenceSpatialFocusRequest | null) {
    if (!request || !onSpatialFocus) return null;
    const active = activeSpatialSourceId === request.sourceId;
    return <button
      type="button"
      data-evidence-spatial-kind={request.sourceKind}
      data-evidence-spatial-source={request.sourceId}
      data-business-id={request.businessIds[0]}
      aria-pressed={active}
      aria-label={`在3D中定位${request.label}`}
      onClick={() => onSpatialFocus(request)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 12,
        padding: "7px 10px",
        border: `1px solid ${active ? "rgba(217, 228, 222, .78)" : "rgba(111, 143, 141, .42)"}`,
        color: active ? "#111313" : "#b7c6c1",
        background: active ? "#d9e4de" : "transparent",
        fontSize: 9,
        letterSpacing: ".08em"
      }}
    ><Crosshair size={12} aria-hidden="true" />{active ? "已定位到3D" : "定位到3D"}</button>;
  }

  return <section className="evidence-time-chain" aria-labelledby="evidence-time-chain-title">
    <header>
      <p>REALITY ↔ SPACE ↔ BIM ↔ MEMORY</p>
      <h2 id="evidence-time-chain-title">证据不是图库，<br />只显示已经发生的记录。</h2>
      <span>建造期图片为 AI_GENERATED · DEMO_SYNTHETIC；住户、系统、维修与复验项只有在当前会话实际形成后才会出现在时间线中。带有结构化空间关联的记录可以直接定位回同一个1602数字样间。</span>
    </header>
    <ol>
      {rows.map((row, rowIndex) => {
        const connector = rowIndex < rows.length - 1 ? <ArrowDown aria-hidden="true" /> : null;

        if (row.kind === "construction") {
          const request = spatialRequest("CONSTRUCTION_MEMORY", row.id, "接头安装留痕", [constructionMemory.componentId, constructionMemory.spaceId]);
          return <li key={row.id}>
            <figure><img src={publicAssetPath(constructionMemory.assetPath!)} alt="接头安装留痕的AI生成脱敏合成演示" /><figcaption>{constructionMemory.disclosure}</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 建造记忆</small><strong>接头安装留痕</strong><p>{constructionMemory.spaceId}<br />{constructionMemory.componentId ?? "未关联构件"}</p><code>{constructionMemory.type}</code>{spatialAction(request)}<details><summary>证据身份</summary><dl><div><dt>事件</dt><dd>建造期历史，不代表当前故障</dd></div><div><dt>提交者</dt><dd>{constructionMemory.submittedBy}</dd></div><div><dt>时间</dt><dd>{formatTime(constructionMemory.capturedAt)}</dd></div><div><dt>数据</dt><dd>{constructionMemory.dataClass}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        if (row.kind === "product") {
          const item = productItems[row.index];
          const request = spatialRequest("PRODUCT_EVIDENCE", item.id, item.type, item.relatedBusinessIds.length ? item.relatedBusinessIds : [item.spaceId]);
          return <li key={row.id} className="product-evidence-entry">
            <figure><div><span>{item.sourceActor}</span><strong>不可变产品证据</strong><small>{item.dataClass}</small></div><figcaption>{item.disclosure}</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 产品证据</small><strong>{item.type}</strong><p>{item.observedValue}</p><code>{item.id}</code>{spatialAction(request)}<details><summary>证据身份</summary><dl><div><dt>{result ? "事件" : "受理关联"}</dt><dd>{item.eventId}</dd></div>{!result ? <div><dt>边界</dt><dd>预分配关联 ID，用于后续确定性评估对齐；此刻不代表已经形成 Life Event。</dd></div> : null}<div><dt>角色</dt><dd>{item.sourceActor}</dd></div><div><dt>时间</dt><dd>{formatTime(item.capturedAt)}</dd></div><div><dt>领域引用</dt><dd>{item.domainEvidenceRefs.join(" · ") || (result ? "该产品证据不参与领域评分或尚未形成唯一轮次映射" : "尚未进入领域评分")}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        if (row.kind === "domain") {
          const item = domainEvidence[row.index];
          const request = spatialRequest("DOMAIN_EVIDENCE", item.id, domainEvidenceLabels[item.type] ?? item.type, item.relatedBusinessIds);
          return <li key={row.id} className="product-evidence-entry">
            <figure><div><span>DOMAIN EVIDENCE</span><strong>确定性事件证据</strong><small>{item.status}</small></div><figcaption>{item.provenance}</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 领域证据</small><strong>{domainEvidenceLabels[item.type] ?? item.type}</strong><p>{String(item.observedValue ?? "已记录")}</p><code>{item.id}</code>{spatialAction(request)}<details><summary>证据身份</summary><dl><div><dt>事件</dt><dd>{result!.eventId}</dd></div><div><dt>来源</dt><dd>{item.sourceActor}</dd></div><div><dt>时间</dt><dd>{formatTime(row.capturedAt)}</dd></div><div><dt>关联对象</dt><dd>{item.relatedBusinessIds.join(" · ")}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        if (row.kind === "observation") {
          const item = observations[row.index];
          const request = spatialRequest("SYSTEM_OBSERVATION", item.id, metricLabels[item.metric] ?? item.metric, [item.sensorBusinessId]);
          return <li key={row.id} className="product-evidence-entry">
            <figure><div><span>SYSTEM OBSERVATION</span><strong>已进入事件的观测</strong><small>{item.quality}</small></div><figcaption>只有物业明确确认并运行确定性评估后才出现</figcaption></figure>
            <div><small>{String(rowIndex + 1).padStart(2, "0")} / 系统观测</small><strong>{metricLabels[item.metric] ?? item.metric}</strong><p>{item.value} {item.unit}{item.durationMinutes !== undefined ? ` · ${item.durationMinutes} min` : ""}</p><code>{item.id}</code>{spatialAction(request)}<details><summary>观测身份</summary><dl><div><dt>事件</dt><dd>{result!.eventId}</dd></div><div><dt>传感器</dt><dd>{item.sensorBusinessId}</dd></div><div><dt>时间</dt><dd>{formatTime(item.observedAt)}</dd></div><div><dt>基线</dt><dd>{item.baseline ?? "未记录"}</dd></div></dl></details></div>
            {connector}
          </li>;
        }

        const item = repairs[row.index];
        const request = spatialRequest("REPAIR_RECORD", item.repairRecordId, item.method, [item.targetBusinessId]);
        return <li key={row.id} className="product-evidence-entry">
          <figure><div><span>REPAIR RECORD</span><strong>不可变维修记录</strong><small>{item.result}</small></div><figcaption>只有物业实际提交维修记录后才出现</figcaption></figure>
          <div><small>{String(rowIndex + 1).padStart(2, "0")} / 维修</small><strong>{item.method}</strong><p>{item.description}</p><code>{item.repairRecordId}</code>{spatialAction(request)}<details><summary>维修身份</summary><dl><div><dt>事件</dt><dd>{item.eventId}</dd></div><div><dt>目标构件</dt><dd>{item.targetBusinessId}</dd></div><div><dt>班组</dt><dd>{item.crewId}</dd></div><div><dt>提交时间</dt><dd>{formatTime(item.submittedAt)}</dd></div></dl></details></div>
          {connector}
        </li>;
      })}
    </ol>
  </section>;
}
