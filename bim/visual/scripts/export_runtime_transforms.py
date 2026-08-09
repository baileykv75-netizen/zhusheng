"""Export deterministic glTF-space node transforms without modifying the source Blend or GLB."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import tempfile
from pathlib import Path

import bpy


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


def glb_json(path: Path) -> dict:
    payload = path.read_bytes()
    if payload[:4] != b"glTF":
        raise ValueError("Temporary export is not a GLB")
    json_length = struct.unpack_from("<I", payload, 12)[0]
    if payload[16:20] != b"JSON":
        raise ValueError("Temporary GLB has no leading JSON chunk")
    return json.loads(payload[20 : 20 + json_length].rstrip(b"\x00 \t\r\n"))


def main() -> int:
    args = arguments()
    source_blend = Path(bpy.data.filepath).resolve()
    if not source_blend.exists():
        raise FileNotFoundError("Open bathroom-1602.blend before exporting runtime transforms")

    for collection in bpy.data.collections:
        collection.hide_render = False
        collection.hide_viewport = False
    for obj in bpy.data.objects:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.hide_set(False)
        if obj.name.startswith("LAYER-") or obj.name.startswith("STATE-"):
            obj.scale = (1.0, 1.0, 1.0)

    with tempfile.TemporaryDirectory(prefix="zhusheng-runtime-") as temporary:
        glb_path = Path(temporary) / "runtime.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path),
            export_format="GLB",
            use_selection=False,
            export_cameras=True,
            export_lights=True,
            export_extras=True,
            export_apply=True,
            export_yup=True,
            export_materials="EXPORT",
        )
        document = glb_json(glb_path)

    transforms = {}
    for node in document.get("nodes", []):
        name = node.get("name")
        if not name:
            continue
        transforms[name] = {
            "translation": node.get("translation", [0.0, 0.0, 0.0]),
            "rotation": node.get("rotation", [0.0, 0.0, 0.0, 1.0]),
            "scale": node.get("scale", [1.0, 1.0, 1.0]),
        }

    required = ["PIPE-1602-CW-01", "J-1602-CW-03", "VALVE-1602-CW-01", "MESH-VALVE-1602-CW-01-HANDLE"]
    missing = [name for name in required if name not in transforms]
    if missing:
        raise ValueError(f"Runtime transform export is missing nodes: {missing}")
    for name in required:
        if transforms[name]["scale"] == [0.0, 0.0, 0.0]:
            raise ValueError(f"Runtime transform remained hidden: {name}")

    result = {
        "schemaVersion": 1,
        "sceneId": "SCENE-1602-BATHROOM",
        "syntheticDemo": True,
        "sourceBlend": source_blend.name,
        "sourceBlendSha256": hashlib.sha256(source_blend.read_bytes()).hexdigest(),
        "coordinateSystem": "glTF_y_up",
        "transforms": dict(sorted(transforms.items())),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"RUNTIME_TRANSFORMS_EXPORTED nodes={len(transforms)} output={args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
