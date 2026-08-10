from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import traceback
from pathlib import Path
from typing import Any

import bpy


def script_arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Derive the premium 1602 visual twin from the protected semantic BLEND.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--source-glb", type=Path, required=True)
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--screenshots", type=Path, required=True)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def principled(material: bpy.types.Material) -> bpy.types.Node | None:
    if not material.use_nodes or not material.node_tree:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def tune_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    transmission: float = 0.0,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.node_tree.nodes.clear()
        output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = color
    bsdf = principled(material)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = color[3]
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = transmission
        if emission_strength and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if color[3] < 1.0 or transmission:
        material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
    return material


def collection_for(parent: bpy.types.Object) -> bpy.types.Collection:
    if parent.users_collection:
        return parent.users_collection[0]
    return bpy.context.scene.collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def mark_detail(obj: bpy.types.Object, role: str) -> bpy.types.Object:
    obj["visualOnly"] = True
    obj["premiumDetail"] = True
    obj["syntheticDemo"] = True
    obj["premiumRole"] = role
    return obj


def add_box(
    name: str,
    size: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
    role: str,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.dimensions = size
    move_to_collection(obj, collection_for(parent))
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("PremiumSoftEdge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return mark_detail(obj, role)


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object,
    role: str,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    move_to_collection(obj, collection_for(parent))
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("PremiumSoftEdge", "BEVEL")
    bevel.width = min(radius * 0.12, 0.008)
    bevel.segments = 3
    return mark_detail(obj, role)


def add_torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    role: str,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=16,
    )
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    move_to_collection(obj, collection_for(parent))
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return mark_detail(obj, role)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.7
    scene.view_settings.gamma = 1.0
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.012, 0.014, 0.014, 1.0)
        background.inputs["Strength"].default_value = 0.24
    for light in (obj for obj in scene.objects if obj.type == "LIGHT"):
        light.data.energy *= 0.62
        light.data.color = (1.0, 0.88, 0.74) if "KEY" in light.name else (0.72, 0.79, 0.78)


def tune_existing_materials() -> dict[str, bpy.types.Material]:
    materials = {
        "wall": tune_material("MAT-TILE-WALL", (0.46, 0.43, 0.39, 1.0), 0.58),
        "floor": tune_material("MAT-TILE-FLOOR", (0.27, 0.29, 0.28, 1.0), 0.42),
        "grout": tune_material("MAT-GROUT", (0.055, 0.06, 0.06, 1.0), 0.82),
        "porcelain": tune_material("MAT-PORCELAIN", (0.82, 0.83, 0.79, 1.0), 0.2),
        "vanity": tune_material("MAT-VANITY", (0.115, 0.13, 0.13, 1.0), 0.44, 0.02),
        "metal": tune_material("MAT-METAL", (0.34, 0.37, 0.37, 1.0), 0.24, 0.82),
        "glass": tune_material("MAT-GLASS", (0.32, 0.45, 0.46, 0.2), 0.12, 0.0, 0.82),
        "mirror": tune_material("MAT-MIRROR", (0.23, 0.29, 0.3, 1.0), 0.035, 0.96),
        "door": tune_material("MAT-DOOR", (0.18, 0.14, 0.105, 1.0), 0.5, 0.02),
        "joint": tune_material("MAT-JOINT", (0.58, 0.32, 0.14, 1.0), 0.3, 0.56),
        "valve": tune_material("MAT-VALVE", (0.5, 0.27, 0.13, 1.0), 0.3, 0.58),
        "evidence": tune_material("MAT-EVIDENCE", (0.42, 0.31, 0.2, 1.0), 0.52, 0.12),
        "detail": tune_material("MAT-PREMIUM-DETAIL", (0.095, 0.105, 0.105, 1.0), 0.38, 0.24),
        "edge": tune_material("MAT-PREMIUM-EDGE", (0.23, 0.21, 0.19, 1.0), 0.62),
        "warm": tune_material("MAT-PREMIUM-WARM-LIGHT", (0.92, 0.62, 0.34, 1.0), 0.28, 0.0, 0.0, 1.5),
        "cavity": tune_material("MAT-PREMIUM-CAVITY", (0.035, 0.038, 0.038, 1.0), 0.88),
    }
    for damp_name, color in (
        ("MAT-DAMP-LIGHT", (0.19, 0.18, 0.16, 0.34)),
        ("MAT-DAMP-MODERATE", (0.14, 0.14, 0.13, 0.48)),
        ("MAT-DAMP-SEVERE", (0.1, 0.11, 0.1, 0.62)),
    ):
        tune_material(damp_name, color, 0.92)
    tune_material("MAT-REPAIR", (0.045, 0.048, 0.047, 1.0), 0.9)
    return materials


def smooth_existing() -> None:
    smooth_tokens = ("WC-BOWL", "WC-SEAT", "BASIN-BOWL", "FAUCET", "SHOWER-", "METER-", "VALVE-", "J-1602")
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if any(token in obj.name for token in smooth_tokens):
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        for modifier in obj.modifiers:
            if modifier.type == "BEVEL":
                modifier.segments = max(modifier.segments, 3)


def add_architectural_details(materials: dict[str, bpy.types.Material]) -> None:
    architecture = bpy.data.objects["LAYER-ARCHITECTURE"]
    fixtures = bpy.data.objects["LAYER-FIXTURES"]
    room_width = 2.4
    room_depth = 1.8
    room_height = 2.7

    for index, x in enumerate((0.6, 1.2, 1.8), start=1):
        add_box(f"PREMIUM-NORTH-JOINT-V-{index:02d}", (0.007, 0.006, room_height - 0.14), (x, room_depth - 0.004, room_height / 2), materials["edge"], architecture, "wall-joint")
    for index, z in enumerate((0.9, 1.8), start=1):
        add_box(f"PREMIUM-NORTH-JOINT-H-{index:02d}", (room_width - 0.08, 0.006, 0.007), (room_width / 2, room_depth - 0.004, z), materials["edge"], architecture, "wall-joint")
    for index, y in enumerate((0.6, 1.2), start=1):
        add_box(f"PREMIUM-EAST-JOINT-V-{index:02d}", (0.006, 0.007, room_height - 0.14), (room_width - 0.004, y, room_height / 2), materials["edge"], architecture, "wall-joint")

    for suffix, size, location in (
        ("NORTH", (room_width - 0.04, 0.025, 0.07), (room_width / 2, room_depth - 0.018, 0.085)),
        ("WEST", (0.025, room_depth - 0.04, 0.07), (0.018, room_depth / 2, 0.085)),
        ("EAST", (0.025, room_depth - 0.04, 0.07), (room_width - 0.018, room_depth / 2, 0.085)),
    ):
        add_box(f"PREMIUM-SKIRTING-{suffix}", size, location, materials["edge"], architecture, "skirting", bevel=0.004)

    mirror = bpy.data.objects["VIS-MIRROR-CABINET-01"]
    for suffix, size, location in (
        ("L", (0.025, 0.025, 0.84), (0.175, 0.012, 1.56)),
        ("R", (0.025, 0.025, 0.84), (0.905, 0.012, 1.56)),
        ("T", (0.755, 0.025, 0.025), (0.54, 0.012, 1.965)),
        ("B", (0.755, 0.025, 0.025), (0.54, 0.012, 1.155)),
    ):
        add_box(f"PREMIUM-MIRROR-RIM-{suffix}", size, location, materials["metal"], mirror, "mirror-rim", bevel=0.004)
    add_box("PREMIUM-MIRROR-LIGHT", (0.62, 0.022, 0.025), (0.54, 0.0, 2.01), materials["warm"], mirror, "mirror-light", bevel=0.006)

    basin = bpy.data.objects["FIXTURE-1602-BASIN-01"]
    add_box("PREMIUM-VANITY-TOE-KICK", (0.58, 0.035, 0.09), (0.54, 0.145, 0.075), materials["cavity"], basin, "vanity-detail", bevel=0.006)
    add_box("PREMIUM-VANITY-DRAWER-GAP", (0.56, 0.012, 0.012), (0.54, 0.124, 0.47), materials["edge"], basin, "vanity-detail", bevel=0.003)
    add_box("PREMIUM-VANITY-HANDLE", (0.25, 0.018, 0.018), (0.54, 0.115, 0.55), materials["metal"], basin, "vanity-hardware", bevel=0.006)
    add_cylinder("PREMIUM-BASIN-DRAIN", 0.035, 0.008, (0.54, 0.37, 0.795), materials["metal"], basin, "basin-detail")

    wc = bpy.data.objects["FIXTURE-1602-WC-01"]
    add_box("PREMIUM-WC-FLUSH-PLATE", (0.19, 0.018, 0.12), (1.93, room_depth - 0.015, 1.18), materials["metal"], wc, "wc-detail", bevel=0.012)
    add_cylinder("PREMIUM-WC-FLUSH-BUTTON", 0.024, 0.01, (1.93, room_depth - 0.024, 1.18), materials["detail"], wc, "wc-detail", rotation=(math.pi / 2.0, 0.0, 0.0))

    shower = bpy.data.objects["FIXTURE-1602-SHOWER-01"]
    add_box("PREMIUM-SHOWER-SHELF", (0.32, 0.1, 0.025), (2.22, 1.52, 1.3), materials["metal"], shower, "shower-detail", bevel=0.008)
    add_box("PREMIUM-SHOWER-SHELF-BACK", (0.32, 0.018, 0.12), (2.22, 1.565, 1.35), materials["detail"], shower, "shower-detail", bevel=0.008)

    partition = bpy.data.objects["PARTITION-1602-SHOWER-01"]
    for index, z in enumerate((0.35, 1.65), start=1):
        add_box(f"PREMIUM-GLASS-CLAMP-{index:02d}", (0.065, 0.035, 0.055), (1.50, 0.86, z), materials["metal"], partition, "glass-hardware", bevel=0.007)

    maintenance = bpy.data.objects["STATE-REPAIR-OPEN"]
    add_box("PREMIUM-REPAIR-CAVITY", (0.56, 0.045, 0.66), (1.36, room_depth - 0.022, 1.08), materials["cavity"], maintenance, "repair-cavity", bevel=0.012)
    for suffix, size, location in (
        ("L", (0.035, 0.045, 0.72), (1.055, room_depth - 0.045, 1.08)),
        ("R", (0.035, 0.045, 0.72), (1.665, room_depth - 0.045, 1.08)),
        ("T", (0.64, 0.045, 0.035), (1.36, room_depth - 0.045, 1.42)),
        ("B", (0.64, 0.045, 0.035), (1.36, room_depth - 0.045, 0.74)),
    ):
        add_box(f"PREMIUM-REPAIR-EDGE-{suffix}", size, location, materials["edge"], maintenance, "repair-edge", bevel=0.008)


def set_recursive_render(root: bpy.types.Object, hidden: bool) -> None:
    root.hide_render = hidden
    for child in root.children_recursive:
        child.hide_render = hidden


def apply_view(manifest: dict[str, Any], view_name: str, state_name: str = "DRY") -> None:
    view = manifest["views"][view_name]
    visible_layers = set(view["visibleLayers"])
    for layer_name in ("ARCHITECTURE", "FIXTURES", "SYSTEMS", "WATERPROOFING", "MOISTURE", "MAINTENANCE", "EVIDENCE"):
        layer = bpy.data.objects.get(f"LAYER-{layer_name}")
        if layer:
            layer.scale = (1.0, 1.0, 1.0) if layer_name in visible_layers or layer_name == "MOISTURE" else (0.0, 0.0, 0.0)
            set_recursive_render(layer, False)
    for node_name in view["hiddenNodes"]:
        node = bpy.data.objects.get(node_name)
        if node:
            set_recursive_render(node, True)
    for state in ("DAMP_LIGHT", "DAMP_MODERATE", "DAMP_SEVERE", "REPAIR-OPEN", "REPAIRED"):
        node = bpy.data.objects.get(f"STATE-{state}")
        if node:
            node.scale = (1.0, 1.0, 1.0) if state == state_name else (0.0, 0.0, 0.0)
    for marker in (obj for obj in bpy.context.scene.objects if obj.name.startswith("VIS-EVIDENCE-ANCHOR") and obj.name.endswith("MARKER")):
        marker.hide_render = True
    bpy.context.scene.camera = bpy.data.objects[view["camera"]]


def render_views(args: argparse.Namespace, manifest: dict[str, Any]) -> None:
    args.screenshots.mkdir(parents=True, exist_ok=True)
    views = (
        ("VIEW_RESIDENT", "DAMP_LIGHT", "01-premium-resident.png"),
        ("VIEW_DIAGNOSTIC", "DAMP_MODERATE", "02-premium-diagnostic.png"),
        ("VIEW_CONSTRUCTION_MEMORY", "DRY", "03-premium-memory.png"),
        ("VIEW_MAINTENANCE", "REPAIR-OPEN", "04-premium-maintenance.png"),
    )
    for view_name, state_name, filename in views:
        apply_view(manifest, view_name, state_name)
        bpy.context.scene.render.filepath = str((args.screenshots / filename).resolve())
        bpy.ops.render.render(write_still=True)


def triangle_count() -> int:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return triangles


def export(args: argparse.Namespace, manifest: dict[str, Any]) -> None:
    apply_view(manifest, "VIEW_RESIDENT", "DRY")
    args.blend.parent.mkdir(parents=True, exist_ok=True)
    args.glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    bpy.ops.export_scene.gltf(
        filepath=str(args.glb.resolve()),
        export_format="GLB",
        use_selection=False,
        export_cameras=True,
        export_lights=False,
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )


def validate(args: argparse.Namespace, manifest: dict[str, Any]) -> dict[str, Any]:
    critical = sorted({node["nodeName"] for node in manifest["nodes"].values()})
    missing = [name for name in critical if bpy.data.objects.get(name) is None]
    premium_details = sorted(obj.name for obj in bpy.context.scene.objects if obj.get("premiumDetail"))
    glb_bytes = args.glb.stat().st_size
    triangles = triangle_count()
    payload = {
        "schemaVersion": 1,
        "asset": args.glb.name,
        "syntheticDemo": True,
        "semanticBaseline": args.source_glb.name,
        "semanticBaselineSha256": sha256(args.source_glb),
        "criticalNodeCount": len(critical),
        "missingCriticalNodes": missing,
        "premiumDetailCount": len(premium_details),
        "premiumDetails": premium_details,
        "triangleCount": triangles,
        "glbBytes": glb_bytes,
        "externalTextureCount": 0,
        "limits": {"maxGlbBytes": 10 * 1024 * 1024, "maxTriangles": 150000},
        "passed": not missing and len(premium_details) >= 24 and glb_bytes <= 10 * 1024 * 1024 and triangles <= 150000,
    }
    args.validation.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not payload["passed"]:
        raise RuntimeError(f"Premium asset validation failed: {payload}")
    return payload


def main() -> int:
    args = script_arguments()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    for name in ("SCENE-1602-BATHROOM", "SPACE-1602-BATHROOM", "LAYER-ARCHITECTURE", "FIXTURE-1602-WC-01", "J-1602-CW-03"):
        if bpy.data.objects.get(name) is None:
            raise RuntimeError(f"Protected semantic source is missing {name}")
    configure_scene()
    materials = tune_existing_materials()
    smooth_existing()
    add_architectural_details(materials)
    render_views(args, manifest)
    export(args, manifest)
    result = validate(args, manifest)
    print(
        "BATHROOM_PREMIUM_BUILT",
        args.glb.resolve(),
        f"details={result['premiumDetailCount']}",
        f"triangles={result['triangleCount']}",
        f"glbBytes={result['glbBytes']}",
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
