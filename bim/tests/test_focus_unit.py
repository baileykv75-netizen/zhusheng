from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell
import pytest


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file, load_spec  # noqa: E402
from validate_ifc import ancestor_chain, business_id, geometry_bounds  # noqa: E402


def test_focus_unit_rooms_and_bathroom_elements(tmp_path: Path) -> None:
    output = tmp_path / "focus.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", output)
    model = ifcopenshell.open(str(output))
    spec = load_spec()
    by_id = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }

    unit = by_id["UNIT-1602"]
    bathroom = by_id["SPACE-1602-BATHROOM"]
    assert by_id["LVL-16"] in ancestor_chain(bathroom)
    assert unit in ancestor_chain(bathroom)

    origin = spec["focusUnit"]["globalOrigin"]
    for room_spec in spec["focusUnit"]["spaces"]:
        room = by_id[room_spec["businessId"]]
        bounds = geometry_bounds(room)
        local = room_spec["localOrigin"]
        size = room_spec["size"]
        expected = (
            origin["x"] + local["x"],
            origin["y"] + local["y"],
            origin["z"],
            origin["x"] + local["x"] + size["widthX"],
            origin["y"] + local["y"] + size["depthY"],
            origin["z"] + size["clearHeight"],
        )
        assert bounds == pytest.approx(expected, abs=1e-6)

    for element_id in (
        "WALL-1602-BATHROOM-WEST",
        "WALL-1602-BATHROOM-EAST",
        "WALL-1602-BATHROOM-NORTH",
        "WALL-1602-BATHROOM-SOUTH-WEST",
        "WALL-1602-BATHROOM-SOUTH-EAST",
        "SLAB-1602-BATHROOM",
        "DOOR-1602-BATHROOM",
    ):
        element = by_id[element_id]
        bounds = geometry_bounds(element)
        assert all(bounds[index + 3] > bounds[index] for index in range(3))
        assert any(
            relation.RelatingStructure == bathroom
            for relation in element.ContainedInStructure
        )

    door = by_id["DOOR-1602-BATHROOM"]
    construction = spec["construction"]
    assert door.OverallWidth == pytest.approx(construction["bathroomDoorWidth"])
    assert door.OverallHeight == pytest.approx(construction["defaultDoorHeight"])

