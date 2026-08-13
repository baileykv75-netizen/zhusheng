"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw } from "lucide-react";
import { publicAssetPath } from "@/lib/site-path";

type Props = {
  label: string;
  help: string;
  syntheticExample?: string;
  onSelected?(file: File): void;
  onReadyChange?(ready: boolean): void;
};

export function LocalEvidenceUpload({ label, help, syntheticExample, onSelected, onReadyChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [syntheticSelected, setSyntheticSelected] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function select(file?: File) {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setSyntheticSelected(false);
    onSelected?.(file);
    onReadyChange?.(true);
  }

  function useSynthetic() {
    if (!syntheticExample) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSyntheticSelected(true);
    onReadyChange?.(true);
  }

  return <div className="local-evidence-upload">
    <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => select(event.target.files?.[0])} />
    {previewUrl ? <div className="local-evidence-preview"><img src={previewUrl} alt={`${label}本地预览`} /><span>浏览器本地图片</span><button type="button" onClick={() => inputRef.current?.click()}><RotateCcw size={13} />重新选择</button></div> : syntheticSelected && syntheticExample ? <div className="local-evidence-preview synthetic-selected"><img src={publicAssetPath(syntheticExample)} alt={`${label}已选择的AI生成脱敏合成演示`} /><span>AI生成 · 脱敏合成演示</span><button type="button" onClick={() => inputRef.current?.click()}><RotateCcw size={13} />改为本地照片</button></div> : <button type="button" className="local-evidence-trigger" onClick={() => inputRef.current?.click()}><ImagePlus size={18} /><span><strong>{label}</strong><small>{help}</small></span></button>}
    <p><Camera size={12} />当前仅在浏览器会话中预览，不上传服务器。</p>
    {syntheticExample && !syntheticSelected ? <details><summary>查看脱敏演示示例</summary><div className="synthetic-evidence"><img src={publicAssetPath(syntheticExample)} alt={`${label}的AI生成脱敏合成演示`} /><span>AI生成 · 脱敏合成演示</span><button type="button" onClick={useSynthetic}>使用此脱敏图继续演示</button></div></details> : null}
  </div>;
}
