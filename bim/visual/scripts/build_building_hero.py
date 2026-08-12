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
from mathutils import Vector


def arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build the IFC-aligned Zhusheng Building Hero visual twin.")
    parser.add_argument("--spec", type=Path, required=True)
    parser.add_argument("--ifc", type=Path, required=True)
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--anchors", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--screenshots", type=Path, required=True)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def material(name: str, color: tuple[float, float, float, float], roughness: float, metallic: float = 0.0, emission: float = 0.0) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    bsdf = next((node for node in value.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = value.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        output = next((node for node in value.node_tree.nodes if node.type == "OUTPUT_MATERIAL"), None)
        if output is None:
            output = value.node_tree.nodes.new("ShaderNodeOutputMaterial")
        value.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    value.diffuse_color = color
    return value


def add_box(name: str, dimensions: tuple[float, float, float], location: tuple[float, float, float], mat: bpy.types.Material, parent: bpy.types.Object | None = None, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.data.materials.append(mat)
    obj.parent = parent
    if bevel:
        modifier = obj.modifiers.new("HeroSoftEdge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def add_anchor(name: str, location: tuple[float, float, float], parent: bpy.types.Object) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.32
    obj.location = location
    obj.parent = parent
    obj["visualAnchor"] = True
    bpy.context.scene.collection.objects.link(obj)
    return obj


def camera(name: str, location: tuple[float, float, float], target: tuple[float, float, float], lens: float, parent: bpy.types.Object) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36
    data.clip_start = 0.1
    data.clip_end = 300
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.parent = parent
    bpy.context.scene.collection.objects.link(obj)
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            datablocks.remove(block)


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.15
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.025, 0.029, 0.029, 1)
    background.inputs["Strength"].default_value = 0.42


def build(args: argparse.Namespace) -> dict[str, Any]:
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    building = spec["building"]
    shell = spec["architecturalShell"]
    unit = spec["focusUnit"]
    bathroom = next(space for space in unit["spaces"] if space["businessId"] == "SPACE-1602-BATHROOM")
    width = float(building["footprint"]["widthX"])
    depth = float(building["footprint"]["depthY"])
    floors = int(building["storeyCount"])
    floor_height = float(building["storeyHeight"])
    body_height = floors * floor_height

    reset_scene()
    configure_scene()
    root = bpy.data.objects.new("BLD-ZS-DEMO-001", None)
    root["businessId"] = "BLD-ZS-DEMO-001"
    root["sourceIfc"] = args.ifc.name
    root["syntheticDemo"] = True
    bpy.context.scene.collection.objects.link(root)

    mats = {
        "concrete": material("MAT-HERO-CONCRETE", (0.52, 0.50, 0.46, 1), 0.72, 0.02, 0.16),
        "band": material("MAT-HERO-SHADOW-BAND", (0.10, 0.105, 0.10, 1), 0.82, 0.0, 0.035),
        "glass": material("MAT-HERO-GLASS", (0.045, 0.10, 0.11, 1), 0.24, 0.28),
        "warm": material("MAT-HERO-WARM-WINDOW", (0.88, 0.46, 0.18, 1), 0.32, 0.05, 3.2),
        "focus": material("MAT-HERO-1602", (0.73, 0.20, 0.07, 1), 0.42, 0.08, 1.4),
        "entrance": material("MAT-HERO-ENTRANCE", (0.40, 0.08, 0.035, 1), 0.48, 0.04, 0.45),
        "core": material("MAT-HERO-CORE", (0.22, 0.23, 0.22, 1), 0.86, 0.0, 0.04),
        "ground": material("MAT-HERO-GROUND", (0.012, 0.015, 0.015, 1), 0.24, 0.42),
    }

    floor_objects: list[bpy.types.Object] = []
    for floor in range(1, floors + 1):
        elevation = (floor - 1) * floor_height
        group = bpy.data.objects.new(f"LVL-{floor:02d}", None)
        group["businessId"] = f"LVL-{floor:02d}"
        group["elevation"] = elevation
        group.parent = root
        bpy.context.scene.collection.objects.link(group)
        floor_objects.append(group)
        slab = add_box(f"SLAB-LVL-{floor:02d}", (width + 0.2, depth + 0.2, 0.18), (width / 2, depth / 2, elevation + 0.09), mats["band"], group, 0.025)
        slab["businessId"] = f"SLAB-LVL-{floor:02d}"
        add_box(f"VIS-SHELL-LVL-{floor:02d}", (width, depth, floor_height - 0.22), (width / 2, depth / 2, elevation + floor_height / 2 + 0.02), mats["concrete"], group, 0.06)

        for facade, y, outward in (("SOUTH", -0.045, -1), ("NORTH", depth + 0.045, 1)):
            for index in range(4):
                x = float(shell["window"]["firstCentreX"]) + float(shell["window"]["spacingX"]) * index
                z = elevation + float(shell["window"]["sillHeight"]) + float(shell["window"]["height"]) / 2
                warm = (floor * 7 + index * 3) % 13 == 0 or (floor == 16 and facade == "NORTH" and index == 3)
                window = add_box(
                    f"WINDOW-LVL-{floor:02d}-{facade}-{index + 1:02d}",
                    (float(shell["window"]["width"]), 0.12, float(shell["window"]["height"])),
                    (x, y, z), mats["warm"] if warm else mats["glass"], group, 0.025
                )
                window["businessId"] = window.name
                window["facade"] = facade
                window["outward"] = outward

        if floor == 16:
            unit_root = bpy.data.objects.new("UNIT-1602", None)
            unit_root["businessId"] = "UNIT-1602"
            unit_root.parent = group
            unit_root.location = (float(unit["globalOrigin"]["x"]), float(unit["globalOrigin"]["y"]), 0)
            bpy.context.scene.collection.objects.link(unit_root)
            add_box("VIS-UNIT-1602", (float(unit["moduleSize"]["widthX"]), 0.14, 2.35), (float(unit["moduleSize"]["widthX"]) / 2, float(unit["moduleSize"]["depthY"]) + 0.08, 1.52), mats["focus"], unit_root, 0.035)
            bath_origin = bathroom["localOrigin"]
            bath_size = bathroom["size"]
            bathroom_root = bpy.data.objects.new("SPACE-1602-BATHROOM", None)
            bathroom_root["businessId"] = "SPACE-1602-BATHROOM"
            bathroom_root.parent = unit_root
            bathroom_root.location = (float(bath_origin["x"]), float(bath_origin["y"]), 0)
            bpy.context.scene.collection.objects.link(bathroom_root)
            add_box("VIS-SPACE-1602-BATHROOM", (float(bath_size["widthX"]), 0.2, float(bath_size["clearHeight"])), (float(bath_size["widthX"]) / 2, -0.16, 1.5), mats["warm"], bathroom_root, 0.025)

    core = spec["typicalResidentialStorey"]["core"]
    for segment in core["segments"]:
        bounds = segment["bounds"]
        core_width = bounds["maxX"] - bounds["minX"]
        core_depth = bounds["maxY"] - bounds["minY"]
        add_box(
            f"VIS-CORE-{segment['suffix']}",
            (max(0.1, core_width - 0.5), max(0.1, core_depth - 0.5), body_height - 0.4),
            ((bounds["minX"] + bounds["maxX"]) / 2, (bounds["minY"] + bounds["maxY"]) / 2, body_height / 2),
            mats["core"], root, 0.04
        )

    add_box("SLAB-ROOF", (width + 0.2, depth + 0.2, 0.2), (width / 2, depth / 2, body_height + 0.1), mats["band"], root, 0.035)
    parapet_h = float(shell["roof"]["parapetHeight"])
    parapet_t = float(shell["roof"]["parapetThickness"])
    for name, dims, location in (
        ("WALL-ROOF-PARAPET-SOUTH", (width + 0.4, parapet_t, parapet_h), (width / 2, -0.1, body_height + parapet_h / 2)),
        ("WALL-ROOF-PARAPET-NORTH", (width + 0.4, parapet_t, parapet_h), (width / 2, depth + 0.1, body_height + parapet_h / 2)),
        ("WALL-ROOF-PARAPET-WEST", (parapet_t, depth, parapet_h), (-0.1, depth / 2, body_height + parapet_h / 2)),
        ("WALL-ROOF-PARAPET-EAST", (parapet_t, depth, parapet_h), (width + 0.1, depth / 2, body_height + parapet_h / 2)),
    ):
        add_box(name, dims, location, mats["concrete"], root, 0.03)
    entrance = shell["mainEntrance"]
    add_box("DOOR-LVL-01-MAIN", (float(entrance["width"]), 0.16, float(entrance["height"])), (float(entrance["centreX"]), -0.14, float(entrance["height"]) / 2), mats["entrance"], root, 0.04)
    add_box("VIS-HERO-GROUND", (90, 70, 0.08), (width / 2, depth / 2, -0.06), mats["ground"], None, 0.02)

    anchors = {
        "BUILDING_CENTER": (width / 2, depth / 2, body_height * 0.48),
        "FLOOR_16": (width / 2, depth / 2, 45 + 1.5),
        "UNIT_1602": (16 + 5.6, 8.4 + 3.2, 45 + 1.5),
        "BATHROOM_1602": (16 + 0.3 + 1.2, 8.4 + 0.3 + 0.9, 45 + 1.4),
        "EVENT_1602": (16 + 0.3 + 1.2, 14.92, 45 + 1.45),
    }
    for name, location in anchors.items():
        add_anchor(f"ANCHOR-{name}", location, root)

    cameras = {
        "building": camera("CAM-HERO-BUILDING", (102, 124, 72), anchors["BUILDING_CENTER"], 58, root),
        "floor": camera("CAM-HERO-FLOOR-16", (82, 94, 63), anchors["FLOOR_16"], 60, root),
        "unit": camera("CAM-HERO-UNIT-1602", (62, 72, 57), anchors["UNIT_1602"], 64, root),
        "space": camera("CAM-HERO-BATHROOM-1602", (48, 55, 53), anchors["BATHROOM_1602"], 68, root),
    }

    sun_data = bpy.data.lights.new("HERO-KEY", "AREA")
    sun_data.energy = 1750
    sun_data.shape = "RECTANGLE"
    sun_data.size = 38
    sun_data.color = (1.0, 0.82, 0.65)
    sun = bpy.data.objects.new("HERO-KEY", sun_data)
    sun.location = (-18, -28, 70)
    sun.rotation_euler = (Vector(anchors["BUILDING_CENTER"]) - sun.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(sun)
    fill_data = bpy.data.lights.new("HERO-RIM", "AREA")
    fill_data.energy = 1200
    fill_data.shape = "RECTANGLE"
    fill_data.size = 30
    fill_data.color = (0.36, 0.56, 0.58)
    fill = bpy.data.objects.new("HERO-RIM", fill_data)
    fill.location = (48, 35, 45)
    fill.rotation_euler = (Vector(anchors["BUILDING_CENTER"]) - fill.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(fill)
    top_data = bpy.data.lights.new("HERO-TOP", "AREA")
    top_data.energy = 950
    top_data.shape = "DISK"
    top_data.size = 24
    top_data.color = (0.72, 0.78, 0.78)
    top = bpy.data.objects.new("HERO-TOP", top_data)
    top.location = (12, 8, 78)
    top.rotation_euler = (Vector(anchors["BUILDING_CENTER"]) - top.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(top)

    args.screenshots.mkdir(parents=True, exist_ok=True)
    for phase, cam in cameras.items():
        bpy.context.scene.camera = cam
        bpy.context.scene.render.filepath = str((args.screenshots / f"hero-{phase}.png").resolve())
        bpy.ops.render.render(write_still=True)

    args.blend.parent.mkdir(parents=True, exist_ok=True)
    args.glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.camera = cameras["building"]
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    bpy.ops.export_scene.gltf(
        filepath=str(args.glb.resolve()), export_format="GLB", export_cameras=True,
        export_lights=False, export_extras=True, export_apply=True, export_yup=True, export_materials="EXPORT"
    )

    anchor_payload = {
        "schemaVersion": 1,
        "asset": args.glb.name,
        "coordinateSystem": "BUILDING_SPEC_METRES_Z_UP_SOURCE_GLTF_Y_UP",
        "sourceSpec": args.spec.name,
        "anchors": {
            phase: {
                "node": cameras[phase].name,
                "targetNode": f"ANCHOR-{target}",
            }
            for phase, target in (("building", "BUILDING_CENTER"), ("floor", "FLOOR_16"), ("unit", "UNIT_1602"), ("space", "BATHROOM_1602"))
        },
        "eventAnchorNode": "ANCHOR-EVENT_1602",
        "floorNodes": {str(floor): f"LVL-{floor:02d}" for floor in range(1, floors + 1)},
        "focusNodes": {"floor": "LVL-16", "unit": "UNIT-1602", "space": "SPACE-1602-BATHROOM"},
    }
    args.anchors.write_text(json.dumps(anchor_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"spec": spec, "width": width, "depth": depth, "floors": floors, "floorHeight": floor_height, "bodyHeight": body_height, "anchors": anchors}


def bounds(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    corners: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = [min(point[index] for point in corners) for index in range(3)]
    maximum = [max(point[index] for point in corners) for index in range(3)]
    return minimum, maximum


def validate(args: argparse.Namespace, facts: dict[str, Any]) -> dict[str, Any]:
    spec = facts["spec"]
    shell_objects = [obj for obj in bpy.context.scene.objects if obj.name.startswith("VIS-SHELL-LVL-")]
    envelope_objects = shell_objects + [obj for obj in bpy.context.scene.objects if obj.name.startswith("SLAB-LVL-") or obj.name == "SLAB-ROOF"]
    shell_min, shell_max = bounds(shell_objects)
    model_min, model_max = bounds(envelope_objects)
    tolerance = max(facts["width"], facts["depth"], facts["bodyHeight"]) * 1e-5
    overhang = float(spec["architecturalShell"]["floorSlab"]["edgeOverhang"])
    expected_unit = [16.0, 8.4, 45.0, 27.2, 14.8, 48.0]
    bathroom = [16.3, 8.7, 45.0, 18.7, 10.5, 47.8]
    checks = {
        "bodyWidth": abs((shell_max[0] - shell_min[0]) - facts["width"]) <= tolerance,
        "bodyDepth": abs((shell_max[1] - shell_min[1]) - facts["depth"]) <= tolerance,
        "envelopeWidthWithSlabOverhang": abs((model_max[0] - model_min[0]) - (facts["width"] + 2 * overhang)) <= tolerance,
        "envelopeDepthWithSlabOverhang": abs((model_max[1] - model_min[1]) - (facts["depth"] + 2 * overhang)) <= tolerance,
        "bodyHeight": abs(model_max[2] - facts["bodyHeight"] - 0.2) <= tolerance,
        "storeyCount": len([obj for obj in bpy.context.scene.objects if obj.name.startswith("LVL-")]) == facts["floors"],
        "storeyElevations": all(abs(float(bpy.data.objects[f"LVL-{floor:02d}"]["elevation"]) - ((floor - 1) * facts["floorHeight"])) <= tolerance for floor in range(1, facts["floors"] + 1)),
        "coreSouth": bpy.data.objects.get("VIS-CORE-SOUTH") is not None,
        "coreNorth": bpy.data.objects.get("VIS-CORE-NORTH") is not None,
        "unit1602Node": bpy.data.objects.get("UNIT-1602") is not None,
        "bathroom1602Node": bpy.data.objects.get("SPACE-1602-BATHROOM") is not None,
        "allAnchors": all(bpy.data.objects.get(f"ANCHOR-{name}") is not None for name in facts["anchors"]),
    }
    triangles = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    payload = {
        "schemaVersion": 1,
        "asset": args.glb.name,
        "sourceIfc": args.ifc.name,
        "sourceIfcSha256": sha256(args.ifc),
        "sourceSpec": args.spec.name,
        "lengthUnit": spec["meta"]["lengthUnit"],
        "toleranceDerivedFromModelScale": tolerance,
        "geometry": {
            "buildingEnvelopeBoundingBox": {"min": model_min, "max": model_max},
            "bodyBoundingBox": {"min": shell_min, "max": shell_max},
            "expectedBodyFootprint": [facts["width"], facts["depth"]],
            "expectedEnvelopeFootprint": [facts["width"] + 2 * overhang, facts["depth"] + 2 * overhang],
            "expectedBodyHeight": facts["bodyHeight"],
            "storeyCount": facts["floors"],
            "storeyHeight": facts["floorHeight"],
            "unit1602BoundingVolume": expected_unit,
            "bathroom1602BoundingVolume": bathroom,
            "anchorPositions": facts["anchors"],
        },
        "checks": checks,
        "performanceBudget": {"triangleCount": triangles, "glbBytes": args.glb.stat().st_size, "recommendedMaxTriangles": 75000, "maxGlbBytes": 10 * 1024 * 1024},
        "visualPriority": ["Visual QA", "Material Quality", "Silhouette", "Lighting", "Geometry Detail", "Triangle Count"],
        "passed": all(checks.values()) and args.glb.stat().st_size <= 10 * 1024 * 1024,
    }
    args.validation.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not payload["passed"]:
        raise RuntimeError(f"Building hero validation failed: {payload}")
    return payload


def main() -> int:
    args = arguments()
    facts = build(args)
    result = validate(args, facts)
    print("BUILDING_HERO_BUILT", args.glb.resolve(), f"triangles={result['performanceBudget']['triangleCount']}", f"bytes={result['performanceBudget']['glbBytes']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
