from __future__ import annotations

import argparse
import json
import os
import uuid
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.geometry
import ifcopenshell.api.project
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.style
import ifcopenshell.api.system
import ifcopenshell.api.unit
import ifcopenshell.guid
import numpy as np


BIM_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SPEC = BIM_ROOT / "building-spec.json"
DEFAULT_OUTPUT = BIM_ROOT / "output" / "ZS-DEMO-001.ifc"
IDENTITY_PSET = "Pset_ZhushengIdentity"


def load_spec(path: Path | str = DEFAULT_SPEC) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def stable_global_id(business_id: str, seed_namespace: str) -> str:
    namespace = uuid.uuid5(uuid.NAMESPACE_URL, seed_namespace)
    value = uuid.uuid5(namespace, business_id)
    return ifcopenshell.guid.compress(value.hex)


def _matrix(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> np.ndarray:
    matrix = np.eye(4)
    matrix[0, 3] = x
    matrix[1, 3] = y
    matrix[2, 3] = z
    return matrix


class ModelBuilder:
    def __init__(self, spec: dict[str, Any]):
        self.spec = spec
        self.model = ifcopenshell.api.project.create_file(version="IFC4")
        self.seed = spec["identity"]["globalIdSeedNamespace"]
        self.pset_name = spec["identity"]["propertySetName"]
        self.context = None
        self.body = None
        self.objects: dict[str, ifcopenshell.entity_instance] = {}
        self.styles: dict[str, ifcopenshell.entity_instance] = {}

    def create_root(
        self,
        ifc_class: str,
        business_id: str,
        name: str,
        *,
        lifecycle_owner: str = "筑生样板楼",
    ) -> ifcopenshell.entity_instance:
        if business_id in self.objects:
            raise ValueError(f"Duplicate business ID: {business_id}")
        entity = ifcopenshell.api.root.create_entity(
            self.model,
            ifc_class=ifc_class,
            name=name,
        )
        entity.GlobalId = stable_global_id(business_id, self.seed)
        self.objects[business_id] = entity
        pset = ifcopenshell.api.pset.add_pset(
            self.model,
            product=entity,
            name=self.pset_name,
        )
        ifcopenshell.api.pset.edit_pset(
            self.model,
            pset=pset,
            properties={
                "BusinessId": business_id,
                "DisplayName": name,
                "LifecycleOwner": lifecycle_owner,
                "SyntheticDemo": True,
                "SourceType": "synthetic_spec",
                "Version": self.spec["meta"]["specVersion"],
            },
        )
        if hasattr(entity, "Tag"):
            entity.Tag = business_id
        return entity

    def create_styles(self) -> None:
        for key, style_spec in self.spec["architecturalShell"]["displayStyles"].items():
            style = ifcopenshell.api.style.add_style(
                self.model,
                name=style_spec["name"],
            )
            red, green, blue = style_spec["rgb"]
            ifcopenshell.api.style.add_surface_style(
                self.model,
                style=style,
                ifc_class="IfcSurfaceStyleShading",
                attributes={
                    "SurfaceColour": {
                        "Name": None,
                        "Red": red,
                        "Green": green,
                        "Blue": blue,
                    },
                    "Transparency": style_spec["transparency"],
                },
            )
            self.styles[key] = style

    def add_pset(
        self,
        entity: ifcopenshell.entity_instance,
        name: str,
        properties: dict[str, Any],
    ) -> None:
        pset = ifcopenshell.api.pset.add_pset(
            self.model,
            product=entity,
            name=name,
        )
        ifcopenshell.api.pset.edit_pset(
            self.model,
            pset=pset,
            properties=properties,
        )

    def place(self, entity: ifcopenshell.entity_instance, x: float, y: float, z: float) -> None:
        ifcopenshell.api.geometry.edit_object_placement(
            self.model,
            product=entity,
            matrix=_matrix(x, y, z),
            is_si=True,
        )

    def add_box(
        self,
        entity: ifcopenshell.entity_instance,
        *,
        x: float,
        y: float,
        z: float,
        width: float,
        depth: float,
        height: float,
        style: str | None = None,
    ) -> None:
        if min(width, depth, height) <= 0:
            raise ValueError(f"Invalid box dimensions for {entity}: {width}, {depth}, {height}")
        self.place(entity, x, y, z)
        vertices = [[
            (0.0, 0.0, 0.0),
            (width, 0.0, 0.0),
            (width, depth, 0.0),
            (0.0, depth, 0.0),
            (0.0, 0.0, height),
            (width, 0.0, height),
            (width, depth, height),
            (0.0, depth, height),
        ]]
        faces = [[
            (0, 3, 2, 1),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (1, 2, 6, 5),
            (2, 3, 7, 6),
            (3, 0, 4, 7),
        ]]
        representation = ifcopenshell.api.geometry.add_mesh_representation(
            self.model,
            context=self.body,
            vertices=vertices,
            faces=faces,
        )
        ifcopenshell.api.geometry.assign_representation(
            self.model,
            product=entity,
            representation=representation,
        )
        if style:
            ifcopenshell.api.style.assign_representation_styles(
                self.model,
                shape_representation=representation,
                styles=[self.styles[style]],
            )

    def add_boxes(
        self,
        entity: ifcopenshell.entity_instance,
        boxes: list[dict[str, float]],
        *,
        style: str | None = None,
    ) -> None:
        if not boxes:
            raise ValueError(f"No box geometry supplied for {entity}")
        base_x = min(box["x"] for box in boxes)
        base_y = min(box["y"] for box in boxes)
        base_z = min(box["z"] for box in boxes)
        vertices: list[list[tuple[float, float, float]]] = []
        faces: list[list[tuple[int, ...]]] = []
        for box in boxes:
            width = box["width"]
            depth = box["depth"]
            height = box["height"]
            if min(width, depth, height) <= 0:
                raise ValueError(f"Invalid multi-box dimensions for {entity}: {box}")
            x = box["x"] - base_x
            y = box["y"] - base_y
            z = box["z"] - base_z
            vertices.append([
                (x, y, z),
                (x + width, y, z),
                (x + width, y + depth, z),
                (x, y + depth, z),
                (x, y, z + height),
                (x + width, y, z + height),
                (x + width, y + depth, z + height),
                (x, y + depth, z + height),
            ])
            faces.append([
                (0, 3, 2, 1),
                (4, 5, 6, 7),
                (0, 1, 5, 4),
                (1, 2, 6, 5),
                (2, 3, 7, 6),
                (3, 0, 4, 7),
            ])
        self.place(entity, base_x, base_y, base_z)
        representation = ifcopenshell.api.geometry.add_mesh_representation(
            self.model,
            context=self.body,
            vertices=vertices,
            faces=faces,
        )
        ifcopenshell.api.geometry.assign_representation(
            self.model,
            product=entity,
            representation=representation,
        )
        if style:
            ifcopenshell.api.style.assign_representation_styles(
                self.model,
                shape_representation=representation,
                styles=[self.styles[style]],
            )

    def aggregate(
        self,
        parent: ifcopenshell.entity_instance,
        children: list[ifcopenshell.entity_instance],
    ) -> None:
        ifcopenshell.api.aggregate.assign_object(
            self.model,
            products=children,
            relating_object=parent,
        )

    def build(self) -> ifcopenshell.file:
        project_spec = self.spec["project"]
        site_spec = self.spec["site"]
        building_spec = self.spec["building"]

        project = self.create_root(
            "IfcProject", project_spec["businessId"], project_spec["name"]
        )
        length = ifcopenshell.api.unit.add_si_unit(self.model, unit_type="LENGTHUNIT")
        area = ifcopenshell.api.unit.add_si_unit(self.model, unit_type="AREAUNIT")
        volume = ifcopenshell.api.unit.add_si_unit(self.model, unit_type="VOLUMEUNIT")
        ifcopenshell.api.unit.assign_unit(self.model, units=[length, area, volume])
        self.context = ifcopenshell.api.context.add_context(self.model, context_type="Model")
        self.body = ifcopenshell.api.context.add_context(
            self.model,
            context_type="Model",
            context_identifier="Body",
            target_view="MODEL_VIEW",
            parent=self.context,
        )
        self.create_styles()

        site = self.create_root("IfcSite", site_spec["businessId"], site_spec["name"])
        building = self.create_root(
            "IfcBuilding", building_spec["businessId"], building_spec["name"]
        )
        site.CompositionType = "ELEMENT"
        building.CompositionType = "ELEMENT"
        self.aggregate(project, [site])
        self.aggregate(site, [building])
        self.place(site, 0.0, 0.0, 0.0)
        origin = building_spec["origin"]
        self.place(building, origin["x"], origin["y"], origin["z"])

        storeys: dict[int, ifcopenshell.entity_instance] = {}
        storey_height = building_spec["storeyHeight"]
        for number in range(1, building_spec["storeyCount"] + 1):
            storey = self.create_root("IfcBuildingStorey", f"LVL-{number:02d}", f"{number}层")
            storey.CompositionType = "ELEMENT"
            elevation = (number - 1) * storey_height
            storey.Elevation = elevation
            self.aggregate(building, [storey])
            self.place(storey, 0.0, 0.0, elevation)
            storeys[number] = storey

        self._build_first_storey(storeys[1])
        for number in range(
            self.spec["storeys"]["residentialFrom"],
            self.spec["storeys"]["residentialTo"] + 1,
        ):
            self._build_residential_storey(number, storeys[number])

        self._build_focus_unit(storeys[self.spec["focusUnit"]["storey"]])
        self._build_architectural_shell(storeys)
        self._build_focus_bathroom_elements()
        self._build_bathroom_systems()
        self._build_bathroom_fixtures()
        return self.model

    def _build_first_storey(self, storey: ifcopenshell.entity_instance) -> None:
        item = self.spec["storeys"]["firstStorey"]["spaces"][0]
        bounds = item["bounds"]
        space = self.create_root("IfcSpace", item["businessId"], item["name"])
        space.CompositionType = "ELEMENT"
        self.aggregate(storey, [space])
        self.add_box(
            space,
            x=bounds["minX"],
            y=bounds["minY"],
            z=0.0,
            width=bounds["maxX"] - bounds["minX"],
            depth=bounds["maxY"] - bounds["minY"],
            height=self.spec["building"]["storeyHeight"],
            style="space",
        )

    def _build_residential_storey(
        self,
        number: int,
        storey: ifcopenshell.entity_instance,
    ) -> None:
        typical = self.spec["typicalResidentialStorey"]
        elevation = (number - 1) * self.spec["building"]["storeyHeight"]
        children: list[ifcopenshell.entity_instance] = []

        for apartment in typical["apartments"]:
            suffix = apartment["suffix"]
            business_id = f"UNIT-{number:02d}{suffix}"
            unit = self.create_root("IfcSpace", business_id, f"{number}{suffix}户")
            unit.CompositionType = "COMPLEX" if business_id == self.spec["focusUnit"]["businessId"] else "ELEMENT"
            children.append(unit)
            if business_id != self.spec["focusUnit"]["businessId"]:
                bounds = apartment["bounds"]
                self.add_box(
                    unit,
                    x=bounds["minX"],
                    y=bounds["minY"],
                    z=elevation,
                    width=bounds["maxX"] - bounds["minX"],
                    depth=bounds["maxY"] - bounds["minY"],
                    height=self.spec["building"]["storeyHeight"],
                    style="space",
                )

        corridor_spec = typical["corridor"]
        corridor_id = corridor_spec["businessIdPattern"].format(storey=number)
        corridor = self.create_root("IfcSpace", corridor_id, f"{number}层{corridor_spec['name']}")
        corridor.CompositionType = "ELEMENT"
        children.append(corridor)
        corridor_bounds = corridor_spec["bounds"]
        self.add_box(
            corridor,
            x=corridor_bounds["minX"],
            y=corridor_bounds["minY"],
            z=elevation,
            width=corridor_bounds["maxX"] - corridor_bounds["minX"],
            depth=corridor_bounds["maxY"] - corridor_bounds["minY"],
            height=self.spec["building"]["storeyHeight"],
            style="space",
        )

        core_spec = typical["core"]
        core_base = core_spec["businessIdPattern"].format(storey=number)
        for segment in core_spec["segments"]:
            core_id = f"{core_base}-{segment['suffix']}"
            core = self.create_root(
                "IfcSpace", core_id, f"{number}层{core_spec['name']}{segment['suffix']}"
            )
            core.CompositionType = "ELEMENT"
            children.append(core)
            bounds = segment["bounds"]
            self.add_box(
                core,
                x=bounds["minX"],
                y=bounds["minY"],
                z=elevation,
                width=bounds["maxX"] - bounds["minX"],
                depth=bounds["maxY"] - bounds["minY"],
                height=self.spec["building"]["storeyHeight"],
                style="space",
            )

        self.aggregate(storey, children)

    def _build_focus_unit(self, storey: ifcopenshell.entity_instance) -> None:
        focus = self.spec["focusUnit"]
        unit = self.objects[focus["businessId"]]
        origin = focus["globalOrigin"]
        rooms: list[ifcopenshell.entity_instance] = []
        for room_spec in focus["spaces"]:
            room = self.create_root("IfcSpace", room_spec["businessId"], room_spec["name"])
            room.CompositionType = "ELEMENT"
            rooms.append(room)
            local = room_spec["localOrigin"]
            size = room_spec["size"]
            self.add_box(
                room,
                x=origin["x"] + local["x"],
                y=origin["y"] + local["y"],
                z=origin["z"],
                width=size["widthX"],
                depth=size["depthY"],
                height=size["clearHeight"],
                style="focusSpace",
            )
        self.aggregate(unit, rooms)
        # assign_object recalculates placements; confirm the focus unit remains under its storey.
        if unit not in [child for rel in storey.IsDecomposedBy for child in rel.RelatedObjects]:
            raise RuntimeError("Focus unit was detached from storey during room aggregation")

    def _build_architectural_shell(
        self,
        storeys: dict[int, ifcopenshell.entity_instance],
    ) -> None:
        for number, storey in storeys.items():
            self._build_storey_slab(number, storey)
            self._build_exterior_and_windows(number, storey)
            self._build_core_walls(number, storey)
        self._build_roof(storeys[self.spec["building"]["storeyCount"]])

    def _build_storey_slab(
        self,
        number: int,
        storey: ifcopenshell.entity_instance,
    ) -> None:
        building = self.spec["building"]
        slab_spec = self.spec["architecturalShell"]["floorSlab"]
        footprint = building["footprint"]
        elevation = (number - 1) * building["storeyHeight"]
        overhang = slab_spec["edgeOverhang"]
        slab = self.create_root(
            "IfcSlab",
            slab_spec["businessIdPattern"].format(storey=number),
            slab_spec["namePattern"].format(storey=number),
        )
        slab.PredefinedType = "FLOOR"
        self.add_box(
            slab,
            x=-overhang,
            y=-overhang,
            z=elevation - slab_spec["thickness"],
            width=footprint["widthX"] + 2.0 * overhang,
            depth=footprint["depthY"] + 2.0 * overhang,
            height=slab_spec["thickness"],
            style="focusShell" if number == self.spec["focusUnit"]["storey"] else "slab",
        )
        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=[slab],
            relating_structure=storey,
        )

    @staticmethod
    def _solid_facade_panels(
        facade_width: float,
        facade_height: float,
        openings: list[tuple[float, float, float, float]],
    ) -> list[tuple[float, float, float, float]]:
        z_edges = sorted(
            {0.0, facade_height}
            | {
                value
                for _, _, bottom, top in openings
                for value in (max(0.0, bottom), min(facade_height, top))
            }
        )
        panels: list[tuple[float, float, float, float]] = []
        for bottom, top in zip(z_edges, z_edges[1:]):
            if top - bottom <= 1e-9:
                continue
            active = sorted(
                (max(0.0, left), min(facade_width, right))
                for left, right, opening_bottom, opening_top in openings
                if opening_bottom < top - 1e-9 and opening_top > bottom + 1e-9
            )
            merged: list[list[float]] = []
            for left, right in active:
                if right - left <= 1e-9:
                    continue
                if merged and left <= merged[-1][1] + 1e-9:
                    merged[-1][1] = max(merged[-1][1], right)
                else:
                    merged.append([left, right])
            cursor = 0.0
            for left, right in merged:
                if left - cursor > 1e-9:
                    panels.append((cursor, bottom, left - cursor, top - bottom))
                cursor = max(cursor, right)
            if facade_width - cursor > 1e-9:
                panels.append((cursor, bottom, facade_width - cursor, top - bottom))
        return panels

    def _build_exterior_and_windows(
        self,
        number: int,
        storey: ifcopenshell.entity_instance,
    ) -> None:
        building = self.spec["building"]
        shell = self.spec["architecturalShell"]
        wall_spec = shell["externalWall"]
        window_spec = shell["window"]
        entrance_spec = shell["mainEntrance"]
        footprint = building["footprint"]
        width = footprint["widthX"]
        depth = footprint["depthY"]
        elevation = (number - 1) * building["storeyHeight"]
        wall_height = wall_spec["height"]
        wall_thickness = self.spec["construction"]["externalWallThickness"]
        facade_names = {
            "SOUTH": "南",
            "NORTH": "北",
            "WEST": "西",
            "EAST": "东",
        }
        elements: list[ifcopenshell.entity_instance] = []

        for facade, x in (("WEST", -wall_thickness), ("EAST", width)):
            wall = self.create_root(
                "IfcWall",
                wall_spec["businessIdPattern"].format(
                    storey=number,
                    facade=facade,
                    segment="MAIN",
                ),
                wall_spec["namePattern"].format(
                    storey=number,
                    facadeZh=facade_names[facade],
                    segment="主体",
                ),
            )
            self.add_box(
                wall,
                x=x,
                y=0.0,
                z=elevation,
                width=wall_thickness,
                depth=depth,
                height=wall_height,
                style="focusShell"
                if number == self.spec["focusUnit"]["storey"] and facade == "EAST"
                else "wall",
            )
            elements.append(wall)

        window_ranges: list[tuple[float, float]] = []
        for index in range(window_spec["countPerFacade"]):
            centre = window_spec["firstCentreX"] + index * window_spec["spacingX"]
            window_ranges.append(
                (centre - window_spec["width"] / 2.0, centre + window_spec["width"] / 2.0)
            )

        for facade in window_spec["facades"]:
            openings = [
                (
                    left,
                    right,
                    window_spec["sillHeight"],
                    window_spec["sillHeight"] + window_spec["height"],
                )
                for left, right in window_ranges
            ]
            if number == 1 and facade == entrance_spec["facade"]:
                entrance_left = entrance_spec["centreX"] - entrance_spec["width"] / 2.0
                openings.append(
                    (
                        entrance_left,
                        entrance_left + entrance_spec["width"],
                        0.0,
                        entrance_spec["height"],
                    )
                )
            for panel_index, (x, z, panel_width, panel_height) in enumerate(
                self._solid_facade_panels(width, wall_height, openings),
                start=1,
            ):
                wall = self.create_root(
                    "IfcWall",
                    wall_spec["businessIdPattern"].format(
                        storey=number,
                        facade=facade,
                        segment=f"PANEL-{panel_index:02d}",
                    ),
                    wall_spec["namePattern"].format(
                        storey=number,
                        facadeZh=facade_names[facade],
                        segment=f"分段{panel_index:02d}",
                    ),
                )
                self.add_box(
                    wall,
                    x=x,
                    y=-wall_thickness if facade == "SOUTH" else depth,
                    z=elevation + z,
                    width=panel_width,
                    depth=wall_thickness,
                    height=panel_height,
                    style="wall",
                )
                elements.append(wall)

            for index, (left, _) in enumerate(window_ranges, start=1):
                window = self.create_root(
                    "IfcWindow",
                    window_spec["businessIdPattern"].format(
                        storey=number,
                        facade=facade,
                        index=index,
                    ),
                    window_spec["namePattern"].format(
                        storey=number,
                        facadeZh=facade_names[facade],
                        index=index,
                    ),
                )
                window.OverallWidth = window_spec["width"]
                window.OverallHeight = window_spec["height"]
                focus_window = (
                    number == self.spec["focusUnit"]["storey"]
                    and facade == "NORTH"
                    and left >= self.spec["focusUnit"]["globalOrigin"]["x"]
                )
                self.add_box(
                    window,
                    x=left,
                    y=-wall_thickness if facade == "SOUTH" else depth,
                    z=elevation + window_spec["sillHeight"],
                    width=window_spec["width"],
                    depth=window_spec["frameDepth"],
                    height=window_spec["height"],
                    style="focusShell" if focus_window else "window",
                )
                elements.append(window)

        if number == 1:
            entrance_left = entrance_spec["centreX"] - entrance_spec["width"] / 2.0
            door = self.create_root(
                "IfcDoor",
                entrance_spec["businessId"],
                entrance_spec["name"],
            )
            door.OverallWidth = entrance_spec["width"]
            door.OverallHeight = entrance_spec["height"]
            self.add_box(
                door,
                x=entrance_left,
                y=-wall_thickness,
                z=elevation,
                width=entrance_spec["width"],
                depth=entrance_spec["depth"],
                height=entrance_spec["height"],
                style="entrance",
            )
            elements.append(door)

        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=elements,
            relating_structure=storey,
        )

    def _build_core_walls(
        self,
        number: int,
        storey: ifcopenshell.entity_instance,
    ) -> None:
        core_spec = self.spec["typicalResidentialStorey"]["core"]
        wall_spec = self.spec["architecturalShell"]["coreWalls"]
        elevation = (number - 1) * self.spec["building"]["storeyHeight"]
        thickness = wall_spec["thickness"]
        elements: list[ifcopenshell.entity_instance] = []
        segment_names = {"SOUTH": "南段", "NORTH": "北段"}
        side_names = {"WEST": "西侧", "EAST": "东侧", "CORRIDOR": "走廊侧"}
        for segment in core_spec["segments"]:
            segment_id = segment["suffix"]
            bounds = segment["bounds"]
            geometry = {
                "WEST": (
                    bounds["minX"],
                    bounds["minY"],
                    thickness,
                    bounds["maxY"] - bounds["minY"],
                ),
                "EAST": (
                    bounds["maxX"] - thickness,
                    bounds["minY"],
                    thickness,
                    bounds["maxY"] - bounds["minY"],
                ),
                "CORRIDOR": (
                    bounds["minX"],
                    bounds["maxY"] - thickness
                    if segment_id == "SOUTH"
                    else bounds["minY"],
                    bounds["maxX"] - bounds["minX"],
                    thickness,
                ),
            }
            for side in wall_spec["sidesPerSegment"]:
                x, y, width, depth = geometry[side]
                wall = self.create_root(
                    "IfcWall",
                    wall_spec["businessIdPattern"].format(
                        storey=number,
                        segment=segment_id,
                        side=side,
                    ),
                    wall_spec["namePattern"].format(
                        storey=number,
                        segmentZh=segment_names[segment_id],
                        sideZh=side_names[side],
                    ),
                )
                self.add_box(
                    wall,
                    x=x,
                    y=y,
                    z=elevation,
                    width=width,
                    depth=depth,
                    height=wall_spec["height"],
                    style="wall",
                )
                elements.append(wall)
        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=elements,
            relating_structure=storey,
        )

    def _build_roof(self, storey: ifcopenshell.entity_instance) -> None:
        building = self.spec["building"]
        roof_spec = self.spec["architecturalShell"]["roof"]
        footprint = building["footprint"]
        overhang = roof_spec["edgeOverhang"]
        roof = self.create_root(
            "IfcSlab",
            roof_spec["businessId"],
            roof_spec["name"],
        )
        roof.PredefinedType = "ROOF"
        self.add_box(
            roof,
            x=-overhang,
            y=-overhang,
            z=roof_spec["elevation"],
            width=footprint["widthX"] + 2.0 * overhang,
            depth=footprint["depthY"] + 2.0 * overhang,
            height=roof_spec["thickness"],
            style="slab",
        )
        elements: list[ifcopenshell.entity_instance] = [roof]
        parapet_z = roof_spec["elevation"] + roof_spec["thickness"]
        parapet_height = roof_spec["parapetHeight"]
        thickness = roof_spec["parapetThickness"]
        parapets = {
            "SOUTH": (0.0, -thickness, footprint["widthX"], thickness),
            "NORTH": (0.0, footprint["depthY"], footprint["widthX"], thickness),
            "WEST": (-thickness, 0.0, thickness, footprint["depthY"]),
            "EAST": (footprint["widthX"], 0.0, thickness, footprint["depthY"]),
        }
        for facade, (x, y, width, depth) in parapets.items():
            wall = self.create_root(
                "IfcWall",
                roof_spec["parapetBusinessIdPattern"].format(facade=facade),
                f"屋面{facade}女儿墙",
            )
            self.add_box(
                wall,
                x=x,
                y=y,
                z=parapet_z,
                width=width,
                depth=depth,
                height=parapet_height,
                style="wall",
            )
            elements.append(wall)
        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=elements,
            relating_structure=storey,
        )

    def _build_focus_bathroom_elements(self) -> None:
        focus = self.spec["focusUnit"]
        bathroom_spec = next(
            room for room in focus["spaces"] if room["businessId"] == self.spec["bathroomDetail"]["businessId"]
        )
        bathroom = self.objects[bathroom_spec["businessId"]]
        origin = focus["globalOrigin"]
        local = bathroom_spec["localOrigin"]
        size = bathroom_spec["size"]
        x0 = origin["x"] + local["x"]
        y0 = origin["y"] + local["y"]
        z0 = origin["z"]
        width = size["widthX"]
        depth = size["depthY"]
        height = size["clearHeight"]
        construction = self.spec["construction"]
        thickness = construction["internalWallThickness"]
        door_width = construction["bathroomDoorWidth"]
        door_height = construction["defaultDoorHeight"]
        door_start = x0 + (width - door_width) / 2.0
        door_end = door_start + door_width

        wall_boxes = [
            ("WEST", x0 - thickness, y0, thickness, depth),
            ("EAST", x0 + width, y0, thickness, depth),
            ("NORTH", x0, y0 + depth, width, thickness),
            ("SOUTH-WEST", x0 - thickness, y0 - thickness, door_start - (x0 - thickness), thickness),
            ("SOUTH-EAST", door_end, y0 - thickness, (x0 + width + thickness) - door_end, thickness),
        ]
        elements: list[ifcopenshell.entity_instance] = []
        for suffix, x, y, wall_width, wall_depth in wall_boxes:
            business_id = f"WALL-1602-BATHROOM-{suffix}"
            wall = self.create_root("IfcWall", business_id, f"1602卫生间{suffix}墙体")
            self.add_box(
                wall,
                x=x,
                y=y,
                z=z0,
                width=wall_width,
                depth=wall_depth,
                height=height,
                style="focusShell",
            )
            elements.append(wall)

        slab_id = self.spec["bathroomDetail"]["structuralSlabBusinessId"]
        slab = self.create_root("IfcSlab", slab_id, "1602卫生间结构板")
        slab.PredefinedType = "FLOOR"
        slab_thickness = construction["structuralSlabThickness"]
        self.add_box(
            slab,
            x=x0 - thickness,
            y=y0 - thickness,
            z=z0 - slab_thickness,
            width=width + 2.0 * thickness,
            depth=depth + 2.0 * thickness,
            height=slab_thickness,
            style="focusShell",
        )
        elements.append(slab)

        door = self.create_root("IfcDoor", "DOOR-1602-BATHROOM", "1602卫生间门")
        door.OverallWidth = door_width
        door.OverallHeight = door_height
        self.add_box(
            door,
            x=door_start,
            y=y0 - thickness,
            z=z0,
            width=door_width,
            depth=thickness,
            height=door_height,
            style="entrance",
        )
        elements.append(door)

        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=elements,
            relating_structure=bathroom,
        )

    def _build_bathroom_systems(self) -> None:
        detail = self.spec["bathroomDetail"]
        focus = self.spec["focusUnit"]
        bathroom_spec = next(
            room for room in focus["spaces"] if room["businessId"] == detail["businessId"]
        )
        bathroom = self.objects[detail["businessId"]]
        focus_origin = focus["globalOrigin"]
        room_origin = bathroom_spec["localOrigin"]
        room_size = bathroom_spec["size"]
        x0 = focus_origin["x"] + room_origin["x"]
        y0 = focus_origin["y"] + room_origin["y"]
        z0 = focus_origin["z"]

        waterproof_spec = detail["waterproofing"]
        waterproof = self.create_root(
            waterproof_spec["ifcClass"],
            waterproof_spec["businessId"],
            waterproof_spec["displayName"],
        )
        waterproof.PredefinedType = waterproof_spec["predefinedType"]
        display_thickness = waterproof_spec["displayThickness"]
        upturn = waterproof_spec["wallUpturnHeight"]
        waterproof_boxes = [
            {
                "x": x0,
                "y": y0,
                "z": z0,
                "width": room_size["widthX"],
                "depth": room_size["depthY"],
                "height": display_thickness,
            },
            {
                "x": x0,
                "y": y0,
                "z": z0,
                "width": display_thickness,
                "depth": room_size["depthY"],
                "height": upturn,
            },
            {
                "x": x0 + room_size["widthX"] - display_thickness,
                "y": y0,
                "z": z0,
                "width": display_thickness,
                "depth": room_size["depthY"],
                "height": upturn,
            },
            {
                "x": x0,
                "y": y0,
                "z": z0,
                "width": room_size["widthX"],
                "depth": display_thickness,
                "height": upturn,
            },
            {
                "x": x0,
                "y": y0 + room_size["depthY"] - display_thickness,
                "z": z0,
                "width": room_size["widthX"],
                "depth": display_thickness,
                "height": upturn,
            },
        ]
        self.add_boxes(waterproof, waterproof_boxes, style="waterproofing")
        self.add_pset(
            waterproof,
            "Pset_ZhushengWaterproofing",
            {
                "EngineeringThickness": waterproof_spec["engineeringThickness"],
                "DisplayThickness": waterproof_spec["displayThickness"],
                "WallUpturnHeight": waterproof_spec["wallUpturnHeight"],
            },
        )
        self._add_component_memory_pset(waterproof, waterproof_spec)

        components: list[ifcopenshell.entity_instance] = [waterproof]
        component_specs = {
            item["businessId"]: item for item in detail["components"]
        }
        for component_spec in detail["components"]:
            component = self.create_root(
                component_spec["ifcClass"],
                component_spec["businessId"],
                component_spec["displayName"],
            )
            component.PredefinedType = component_spec["predefinedType"]
            local = component_spec["geometry"]["localOrigin"]
            size = component_spec["geometry"]["size"]
            style = "equipment"
            if component_spec["systemId"] == "SYS-1602-CW" and component.is_a("IfcPipeSegment"):
                style = "coldWater"
            elif component_spec["systemId"] == "SYS-1602-HW":
                style = "hotWater"
            elif component.is_a("IfcSensor"):
                style = "sensor"
            self.add_box(
                component,
                x=x0 + local["x"],
                y=y0 + local["y"],
                z=z0 + local["z"],
                width=size["x"],
                depth=size["y"],
                height=size["z"],
                style=style,
            )
            self._add_component_memory_pset(component, component_spec)
            self.add_pset(
                component,
                "Pset_ZhushengSystem",
                {
                    "SystemId": component_spec["systemId"],
                    "SystemType": next(
                        system["systemType"]
                        for system in detail["systems"]
                        if system["businessId"] == component_spec["systemId"]
                    ),
                    "FlowDirection": component_spec["flowDirection"],
                    "UpstreamComponentId": ",".join(component_spec["upstreamIds"]),
                    "DownstreamComponentId": ",".join(component_spec["downstreamIds"]),
                    "IsolationValveId": component_spec["isolationValveId"] or "",
                },
            )
            if component_spec.get("safety"):
                safety = component_spec["safety"]
                self.add_pset(
                    component,
                    "Pset_ZhushengSafety",
                    {
                        "ActionClass": safety["actionClass"],
                        "HumanAuthorizationRequired": component_spec["humanAuthorizationRequired"],
                        "AuthorizationState": safety["authorizationState"],
                        "FallbackMode": safety["fallbackMode"],
                    },
                )
            components.append(component)

        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=components,
            relating_structure=bathroom,
        )

        systems: dict[str, ifcopenshell.entity_instance] = {}
        for system_spec in detail["systems"]:
            system = self.create_root(
                "IfcDistributionSystem",
                system_spec["businessId"],
                system_spec["displayName"],
            )
            system.PredefinedType = system_spec["ifcPredefinedType"]
            self.add_pset(
                system,
                "Pset_ZhushengSystem",
                {
                    "SystemId": system_spec["businessId"],
                    "SystemType": system_spec["systemType"],
                    "FlowDirection": "FORWARD",
                    "UpstreamComponentId": "",
                    "DownstreamComponentId": "",
                    "IsolationValveId": "VALVE-1602-CW-01"
                    if system_spec["businessId"] == "SYS-1602-CW"
                    else "",
                },
            )
            relation = ifcopenshell.api.system.assign_system(
                self.model,
                products=[self.objects[item_id] for item_id in system_spec["members"]],
                system=system,
            )
            if relation is not None:
                relation.GlobalId = stable_global_id(
                    f"REL-SYSTEM-{system_spec['businessId']}",
                    self.seed,
                )
            systems[system_spec["businessId"]] = system

        ports: dict[str, ifcopenshell.entity_instance] = {}
        for component_id, component_spec in component_specs.items():
            component = self.objects[component_id]
            system_spec = next(
                system for system in detail["systems"] if system["businessId"] == component_spec["systemId"]
            )
            for port_spec in component_spec["ports"]:
                port = self.create_root(
                    "IfcDistributionPort",
                    port_spec["businessId"],
                    port_spec["displayName"],
                )
                port.FlowDirection = port_spec["flowDirection"]
                port.PredefinedType = "PIPE"
                port.SystemType = system_spec["ifcPredefinedType"]
                relation = ifcopenshell.api.system.assign_port(
                    self.model,
                    element=component,
                    port=port,
                )
                relation.GlobalId = stable_global_id(
                    f"REL-NEST-{port_spec['businessId']}",
                    self.seed,
                )
                self.add_pset(
                    port,
                    "Pset_ZhushengPort",
                    {
                        "ParentComponentId": component_id,
                        "Role": port_spec["role"],
                        "Boundary": port_spec["boundary"],
                    },
                )
                ports[port_spec["businessId"]] = port

        for connection_spec in detail["connections"]:
            before = {relation.id() for relation in self.model.by_type("IfcRelConnectsPorts")}
            ifcopenshell.api.system.connect_port(
                self.model,
                port1=ports[connection_spec["fromPortId"]],
                port2=ports[connection_spec["toPortId"]],
                direction=connection_spec["flowDirection"],
            )
            created = [
                relation
                for relation in self.model.by_type("IfcRelConnectsPorts")
                if relation.id() not in before
            ]
            if len(created) != 1:
                raise RuntimeError(
                    f"Expected one port connection for {connection_spec['businessId']}, got {len(created)}"
                )
            relation = created[0]
            relation.GlobalId = stable_global_id(connection_spec["businessId"], self.seed)
            relation.Name = connection_spec["businessId"]
            relation.Description = "Structured synthetic bathroom topology"

    def _add_component_memory_pset(
        self,
        component: ifcopenshell.entity_instance,
        component_spec: dict[str, Any],
    ) -> None:
        self.add_pset(
            component,
            "Pset_ZhushengMemory",
            {
                "MemoryStatus": component_spec["lifecycleStatus"],
                "EvidenceCount": 0,
                "RelatedEventId": "",
                "DataProvenance": "synthetic_spec",
                "LifecycleStage": "AS_BUILT",
            },
        )

    def _build_bathroom_fixtures(self) -> None:
        detail = self.spec["bathroomDetail"]
        focus = self.spec["focusUnit"]
        bathroom_spec = next(
            room for room in focus["spaces"] if room["businessId"] == detail["businessId"]
        )
        bathroom = self.objects[detail["businessId"]]
        focus_origin = focus["globalOrigin"]
        room_origin = bathroom_spec["localOrigin"]
        x0 = focus_origin["x"] + room_origin["x"]
        y0 = focus_origin["y"] + room_origin["y"]
        z0 = focus_origin["z"]
        fixtures: list[ifcopenshell.entity_instance] = []

        for fixture_spec in detail["fixtures"]:
            fixture = self.create_root(
                fixture_spec["ifcClass"],
                fixture_spec["businessId"],
                fixture_spec["displayName"],
            )
            fixture.PredefinedType = fixture_spec["predefinedType"]
            if fixture_spec.get("objectType"):
                fixture.ObjectType = fixture_spec["objectType"]
            local = fixture_spec["geometry"]["localOrigin"]
            size = fixture_spec["geometry"]["size"]
            self.add_box(
                fixture,
                x=x0 + local["x"],
                y=y0 + local["y"],
                z=z0 + local["z"],
                width=size["x"],
                depth=size["y"],
                height=size["z"],
                style="glass"
                if fixture_spec["businessId"].startswith("PARTITION-")
                else "sanitary",
            )
            self._add_component_memory_pset(fixture, fixture_spec)
            self.add_pset(
                fixture,
                "Pset_ZhushengFixture",
                {
                    "SpaceId": fixture_spec["spaceId"],
                    "EnvironmentComponent": True,
                    "DiagnosticParticipant": False,
                },
            )
            fixtures.append(fixture)

        ifcopenshell.api.spatial.assign_container(
            self.model,
            products=fixtures,
            relating_structure=bathroom,
        )


def generate_model(spec: dict[str, Any]) -> ifcopenshell.file:
    return ModelBuilder(spec).build()


def generate_ifc_file(
    spec_path: Path | str = DEFAULT_SPEC,
    output_path: Path | str = DEFAULT_OUTPUT,
) -> Path:
    spec_path = Path(spec_path).resolve()
    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model = generate_model(load_spec(spec_path))
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    try:
        model.write(str(temporary))
        os.replace(temporary, output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the Zhusheng phase-2.5 IFC model.")
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = generate_ifc_file(args.spec, args.output)
    model = ifcopenshell.open(str(output))
    print(
        f"Generated {output} | schema={model.schema} | "
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
