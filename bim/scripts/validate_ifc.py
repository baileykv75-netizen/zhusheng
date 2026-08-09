from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.guid
import ifcopenshell.util.element

from generate_ifc import DEFAULT_OUTPUT, DEFAULT_SPEC, IDENTITY_PSET, load_spec


PHASE1_1_COUNTS = {
    "IfcBuildingStorey": 18,
    "IfcSpace": 126,
    "IfcSlab": 20,
    "IfcWall": 409,
    "IfcWindow": 144,
    "IfcDoor": 2,
}

PHASE2_COUNTS = {
    "IfcCovering": 1,
    "IfcPipeSegment": 3,
    "IfcPipeFitting": 1,
    "IfcValve": 1,
    "IfcFlowMeter": 1,
    "IfcSensor": 1,
    "IfcDistributionSystem": 3,
    "IfcDistributionPort": 12,
    "IfcRelConnectsPorts": 4,
}

PHASE2_5_COUNTS = {
    "IfcSanitaryTerminal": 3,
    "IfcWasteTerminal": 1,
    "IfcBuildingElementProxy": 1,
}


def identity(entity: ifcopenshell.entity_instance) -> dict[str, Any]:
    return ifcopenshell.util.element.get_pset(entity, IDENTITY_PSET) or {}


def business_id(entity: ifcopenshell.entity_instance) -> str | None:
    return identity(entity).get("BusinessId")


def parent_aggregate(entity: ifcopenshell.entity_instance) -> ifcopenshell.entity_instance | None:
    for relation in getattr(entity, "Decomposes", ()):
        if relation.is_a("IfcRelAggregates"):
            return relation.RelatingObject
    return None


def descendants(entity: ifcopenshell.entity_instance) -> list[ifcopenshell.entity_instance]:
    result: list[ifcopenshell.entity_instance] = []
    for relation in getattr(entity, "IsDecomposedBy", ()):
        if not relation.is_a("IfcRelAggregates"):
            continue
        for child in relation.RelatedObjects:
            result.append(child)
            result.extend(descendants(child))
    return result


def ancestor_chain(entity: ifcopenshell.entity_instance) -> list[ifcopenshell.entity_instance]:
    chain: list[ifcopenshell.entity_instance] = []
    current = entity
    seen: set[int] = set()
    while current is not None and current.id() not in seen:
        seen.add(current.id())
        current = parent_aggregate(current)
        if current is not None:
            chain.append(current)
    return chain


def geometry_bounds(entity: ifcopenshell.entity_instance) -> tuple[float, float, float, float, float, float]:
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    shape = ifcopenshell.geom.create_shape(settings, entity)
    vertices = list(shape.geometry.verts)
    if len(vertices) < 3:
        raise ValueError("geometry contains no vertices")
    xs = vertices[0::3]
    ys = vertices[1::3]
    zs = vertices[2::3]
    return min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)


def _positive_overlap(
    first: tuple[float, float, float, float, float, float],
    second: tuple[float, float, float, float, float, float],
    tolerance: float = 1e-6,
) -> bool:
    return all(
        min(first[index + 3], second[index + 3])
        - max(first[index], second[index])
        > tolerance
        for index in range(3)
    )


def collect_identity_map(model: ifcopenshell.file) -> dict[str, str]:
    result: dict[str, str] = {}
    for entity in model.by_type("IfcRoot"):
        item_id = business_id(entity)
        if item_id:
            if item_id in result:
                raise ValueError(f"Duplicate BusinessId: {item_id}")
            result[item_id] = entity.GlobalId
    return result


def direct_container(
    entity: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    for relation in getattr(entity, "ContainedInStructure", ()):
        return relation.RelatingStructure
    return None


def port_owner(
    port: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    owners = [relation.RelatingObject for relation in getattr(port, "Nests", ())]
    return owners[0] if len(owners) == 1 else None


def expected_space_business_ids(spec: dict[str, Any]) -> set[str]:
    expected = {
        item["businessId"]
        for item in spec["storeys"]["firstStorey"]["spaces"]
    }
    typical = spec["typicalResidentialStorey"]
    for number in range(
        spec["storeys"]["residentialFrom"],
        spec["storeys"]["residentialTo"] + 1,
    ):
        expected.update(
            f"UNIT-{number:02d}{apartment['suffix']}"
            for apartment in typical["apartments"]
        )
        expected.add(typical["corridor"]["businessIdPattern"].format(storey=number))
        core_base = typical["core"]["businessIdPattern"].format(storey=number)
        expected.update(
            f"{core_base}-{segment['suffix']}"
            for segment in typical["core"]["segments"]
        )
    expected.update(room["businessId"] for room in spec["focusUnit"]["spaces"])
    return expected


def representation_transparencies(
    entity: ifcopenshell.entity_instance,
) -> list[float]:
    values: list[float] = []
    product_representation = getattr(entity, "Representation", None)
    if product_representation is None:
        return values
    for representation in product_representation.Representations:
        for item in representation.Items:
            for styled_item in getattr(item, "StyledByItem", ()):
                for surface_style in styled_item.Styles:
                    for presentation_item in getattr(surface_style, "Styles", ()):
                        transparency = getattr(presentation_item, "Transparency", None)
                        if transparency is not None:
                            values.append(float(transparency))
    return values


def validate_model(model: ifcopenshell.file, spec: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def expect(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    expect(model.schema == "IFC4", f"Schema must be IFC4, got {model.schema}")
    for ifc_class, expected in (("IfcProject", 1), ("IfcSite", 1), ("IfcBuilding", 1)):
        actual = len(model.by_type(ifc_class))
        expect(actual == expected, f"{ifc_class}: expected {expected}, got {actual}")
    for ifc_class, expected in {
        **PHASE1_1_COUNTS,
        **PHASE2_COUNTS,
        **PHASE2_5_COUNTS,
    }.items():
        actual = len(model.by_type(ifc_class))
        expect(actual == expected, f"{ifc_class}: expected {expected}, got {actual}")

    storeys = model.by_type("IfcBuildingStorey")
    expect(
        len(storeys) == spec["building"]["storeyCount"],
        f"IfcBuildingStorey: expected {spec['building']['storeyCount']}, got {len(storeys)}",
    )
    ids_to_entities: dict[str, ifcopenshell.entity_instance] = {}
    duplicate_ids: list[str] = []
    global_ids: dict[str, list[str]] = defaultdict(list)
    for entity in model.by_type("IfcRoot"):
        item_id = business_id(entity)
        if not item_id:
            continue
        if item_id in ids_to_entities:
            duplicate_ids.append(item_id)
        ids_to_entities[item_id] = entity
        global_ids[entity.GlobalId].append(item_id)
        expect(len(entity.GlobalId) == 22, f"{item_id}: invalid IFC GlobalId length")
        try:
            expect(
                ifcopenshell.guid.compress(ifcopenshell.guid.expand(entity.GlobalId)) == entity.GlobalId,
                f"{item_id}: GlobalId does not round-trip",
            )
        except Exception as exc:
            errors.append(f"{item_id}: invalid GlobalId ({exc})")
    expect(not duplicate_ids, f"Duplicate BusinessId values: {sorted(set(duplicate_ids))}")
    duplicate_guids = [items for items in global_ids.values() if len(items) > 1]
    expect(not duplicate_guids, f"Duplicate GlobalIds: {duplicate_guids}")

    length_units = [
        unit
        for unit in model.by_type("IfcSIUnit")
        if unit.UnitType == "LENGTHUNIT"
    ]
    expect(
        len(length_units) == 1
        and length_units[0].Name == "METRE"
        and length_units[0].Prefix is None,
        "Project length unit must be unprefixed METRE",
    )

    for number in range(1, spec["building"]["storeyCount"] + 1):
        storey_id = f"LVL-{number:02d}"
        storey = ids_to_entities.get(storey_id)
        expect(storey is not None, f"Missing storey {storey_id}")
        if storey is None:
            continue
        expected_elevation = (number - 1) * spec["building"]["storeyHeight"]
        expect(
            abs(float(storey.Elevation) - expected_elevation) < 1e-9,
            f"{storey_id}: expected elevation {expected_elevation}, got {storey.Elevation}",
        )
        direct_spaces = [item for item in descendants(storey) if item.is_a("IfcSpace") and parent_aggregate(item) == storey]
        expected_direct = 1 if number == 1 else 7
        expect(
            len(direct_spaces) == expected_direct,
            f"{storey_id}: expected {expected_direct} direct spaces, got {len(direct_spaces)}",
        )

    focus_ids = [spec["focusUnit"]["businessId"]] + [
        room["businessId"] for room in spec["focusUnit"]["spaces"]
    ]
    for focus_id in focus_ids:
        expect(focus_id in ids_to_entities, f"Missing focus object {focus_id}")

    bathroom = ids_to_entities.get(spec["bathroomDetail"]["businessId"])
    unit = ids_to_entities.get(spec["focusUnit"]["businessId"])
    storey16 = ids_to_entities.get("LVL-16")
    if bathroom and unit and storey16:
        chain = ancestor_chain(bathroom)
        expect(unit in chain, "1602 bathroom is not aggregated under UNIT-1602")
        expect(storey16 in chain, "1602 bathroom is not indirectly aggregated under LVL-16")
        expect(parent_aggregate(unit) == storey16, "UNIT-1602 is not directly aggregated under LVL-16")

    all_spaces = model.by_type("IfcSpace")
    expected_space_ids = expected_space_business_ids(spec)
    actual_space_ids = {business_id(space) for space in all_spaces}
    expect(
        len(all_spaces) == len(expected_space_ids) == 126,
        f"IfcSpace: expected 126, got {len(all_spaces)}",
    )
    expect(
        actual_space_ids == expected_space_ids,
        "IfcSpace BusinessId set changed; "
        f"missing={sorted(expected_space_ids - actual_space_ids)}, "
        f"unexpected={sorted(actual_space_ids - expected_space_ids)}",
    )
    project = model.by_type("IfcProject")[0] if model.by_type("IfcProject") else None
    for space in all_spaces:
        item_id = business_id(space) or f"#{space.id()}"
        expect(project in ancestor_chain(space), f"{item_id}: space does not trace to IfcProject")
        if space.Representation:
            transparencies = representation_transparencies(space)
            expect(
                transparencies and max(transparencies) >= 0.7,
                f"{item_id}: represented space must use a highly transparent style",
            )

    grouped_spaces: dict[int, list[ifcopenshell.entity_instance]] = defaultdict(list)
    for space in all_spaces:
        parent = parent_aggregate(space)
        if parent is not None and space.Representation:
            grouped_spaces[parent.id()].append(space)
    for siblings in grouped_spaces.values():
        bounds = [(space, geometry_bounds(space)) for space in siblings]
        for index, (first, first_bounds) in enumerate(bounds):
            for second, second_bounds in bounds[index + 1 :]:
                if _positive_overlap(first_bounds, second_bounds):
                    errors.append(
                        f"Space overlap: {business_id(first)} intersects {business_id(second)}"
                    )

    def check_geometry_and_container(
        element_id: str,
        ifc_class: str,
        container: ifcopenshell.entity_instance,
    ) -> ifcopenshell.entity_instance | None:
        element = ids_to_entities.get(element_id)
        expect(element is not None, f"Missing shell element {element_id}")
        if element is None:
            return None
        expect(element.is_a(ifc_class), f"{element_id}: expected {ifc_class}, got {element.is_a()}")
        expect(element.Representation is not None, f"{element_id}: missing geometry representation")
        expect(
            direct_container(element) == container,
            f"{element_id}: expected container {business_id(container)}, "
            f"got {business_id(direct_container(element)) if direct_container(element) else None}",
        )
        try:
            bounds = geometry_bounds(element)
            expect(
                all(bounds[index + 3] - bounds[index] > 0 for index in range(3)),
                f"{element_id}: degenerate geometry",
            )
        except Exception as exc:
            errors.append(f"{element_id}: geometry could not be created ({exc})")
        return element

    shell_spec = spec["architecturalShell"]
    slab_spec = shell_spec["floorSlab"]
    wall_spec = shell_spec["externalWall"]
    window_spec = shell_spec["window"]
    core_wall_spec = shell_spec["coreWalls"]
    for number in range(1, spec["building"]["storeyCount"] + 1):
        storey_id = f"LVL-{number:02d}"
        storey = ids_to_entities.get(storey_id)
        if storey is None:
            continue
        slab_id = slab_spec["businessIdPattern"].format(storey=number)
        check_geometry_and_container(slab_id, "IfcSlab", storey)

        for facade in wall_spec["facades"]:
            prefix = wall_spec["businessIdPattern"].format(
                storey=number,
                facade=facade,
                segment="",
            )
            facade_walls = [
                entity
                for item_id, entity in ids_to_entities.items()
                if item_id.startswith(prefix)
            ]
            expect(facade_walls, f"LVL-{number:02d}: missing {facade} external wall")
            for wall in facade_walls:
                check_geometry_and_container(business_id(wall), "IfcWall", storey)

        for facade in window_spec["facades"]:
            for index in range(1, window_spec["countPerFacade"] + 1):
                window_id = window_spec["businessIdPattern"].format(
                    storey=number,
                    facade=facade,
                    index=index,
                )
                window = check_geometry_and_container(window_id, "IfcWindow", storey)
                if window is not None:
                    expect(
                        abs(float(window.OverallWidth) - window_spec["width"]) < 1e-9,
                        f"{window_id}: incorrect OverallWidth",
                    )
                    expect(
                        abs(float(window.OverallHeight) - window_spec["height"]) < 1e-9,
                        f"{window_id}: incorrect OverallHeight",
                    )

        for segment in spec["typicalResidentialStorey"]["core"]["segments"]:
            for side in core_wall_spec["sidesPerSegment"]:
                core_wall_id = core_wall_spec["businessIdPattern"].format(
                    storey=number,
                    segment=segment["suffix"],
                    side=side,
                )
                check_geometry_and_container(core_wall_id, "IfcWall", storey)

    level_one = ids_to_entities.get("LVL-01")
    entrance_spec = shell_spec["mainEntrance"]
    entrance = (
        check_geometry_and_container(
            entrance_spec["businessId"],
            "IfcDoor",
            level_one,
        )
        if level_one is not None
        else None
    )
    if entrance is not None:
        expect(
            abs(float(entrance.OverallWidth) - entrance_spec["width"]) < 1e-9,
            f"{entrance_spec['businessId']}: incorrect OverallWidth",
        )
        expect(
            abs(float(entrance.OverallHeight) - entrance_spec["height"]) < 1e-9,
            f"{entrance_spec['businessId']}: incorrect OverallHeight",
        )

    roof_spec = shell_spec["roof"]
    top_storey = ids_to_entities.get(f"LVL-{spec['building']['storeyCount']:02d}")
    roof = (
        check_geometry_and_container(
            roof_spec["businessId"],
            "IfcSlab",
            top_storey,
        )
        if top_storey is not None
        else None
    )
    if roof is not None:
        expect(roof.PredefinedType == "ROOF", f"{roof_spec['businessId']}: must be ROOF")
    for facade in wall_spec["facades"]:
        parapet_id = roof_spec["parapetBusinessIdPattern"].format(facade=facade)
        if top_storey is not None:
            check_geometry_and_container(parapet_id, "IfcWall", top_storey)

    required_elements = [
        "WALL-1602-BATHROOM-WEST",
        "WALL-1602-BATHROOM-EAST",
        "WALL-1602-BATHROOM-NORTH",
        "WALL-1602-BATHROOM-SOUTH-WEST",
        "WALL-1602-BATHROOM-SOUTH-EAST",
        "SLAB-1602-BATHROOM",
        "DOOR-1602-BATHROOM",
    ]
    for element_id in required_elements:
        element = ids_to_entities.get(element_id)
        expect(element is not None, f"Missing focus element {element_id}")
        if element is None:
            continue
        expect(element.Representation is not None, f"{element_id}: missing geometry representation")
        try:
            bounds = geometry_bounds(element)
            expect(
                all(bounds[index + 3] - bounds[index] > 0 for index in range(3)),
                f"{element_id}: degenerate geometry",
            )
        except Exception as exc:
            errors.append(f"{element_id}: geometry could not be created ({exc})")
        containers = getattr(element, "ContainedInStructure", ())
        expect(
            any(relation.RelatingStructure == bathroom for relation in containers),
            f"{element_id}: not contained in 1602 bathroom",
        )

    detail = spec["bathroomDetail"]
    phase2_specs = [
        detail["waterproofing"],
        *detail["components"],
        *detail["fixtures"],
    ]
    systems_by_id = {
        business_id(system): system for system in model.by_type("IfcDistributionSystem")
    }
    for component_spec in phase2_specs:
        component_id = component_spec["businessId"]
        component = check_geometry_and_container(
            component_id,
            component_spec["ifcClass"],
            bathroom,
        )
        if component is None:
            continue
        memory_pset = ifcopenshell.util.element.get_pset(component, "Pset_ZhushengMemory") or {}
        expect(memory_pset.get("MemoryStatus") == component_spec["lifecycleStatus"], f"{component_id}: incorrect MemoryStatus")
        expect(memory_pset.get("EvidenceCount") == 0, f"{component_id}: EvidenceCount must start at 0")
        expect(not memory_pset.get("RelatedEventId"), f"{component_id}: RelatedEventId must be empty")
        expect(memory_pset.get("DataProvenance") == "synthetic_spec", f"{component_id}: incorrect DataProvenance")
        if component_spec.get("systemId"):
            system_id = component_spec["systemId"]
            system = systems_by_id.get(system_id)
            expect(system is not None, f"{component_id}: missing assigned system {system_id}")
            assigned_systems = [
                relation.RelatingGroup
                for relation in component.HasAssignments
                if relation.is_a("IfcRelAssignsToGroup")
                and relation.RelatingGroup.is_a("IfcDistributionSystem")
            ]
            expect(assigned_systems == [system], f"{component_id}: incorrect system assignment")
            system_pset = ifcopenshell.util.element.get_pset(component, "Pset_ZhushengSystem") or {}
            expect(system_pset.get("SystemId") == system_id, f"{component_id}: incorrect Pset system ID")

    for fixture_spec in detail["fixtures"]:
        fixture_id = fixture_spec["businessId"]
        fixture = ids_to_entities.get(fixture_id)
        if fixture is None:
            continue
        fixture_pset = ifcopenshell.util.element.get_pset(
            fixture, "Pset_ZhushengFixture"
        ) or {}
        expect(
            fixture_pset.get("SpaceId") == detail["businessId"],
            f"{fixture_id}: incorrect fixture SpaceId",
        )
        expect(
            fixture_pset.get("EnvironmentComponent") is True,
            f"{fixture_id}: must be an environment component",
        )
        expect(
            fixture_pset.get("DiagnosticParticipant") is False,
            f"{fixture_id}: must not be a diagnostic participant",
        )

    waterproof = ids_to_entities.get(detail["waterproofing"]["businessId"])
    if waterproof is not None:
        waterproof_pset = ifcopenshell.util.element.get_pset(
            waterproof, "Pset_ZhushengWaterproofing"
        ) or {}
        expect(
            abs(float(waterproof_pset.get("EngineeringThickness", -1.0)) - detail["waterproofing"]["engineeringThickness"]) < 1e-9,
            "WP-1602-BATHROOM: incorrect EngineeringThickness",
        )
        expect(
            abs(float(waterproof_pset.get("DisplayThickness", -1.0)) - detail["waterproofing"]["displayThickness"]) < 1e-9,
            "WP-1602-BATHROOM: incorrect DisplayThickness",
        )
        expect(
            abs(float(waterproof_pset.get("WallUpturnHeight", -1.0)) - detail["waterproofing"]["wallUpturnHeight"]) < 1e-9,
            "WP-1602-BATHROOM: incorrect WallUpturnHeight",
        )

    valve_spec = next(item for item in detail["components"] if item["ifcClass"] == "IfcValve")
    valve = ids_to_entities.get(valve_spec["businessId"])
    if valve is not None:
        safety = ifcopenshell.util.element.get_pset(valve, "Pset_ZhushengSafety") or {}
        expect(safety.get("HumanAuthorizationRequired") is True, f"{valve_spec['businessId']}: authorization must be required")
        expect(safety.get("AuthorizationState") == "NOT_REQUESTED", f"{valve_spec['businessId']}: authorization must be NOT_REQUESTED")

    for system_spec in detail["systems"]:
        system_id = system_spec["businessId"]
        system = systems_by_id.get(system_id)
        expect(system is not None, f"Missing distribution system {system_id}")
        if system is None:
            continue
        expect(system.PredefinedType == system_spec["ifcPredefinedType"], f"{system_id}: incorrect PredefinedType")
        actual_members = sorted(
            business_id(item)
            for relation in system.IsGroupedBy
            for item in relation.RelatedObjects
            if business_id(item)
        )
        expect(actual_members == sorted(system_spec["members"]), f"{system_id}: incorrect members {actual_members}")

    expected_ports = {
        port_spec["businessId"]: (component_spec, port_spec)
        for component_spec in detail["components"]
        for port_spec in component_spec["ports"]
    }
    for port_id, (component_spec, port_spec) in expected_ports.items():
        port = ids_to_entities.get(port_id)
        expect(port is not None, f"Missing distribution port {port_id}")
        if port is None:
            continue
        expect(port.is_a("IfcDistributionPort"), f"{port_id}: expected IfcDistributionPort")
        expect(port_owner(port) == ids_to_entities.get(component_spec["businessId"]), f"{port_id}: incorrect owner")
        expect(port.FlowDirection == port_spec["flowDirection"], f"{port_id}: incorrect FlowDirection")
        port_pset = ifcopenshell.util.element.get_pset(port, "Pset_ZhushengPort") or {}
        expect(port_pset.get("Boundary") is port_spec["boundary"], f"{port_id}: incorrect boundary marker")
        connection_count = len(port.ConnectedFrom) + len(port.ConnectedTo)
        expected_connections = 0 if port_spec["boundary"] else 1
        expect(
            connection_count == expected_connections,
            f"{port_id}: expected {expected_connections} connection(s), got {connection_count}",
        )

    expected_connections = {item["businessId"]: item for item in detail["connections"]}
    actual_connections = {relation.Name: relation for relation in model.by_type("IfcRelConnectsPorts")}
    expect(set(actual_connections) == set(expected_connections), "Port connection BusinessId set changed")
    graph_upstream: dict[str, list[str]] = defaultdict(list)
    graph_downstream: dict[str, list[str]] = defaultdict(list)
    for connection_id, connection_spec in expected_connections.items():
        relation = actual_connections.get(connection_id)
        if relation is None:
            continue
        from_component = port_owner(relation.RelatingPort)
        to_component = port_owner(relation.RelatedPort)
        from_id = business_id(from_component) if from_component else None
        to_id = business_id(to_component) if to_component else None
        expect(from_id == connection_spec["fromComponentId"], f"{connection_id}: incorrect upstream component")
        expect(to_id == connection_spec["toComponentId"], f"{connection_id}: incorrect downstream component")
        expect(business_id(relation.RelatingPort) == connection_spec["fromPortId"], f"{connection_id}: incorrect source port")
        expect(business_id(relation.RelatedPort) == connection_spec["toPortId"], f"{connection_id}: incorrect sink port")
        expect(
            relation.GlobalId == ifcopenshell.guid.compress(
                ifcopenshell.guid.expand(relation.GlobalId)
            ),
            f"{connection_id}: invalid GlobalId",
        )
        if from_id and to_id:
            graph_downstream[from_id].append(to_id)
            graph_upstream[to_id].append(from_id)

    cold_system = next(item for item in detail["systems"] if item["businessId"] == "SYS-1602-CW")
    expected_chain = cold_system["members"]
    for first, second in zip(expected_chain, expected_chain[1:]):
        expect(second in graph_downstream[first], f"Cold-water chain broken: {first} -> {second}")

    fitting_id = next(item["businessId"] for item in detail["components"] if item.get("eventFocus"))
    queue = list(graph_upstream[fitting_id])
    visited: set[str] = set()
    upstream_valves: list[str] = []
    while queue:
        current_id = queue.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)
        current = ids_to_entities.get(current_id)
        if current is not None and current.is_a("IfcValve"):
            upstream_valves.append(current_id)
            continue
        queue.extend(graph_upstream[current_id])
    expect(upstream_valves == [valve_spec["businessId"]], f"Unexpected upstream valves for {fitting_id}: {upstream_valves}")

    phase2_flags = spec["phase2"]
    expect(phase2_flags["includeSensorTimeSeries"] is False, "Sensor time series must not be included")
    expect(phase2_flags["includeLeakDiagnosis"] is False, "Leak diagnosis must not be included")
    expect(phase2_flags["includeAuthorizedActions"] is False, "Authorized actions must not be included")
    expect(phase2_flags["includeLifecycleEventEngine"] is False, "Lifecycle event engine must not be included")
    phase2_5_flags = spec["phase2_5"]
    expect(phase2_5_flags["includeLifecycleEventEngine"] is False, "Phase 2.5 must not include an event engine")
    expect(phase2_5_flags["includeSensorTimeSeries"] is False, "Phase 2.5 must not include sensor time series")
    expect(phase2_5_flags["includeLeakDiagnosis"] is False, "Phase 2.5 must not include leak diagnosis")
    expect(phase2_5_flags["includeAuthorizedActions"] is False, "Phase 2.5 must not include authorized actions")
    expect(phase2_5_flags["includeWorkOrders"] is False, "Phase 2.5 must not include work orders")
    expect(phase2_5_flags["includeWebsiteIntegration"] is False, "Phase 2.5 must not include website integration")

    return errors


def validate_ifc_file(
    ifc_path: Path | str = DEFAULT_OUTPUT,
    spec_path: Path | str = DEFAULT_SPEC,
) -> list[str]:
    model = ifcopenshell.open(str(Path(ifc_path).resolve()))
    return validate_model(model, load_spec(spec_path))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate the Zhusheng phase-2.5 IFC model.")
    parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        errors = validate_ifc_file(args.input, args.spec)
    except Exception as exc:
        print(f"[FAIL] Unable to validate IFC: {exc}", file=sys.stderr)
        return 1
    if errors:
        print(f"[FAIL] {len(errors)} validation error(s):", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    model = ifcopenshell.open(str(args.input.resolve()))
    print(
        f"[PASS] {args.input.resolve()} | schema={model.schema} | "
        f"storeys={len(model.by_type('IfcBuildingStorey'))} | "
        f"spaces={len(model.by_type('IfcSpace'))} | "
        f"slabs={len(model.by_type('IfcSlab'))} | "
        f"walls={len(model.by_type('IfcWall'))} | "
        f"windows={len(model.by_type('IfcWindow'))} | "
        f"doors={len(model.by_type('IfcDoor'))} | "
        f"system_components={sum(len(model.by_type(name)) for name in ('IfcCovering', 'IfcPipeSegment', 'IfcPipeFitting', 'IfcValve', 'IfcFlowMeter', 'IfcSensor'))} | "
        f"ports={len(model.by_type('IfcDistributionPort'))} | "
        f"connections={len(model.by_type('IfcRelConnectsPorts'))}"
        f" | fixtures={sum(len(model.by_type(name)) for name in ('IfcSanitaryTerminal', 'IfcWasteTerminal', 'IfcBuildingElementProxy'))}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
