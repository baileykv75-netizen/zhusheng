from __future__ import annotations

import json
import sys
from pathlib import Path

import ifcopenshell


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from validate_ifc import business_id  # noqa: E402


def test_visual_manifest_uses_actual_ifc_identities() -> None:
    manifest_path = BIM_ROOT / "visual" / "bathroom-1602.manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    model = ifcopenshell.open(str(BIM_ROOT / "output" / "ZS-DEMO-001.ifc"))
    identities = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }

    assert manifest["sceneId"] == "SCENE-1602-BATHROOM"
    assert manifest["sourceBuildingId"] == "BLD-ZS-DEMO-001"
    assert manifest["sourceStoreyId"] == "LVL-16"
    assert manifest["sourceUnitId"] == "UNIT-1602"
    assert manifest["sourceSpaceId"] == "SPACE-1602-BATHROOM"
    assert manifest["ifcSchema"] == "IFC4"
    assert manifest["syntheticDemo"] is True

    semantic_nodes = [item for item in manifest["nodes"].values() if not item["visualOnly"]]
    assert semantic_nodes
    for node in semantic_nodes:
        entity = identities[node["businessId"]]
        assert node["nodeName"] == node["businessId"]
        assert node["ifcGlobalId"] == entity.GlobalId
        assert node["ifcClass"] == entity.is_a()

    for fixture_id in (
        "FIXTURE-1602-WC-01",
        "FIXTURE-1602-BASIN-01",
        "FIXTURE-1602-SHOWER-01",
        "DRAIN-1602-FLOOR-01",
        "PARTITION-1602-SHOWER-01",
    ):
        assert fixture_id in manifest["nodes"]
        assert manifest["nodes"][fixture_id]["interactive"] is True
        assert manifest["nodes"][fixture_id]["visualOnly"] is False

    for visual_id in ("VIS-MIRROR-CABINET-01", "VIS-CEILING-LIGHT-01"):
        assert manifest["nodes"][visual_id]["visualOnly"] is True
        assert manifest["nodes"][visual_id]["interactive"] is False

