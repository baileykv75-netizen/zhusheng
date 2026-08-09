import type { VisualDirective, VisualManifest } from "../life-event-engine/types.ts";

export type TransformSnapshot = {
  position: [number, number, number];
  scale: [number, number, number];
  quaternion: [number, number, number, number];
  visible: boolean;
};

export function naturalTransform(snapshot: TransformSnapshot): TransformSnapshot {
  const hiddenScale = snapshot.scale.every((value) => Math.abs(value) < 1e-7);
  const exportHiddenOffset = hiddenScale
    && Math.abs(snapshot.position[0]) < 1e-7
    && Math.abs(snapshot.position[1]) < 1e-7
    && Math.abs(snapshot.position[2] + 64) < 1e-4;
  return {
    position: exportHiddenOffset ? [0, 0, 0] : [...snapshot.position],
    scale: hiddenScale ? [1, 1, 1] : [...snapshot.scale],
    quaternion: [...snapshot.quaternion],
    visible: true
  };
}

export function resolveScenePlan(
  manifest: VisualManifest,
  directive: VisualDirective,
  viewOverride?: VisualDirective["view"]
) {
  const view = viewOverride ?? directive.view;
  const viewSpec = manifest.views[view];
  if (!viewSpec) throw new Error(`Manifest view missing: ${view}`);
  const binding = manifest.visualStates.stateBindings[directive.moistureState];
  if (!binding) throw new Error(`Manifest state binding missing: ${directive.moistureState}`);
  const allLayers = new Set<string>();
  for (const spec of Object.values(manifest.views)) {
    spec.visibleLayers.forEach((layer) => allLayers.add(layer));
    spec.hiddenLayers.forEach((layer) => allLayers.add(layer));
  }
  return {
    view,
    camera: viewSpec.camera,
    layerVisibility: Object.fromEntries([...allLayers].map((layer) => [layer, viewSpec.visibleLayers.includes(layer)])),
    hiddenNodes: [...viewSpec.hiddenNodes],
    visibleStateNodes: [...binding.visibleNodes],
    hiddenStateNodes: [...new Set(Object.values(manifest.visualStates.stateBindings).flatMap((item) => [...item.visibleNodes, ...item.hiddenNodes]))],
    valveNodeName: manifest.visualStates.valvePosition.nodeName,
    valveRotation: manifest.visualStates.valvePosition.transforms[directive.valvePosition]?.rotationEuler ?? [0, 0, 0],
    highlights: [...directive.highlightBusinessIds],
    evidenceAnchors: [...directive.evidenceAnchorIds]
  };
}
