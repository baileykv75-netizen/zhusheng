"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { publicAssetPath } from "@/lib/site-path";

export type HeroDrillPhase = "building" | "floor" | "unit" | "space";

type Props = {
  phase: HeroDrillPhase;
  onEnter(): void;
};

type Runtime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  tower: THREE.Group;
  eventPoint: THREE.Object3D;
  floorMaterials: Map<number, THREE.Material[]>;
  cameraGoal: THREE.Vector3;
  target: THREE.Vector3;
  targetGoal: THREE.Vector3;
  frame: number;
  reducedMotion: boolean;
};

const floorCount = 18;
const floorHeight = 0.38;

function makeBox(size: [number, number, number], material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(...size), material);
}

function cameraFor(phase: HeroDrillPhase) {
  if (phase === "floor") return { position: new THREE.Vector3(4.7, 6.55, 5.8), target: new THREE.Vector3(0.25, 6.02, 0.1) };
  if (phase === "unit") return { position: new THREE.Vector3(2.65, 6.28, 3.55), target: new THREE.Vector3(0.72, 6.02, 0.7) };
  if (phase === "space") return { position: new THREE.Vector3(1.75, 6.16, 2.35), target: new THREE.Vector3(0.92, 5.98, 0.98) };
  return { position: new THREE.Vector3(7.4, 6.2, 10.2), target: new THREE.Vector3(0, 3.55, 0) };
}

function targetOpacity(phase: HeroDrillPhase, floor: number) {
  if (phase === "building") return 1;
  if (floor === 16) return 1;
  return phase === "floor" ? 0.15 : 0.055;
}

export function BuildingHeroTwin({ phase, onEnter }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLButtonElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const phaseRef = useRef(phase);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const camera = cameraFor(phase);
    runtime.cameraGoal.copy(camera.position);
    runtime.targetGoal.copy(camera.target);
    if (runtime.reducedMotion) {
      runtime.camera.position.copy(runtime.cameraGoal);
      runtime.target.copy(runtime.targetGoal);
    }
  }, [phase]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    const hasWebGl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!hasWebGl) {
      setFailed(true);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c0e0e, 0.045);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = !window.matchMedia("(max-width: 700px)").matches;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.replaceChildren(renderer.domElement);

    const initial = cameraFor(phaseRef.current);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    camera.position.copy(initial.position);
    const tower = new THREE.Group();
    tower.rotation.y = -0.24;
    scene.add(tower);

    const floorMaterials = new Map<number, THREE.Material[]>();
    let eventPoint: THREE.Object3D | null = null;
    for (let floor = 1; floor <= floorCount; floor += 1) {
      const floorGroup = new THREE.Group();
      const y = 0.33 + (floor - 1) * floorHeight;
      floorGroup.position.y = y;
      floorGroup.name = `VISUAL-FLOOR-${String(floor).padStart(2, "0")}`;
      const materials: THREE.Material[] = [];

      const concrete = new THREE.MeshStandardMaterial({ color: 0xaaa79f, roughness: 0.72, metalness: 0.04, transparent: true });
      const shadowBand = new THREE.MeshStandardMaterial({ color: 0x3c3d3b, roughness: 0.82, transparent: true });
      materials.push(concrete, shadowBand);
      const module = makeBox([3.2, 0.315, 1.9], concrete);
      module.castShadow = true;
      module.receiveShadow = true;
      floorGroup.add(module);
      const seam = makeBox([3.28, 0.018, 1.96], shadowBand);
      seam.position.y = -0.172;
      floorGroup.add(seam);

      const windowXs = [-1.08, -0.36, 0.36, 1.08];
      windowXs.forEach((x, windowIndex) => {
        const warm = ((floor * 7 + windowIndex * 3) % 13 === 0) || (floor === 16 && windowIndex === 3);
        const glass = new THREE.MeshPhysicalMaterial({
          color: warm ? 0x9a7950 : 0x26383a,
          roughness: 0.26,
          metalness: 0.05,
          transmission: 0.12,
          transparent: true,
          opacity: 0.92,
          emissive: new THREE.Color(warm ? 0xffb35d : 0x071011),
          emissiveIntensity: warm ? 1.15 : 0.12
        });
        materials.push(glass);
        const windowMesh = makeBox([0.31, 0.19, 0.035], glass);
        windowMesh.position.set(x, 0.015, 0.968);
        floorGroup.add(windowMesh);
      });

      if (floor === 16) {
        const unitMaterial = new THREE.MeshStandardMaterial({
          color: 0xb97832,
          emissive: new THREE.Color(0xcf7d2c),
          emissiveIntensity: 0.48,
          roughness: 0.42,
          transparent: true,
          opacity: 0.9
        });
        materials.push(unitMaterial);
        const unit = makeBox([0.63, 0.285, 0.055], unitMaterial);
        unit.position.set(1.04, 0, 0.995);
        unit.name = "VISUAL-UNIT-1602";
        floorGroup.add(unit);
        eventPoint = new THREE.Object3D();
        eventPoint.position.set(1.04, 0, 1.12);
        eventPoint.name = "VISUAL-EVENT-EVT-1602";
        floorGroup.add(eventPoint);
      }

      floorMaterials.set(floor, materials);
      tower.add(floorGroup);
    }

    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x555653, roughness: 0.74, metalness: 0.12 });
    const roof = makeBox([3.35, 0.12, 2.05], roofMaterial);
    roof.position.y = 7.08;
    roof.castShadow = true;
    tower.add(roof);
    const entranceMaterial = new THREE.MeshStandardMaterial({ color: 0x67331f, roughness: 0.54 });
    const entrance = makeBox([0.38, 0.48, 0.08], entranceMaterial);
    entrance.position.set(0, 0.18, 1.01);
    tower.add(entrance);

    const groundMaterial = new THREE.MeshPhysicalMaterial({ color: 0x111313, roughness: 0.28, metalness: 0.22, clearcoat: 0.45, clearcoatRoughness: 0.32 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    const hemisphere = new THREE.HemisphereLight(0xeae4d8, 0x171c1c, 1.7);
    const key = new THREE.DirectionalLight(0xfff7e8, 3.8);
    key.position.set(-4, 10, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.DirectionalLight(0x6f9b9d, 1.15);
    rim.position.set(7, 5, -5);
    const eventLight = new THREE.PointLight(0xe79b4b, 2.2, 4.2, 2);
    eventLight.position.set(1.3, 6.1, 2.1);
    scene.add(hemisphere, key, rim, eventLight);

    const runtime: Runtime = {
      scene,
      camera,
      renderer,
      tower,
      eventPoint: eventPoint ?? tower,
      floorMaterials,
      cameraGoal: initial.position.clone(),
      target: initial.target.clone(),
      targetGoal: initial.target.clone(),
      frame: 0,
      reducedMotion
    };
    runtimeRef.current = runtime;

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

    const world = new THREE.Vector3();
    const animate = () => {
      const activePhase = phaseRef.current;
      const amount = reducedMotion ? 1 : 0.055;
      camera.position.lerp(runtime.cameraGoal, amount);
      runtime.target.lerp(runtime.targetGoal, amount);
      camera.lookAt(runtime.target);
      if (!reducedMotion && activePhase === "building") tower.rotation.y = -0.24 + Math.sin(performance.now() * 0.00018) * 0.025;
      floorMaterials.forEach((materials, floor) => {
        const goal = targetOpacity(activePhase, floor);
        materials.forEach((material) => {
          material.transparent = goal < 0.999 || material.transparent;
          material.opacity += (goal - material.opacity) * (reducedMotion ? 1 : 0.09);
          material.depthWrite = material.opacity > 0.3;
        });
      });
      renderer.render(scene, camera);

      const anchor = eventRef.current;
      if (anchor) {
        runtime.eventPoint.getWorldPosition(world);
        world.project(camera);
        anchor.style.left = `${(world.x * 0.5 + 0.5) * host.clientWidth}px`;
        anchor.style.top = `${(-world.y * 0.5 + 0.5) * host.clientHeight}px`;
        anchor.hidden = world.z > 1;
      }
      runtime.frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(runtime.frame);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      host.replaceChildren();
      runtimeRef.current = null;
    };
  }, []);

  return <div className={`v6-building-twin phase-${phase}`}>
    <div ref={hostRef} className="v6-building-canvas" role="img" aria-label="华章新筑2号楼18层建筑数字孪生，16层1602存在一项建筑生命事件" />
    {failed ? <div className="v6-building-fallback"><img src={publicAssetPath("/assets/building-digital-twin.png")} alt="华章新筑2号楼建筑模型降级画面" /></div> : null}
    <button ref={eventRef} type="button" className="v6-event-anchor" onClick={onEnter} aria-label="进入16层1602卫生间建筑生命事件">
      <i /><span><strong>16F / 1602</strong><small>LIFE EVENT ACTIVE</small></span>
    </button>
  </div>;
}
