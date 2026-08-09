from __future__ import annotations

import json
import sys
from pathlib import Path

import ifcopenshell


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file  # noqa: E402
from generate_memory_seed import generate_memory_seed_file  # noqa: E402
from validate_ifc import business_id  # noqa: E402


def test_memory_seed_matches_ifc_and_is_deterministic(tmp_path: Path) -> None:
    ifc_path = tmp_path / "memory.ifc"
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    generate_ifc_file(BIM_ROOT / "building-spec.json", ifc_path)
    generate_memory_seed_file(ifc_path, BIM_ROOT / "building-spec.json", first)
    generate_memory_seed_file(ifc_path, BIM_ROOT / "building-spec.json", second)
    assert first.read_bytes() == second.read_bytes()

    model = ifcopenshell.open(str(ifc_path))
    roots = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }
    memory = json.loads(first.read_text(encoding="utf-8"))
    assert len(memory["spaces"]) == 126
    assert len(memory["components"]) == 13
    assert len(memory["systems"]) == 3
    assert len(memory["connections"]) == 4
    assert len(memory["identityIndex"]) == 750
    for collection in ("spaces", "components", "systems"):
        for item in memory[collection]:
            assert item["ifcGlobalId"] == roots[item["businessId"]].GlobalId
    connection_ids = {item.Name: item.GlobalId for item in model.by_type("IfcRelConnectsPorts")}
    for item in memory["connections"]:
        assert item["ifcGlobalId"] == connection_ids[item["businessId"]]

    fitting = next(item for item in memory["components"] if item["businessId"] == "J-1602-CW-03")
    assert fitting["spaceId"] == "SPACE-1602-BATHROOM"
    assert fitting["unitId"] == "UNIT-1602"
    assert fitting["storeyId"] == "LVL-16"
    assert fitting["buildingId"] == "BLD-ZS-DEMO-001"
