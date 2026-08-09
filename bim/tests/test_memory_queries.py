from __future__ import annotations

import sys
from pathlib import Path

import pytest


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file  # noqa: E402
from generate_memory_seed import generate_memory_seed_file  # noqa: E402
from query_building_memory import load_memory, run_query  # noqa: E402


def test_queries_traverse_memory_without_component_special_cases(tmp_path: Path) -> None:
    ifc_path = tmp_path / "query.ifc"
    memory_path = tmp_path / "memory.json"
    generate_ifc_file(BIM_ROOT / "building-spec.json", ifc_path)
    generate_memory_seed_file(ifc_path, BIM_ROOT / "building-spec.json", memory_path)
    memory = load_memory(memory_path)

    component = run_query(memory, "component", "J-1602-CW-03")
    assert component["upstreamIds"] == ["PIPE-1602-CW-01"]
    assert component["downstreamIds"] == ["PIPE-1602-CW-02"]
    assert component["isolationValveIds"] == ["VALVE-1602-CW-01"]
    assert component["relatedMeterIds"] == ["METER-1602-FLOW-01"]
    assert component["relatedSensorIds"] == ["SENSOR-1602-HUM-01"]
    assert component["isolationRequiresHumanAuthorization"] is True

    valve = run_query(memory, "upstream-valve", "J-1602-CW-03")
    assert valve["upstreamValveIds"] == ["VALVE-1602-CW-01"]
    assert valve["valves"][0]["humanAuthorizationRequired"] is True

    trace = run_query(memory, "trace-space", "J-1602-CW-03")
    assert trace == {
        "componentId": "J-1602-CW-03",
        "spaceId": "SPACE-1602-BATHROOM",
        "unitId": "UNIT-1602",
        "storeyId": "LVL-16",
        "buildingId": "BLD-ZS-DEMO-001",
    }
    evidence = run_query(memory, "related-evidence", "J-1602-CW-03")
    assert "joint_dual_angle_photo" in evidence["evidenceTypes"]

    with pytest.raises(KeyError):
        run_query(memory, "component", "MISSING-COMPONENT")

    source = (SCRIPTS / "query_building_memory.py").read_text(encoding="utf-8")
    assert "J-1602-CW-03" not in source
    assert "VALVE-1602-CW-01" not in source
