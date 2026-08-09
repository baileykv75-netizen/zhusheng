from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
import traceback
from pathlib import Path
from typing import Any

import bpy


VISUAL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BLEND = VISUAL_ROOT / "bathroom-1602.blend"
DEFAULT_GLB = VISUAL_ROOT / "bathroom-1602.glb"
DEFAULT_MANIFEST = VISUAL_ROOT / "bathroom-1602.manifest.json"
DEFAULT_REPORT = VISUAL_ROOT / "bathroom-1602.validation.json"
REQUIRED_VIEWS = {
    "VIEW_RESIDENT",
    "VIEW_DIAGNOSTIC",
    "VIEW_CONSTRUCTION_MEMORY",
    "VIEW_MAINTENANCE",
}
REQUIRED_STATES = {
    "DRY",
    "DAMP_LIGHT",
    "DAMP_MODERATE",
    "DAMP_SEVERE",
    "REPAIR_OPEN",
    "REPAIRED",
}
REQUIRED_ANCHORS = {
    "EVIDENCE-ANCHOR-PIPE-INSTALL",
    "EVIDENCE-ANCHOR-WATERPROOF",
    "EVIDENCE-ANCHOR-CLOSED-WATER-TEST",
    "EVIDENCE-ANCHOR-RESIDENT-WALL-PHOTO",
    "EVIDENCE-ANCHOR-METER-READING",
    "EVIDENCE-ANCHOR-REPAIR-RESULT",
}


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate the Zhusheng bathroom Blender scene.")
    parser.add_argument("--blend", type=Path, default=DEFAULT_BLEND)
    parser.add_argument("--glb", type=Path, default=DEFAULT_GLB)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def read_glb_json(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB is too small")
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total_length != len(data):
        raise ValueError("Invalid GLB header")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError("GLB first chunk is not JSON")
    return json.loads(data[20 : 20 + chunk_length].decode("utf-8").rstrip(" \t\r\n\x00"))


def triangle_count() -> int:
    total = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def main() -> int:
    args = script_arguments()
    errors: list[str] = []

    def expect(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    for path in (args.blend, args.glb, args.manifest):
        expect(path.resolve().exists(), f"Missing artifact: {path.resolve()}")
    if errors:
        raise RuntimeError("; ".join(errors))

    manifest = json.loads(args.manifest.resolve().read_text(encoding="utf-8"))
    expect(Path(bpy.data.filepath).resolve() == args.blend.resolve(), "Blender did not open the expected .blend file")
    expect(REQUIRED_VIEWS == set(manifest["views"]), "Manifest view set is incomplete")
    expect(REQUIRED_STATES == set(manifest["visualStates"]["states"]), "Manifest visual state set is incomplete")
    expect(REQUIRED_ANCHORS == set(manifest["evidenceAnchors"]), "Manifest evidence anchor set is incomplete")
    expect(manifest["visualStates"]["defaultState"] == "DRY", "Default scene state must be DRY")
    valve = manifest["visualStates"]["valvePosition"]
    expect(valve["default"] == "OPEN", "Valve default must be OPEN")
    expect(valve["authorizationRequired"] is True, "Valve CLOSED state must require authorization")
    expect(valve["doesNotGrantAuthorization"] is True, "Visual CLOSED state must not grant authorization")

    blend_objects = {obj.name for obj in bpy.data.objects}
    blend_collections = {collection.name for collection in bpy.data.collections}
    expected_nodes = {item["nodeName"] for item in manifest["nodes"].values()}
    expect(expected_nodes <= blend_objects, f"Blend missing nodes: {sorted(expected_nodes - blend_objects)}")
    expect(REQUIRED_VIEWS <= blend_collections, f"Blend missing view collections: {sorted(REQUIRED_VIEWS - blend_collections)}")
    for view in manifest["views"].values():
        expect(view["camera"] in blend_objects, f"Blend missing camera {view['camera']}")
    expect(REQUIRED_ANCHORS <= blend_objects, f"Blend missing evidence anchors: {sorted(REQUIRED_ANCHORS - blend_objects)}")
    external_images = [
        image
        for image in bpy.data.images
        if image.source == "FILE" and image.filepath and image.name not in {"Render Result", "Viewer Node"}
    ]
    expect(not external_images, f"Scene contains external texture images: {[image.name for image in external_images]}")

    glb_json = read_glb_json(args.glb.resolve())
    node_names = [node.get("name") for node in glb_json.get("nodes", []) if node.get("name")]
    for node_name in expected_nodes:
        expect(node_names.count(node_name) == 1, f"GLB key node count for {node_name} is {node_names.count(node_name)}")
    images = glb_json.get("images", [])
    expect(
        all("uri" not in image or image["uri"].startswith("data:") for image in images),
        "GLB contains a non-embedded image URI",
    )
    glb_text = json.dumps(glb_json, ensure_ascii=False)
    expect(not re.search(r"(?:[A-Za-z]:\\\\|file://|/Users/|/home/)", glb_text), "GLB JSON contains a local absolute path")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    result = bpy.ops.import_scene.gltf(filepath=str(args.glb.resolve()))
    expect("FINISHED" in result, f"GLB import failed: {result}")
    imported_names = {obj.name for obj in bpy.context.scene.objects}
    expect(expected_nodes <= imported_names, f"Reimported GLB missing nodes: {sorted(expected_nodes - imported_names)}")
    imported_triangles = triangle_count()
    glb_bytes = args.glb.stat().st_size
    limits = manifest["performance"]
    expect(imported_triangles <= limits["maxTriangles"], f"Triangle limit exceeded: {imported_triangles}")
    expect(glb_bytes <= limits["maxGlbBytes"], f"GLB size limit exceeded: {glb_bytes}")
    expect(imported_triangles == limits["triangleCount"], "Manifest triangle count differs from reimported GLB")
    expect(glb_bytes == limits["glbBytes"], "Manifest GLB byte count differs from actual file")

    report = {
        "blend": str(args.blend.resolve()),
        "glb": str(args.glb.resolve()),
        "manifest": str(args.manifest.resolve()),
        "blenderVersion": bpy.app.version_string,
        "glbBytes": glb_bytes,
        "triangleCount": imported_triangles,
        "keyNodeCount": len(expected_nodes),
        "viewCount": len(REQUIRED_VIEWS),
        "visualStateCount": len(REQUIRED_STATES),
        "evidenceAnchorCount": len(REQUIRED_ANCHORS),
        "externalTextureCount": len(external_images),
        "passed": not errors,
        "errors": errors,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if errors:
        raise RuntimeError("Bathroom visual validation failed: " + "; ".join(errors))
    print(
        "BATHROOM_SCENE_VALID",
        f"blender={bpy.app.version_string}",
        f"glbBytes={glb_bytes}",
        f"triangles={imported_triangles}",
        f"keyNodes={len(expected_nodes)}",
    )
    return 0


if __name__ == "__main__":
    try:
        exit_code = main()
    except Exception:
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    raise SystemExit(exit_code)
