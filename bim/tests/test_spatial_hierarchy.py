from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file, load_spec  # noqa: E402
from validate_ifc import business_id, descendants, parent_aggregate, validate_ifc_file  # noqa: E402


def test_spatial_hierarchy_and_no_overlap(tmp_path: Path) -> None:
    output = tmp_path / "spatial.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", output)
    assert validate_ifc_file(output, BIM_ROOT / "building-spec.json") == []

    model = ifcopenshell.open(str(output))
    spec = load_spec()
    storeys = model.by_type("IfcBuildingStorey")
    assert len(storeys) == 18
    by_id = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }
    for number in range(1, 19):
        storey = by_id[f"LVL-{number:02d}"]
        assert storey.Elevation == (number - 1) * spec["building"]["storeyHeight"]
        direct_spaces = [
            item
            for item in descendants(storey)
            if item.is_a("IfcSpace") and parent_aggregate(item) == storey
        ]
        assert len(direct_spaces) == (1 if number == 1 else 7)

