"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, Clock3, House, LockKeyhole, ShieldCheck, Upload, X } from "lucide-react";
import { useLifecycleJourney } from "@/components/lifecycle-journey-provider";
import { hasFreshEvidenceAfterReopen } from "@/lib/life-event-lab/reopened-cycle.ts";
import { publicAssetPath } from "@/lib/site-path";
import type { ResidentMeterFinding, ResidentPhotoFinding } from "@/lib/product/evidence";

const progressLabels: Record<string, string> = {
  ASSESSED: "物业正在查看建筑记忆",
  ACTION_PROPOSED: "物业准备提出处置方案",
  AUTHORIZED: "授权已记录，等待物业执行",
  SIMULATED_ACTION_APPLIED: "物业正在进行隔离验证",
  VERIFYING: "物业正在记录隔离后观察",
  ISOLATION_CONFIRMED: "异常范围已被临时控制",
  REPAIR_PENDING: "物业维修人员正在处理",
  REPAIR_RECORDED: "维修已记录，等待恢复供水确认",
  POST_REPAIR_VERIFYING: "物业正在进行维修后复验",
  REOPENED: "新的住户证据已提交，等待物业复测湿度与微流量"
};

export function ResidentService() {
  const { session, setSession, assets, busy, submitResidentEvidence, decideAuthorization } = useLifecycleJourney();
  const result = session.result;
  const [description, setDescription] = useState("我家卫生间北侧墙角最近一直很潮。 ");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoMetadata, setPhotoMetadata] = useState<{ fileName: string; mediaType: string; size: number } | null>(null);
  const [photoFinding, setPhotoFinding] = useState<ResidentPhotoFinding>("UNCONFIRMED");
  const [meterFinding, setMeterFinding] = useState<ResidentMeterFinding | null>(null);
  const [syntheticPhoto, setSyntheticPhoto] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const freshReopenEvidence = result?.state === "REOPENED"
    ? hasFreshEvidenceAfterReopen(result, (session.residentSubmissions ?? []).map((item) => item.submittedAt))
    : false;
  const intake = !result
    || ["DETECTED", "COLLECTING_EVIDENCE", "INCONCLUSIVE"].includes(result.state)
    || (result.state === "REOPENED" && !freshReopenEvidence);
  const authorization = result?.state === "AUTHORIZATION_PENDING" ? result.authorizationRequirement : null;
  const reopening = authorization?.action === "SIMULATE_REOPEN_VALVE";
  const latestSubmission = session.residentSubmissions?.at(-1) ?? null;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("focus") !== "authorization") return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-focus="authorization"]')?.focus());
  }, [result?.state]);

  function choosePhoto(file?: File) {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPhotoMetadata({ fileName: file.name, mediaType: file.type || "application/octet-stream", size: file.size });
    setPhotoFinding("UNCONFIRMED");
    setSyntheticPhoto(false);
    setSession((current) => ({
      ...current,
      photoObservationConfirmation: "UNCONFIRMED",
      notice: "图片已选择，请根据画面手工确认你实际看到的情况。"
    }));
  }

  function confirmPhotoFinding(value: Exclude<ResidentPhotoFinding, "UNCONFIRMED">) {
    setPhotoFinding(value);
    setSession((current) => ({ ...current, photoObservationConfirmation: value, notice: null }));
  }

  function useSyntheticEvidence() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhotoMetadata(null);
    setSyntheticPhoto(true);
    setPhotoFinding("UNCONFIRMED");
    setSession((current) => ({
      ...current,
      photoObservationConfirmation: "UNCONFIRMED",
      notice: "已载入脱敏演示照片，请继续手工确认画面中的实际观察。"
    }));
  }

  function submitEvidence() {
    if (photoFinding === "UNCONFIRMED" || !meterFinding || (!previewUrl && !syntheticPhoto)) return;
    submitResidentEvidence({
      description,
      photo: syntheticPhoto
        ? {
            dataClass: "DEMO_SYNTHETIC",
            assetPath: "/assets/demo-evidence/1602-resident-damp-wall.webp",
            finding: photoFinding
          }
        : {
            dataClass: "BROWSER_LOCAL",
            fileName: photoMetadata?.fileName,
            mediaType: photoMetadata?.mediaType,
            size: photoMetadata?.size,
            finding: photoFinding
          },
      meterFinding
    });
  }

  function authorize(decision: "APPROVED" | "REJECTED") {
    decideAuthorization({
      actorType: "RESIDENT",
      actorId: "DEMO-RESIDENT-1602",
      decision,
      reason: decision === "APPROVED"
        ? reopening ? "同意维修后模拟恢复局部供水并进行复验" : "同意物业模拟关闭1602卫生间局部进水阀进行隔离验证"
        : "住户暂不同意本次模拟设备动作"
    });
  }

  function recordResidentResult(message: string) {
    setSession((current) => ({ ...current, notice: message }));
  }

  return <div className="resident-service">
    <header className="resident-service-header"><Link href="/case-1602">EVT-1602</Link><span>住户任务</span><small>你的现场观察进入同一事件</small></header>
    <main>
      <section className="resident-service-title"><p>1602 / 卫生间</p><h1>{authorization ? reopening ? "维修完成后，是否允许恢复供水？" : "物业申请临时关闭局部进水阀" : result?.state === "RESOLVED" ? "这件事已经完成维修复验" : result?.state === "REOPENED" ? freshReopenEvidence ? "新的现场情况已提交" : "维修后仍有异常，请补充新的现场情况" : intake ? "把你看到的情况告诉筑生" : "物业正在继续处理"}</h1><span>你只需要描述现场、补充照片和水表观察，并在需要时作出授权决定。</span></section>

      {session.notice ? <div className="resident-message" role="status"><span>{session.notice}</span><button onClick={() => setSession((current) => ({ ...current, notice: null }))} aria-label="关闭提示"><X size={14} /></button></div> : null}

      {intake ? <section className="resident-intake">
        {result?.state === "REOPENED" ? <p className="resident-boundary"><Camera size={14} />这次需要重新提交维修后的新观察；第一次维修、授权和复验记录仍保留在原事件中。</p> : null}
        <article><div className="resident-step"><span>01</span><div><strong>发生了什么</strong><small>不用判断原因，只描述你实际看到的现象。</small></div></div><textarea value={description} onChange={(event) => setDescription(event.target.value)} aria-label="问题描述" /></article>
        <article><div className="resident-step"><span>02</span><div><strong>补一张现场照片</strong><small>选择照片后，再确认画面里你实际看到什么。</small></div></div>
          <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} />
          {previewUrl ? <div className="resident-photo-preview"><img src={previewUrl} alt="住户选择的卫生间现场照片预览" /><button onClick={() => fileInput.current?.click()}><Camera size={15} />重新选择</button></div> : <button className="resident-upload" onClick={() => fileInput.current?.click()}><Upload size={19} /><span><strong>选择现场照片</strong><small>JPG / JPEG / PNG / WEBP</small></span></button>}
          {syntheticPhoto ? <p className="resident-synthetic-selected"><Check size={14} />已选择脱敏演示照片</p> : null}
          {previewUrl || syntheticPhoto ? <div className="resident-photo-observation"><strong>这张照片中，你实际看到什么？</strong><small>请按画面手工确认。</small><div className="resident-choice">
            <button type="button" className={photoFinding === "MOISTURE_VISIBLE" ? "active" : ""} onClick={() => confirmPhotoFinding("MOISTURE_VISIBLE")}>看见潮湿</button>
            <button type="button" className={photoFinding === "NO_VISIBLE_MOISTURE" ? "active" : ""} onClick={() => confirmPhotoFinding("NO_VISIBLE_MOISTURE")}>未见潮湿</button>
            <button type="button" className={photoFinding === "UNREADABLE" ? "active" : ""} onClick={() => confirmPhotoFinding("UNREADABLE")}>无法判断</button>
          </div></div> : null}
          <details className="resident-photo-guide"><summary>查看拍摄位置</summary><div><figure><img src={publicAssetPath("/assets/v6/model/north-wall-locator.webp")} alt="BIM模型中的1602卫生间北侧墙角定位" /><figcaption>BIM / GLB · MODEL_LOCATOR</figcaption></figure><section><strong>请拍摄北侧墙角</strong><p>建议画面同时包含墙面、墙地交界和相邻区域。</p><figure><img src={publicAssetPath("/assets/demo-evidence/1602-resident-damp-wall.webp")} alt="AI生成的北侧墙角脱敏合成演示照片" /><figcaption>AI生成 · 脱敏合成演示</figcaption></figure><button type="button" onClick={useSyntheticEvidence}>使用这张脱敏图继续演示</button></section></div></details>
        </article>
        <article><div className="resident-step"><span>03</span><div><strong>无人用水时，水表是否仍变化？</strong><small>选择你能确认的一项。</small></div></div><div className="resident-choice">
          <button type="button" className={meterFinding === "FLOW_CONFIRMED_NO_USE" ? "active" : ""} onClick={() => setMeterFinding("FLOW_CONFIRMED_NO_USE")}>有变化</button>
          <button type="button" className={meterFinding === "NO_CHANGE" ? "active" : ""} onClick={() => setMeterFinding("NO_CHANGE")}>没有变化</button>
          <button type="button" className={meterFinding === "UNREADABLE" ? "active" : ""} onClick={() => setMeterFinding("UNREADABLE")}>看不清</button>
        </div><details className="resident-meter-example"><summary>查看水表观察示例</summary><figure><img src={publicAssetPath("/assets/demo-evidence/1602-water-meter-observation.webp")} alt="AI生成的住宅水表脱敏合成演示照片" /><figcaption>AI生成 · 脱敏合成演示</figcaption></figure></details></article>
        <button className="resident-primary" disabled={busy || !assets || !description.trim() || (!previewUrl && !syntheticPhoto) || photoFinding === "UNCONFIRMED" || !meterFinding} onClick={submitEvidence}>{busy ? "正在提交…" : result?.state === "REOPENED" ? "提交新的现场情况" : "提交给筑生"}<ArrowRight size={17} /></button>
        <p className="resident-boundary"><ShieldCheck size={14} />提交后会形成 EVT-1602 的住户原始证据；物业只能追加独立复核，不能覆盖你的原始提交。</p>
        <details className="resident-data-details"><summary>数据与隐私说明</summary><p>本演示中的本地照片只在浏览器预览，不上传服务器；脱敏示例图会明确标注。照片结论和水表观察都由你手工确认，系统不会把“上传图片”自动当成“发现潮湿”。提交证据不会自动操作阀门。</p></details>
      </section> : null}

      {authorization ? <section className="resident-authorization" data-focus="authorization" tabIndex={-1}>
        <div className="resident-authorization-mark"><LockKeyhole size={23} /></div><p>需要你的决定</p><h2>{reopening ? "模拟恢复1602卫生间局部供水" : "模拟关闭1602卫生间局部进水阀"}</h2>
        <dl><div><dt>为什么做</dt><dd>{reopening ? "维修已记录，需要恢复供水后验证结果" : "观察关闭局部供水后，潮湿与微流量是否变化"}</dd></div><div><dt>影响范围</dt><dd>仅1602卫生间局部供水</dd></div><div><dt>预计持续</dt><dd>{reopening ? "恢复后观察45分钟" : "隔离观察30分钟"}</dd></div><div><dt>是否可恢复</dt><dd>可以，由物业明确执行</dd></div><div><dt>谁执行</dt><dd>物业运行人员（脱敏演示）</dd></div></dl>
        <p><Clock3 size={14} />当前阀门仍为 {result?.valvePosition === "OPEN" ? "开启" : "关闭"}，授权本身不会改变设备。</p>
        <div className="resident-authorization-actions"><button onClick={() => authorize("REJECTED")}>暂不同意</button><button className="approve" disabled={busy} onClick={() => authorize("APPROVED")}><Check size={16} />同意本次操作</button></div>
      </section> : null}

      {result && !intake && !authorization && result.state !== "RESOLVED" ? <section className="resident-progress">
        <House size={23} /><p>事件 {result.eventId}</p><h2>{progressLabels[result.state] ?? "物业正在继续处理"}</h2><span>{latestSubmission ? `你的提交 ${latestSubmission.submissionId} 已进入同一事件，当前由物业继续处理。` : "下一项需要你决定的任务会在这里出现。"}</span><Link href="/case-1602">查看事件生命线 <ArrowRight size={15} /></Link>
      </section> : null}

      {result?.state === "RESOLVED" ? <section className="resident-result"><Check size={25} /><p>维修与复验完成</p><h2>恢复供水后未再次观察到异常</h2><span>本次维修、新观察与住户反馈继续保留在同一栋房子的事件和建筑记忆中。</span><div><button onClick={() => recordResidentResult("住户反馈：现在已经恢复正常。该反馈已记录，但不会绕过事件引擎改写状态。")}>现在已经正常</button><button onClick={() => recordResidentResult("住户反馈：仍有问题。已通知物业创建后续检查任务，原维修与复验记录保留。")}>仍有问题</button></div></section> : null}
    </main>
  </div>;
}
