from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file, load_spec  # noqa: E402
from validate_ifc import business_id, port_owner  # noqa: E402


def test_distribution_systems_and_directed_port_chain(tmp_path: Path) -> None:
    output = tmp_path / "topology.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", output)
    model = ifcopenshell.open(str(output))
    spec = load_spec()
    detail = spec["bathroomDetail"]
    by_id = {
        business_id(item): item
        for item in model.by_type("IfcRoot")
        if business_id(item)
    }

    assert len(model.by_type("IfcDistributionSystem")) == 3
    assert len(model.by_type("IfcDistributionPort")) == 12
    assert len(model.by_type("IfcRelConnectsPorts")) == 4

    for system_spec in detail["systems"]:
        system = by_id[system_spec["businessId"]]
        members = sorted(
            business_id(item)
            for relation in system.IsGroupedBy
            for item in relation.RelatedObjects
        )
        assert members == sorted(system_spec["members"])

    graph_upstream: dict[str, list[str]] = defaultdict(list)
    for connection_spec in detail["connections"]:
        relation = next(
            item
            for item in model.by_type("IfcRelConnectsPorts")
            if item.Name == connection_spec["businessId"]
        )
        assert business_id(relation.RelatingPort) == connection_spec["fromPortId"]
        assert business_id(relation.RelatedPort) == connection_spec["toPortId"]
        assert business_id(port_owner(relation.RelatingPort)) == connection_spec["fromComponentId"]
        assert business_id(port_owner(relation.RelatedPort)) == connection_spec["toComponentId"]
        graph_upstream[connection_spec["toComponentId"]].append(connection_spec["fromComponentId"])

    expected_ports = {
        port["businessId"]: port
        for component in detail["components"]
        for port in component["ports"]
    }
    for port_id, port_spec in expected_ports.items():
        port = by_id[port_id]
        count = len(port.ConnectedFrom) + len(port.ConnectedTo)
        assert count == (0 if port_spec["boundary"] else 1)

    queue = list(graph_upstream["J-1602-CW-03"])
    visited: set[str] = set()
    valves: list[str] = []
    while queue:
        item_id = queue.pop(0)
        if item_id in visited:
            continue
        visited.add(item_id)
        if by_id[item_id].is_a("IfcValve"):
            valves.append(item_id)
        else:
            queue.extend(graph_upstream[item_id])
    assert valves == ["VALVE-1602-CW-01"]

