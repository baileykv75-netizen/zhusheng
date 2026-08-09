from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file, load_spec  # noqa: E402
from validate_ifc import business_id, direct_container, geometry_bounds  # noqa: E402


def test_bathroom_components_have_geometry_memory_and_space(tmp_path: Path) -> None:
    output = tmp_path / "bathroom-system.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", output)
    model = ifcopenshell.open(str(output))
    spec = load_spec()
    detail = spec["bathroomDetail"]
    by_id = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }
    bathroom = by_id[detail["businessId"]]

    assert len(model.by_type("IfcCovering")) == 1
    assert len(model.by_type("IfcPipeSegment")) == 3
    assert len(model.by_type("IfcPipeFitting")) == 1
    assert len(model.by_type("IfcValve")) == 1
    assert len(model.by_type("IfcFlowMeter")) == 1
    assert len(model.by_type("IfcSensor")) == 1
    assert len(model.by_type("IfcSanitaryTerminal")) == 3
    assert len(model.by_type("IfcWasteTerminal")) == 1
    assert len(model.by_type("IfcBuildingElementProxy")) == 1

    for item_spec in [
        detail["waterproofing"],
        *detail["components"],
        *detail["fixtures"],
    ]:
        entity = by_id[item_spec["businessId"]]
        assert entity.is_a(item_spec["ifcClass"])
        assert direct_container(entity) == bathroom
        bounds = geometry_bounds(entity)
        assert all(bounds[index + 3] > bounds[index] for index in range(3))
        memory = ifcopenshell.util.element.get_pset(entity, "Pset_ZhushengMemory")
        assert memory["MemoryStatus"] == item_spec["lifecycleStatus"]
        assert memory["EvidenceCount"] == 0
        assert not memory.get("RelatedEventId")

    waterproof = by_id[detail["waterproofing"]["businessId"]]
    pset = ifcopenshell.util.element.get_pset(waterproof, "Pset_ZhushengWaterproofing")
    assert pset["EngineeringThickness"] == detail["waterproofing"]["engineeringThickness"]
    assert pset["DisplayThickness"] == detail["waterproofing"]["displayThickness"]
    assert pset["WallUpturnHeight"] == detail["waterproofing"]["wallUpturnHeight"]

    valve = by_id["VALVE-1602-CW-01"]
    safety = ifcopenshell.util.element.get_pset(valve, "Pset_ZhushengSafety")
    assert safety["HumanAuthorizationRequired"] is True
    assert safety["AuthorizationState"] == "NOT_REQUESTED"
    assert spec["phase2"]["includeSensorTimeSeries"] is False
    assert spec["phase2"]["includeLeakDiagnosis"] is False
