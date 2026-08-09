from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import ifcopenshell


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from validate_ifc import business_id  # noqa: E402


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF"
    assert version == 2
    assert total_length == len(data)
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    return json.loads(data[20 : 20 + chunk_length].decode("utf-8").rstrip(" \t\r\n\x00"))


def test_phase2_identity_baseline_and_glb_nodes_are_stable() -> None:
    visual_root = BIM_ROOT / "visual"
    baseline = json.loads(
        (visual_root / "phase2-identity-baseline.json").read_text(encoding="utf-8")
    )
    assert baseline["identityCount"] == 745

    model = ifcopenshell.open(str(BIM_ROOT / "output" / "ZS-DEMO-001.ifc"))
    current = {
        business_id(item): item.GlobalId
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }
    assert len(current) == 750
    assert all(current[item_id] == global_id for item_id, global_id in baseline["identities"].items())
    assert set(current) - set(baseline["identities"]) == {
        "FIXTURE-1602-WC-01",
        "FIXTURE-1602-BASIN-01",
        "FIXTURE-1602-SHOWER-01",
        "DRAIN-1602-FLOOR-01",
        "PARTITION-1602-SHOWER-01",
    }

    blend = visual_root / "bathroom-1602.blend"
    glb = visual_root / "bathroom-1602.glb"
    manifest = json.loads((visual_root / "bathroom-1602.manifest.json").read_text(encoding="utf-8"))
    assert blend.exists() and blend.stat().st_size > 0
    assert glb.exists() and glb.stat().st_size > 0
    glb_json = read_glb_json(glb)
    names = [node.get("name") for node in glb_json["nodes"] if node.get("name")]
    for node in manifest["nodes"].values():
        assert names.count(node["nodeName"]) == 1
    assert not any(name.startswith(("Cube.", "Cylinder.", "Object.")) for name in names)

