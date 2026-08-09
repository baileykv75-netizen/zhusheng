from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.util.element

from generate_ifc import DEFAULT_OUTPUT, DEFAULT_SPEC, IDENTITY_PSET, load_spec
from validate_ifc import ancestor_chain, business_id, direct_container, parent_aggregate


BIM_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEMORY_OUTPUT = BIM_ROOT / "data" / "building-memory.seed.json"


def port_owner(port: ifcopenshell.entity_instance) -> ifcopenshell.entity_instance:
    owners = [relation.RelatingObject for relation in port.Nests]
    if len(owners) != 1:
        raise ValueError(f"Port #{port.id()} must have exactly one owner, got {len(owners)}")
    return owners[0]


def assigned_system_id(entity: ifcopenshell.entity_instance) -> str | None:
    systems = [
        relation.RelatingGroup
        for relation in entity.HasAssignments
        if relation.is_a("IfcRelAssignsToGroup")
        and relation.RelatingGroup.is_a("IfcDistributionSystem")
    ]
    if not systems:
        return None
    if len(systems) != 1:
        raise ValueError(f"{business_id(entity)} belongs to multiple distribution systems")
    return business_id(systems[0])


def spatial_trace(entity: ifcopenshell.entity_instance) -> dict[str, str | None]:
    space = direct_container(entity)
    if space is None or not space.is_a("IfcSpace"):
        raise ValueError(f"{business_id(entity)} is not contained in an IfcSpace")
    chain = [space, *ancestor_chain(space)]

    def first_id(ifc_class: str) -> str | None:
        return next((business_id(item) for item in chain if item.is_a(ifc_class)), None)

    unit_id = next(
        (
            business_id(item)
            for item in chain
            if item.is_a("IfcSpace") and (business_id(item) or "").startswith("UNIT-")
        ),
        None,
    )
    return {
        "spaceId": business_id(space),
        "unitId": unit_id,
        "storeyId": first_id("IfcBuildingStorey"),
        "buildingId": first_id("IfcBuilding"),
    }


def connection_records(
    model: ifcopenshell.file,
) -> tuple[list[dict[str, Any]], dict[str, list[str]], dict[str, list[str]]]:
    records: list[dict[str, Any]] = []
    upstream: dict[str, list[str]] = {}
    downstream: dict[str, list[str]] = {}
    for relation in model.by_type("IfcRelConnectsPorts"):
        from_port = relation.RelatingPort
        to_port = relation.RelatedPort
        from_component = port_owner(from_port)
        to_component = port_owner(to_port)
        from_id = business_id(from_component)
        to_id = business_id(to_component)
        from_port_id = business_id(from_port)
        to_port_id = business_id(to_port)
        if not all((from_id, to_id, from_port_id, to_port_id, relation.Name)):
            raise ValueError(f"Incomplete structured port connection #{relation.id()}")
        downstream.setdefault(from_id, []).append(to_id)
        upstream.setdefault(to_id, []).append(from_id)
        records.append(
            {
                "businessId": relation.Name,
                "ifcGlobalId": relation.GlobalId,
                "fromComponentId": from_id,
                "fromPortId": from_port_id,
                "toComponentId": to_id,
                "toPortId": to_port_id,
                "flowDirection": "SOURCE",
            }
        )
    return (
        sorted(records, key=lambda item: item["businessId"]),
        {key: sorted(values) for key, values in upstream.items()},
        {key: sorted(values) for key, values in downstream.items()},
    )


def build_memory_seed(model: ifcopenshell.file, spec: dict[str, Any]) -> dict[str, Any]:
    roots_by_id = {
        business_id(entity): entity
        for entity in model.by_type("IfcRoot")
        if business_id(entity)
    }
    detail = spec["bathroomDetail"]
    connections, upstream, downstream = connection_records(model)
    component_specs = {
        item["businessId"]: item
        for item in [
            detail["waterproofing"],
            *detail["components"],
            *detail["fixtures"],
        ]
    }
    components: list[dict[str, Any]] = []
    for component_id, component_spec in sorted(component_specs.items()):
        entity = roots_by_id[component_id]
        trace = spatial_trace(entity)
        system_id = assigned_system_id(entity)
        components.append(
            {
                "businessId": component_id,
                "ifcGlobalId": entity.GlobalId,
                "ifcClass": entity.is_a(),
                "displayName": entity.Name,
                **trace,
                "systemId": system_id,
                "upstreamIds": upstream.get(component_id, []),
                "downstreamIds": downstream.get(component_id, []),
                "evidenceTypes": component_spec["evidenceTypes"],
                "humanAuthorizationRequired": component_spec["humanAuthorizationRequired"],
                "lifecycleStatus": component_spec["lifecycleStatus"],
                "syntheticDemo": True,
            }
        )

    systems: list[dict[str, Any]] = []
    for system_spec in sorted(detail["systems"], key=lambda item: item["businessId"]):
        system = roots_by_id[system_spec["businessId"]]
        actual_members = sorted(
            business_id(item)
            for relation in system.IsGroupedBy
            for item in relation.RelatedObjects
            if business_id(item)
        )
        systems.append(
            {
                "businessId": system_spec["businessId"],
                "ifcGlobalId": system.GlobalId,
                "ifcClass": system.is_a(),
                "displayName": system.Name,
                "systemType": system_spec["systemType"],
                "memberIds": actual_members,
                "syntheticDemo": True,
            }
        )

    spaces = []
    for space in sorted(model.by_type("IfcSpace"), key=lambda item: business_id(item) or ""):
        item_id = business_id(space)
        spaces.append(
            {
                "businessId": item_id,
                "ifcGlobalId": space.GlobalId,
                "displayName": space.Name,
                "parentId": business_id(parent_aggregate(space)) if parent_aggregate(space) else None,
                "syntheticDemo": True,
            }
        )

    evidence_requirements = [
        {
            "componentId": component["businessId"],
            "evidenceTypes": component["evidenceTypes"],
        }
        for component in components
    ]
    safety_policies = [
        {
            "componentId": item["businessId"],
            "actionClass": item["safety"]["actionClass"],
            "humanAuthorizationRequired": item["humanAuthorizationRequired"],
            "authorizationState": item["safety"]["authorizationState"],
            "fallbackMode": item["safety"]["fallbackMode"],
        }
        for item in detail["components"]
        if item.get("safety")
    ]
    identity_index = {
        item_id: {
            "ifcGlobalId": entity.GlobalId,
            "ifcClass": entity.is_a(),
            "displayName": entity.Name,
        }
        for item_id, entity in sorted(roots_by_id.items())
    }
    return {
        "schemaVersion": spec["meta"]["specVersion"],
        "modelStatus": spec["meta"]["modelStatus"],
        "disclaimer": spec["meta"]["disclaimerZh"],
        "buildingId": spec["building"]["businessId"],
        "spaces": spaces,
        "components": components,
        "systems": systems,
        "connections": connections,
        "evidenceRequirements": evidence_requirements,
        "safetyPolicies": safety_policies,
        "identityIndex": identity_index,
    }


def generate_memory_seed_file(
    ifc_path: Path | str = DEFAULT_OUTPUT,
    spec_path: Path | str = DEFAULT_SPEC,
    output_path: Path | str = DEFAULT_MEMORY_OUTPUT,
) -> Path:
    model = ifcopenshell.open(str(Path(ifc_path).resolve()))
    payload = build_memory_seed(model, load_spec(spec_path))
    output = Path(output_path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    try:
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the Zhusheng building memory seed.")
    parser.add_argument("--ifc", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC)
    parser.add_argument("--output", type=Path, default=DEFAULT_MEMORY_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = generate_memory_seed_file(args.ifc, args.spec, args.output)
    payload = json.loads(output.read_text(encoding="utf-8"))
    print(
        f"Generated {output} | spaces={len(payload['spaces'])} | "
        f"components={len(payload['components'])} | systems={len(payload['systems'])} | "
        f"connections={len(payload['connections'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
