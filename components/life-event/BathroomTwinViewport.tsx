"use client";

import { Box, Crosshair, Eye, EyeOff, Focus, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BrowserLifeEventAssets } from "@/lib/life-event-engine/adapters/browser/index.ts";
import type { VisualDirective } from "@/lib/life-event-engine/types.ts";
import { naturalTransform, resolveScenePlan, type TransformSnapshot } from "@/lib/life-event-lab/scene-controller.ts";
import { publicAssetPath } from "@/lib/site-path";

type Props = {
  assets: BrowserLifeEventAssets | null;
  externalError?: string | null;
  directive: VisualDirective;
  view: VisualDirective["view"];
  selectedBusinessId: string | null;
  onViewChange(view: VisualDirective["view"]): void;
  onSelect(businessId: string | null): void;
};

const viewLabels: Record<VisualDirective["view"], string> = {
  VIEW_RESIDENT: "空间",
  VIEW_DIAGNOSTIC: "定位",
  VIEW_CONSTRUCTION_MEMORY: "建造时",
  VIEW_MAINTENANCE: "维修后"
};

const moistureLabels: Record<VisualDirective["moistureState"], string> = {
  DRY: "当前干燥",
  DAMP_LIGHT: "轻微潮湿",
  DAMP_MODERATE: "潮湿持续",
  DAMP_SEVERE: "潮湿加重",
  REPAIR_OPEN: "维修面已打开",
  REPAIRED: "维修已完成"
};

const valveLabels: Record<VisualDirective["valvePosition"], string> = {
  OPEN: "供水正常",
  CLOSED: "供水已隔离"
};

type SceneRuntime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  baselines: Map<string, TransformSnapshot>;
  materials: Map<string, THREE.Material | THREE.Material[]>;
  highlightMaterials: THREE.Material[];
  frame: number;
};

function snapshot(object: THREE.Object3D): TransformSnapshot {
  return {
    position: object.position.toArray() as [number, number, number],
    scale: object.scale.toArray() as [number, number, number],
    quaternion: object.quaternion.toArray() as [number, number, number, number],
    visible: object.visible
  };
}

function applySnapshot(object: THREE.Object3D, value: TransformSnapshot) {
  object.position.fromArray(value.position);
  object.scale.fromArray(value.scale);
  object.quaternion.fromArray(value.quaternion);
  object.visible = value.visible;
  object.updateMatrix();
}

function semanticBusinessId(object: THREE.Object3D | null): string | null {
  let current = object;
  while (current) {
    if (typeof current.userData?.businessId === "string") return current.userData.businessId;
    current = current.parent;
  }
  return null;
}

function premiumMaterial(source: THREE.Material, businessId: string | null) {
  const material = source.clone() as THREE.MeshStandardMaterial;
  if (!("roughness" in material)) return material;
  material.roughness = Math.max(material.roughness ?? 0.5, 0.24);
  if (businessId?.startsWith("WALL-")) {
    material.color.set(0x8b847a);
    material.roughness = 0.78;
    material.metalness = 0;
  } else if (businessId === "SLAB-1602-BATHROOM" || businessId === "VIS-FLOOR-TILES") {
    material.color.set(0x85837d);
    material.roughness = 0.48;
    material.metalness = 0.02;
  } else if (businessId?.startsWith("FIXTURE-1602-WC") || businessId?.startsWith("FIXTURE-1602-BASIN")) {
    material.color.set(0xeeeae2);
    material.roughness = 0.16;
    material.metalness = 0;
  } else if (businessId === "PARTITION-1602-SHOWER-01") {
    material.color.set(0x9fb1ae);
    material.roughness = 0.12;
    material.metalness = 0.05;
    material.transparent = true;
    material.opacity = 0.28;
    material.depthWrite = false;
  } else if (businessId?.includes("PIPE-1602-CW")) {
    material.color.set(0x5e888b);
    material.roughness = 0.38;
  } else if (businessId?.includes("PIPE-1602-HW")) {
    material.color.set(0x95644f);
    material.roughness = 0.4;
  } else if (businessId === "J-1602-CW-03" || businessId?.startsWith("VALVE-") || businessId?.startsWith("METER-")) {
    material.color.set(0x9b9486);
    material.roughness = 0.28;
    material.metalness = 0.58;
  } else if (businessId?.startsWith("STATE-DAMP")) {
    material.color.multiplyScalar(0.52);
    material.roughness = 0.96;
    material.metalness = 0;
  } else if (businessId?.startsWith("EVIDENCE-ANCHOR")) {
    material.color.set(0xc89a61);
    material.emissive = new THREE.Color(0x6d3d17);
    material.emissiveIntensity = 0.24;
  }
  material.needsUpdate = true;
  return material;
}

function viewMaterial(source: THREE.Material, businessId: string | null, view: VisualDirective["view"]) {
  if (view === "VIEW_RESIDENT") return null;
  const material = source.clone() as THREE.MeshStandardMaterial;
  if (!("opacity" in material)) return null;
  if (view === "VIEW_DIAGNOSTIC") {
    if (businessId === "WALL-1602-BATHROOM-NORTH") material.opacity = 0.52;
    if (businessId?.includes("PIPE-1602-HW")) material.opacity = 0.34;
  }
  if (view === "VIEW_CONSTRUCTION_MEMORY") {
    if (businessId?.startsWith("WALL-") || businessId === "SLAB-1602-BATHROOM") material.opacity = 0.3;
    if (businessId?.startsWith("FIXTURE-") || businessId === "PARTITION-1602-SHOWER-01") material.opacity = 0.42;
    if (businessId?.includes("PIPE-1602-HW")) material.opacity = 0.3;
  }
  if (view === "VIEW_MAINTENANCE") {
    if (businessId === "WALL-1602-BATHROOM-NORTH") material.opacity = 0.62;
    if (businessId?.includes("PIPE-1602-HW")) material.opacity = 0.24;
  }
  if (material.opacity < 0.99) {
    material.transparent = true;
    material.depthWrite = false;
  }
  material.needsUpdate = true;
  return material;
}

export function BathroomTwinViewport({ assets, externalError, directive, view, selectedBusinessId, onViewChange, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const [status, setStatus] = useState<"waiting" | "loading" | "ready" | "failed">("waiting");
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!assets || !selectedBusinessId) return null;
    return assets.manifest.nodes[selectedBusinessId]
      ?? Object.values(assets.manifest.nodes).find((node) => node.businessId === selectedBusinessId)
      ?? null;
  }, [assets, selectedBusinessId]);

  useEffect(() => {
    if (!assets && externalError) {
      setStatus("failed");
      setError(externalError);
    }
  }, [assets, externalError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !assets) return;
    let cancelled = false;
    if (!document.createElement("canvas").getContext("webgl2") && !document.createElement("canvas").getContext("webgl")) {
      setStatus("failed");
      setError("当前浏览器不可用WebGL，已切换为确定性降级视图。");
      return;
    }
    setStatus("loading");
    setError(null);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111313);
    const hemisphere = new THREE.HemisphereLight(0xeee7da, 0x1b2020, 2.1);
    const keyLight = new THREE.DirectionalLight(0xfff4e5, 3.45);
    keyLight.position.set(8, -10, 14);
    const fillLight = new THREE.DirectionalLight(0x7f9fa0, 0.82);
    fillLight.position.set(-8, 6, 8);
    const warmAccent = new THREE.PointLight(0xd79b5a, 0.75, 9, 2);
    warmAccent.position.set(-1.8, -1.5, 2.4);
    scene.add(hemisphere, keyLight, fillLight, warmAccent);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    host.replaceChildren(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 1.4;
    controls.maxDistance = 12;
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const loader = new GLTFLoader();
    loader.load(assets.glbUrl, (gltf) => {
      if (cancelled) return;
      scene.add(gltf.scene);
      const baselines = new Map<string, TransformSnapshot>();
      const materials = new Map<string, THREE.Material | THREE.Material[]>();
      gltf.scene.traverse((object) => {
        const exact = assets.runtimeTransforms.transforms[object.name];
        baselines.set(object.uuid, exact ? {
          position: [...exact.translation], scale: [...exact.scale], quaternion: [...exact.rotation], visible: true
        } : naturalTransform(snapshot(object)));
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          const businessId = semanticBusinessId(object);
          const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const premium = source.map((material) => premiumMaterial(material, businessId));
          mesh.material = Array.isArray(mesh.material) ? premium : premium[0];
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          materials.set(mesh.uuid, mesh.material);
        }
      });
      const runtime: SceneRuntime = {
        scene, camera, renderer, controls, baselines, materials, highlightMaterials: [],
        frame: 0
      };
      runtimeRef.current = runtime;
      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        runtime.frame = requestAnimationFrame(animate);
      };
      animate();
      setStatus("ready");
    }, undefined, (reason) => {
      if (cancelled) return;
      setStatus("failed");
      setError(`GLB加载失败：${reason instanceof Error ? reason.message : "未知错误"}`);
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      const runtime = runtimeRef.current;
      if (runtime) {
        cancelAnimationFrame(runtime.frame);
        runtime.controls.dispose();
        runtime.highlightMaterials.forEach((material) => material.dispose());
        runtime.scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.isMesh) {
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            list.forEach((material) => material.dispose());
          }
        });
        runtime.renderer.dispose();
      }
      runtimeRef.current = null;
      host.replaceChildren();
    };
  }, [assets]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !assets || status !== "ready") return;
    const plan = resolveScenePlan(assets.manifest, directive, view);
    runtime.highlightMaterials.forEach((material) => material.dispose());
    runtime.highlightMaterials = [];
    runtime.scene.traverse((object) => {
      const baseline = runtime.baselines.get(object.uuid);
      if (baseline) applySnapshot(object, baseline);
      const mesh = object as THREE.Mesh;
      const original = runtime.materials.get(mesh.uuid);
      if (mesh.isMesh && original) {
        mesh.material = original;
        const businessId = semanticBusinessId(object);
        const source = Array.isArray(original) ? original : [original];
        const adjusted = source.map((material) => viewMaterial(material, businessId, view));
        if (adjusted.some(Boolean)) {
          const resolved = adjusted.map((material, index) => material ?? source[index]);
          adjusted.filter((material): material is THREE.MeshStandardMaterial => material !== null).forEach((material) => runtime.highlightMaterials.push(material));
          mesh.material = Array.isArray(original) ? resolved : resolved[0];
        }
      }
    });
    for (const [layer, visible] of Object.entries(plan.layerVisibility)) {
      const object = runtime.scene.getObjectByName(`LAYER-${layer}`);
      if (object) object.visible = visible;
    }
    for (const name of plan.hiddenNodes) {
      const object = runtime.scene.getObjectByName(name);
      if (object) object.visible = false;
    }
    for (const name of plan.hiddenStateNodes) {
      const object = runtime.scene.getObjectByName(name);
      if (object) object.visible = false;
    }
    for (const name of plan.visibleStateNodes) {
      const object = runtime.scene.getObjectByName(name);
      if (object) object.visible = true;
    }
    const anchorNames = Object.values(assets.manifest.evidenceAnchors).map((item) => item.nodeName);
    if (plan.evidenceAnchors.length) {
      const evidenceLayer = runtime.scene.getObjectByName("LAYER-EVIDENCE");
      if (evidenceLayer) evidenceLayer.visible = true;
      for (const name of anchorNames) {
        const object = runtime.scene.getObjectByName(name);
        if (object) object.visible = plan.evidenceAnchors.includes(name);
      }
    }
    const valveHandle = runtime.scene.getObjectByName(plan.valveNodeName);
    if (valveHandle) valveHandle.rotation.set(...plan.valveRotation);
    const highlights = new Set([...plan.highlights, ...plan.evidenceAnchors, ...(selectedBusinessId ? [selectedBusinessId] : [])]);
    for (const businessId of highlights) {
      const root = runtime.scene.getObjectByName(businessId);
      root?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const highlighted = source.map((material) => {
          const clone = material.clone();
          const standard = clone as THREE.MeshStandardMaterial;
          if ("emissive" in standard) {
            standard.emissive = new THREE.Color(0xcf8840);
            standard.emissiveIntensity = businessId === selectedBusinessId ? 0.46 : 0.22;
          }
          runtime.highlightMaterials.push(clone);
          return clone;
        });
        mesh.material = Array.isArray(mesh.material) ? highlighted : highlighted[0];
      });
    }
    const sourceCamera = runtime.scene.getObjectByName(plan.camera) as THREE.PerspectiveCamera | undefined;
    if (sourceCamera?.isPerspectiveCamera) {
      sourceCamera.updateWorldMatrix(true, false);
      sourceCamera.matrixWorld.decompose(runtime.camera.position, runtime.camera.quaternion, runtime.camera.scale);
      runtime.camera.fov = sourceCamera.fov;
      runtime.camera.near = 0.05;
      runtime.camera.far = 400;
      runtime.camera.updateProjectionMatrix();
      const box = new THREE.Box3().setFromObject(runtime.scene);
      const focusDistance = box.isEmpty() ? 4 : Math.max(2, box.getSize(new THREE.Vector3()).length() * 0.8);
      const direction = sourceCamera.getWorldDirection(new THREE.Vector3());
      runtime.controls.target.copy(runtime.camera.position.clone().add(direction.multiplyScalar(focusDistance)));
    }
    runtime.controls.update();
  }, [assets, directive, selectedBusinessId, status, view]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || status !== "ready") return;
    const canvas = runtime.renderer.domElement;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const handle = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, runtime.camera);
      const hit = raycaster.intersectObjects(runtime.scene.children, true).find((item) => semanticBusinessId(item.object));
      onSelect(hit ? semanticBusinessId(hit.object) : null);
    };
    canvas.addEventListener("pointerup", handle);
    return () => canvas.removeEventListener("pointerup", handle);
  }, [onSelect, status]);

  function focusSelected() {
    const runtime = runtimeRef.current;
    if (!runtime || !selectedBusinessId) return;
    const object = runtime.scene.getObjectByName(selectedBusinessId);
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    runtime.controls.target.copy(center);
    runtime.camera.position.copy(center.clone().add(new THREE.Vector3(size * 1.5 + 0.6, -size * 1.7 - 0.8, size + 0.5)));
    runtime.camera.lookAt(center);
    runtime.controls.update();
  }

  return (
    <section className="twin-viewport" data-model-status={status} data-view={view} data-valve-position={directive.valvePosition} data-moisture-state={directive.moistureState}>
      <header className="twin-toolbar">
        <div><Box size={16} /><span>1602卫生间数字样间</span><small>脱敏合成演示模型</small></div>
        <nav aria-label="数字样间视图">
          {(Object.keys(viewLabels) as Array<VisualDirective["view"]>).map((item) => (
            <button key={item} className={view === item ? "active" : ""} aria-label={viewLabels[item]} aria-pressed={view === item} onClick={() => onViewChange(item)}>{viewLabels[item]}</button>
          ))}
        </nav>
      </header>
      <div ref={hostRef} className="twin-canvas" aria-label="可交互1602卫生间三维模型" />
      {status === "loading" || status === "waiting" ? <div className="twin-loading"><RotateCcw className="spin" size={22} /><span>正在验证并加载数字样间</span></div> : null}
      {status === "failed" ? (
        <div className="twin-fallback" role="status">
          <picture><source srcSet={publicAssetPath("/assets/v5/scenes/bathroom-moisture-surface.avif")} type="image/avif" /><img src={publicAssetPath("/assets/v5/scenes/bathroom-moisture-surface.webp")} alt="1602卫生间确定性降级剖面" /></picture>
          <div><TriangleAlert size={20} /><strong>三维视图已降级</strong><p>{error}</p><small>输入、诊断、授权与审计仍可继续使用。</small></div>
        </div>
      ) : null}
      <div className="twin-status-strip">
        <span><i className={`moisture-dot ${directive.moistureState.toLowerCase()}`} />{moistureLabels[directive.moistureState]}</span>
        <span>{directive.valvePosition === "OPEN" ? <Eye size={13} /> : <EyeOff size={13} />}{valveLabels[directive.valvePosition]}</span>
        <span><Crosshair size={13} />已定位 {directive.highlightBusinessIds.length} 处</span>
      </div>
      {selected ? (
        <aside className="component-inspector">
          <button aria-label="取消选择构件" onClick={() => onSelect(null)}>×</button>
          <small>{selected.ifcClass}</small><strong>{selected.businessId ?? selected.nodeName}</strong><span>空间：SPACE-1602-BATHROOM</span>
          <button className="focus-component" onClick={focusSelected}><Focus size={13} />聚焦构件</button>
        </aside>
      ) : null}
    </section>
  );
}
