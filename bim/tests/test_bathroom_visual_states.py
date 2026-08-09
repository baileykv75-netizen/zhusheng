from __future__ import annotations

import json
import re
import struct
from pathlib import Path


BIM_ROOT = Path(__file__).resolve().parents[1]
VISUAL_ROOT = BIM_ROOT / "visual"


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    return json.loads(data[20 : 20 + chunk_length].decode("utf-8").rstrip(" \t\r\n\x00"))


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", data[16:24])


def test_visual_views_states_anchors_and_performance() -> None:
    manifest = json.loads((VISUAL_ROOT / "bathroom-1602.manifest.json").read_text(encoding="utf-8"))
    assert set(manifest["views"]) == {
        "VIEW_RESIDENT",
        "VIEW_DIAGNOSTIC",
        "VIEW_CONSTRUCTION_MEMORY",
        "VIEW_MAINTENANCE",
    }
    visual_states = manifest["visualStates"]
    assert set(visual_states["states"]) == {
        "DRY",
        "DAMP_LIGHT",
        "DAMP_MODERATE",
        "DAMP_SEVERE",
        "REPAIR_OPEN",
        "REPAIRED",
    }
    assert visual_states["defaultState"] == "DRY"
    assert visual_states["containsDiagnosticConclusion"] is False
    assert visual_states["valvePosition"]["default"] == "OPEN"
    assert visual_states["valvePosition"]["authorizationRequired"] is True
    assert visual_states["valvePosition"]["doesNotGrantAuthorization"] is True
    assert len(manifest["evidenceAnchors"]) == 6
    assert all(
        anchor["evidenceContentCreated"] is False
        for anchor in manifest["evidenceAnchors"].values()
    )

    glb = VISUAL_ROOT / "bathroom-1602.glb"
    assert glb.stat().st_size <= manifest["performance"]["maxGlbBytes"]
    assert manifest["performance"]["triangleCount"] <= manifest["performance"]["maxTriangles"]
    glb_json = read_glb_json(glb)
    assert not glb_json.get("images")
    assert not re.search(
        r"(?:[A-Za-z]:\\\\|file://|/Users/|/home/)",
        json.dumps(glb_json, ensure_ascii=False),
    )

    expected_screenshots = (
        "01-resident-overview.png",
        "02-diagnostic-cutaway.png",
        "03-joint-valve-closeup.png",
        "04-construction-memory.png",
    )
    for filename in expected_screenshots:
        screenshot = VISUAL_ROOT / "screenshots" / filename
        assert screenshot.exists()
        width, height = png_size(screenshot)
        assert width >= 1600 and height >= 900

