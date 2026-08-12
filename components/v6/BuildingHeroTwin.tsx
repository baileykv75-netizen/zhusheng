"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { publicAssetPath } from "@/lib/site-path";

export type HeroDrillPhase = "building" | "floor" | "unit" | "space";

type Props = { phase: HeroDrillPhase; onEnter(): void };
type AnchorManifest = {
  anchors: Record<HeroDrillPhase, { node: string; targetNode: string }>;
  eventAnchorNode: string;
  floorNodes: Record<string, string>;
  focusNodes: { floor: string; unit: string; space: string };
};
type Runtime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  root: THREE.Group;
  eventPoint: THREE.Object3D;
  manifest: AnchorManifest;
  materials: Map<string, { material: THREE.Material; opacity: number; depthWrite: boolean }>;
  cameraGoal: THREE.Vector3;
  target: THREE.Vector3;
  targetGoal: THREE.Vector3;
  quaternionGoal: THREE.Quaternion;
  fovGoal: number;
  frame: number;
  lastFrameAt: number;
  reducedMotion: boolean;
  fallback: boolean;
};

function makeBox(size: [number, number, number], material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(...size), material);
}

function createFallbackTower() {
  const root = new THREE.Group();
  root.name = "PROCEDURAL-BOX-FALLBACK";
  for (let floor = 1; floor <= 18; floor += 1) {
    const group = new THREE.Group();
    group.name = `LVL-${String(floor).padStart(2, "0")}`;
    group.position.y = (floor - 1) * 0.38;
    const shell = makeBox([3.2, 0.315, 1.9], new THREE.MeshStandardMaterial({ color: 0x77756f, roughness: 0.75 }));
    group.add(shell);
    [-1.08, -0.36, 0.36, 1.08].forEach((x, index) => {
      const warm = floor === 16 && index === 3;
      const windowMesh = makeBox([0.31, 0.19, 0.035], new THREE.MeshStandardMaterial({ color: warm ? 0xd8873a : 0x172426, emissive: warm ? 0xb96624 : 0x000000 }));
      windowMesh.position.set(x, 0.015, 0.968);
      group.add(windowMesh);
    });
    if (floor === 16) {
      const unit = makeBox([0.63, 0.285, 0.055], new THREE.MeshStandardMaterial({ color: 0xc24f23, emissive: 0x6f1e10 }));
      unit.name = "UNIT-1602";
      unit.position.set(1.04, 0, 0.995);
      group.add(unit);
      const event = new THREE.Object3D();
      event.name = "ANCHOR-EVENT_1602";
      event.position.set(1.04, 0, 1.12);
      group.add(event);
    }
    root.add(group);
  }
  root.rotation.y = -0.24;
  return root;
}

function fallbackManifest(): AnchorManifest {
  return {
    anchors: {
      building: { node: "", targetNode: "PROCEDURAL-BOX-FALLBACK" },
      floor: { node: "", targetNode: "LVL-16" },
      unit: { node: "", targetNode: "UNIT-1602" },
      space: { node: "", targetNode: "UNIT-1602" }
    },
    eventAnchorNode: "ANCHOR-EVENT_1602",
    floorNodes: Object.fromEntries(Array.from({ length: 18 }, (_, index) => [String(index + 1), `LVL-${String(index + 1).padStart(2, "0")}`])),
    focusNodes: { floor: "LVL-16", unit: "UNIT-1602", space: "UNIT-1602" }
  };
}

function fallbackCamera(phase: HeroDrillPhase) {
  if (phase === "floor") return { position: new THREE.Vector3(4.7, 6.55, 5.8), target: new THREE.Vector3(0.25, 6.02, 0.1), fov: 35 };
  if (phase === "unit") return { position: new THREE.Vector3(2.65, 6.28, 3.55), target: new THREE.Vector3(0.72, 6.02, 0.7), fov: 35 };
  if (phase === "space") return { position: new THREE.Vector3(1.75, 6.16, 2.35), target: new THREE.Vector3(0.92, 5.98, 0.98), fov: 35 };
  return { position: new THREE.Vector3(7.4, 6.2, 10.2), target: new THREE.Vector3(0, 3.55, 0), fov: 35 };
}

function phaseCamera(runtime: Runtime, phase: HeroDrillPhase) {
  const descriptor = runtime.manifest.anchors[phase];
  const source = descriptor.node ? runtime.scene.getObjectByName(descriptor.node) as THREE.PerspectiveCamera | undefined : undefined;
  const targetObject = runtime.scene.getObjectByName(descriptor.targetNode);
  if (!runtime.fallback && source?.isPerspectiveCamera && targetObject) {
    source.updateWorldMatrix(true, false);
    targetObject.updateWorldMatrix(true, false);
    const position = source.getWorldPosition(new THREE.Vector3());
    const quaternion = source.getWorldQuaternion(new THREE.Quaternion());
    return { position, target: targetObject.getWorldPosition(new THREE.Vector3()), quaternion, fov: source.fov };
  }
  const value = fallbackCamera(phase);
  return { ...value, quaternion: new THREE.Quaternion() };
}

function applyPhase(runtime: Runtime, phase: HeroDrillPhase) {
  const view = phaseCamera(runtime, phase);
  runtime.cameraGoal.copy(view.position);
  runtime.targetGoal.copy(view.target);
  runtime.quaternionGoal.copy(view.quaternion);
  runtime.fovGoal = view.fov;
  if (runtime.reducedMotion) {
    runtime.camera.position.copy(view.position);
    runtime.target.copy(view.target);
    runtime.camera.fov = view.fov;
  }
  Object.entries(runtime.manifest.floorNodes).forEach(([floor, nodeName]) => {
    const root = runtime.scene.getObjectByName(nodeName);
    const opacity = phase === "building" || floor === "16" ? 1 : phase === "floor" ? 0.18 : 0.055;
    root?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        material.transparent = opacity < 0.999 || material.transparent;
        material.opacity = opacity;
        material.depthWrite = opacity > 0.3;
      });
    });
  });
  const unit = runtime.scene.getObjectByName(runtime.manifest.focusNodes.unit);
  const space = runtime.scene.getObjectByName(runtime.manifest.focusNodes.space);
  if (unit) unit.visible = phase === "unit" || phase === "space";
  if (space) space.visible = phase === "space";
}

export function BuildingHeroTwin({ phase, onEnter }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLButtonElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const phaseRef = useRef(phase);
  const [source, setSource] = useState<"loading" | "hero-glb" | "procedural-fallback">("loading");

  useEffect(() => {
    phaseRef.current = phase;
    if (runtimeRef.current) applyPhase(runtimeRef.current, phase);
  }, [phase]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090b0b);
    scene.fog = new THREE.FogExp2(0x090b0b, 0.0065);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      setSource("procedural-fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;
    host.replaceChildren(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xe6ddd0, 0x101515, 2.4));
    const key = new THREE.DirectionalLight(0xffe8cc, 4.6);
    key.position.set(-45, 70, 80);
    const rim = new THREE.DirectionalLight(0x6d9999, 2.2);
    rim.position.set(65, 45, -30);
    scene.add(key, rim);

    const createRuntime = (root: THREE.Group, manifest: AnchorManifest, fallback: boolean) => {
      if (disposed) return;
      scene.add(root);
      const materials = new Map<string, { material: THREE.Material; opacity: number; depthWrite: boolean }>();
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        list.forEach((material) => materials.set(material.uuid, { material, opacity: material.opacity, depthWrite: material.depthWrite }));
      });
      const eventPoint = scene.getObjectByName(manifest.eventAnchorNode) ?? scene.getObjectByName(manifest.focusNodes.unit) ?? root;
      const runtime: Runtime = {
        scene, camera, renderer, root, eventPoint, manifest, materials,
        cameraGoal: new THREE.Vector3(), target: new THREE.Vector3(), targetGoal: new THREE.Vector3(), quaternionGoal: new THREE.Quaternion(),
        fovGoal: 40, frame: 0, lastFrameAt: 0, reducedMotion, fallback
      };
      runtimeRef.current = runtime;
      const initial = phaseCamera(runtime, phaseRef.current);
      camera.position.copy(initial.position);
      runtime.target.copy(initial.target);
      applyPhase(runtime, phaseRef.current);
      setSource(fallback ? "procedural-fallback" : "hero-glb");
      const world = new THREE.Vector3();
      const animate = (now: number) => {
        runtime.frame = requestAnimationFrame(animate);
        if (document.hidden || now - runtime.lastFrameAt < 50) return;
        runtime.lastFrameAt = now;
        const amount = reducedMotion ? 1 : 0.065;
        camera.position.lerp(runtime.cameraGoal, amount);
        runtime.target.lerp(runtime.targetGoal, amount);
        camera.fov += (runtime.fovGoal - camera.fov) * amount;
        camera.updateProjectionMatrix();
        camera.lookAt(runtime.target);
        renderer.render(scene, camera);
        const anchor = eventRef.current;
        if (anchor) {
          runtime.eventPoint.getWorldPosition(world);
          world.project(camera);
          anchor.style.left = `${(world.x * 0.5 + 0.5) * host.clientWidth}px`;
          anchor.style.top = `${(-world.y * 0.5 + 0.5) * host.clientHeight}px`;
          anchor.hidden = world.z > 1 || Math.abs(world.x) > 1.1 || Math.abs(world.y) > 1.1;
        }
      };
      runtime.frame = requestAnimationFrame(animate);
    };

    Promise.all([
      fetch(publicAssetPath("/assets/v6/building/building-hero.anchors.json"), { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`Anchor HTTP ${response.status}`);
        return response.json() as Promise<AnchorManifest>;
      }),
      new Promise<THREE.Group>((resolve, reject) => new GLTFLoader().load(publicAssetPath("/assets/v6/building/building-hero.glb"), (gltf) => resolve(gltf.scene), undefined, reject))
    ]).then(([manifest, root]) => createRuntime(root, manifest, false)).catch(() => createRuntime(createFallbackTower(), fallbackManifest(), true));

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
    return () => {
      disposed = true;
      observer.disconnect();
      const runtime = runtimeRef.current;
      if (runtime) cancelAnimationFrame(runtime.frame);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
      host.replaceChildren();
      runtimeRef.current = null;
    };
  }, []);

  return <div className={`v6-building-twin phase-${phase}`} data-visual-source={source}>
    <div ref={hostRef} className="v6-building-canvas" role="img" aria-label="华章新筑2号楼18层建筑数字孪生，16层1602存在一项建筑生命事件" />
    {source === "loading" ? <div className="v6-building-loading">正在核对建筑几何与空间锚点</div> : null}
    {source === "procedural-fallback" ? <div className="v6-building-source-note">建筑资产已降级为程序化几何</div> : null}
    <button ref={eventRef} type="button" className="v6-event-anchor" onClick={onEnter} aria-label="进入16层1602卫生间建筑生命事件">
      <i /><span><strong>16F / 1602</strong><small>LIFE EVENT ACTIVE</small></span>
    </button>
  </div>;
}
