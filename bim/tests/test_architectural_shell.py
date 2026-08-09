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
from validate_ifc import (  # noqa: E402
    business_id,
    direct_container,
    geometry_bounds,
    representation_transparencies,
)


def test_architectural_shell_is_queryable_and_storey_scoped(tmp_path: Path) -> None:
    output = tmp_path / "shell.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", output)
    model = ifcopenshell.open(str(output))
    spec = load_spec()
    by_id = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }
    shell = spec["architecturalShell"]

    assert len(model.by_type("IfcSpace")) == 126
    assert len(model.by_type("IfcSlab")) == 20
    assert len(model.by_type("IfcWall")) == 409
    assert len(model.by_type("IfcWindow")) == 144
    assert len(model.by_type("IfcDoor")) == 2
    proxies = model.by_type("IfcBuildingElementProxy")
    assert len(proxies) == 1
    assert business_id(proxies[0]) == "PARTITION-1602-SHOWER-01"

    for number in range(1, spec["building"]["storeyCount"] + 1):
        storey = by_id[f"LVL-{number:02d}"]
        slab_id = shell["floorSlab"]["businessIdPattern"].format(storey=number)
        slab = by_id[slab_id]
        assert slab.is_a("IfcSlab")
        assert slab.PredefinedType == "FLOOR"
        assert direct_container(slab) == storey

        for facade in shell["externalWall"]["facades"]:
            prefix = shell["externalWall"]["businessIdPattern"].format(
                storey=number,
                facade=facade,
                segment="",
            )
            walls = [item for item_id, item in by_id.items() if item_id.startswith(prefix)]
            assert walls
            assert all(item.is_a("IfcWall") for item in walls)
            assert all(direct_container(item) == storey for item in walls)

        for facade in shell["window"]["facades"]:
            for index in range(1, shell["window"]["countPerFacade"] + 1):
                window_id = shell["window"]["businessIdPattern"].format(
                    storey=number,
                    facade=facade,
                    index=index,
                )
                window = by_id[window_id]
                assert window.is_a("IfcWindow")
                assert direct_container(window) == storey
                assert window.OverallWidth == pytest.approx(shell["window"]["width"])
                assert window.OverallHeight == pytest.approx(shell["window"]["height"])

        for segment in spec["typicalResidentialStorey"]["core"]["segments"]:
            for side in shell["coreWalls"]["sidesPerSegment"]:
                wall_id = shell["coreWalls"]["businessIdPattern"].format(
                    storey=number,
                    segment=segment["suffix"],
                    side=side,
                )
                wall = by_id[wall_id]
                assert wall.is_a("IfcWall")
                assert direct_container(wall) == storey
                bounds = geometry_bounds(wall)
                assert all(bounds[index + 3] > bounds[index] for index in range(3))

    entrance = by_id[shell["mainEntrance"]["businessId"]]
    assert entrance.is_a("IfcDoor")
    assert direct_container(entrance) == by_id["LVL-01"]

    roof = by_id[shell["roof"]["businessId"]]
    assert roof.is_a("IfcSlab")
    assert roof.PredefinedType == "ROOF"
    assert direct_container(roof) == by_id["LVL-18"]

    represented_spaces = [space for space in model.by_type("IfcSpace") if space.Representation]
    assert represented_spaces
    assert all(
        max(representation_transparencies(space), default=0.0) >= 0.7
        for space in represented_spaces
    )
