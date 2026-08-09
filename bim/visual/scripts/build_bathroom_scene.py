from __future__ import annotations

import argparse
import json
import math
import os
import sys
import traceback
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


VISUAL_ROOT = Path(__file__).resolve().parents[1]
BIM_ROOT = VISUAL_ROOT.parent
DEFAULT_SPEC = BIM_ROOT / "building-spec.json"
DEFAULT_MEMORY = BIM_ROOT / "data" / "building-memory.seed.json"
DEFAULT_BLEND = VISUAL_ROOT / "bathroom-1602.blend"
DEFAULT_GLB = VISUAL_ROOT / "bathroom-1602.glb"
DEFAULT_MANIFEST = VISUAL_ROOT / "bathroom-1602.manifest.json"
DEFAULT_SCREENSHOTS = VISUAL_ROOT / "screenshots"


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Zhusheng 1602 bathroom scene.")
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC)
    parser.add_argument("--memory", type=Path, default=DEFAULT_MEMORY)
    parser.add_argument("--blend", type=Path, default=DEFAULT_BLEND)
    parser.add_argument("--glb", type=Path, default=DEFAULT_GLB)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--screenshots", type=Path, default=DEFAULT_SCREENSHOTS)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.resolve().read_text(encoding="utf-8"))


class BathroomSceneBuilder:
    def __init__(self, spec: dict[str, Any], memory: dict[str, Any], args: argparse.Namespace):
        self.spec = spec
        self.memory = memory
        self.args = args
        self.visual = spec["bathroomVisual"]
        self.detail = spec["bathroomDetail"]
        self.identity = memory["identityIndex"]
        self.collections: dict[str, bpy.types.Collection] = {}
        self.layers: dict[str, bpy.types.Object] = {}
        self.materials: dict[str, bpy.types.Material] = {}
        self.semantic_roots: dict[str, bpy.types.Object] = {}
        self.nodes: dict[str, dict[str, Any]] = {}
        self.cameras: dict[str, bpy.types.Object] = {}
        self.state_nodes: dict[str, bpy.types.Object] = {}
        self.anchor_nodes: dict[str, bpy.types.Object] = {}
        self.wall_roots: dict[str, bpy.types.Object] = {}

        focus = spec["focusUnit"]
        room = next(
            item for item in focus["spaces"] if item["businessId"] == self.detail["businessId"]
        )
        self.room = room
        self.width = room["size"]["widthX"]
        self.depth = room["size"]["depthY"]
        self.height = room["size"]["clearHeight"]
        self.room_global_origin = Vector(
            (
                focus["globalOrigin"]["x"] + room["localOrigin"]["x"],
                focus["globalOrigin"]["y"] + room["localOrigin"]["y"],
                focus["globalOrigin"]["z"],
            )
        )

    def build(self) -> None:
        self._reset_scene()
        bpy.context.preferences.filepaths.save_version = 0
        self._configure_scene()
        self._create_collections()
        self._create_materials()
        self._create_hierarchy()
        self._create_architecture()
        self._create_fixtures()
        self._create_systems()
        self._create_waterproofing()
        self._create_visual_states()
        self._create_evidence_anchors()
        self._create_view_controllers()
        self._create_cameras_and_lights()
        self._render_screenshots()
        self._apply_view("VIEW_RESIDENT")
        self._reset_state_nodes()
        self._write_manifest(pre_export=True)
        self.args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(self.args.blend.resolve()))
        self._export_glb()
        self._write_manifest(pre_export=False)
        bpy.ops.wm.save_as_mainfile(filepath=str(self.args.blend.resolve()))

    def _reset_scene(self) -> None:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        for datablocks in (
            bpy.data.meshes,
            bpy.data.curves,
            bpy.data.materials,
            bpy.data.cameras,
            bpy.data.lights,
        ):
            for datablock in list(datablocks):
                if datablock.users == 0:
                    datablocks.remove(datablock)
        for collection in list(bpy.data.collections):
            bpy.data.collections.remove(collection)

    def _configure_scene(self) -> None:
        scene = bpy.context.scene
        scene.name = self.visual["sceneId"]
        scene["sceneId"] = self.visual["sceneId"]
        scene["sourceBuildingId"] = self.visual["sourceBuildingId"]
        scene["sourceSpaceId"] = self.visual["sourceSpaceId"]
        scene["syntheticDemo"] = True
        scene["defaultVisualState"] = "DRY"
        scene["defaultValvePosition"] = "OPEN"
        scene["authorizationGranted"] = False
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.render.resolution_x = self.visual["performance"]["renderWidth"]
        scene.render.resolution_y = self.visual["performance"]["renderHeight"]
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.film_transparent = False
        scene.render.image_settings.color_mode = "RGBA"
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.world.color = (0.025, 0.03, 0.035)
        world = scene.world
        world.use_nodes = True
        background = world.node_tree.nodes.get("Background")
        if background:
            background.inputs["Color"].default_value = (0.025, 0.03, 0.035, 1.0)
            background.inputs["Strength"].default_value = 0.16

    def _create_collections(self) -> None:
        root = bpy.context.scene.collection
        names = [
            "ARCHITECTURE",
            "FIXTURES",
            "SYSTEMS",
            "WATERPROOFING",
            "MOISTURE",
            "MAINTENANCE",
            "EVIDENCE",
            "CAMERAS",
            "LIGHTS",
            "VIEW_RESIDENT",
            "VIEW_DIAGNOSTIC",
            "VIEW_CONSTRUCTION_MEMORY",
            "VIEW_MAINTENANCE",
        ]
        for name in names:
            collection = bpy.data.collections.new(name)
            root.children.link(collection)
            self.collections[name] = collection

    def _create_materials(self) -> None:
        for name, material_spec in self.visual["materials"].items():
            self.materials[name] = self._material(name, material_spec)
        self.materials["MAT-DOOR"] = self._material(
            "MAT-DOOR", {"baseColor": [0.19, 0.16, 0.13, 1.0], "roughness": 0.42, "metallic": 0.05}
        )
        self.materials["MAT-LIGHT"] = self._material(
            "MAT-LIGHT",
            {"baseColor": [1.0, 0.88, 0.68, 1.0], "roughness": 0.2, "metallic": 0.0, "emission": 3.5},
        )

    def _material(self, name: str, spec: dict[str, Any]) -> bpy.types.Material:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        color = tuple(spec["baseColor"])
        material.diffuse_color = color
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = spec.get("roughness", 0.4)
        bsdf.inputs["Metallic"].default_value = spec.get("metallic", 0.0)
        bsdf.inputs["Alpha"].default_value = color[3]
        transmission = spec.get("transmission", 0.0)
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = transmission
        emission = spec.get("emission", 0.0)
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emission
        if color[3] < 1.0 or transmission:
            material.surface_render_method = "DITHERED"
            material.use_transparency_overlap = False
        return material

    @staticmethod
    def _move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
        for current in list(obj.users_collection):
            current.objects.unlink(obj)
        collection.objects.link(obj)

    def _empty(
        self,
        name: str,
        collection: bpy.types.Collection,
        *,
        parent: bpy.types.Object | None = None,
        location: tuple[float, float, float] = (0.0, 0.0, 0.0),
        display_type: str = "PLAIN_AXES",
    ) -> bpy.types.Object:
        obj = bpy.data.objects.new(name, None)
        collection.objects.link(obj)
        obj.parent = parent
        obj.location = location
        obj.empty_display_type = display_type
        obj.empty_display_size = 0.12
        return obj

    def _box(
        self,
        name: str,
        size: tuple[float, float, float],
        location: tuple[float, float, float],
        material: str,
        collection: bpy.types.Collection,
        parent: bpy.types.Object,
        *,
        bevel: float = 0.0,
    ) -> bpy.types.Object:
        bpy.ops.mesh.primitive_cube_add()
        obj = bpy.context.object
        obj.name = name
        obj.parent = parent
        obj.location = location
        obj.dimensions = size
        self._move_to_collection(obj, collection)
        obj.data.materials.append(self.materials[material])
        if bevel > 0:
            modifier = obj.modifiers.new("SoftEdge", "BEVEL")
            modifier.width = bevel
            modifier.segments = 2
        return obj

    def _cylinder(
        self,
        name: str,
        radius: float,
        depth: float,
        location: tuple[float, float, float],
        material: str,
        collection: bpy.types.Collection,
        parent: bpy.types.Object,
        *,
        rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
        vertices: int = 24,
    ) -> bpy.types.Object:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
        obj = bpy.context.object
        obj.name = name
        obj.parent = parent
        obj.location = location
        obj.rotation_euler = rotation
        self._move_to_collection(obj, collection)
        obj.data.materials.append(self.materials[material])
        bevel_modifier = obj.modifiers.new("SoftEdge", "BEVEL")
        bevel_modifier.width = min(radius * 0.18, 0.012)
        bevel_modifier.segments = 2
        return obj

    def _cylinder_between(
        self,
        name: str,
        start: tuple[float, float, float],
        end: tuple[float, float, float],
        radius: float,
        material: str,
        collection: bpy.types.Collection,
        parent: bpy.types.Object,
    ) -> bpy.types.Object:
        start_vector = Vector(start)
        end_vector = Vector(end)
        direction = end_vector - start_vector
        obj = self._cylinder(
            name,
            radius,
            direction.length,
            tuple((start_vector + end_vector) / 2.0),
            material,
            collection,
            parent,
        )
        obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        return obj

    def _sphere(
        self,
        name: str,
        location: tuple[float, float, float],
        scale: tuple[float, float, float],
        material: str,
        collection: bpy.types.Collection,
        parent: bpy.types.Object,
    ) -> bpy.types.Object:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
        obj = bpy.context.object
        obj.name = name
        obj.parent = parent
        obj.location = location
        obj.scale = scale
        self._move_to_collection(obj, collection)
        obj.data.materials.append(self.materials[material])
        return obj

    def _torus(
        self,
        name: str,
        location: tuple[float, float, float],
        major_radius: float,
        minor_radius: float,
        scale: tuple[float, float, float],
        material: str,
        collection: bpy.types.Collection,
        parent: bpy.types.Object,
    ) -> bpy.types.Object:
        bpy.ops.mesh.primitive_torus_add(
            major_radius=major_radius,
            minor_radius=minor_radius,
            major_segments=32,
            minor_segments=8,
        )
        obj = bpy.context.object
        obj.name = name
        obj.parent = parent
        obj.location = location
        obj.scale = scale
        self._move_to_collection(obj, collection)
        obj.data.materials.append(self.materials[material])
        return obj

    def _create_hierarchy(self) -> None:
        self.scene_root = self._empty(
            self.visual["sceneId"],
            self.collections["ARCHITECTURE"],
            location=tuple(self.room_global_origin),
        )
        self.scene_root["syntheticDemo"] = True
        self.scene_root["disclaimer"] = self.spec["meta"]["disclaimerZh"]
        self.space_root = self._semantic_root(
            self.visual["sourceSpaceId"],
            "ARCHITECTURE",
            parent=self.scene_root,
            interactive=True,
            default_visible=True,
            view_layers=list(self.visual["views"]),
        )
        layer_map = {
            "ARCHITECTURE": "ARCHITECTURE",
            "FIXTURES": "FIXTURES",
            "SYSTEMS": "SYSTEMS",
            "WATERPROOFING": "WATERPROOFING",
            "MOISTURE": "MOISTURE",
            "MAINTENANCE": "MAINTENANCE",
            "EVIDENCE": "EVIDENCE",
        }
        for name, collection_name in layer_map.items():
            layer = self._empty(
                f"LAYER-{name}",
                self.collections[collection_name],
                parent=self.space_root,
            )
            layer["layerName"] = name
            self.layers[name] = layer
        self.layers["SYSTEMS"].scale = (0.0, 0.0, 0.0)
        self.layers["WATERPROOFING"].scale = (0.0, 0.0, 0.0)
        self.layers["EVIDENCE"].scale = (0.0, 0.0, 0.0)
        self.layers["MAINTENANCE"].scale = (0.0, 0.0, 0.0)

    def _semantic_root(
        self,
        business_id: str,
        layer: str,
        *,
        parent: bpy.types.Object | None = None,
        interactive: bool,
        default_visible: bool,
        view_layers: list[str],
        allowed_states: list[str] | None = None,
    ) -> bpy.types.Object:
        if business_id in self.semantic_roots:
            raise ValueError(f"Duplicate semantic node: {business_id}")
        record = self.identity[business_id]
        obj = self._empty(
            business_id,
            self.collections[layer],
            parent=parent or self.layers[layer],
        )
        obj["businessId"] = business_id
        obj["ifcGlobalId"] = record["ifcGlobalId"]
        obj["ifcClass"] = record["ifcClass"]
        obj["syntheticDemo"] = True
        self.semantic_roots[business_id] = obj
        self.nodes[business_id] = {
            "nodeName": business_id,
            "businessId": business_id,
            "ifcGlobalId": record["ifcGlobalId"],
            "ifcClass": record["ifcClass"],
            "interactive": interactive,
            "visualOnly": False,
            "defaultVisible": default_visible,
            "viewLayers": view_layers,
            "allowedVisualStates": allowed_states or self.visual["visualStates"]["states"],
        }
        return obj

    def _visual_root(
        self,
        node_name: str,
        layer: str,
        *,
        parent: bpy.types.Object | None = None,
        default_visible: bool = True,
        view_layers: list[str] | None = None,
    ) -> bpy.types.Object:
        obj = self._empty(
            node_name,
            self.collections[layer],
            parent=parent or self.layers[layer],
        )
        obj["visualOnly"] = True
        obj["interactive"] = False
        self.nodes[node_name] = {
            "nodeName": node_name,
            "businessId": None,
            "ifcGlobalId": None,
            "ifcClass": "VisualObject",
            "interactive": False,
            "visualOnly": True,
            "defaultVisible": default_visible,
            "viewLayers": view_layers or list(self.visual["views"]),
            "allowedVisualStates": self.visual["visualStates"]["states"],
        }
        return obj

    def _create_architecture(self) -> None:
        collection = self.collections["ARCHITECTURE"]
        layer = self.layers["ARCHITECTURE"]
        wall_thickness = self.spec["construction"]["internalWallThickness"]
        door_width = self.spec["construction"]["bathroomDoorWidth"]
        door_height = self.spec["construction"]["defaultDoorHeight"]
        door_start = (self.width - door_width) / 2.0

        wall_specs = {
            "WALL-1602-BATHROOM-WEST": ((wall_thickness, self.depth, self.height), (-wall_thickness / 2.0, self.depth / 2.0, self.height / 2.0)),
            "WALL-1602-BATHROOM-EAST": ((wall_thickness, self.depth, self.height), (self.width + wall_thickness / 2.0, self.depth / 2.0, self.height / 2.0)),
            "WALL-1602-BATHROOM-NORTH": ((self.width, wall_thickness, self.height), (self.width / 2.0, self.depth + wall_thickness / 2.0, self.height / 2.0)),
            "WALL-1602-BATHROOM-SOUTH-WEST": ((door_start, wall_thickness, self.height), (door_start / 2.0, -wall_thickness / 2.0, self.height / 2.0)),
            "WALL-1602-BATHROOM-SOUTH-EAST": ((self.width - door_start - door_width, wall_thickness, self.height), (door_start + door_width + (self.width - door_start - door_width) / 2.0, -wall_thickness / 2.0, self.height / 2.0)),
        }
        for business_id, (size, location) in wall_specs.items():
            root = self._semantic_root(
                business_id,
                "ARCHITECTURE",
                parent=layer,
                interactive=False,
                default_visible=True,
                view_layers=list(self.visual["views"]),
            )
            self.wall_roots[business_id] = root
            self._box(
                f"MESH-{business_id}",
                size,
                location,
                "MAT-TILE-WALL",
                collection,
                root,
                bevel=0.008,
            )

        slab_root = self._semantic_root(
            self.detail["structuralSlabBusinessId"],
            "ARCHITECTURE",
            parent=layer,
            interactive=False,
            default_visible=True,
            view_layers=list(self.visual["views"]),
        )
        slab_thickness = self.spec["construction"]["structuralSlabThickness"]
        self._box(
            "MESH-SLAB-1602-BATHROOM",
            (self.width + 2 * wall_thickness, self.depth + 2 * wall_thickness, slab_thickness),
            (self.width / 2.0, self.depth / 2.0, -slab_thickness / 2.0),
            "MAT-GROUT",
            collection,
            slab_root,
        )

        floor_root = self._visual_root("VIS-FLOOR-TILES", "ARCHITECTURE", parent=layer)
        finish = self.visual["roomFinish"]
        floor_thickness = finish["floorFinishThickness"]
        self._box(
            "MESH-VIS-FLOOR-TILES",
            (self.width, self.depth, floor_thickness),
            (self.width / 2.0, self.depth / 2.0, floor_thickness / 2.0),
            "MAT-TILE-FLOOR",
            collection,
            floor_root,
            bevel=0.006,
        )
        tile = finish["tileModule"]
        grout = finish["groutWidth"]
        for index in range(1, int(self.width / tile)):
            self._box(
                f"VIS-GROUT-X-{index:02d}",
                (grout, self.depth, 0.004),
                (index * tile, self.depth / 2.0, floor_thickness + 0.002),
                "MAT-GROUT",
                collection,
                floor_root,
            )
        for index in range(1, int(self.depth / tile)):
            self._box(
                f"VIS-GROUT-Y-{index:02d}",
                (self.width, grout, 0.004),
                (self.width / 2.0, index * tile, floor_thickness + 0.002),
                "MAT-GROUT",
                collection,
                floor_root,
            )

        door_root = self._semantic_root(
            "DOOR-1602-BATHROOM",
            "ARCHITECTURE",
            parent=layer,
            interactive=True,
            default_visible=True,
            view_layers=list(self.visual["views"]),
        )
        self._box(
            "MESH-DOOR-1602-BATHROOM",
            (0.045, door_width, door_height),
            (door_start + 0.025, -door_width / 2.0 + 0.02, door_height / 2.0),
            "MAT-DOOR",
            collection,
            door_root,
            bevel=0.015,
        )
        frame_root = self._visual_root("VIS-DOOR-FRAME", "ARCHITECTURE", parent=door_root)
        for suffix, size, location in (
            ("L", (0.05, 0.08, door_height + 0.08), (door_start - 0.025, 0.0, (door_height + 0.08) / 2.0)),
            ("R", (0.05, 0.08, door_height + 0.08), (door_start + door_width + 0.025, 0.0, (door_height + 0.08) / 2.0)),
            ("T", (door_width + 0.1, 0.08, 0.05), (door_start + door_width / 2.0, 0.0, door_height + 0.055)),
        ):
            self._box(f"VIS-DOOR-FRAME-{suffix}", size, location, "MAT-METAL", collection, frame_root, bevel=0.008)

        threshold = self._visual_root("VIS-WET-ZONE-THRESHOLD", "ARCHITECTURE", parent=layer)
        self._box(
            "MESH-VIS-WET-ZONE-THRESHOLD",
            (0.055, self.depth - 0.18, 0.028),
            (finish["wetZoneBoundaryX"], self.depth / 2.0 + 0.06, floor_thickness + 0.014),
            "MAT-METAL",
            collection,
            threshold,
            bevel=0.006,
        )

        ceiling = self._visual_root("VIS-CEILING-01", "ARCHITECTURE", parent=layer)
        self._box(
            "MESH-VIS-CEILING-01",
            (self.width, self.depth, finish["ceilingThickness"]),
            (self.width / 2.0, self.depth / 2.0, finish["ceilingElevation"]),
            "MAT-TILE-WALL",
            collection,
            ceiling,
            bevel=0.01,
        )

        mirror = self._visual_root("VIS-MIRROR-CABINET-01", "ARCHITECTURE", parent=layer)
        self._box(
            "MESH-VIS-MIRROR-CABINET-01",
            (0.7, 0.035, 0.78),
            (0.54, 0.035, 1.56),
            "MAT-MIRROR",
            collection,
            mirror,
            bevel=0.012,
        )

    def _create_fixtures(self) -> None:
        collection = self.collections["FIXTURES"]
        layer = self.layers["FIXTURES"]
        views = list(self.visual["views"])

        wc = self._semantic_root("FIXTURE-1602-WC-01", "FIXTURES", parent=layer, interactive=True, default_visible=True, view_layers=views)
        self._box("MESH-WC-PEDESTAL", (0.34, 0.42, 0.38), (1.93, 0.45, 0.21), "MAT-PORCELAIN", collection, wc, bevel=0.08)
        self._sphere("MESH-WC-BOWL", (1.93, 0.5, 0.48), (0.29, 0.38, 0.16), "MAT-PORCELAIN", collection, wc)
        self._torus("MESH-WC-SEAT", (1.93, 0.5, 0.61), 0.22, 0.035, (1.0, 1.35, 1.0), "MAT-PORCELAIN", collection, wc)
        self._box("MESH-WC-CISTERN", (0.48, 0.2, 0.48), (1.93, 0.75, 0.52), "MAT-PORCELAIN", collection, wc, bevel=0.05)

        basin = self._semantic_root("FIXTURE-1602-BASIN-01", "FIXTURES", parent=layer, interactive=True, default_visible=True, view_layers=views)
        self._box("MESH-BASIN-VANITY", (0.68, 0.42, 0.66), (0.54, 0.34, 0.35), "MAT-VANITY", collection, basin, bevel=0.025)
        self._box("MESH-BASIN-TOP", (0.74, 0.48, 0.1), (0.54, 0.36, 0.72), "MAT-PORCELAIN", collection, basin, bevel=0.055)
        self._sphere("MESH-BASIN-BOWL", (0.54, 0.37, 0.76), (0.25, 0.15, 0.055), "MAT-GROUT", collection, basin)
        self._cylinder("MESH-BASIN-FAUCET", 0.025, 0.22, (0.54, 0.54, 0.9), "MAT-METAL", collection, basin)
        self._cylinder_between("MESH-BASIN-FAUCET-SPOUT", (0.54, 0.54, 0.99), (0.54, 0.41, 0.99), 0.022, "MAT-METAL", collection, basin)

        shower = self._semantic_root("FIXTURE-1602-SHOWER-01", "FIXTURES", parent=layer, interactive=True, default_visible=True, view_layers=views)
        self._cylinder("MESH-SHOWER-RAIL", 0.025, 1.75, (2.28, 1.3, 1.15), "MAT-METAL", collection, shower)
        self._cylinder_between("MESH-SHOWER-ARM", (2.28, 1.3, 2.0), (2.02, 1.3, 2.0), 0.022, "MAT-METAL", collection, shower)
        self._cylinder("MESH-SHOWER-HEAD", 0.12, 0.035, (1.98, 1.3, 1.98), "MAT-METAL", collection, shower, rotation=(0.0, math.pi / 2.0, 0.0))
        self._cylinder("MESH-SHOWER-MIXER", 0.07, 0.22, (2.28, 1.3, 0.92), "MAT-METAL", collection, shower, rotation=(0.0, math.pi / 2.0, 0.0))

        drain = self._semantic_root("DRAIN-1602-FLOOR-01", "FIXTURES", parent=layer, interactive=True, default_visible=True, view_layers=views)
        self._box("MESH-DRAIN-FRAME", (0.16, 0.16, 0.02), (2.02, 1.44, 0.05), "MAT-METAL", collection, drain, bevel=0.01)
        for index in range(4):
            self._box(f"MESH-DRAIN-SLOT-{index:02d}", (0.018, 0.12, 0.008), (1.97 + index * 0.035, 1.44, 0.064), "MAT-GROUT", collection, drain)

        partition = self._semantic_root("PARTITION-1602-SHOWER-01", "FIXTURES", parent=layer, interactive=True, default_visible=True, view_layers=views)
        self._box("MESH-SHOWER-GLASS", (0.035, 0.6, 1.9), (1.5175, 1.16, 1.02), "MAT-GLASS", collection, partition, bevel=0.006)
        for y in (0.86, 1.46):
            self._cylinder("MESH-SHOWER-POST-%.2f" % y, 0.018, 1.95, (1.5175, y, 1.025), "MAT-METAL", collection, partition)

    def _component_spec(self, business_id: str) -> dict[str, Any]:
        return next(item for item in self.detail["components"] if item["businessId"] == business_id)

    def _create_systems(self) -> None:
        collection = self.collections["SYSTEMS"]
        layer = self.layers["SYSTEMS"]
        diagnostic_views = ["VIEW_DIAGNOSTIC", "VIEW_CONSTRUCTION_MEMORY", "VIEW_MAINTENANCE"]

        for business_id in ("PIPE-1602-CW-01", "PIPE-1602-CW-02", "PIPE-1602-HW-01"):
            spec = self._component_spec(business_id)
            root = self._semantic_root(business_id, "SYSTEMS", parent=layer, interactive=True, default_visible=False, view_layers=diagnostic_views)
            origin = spec["geometry"]["localOrigin"]
            size = spec["geometry"]["size"]
            centre_y = origin["y"] + size["y"] / 2.0
            centre_z = origin["z"] + size["z"] / 2.0
            material = "MAT-HOT-WATER" if "HW" in business_id else "MAT-COLD-WATER"
            self._cylinder_between(
                f"MESH-{business_id}",
                (origin["x"], centre_y, centre_z),
                (origin["x"] + size["x"], centre_y, centre_z),
                max(size["y"], size["z"]) / 2.0,
                material,
                collection,
                root,
            )

        meter_spec = self._component_spec("METER-1602-FLOW-01")
        meter = self._semantic_root("METER-1602-FLOW-01", "SYSTEMS", parent=layer, interactive=True, default_visible=False, view_layers=diagnostic_views)
        mo = meter_spec["geometry"]["localOrigin"]
        ms = meter_spec["geometry"]["size"]
        centre = (mo["x"] + ms["x"] / 2.0, mo["y"] + ms["y"] / 2.0, mo["z"] + ms["z"] / 2.0)
        self._cylinder("MESH-METER-BODY", 0.075, ms["x"], centre, "MAT-METAL", collection, meter, rotation=(0.0, math.pi / 2.0, 0.0))
        self._cylinder("MESH-METER-DIAL", 0.055, 0.025, (centre[0], centre[1] - 0.065, centre[2] + 0.035), "MAT-LIGHT", collection, meter, rotation=(math.pi / 2.0, 0.0, 0.0))

        valve_spec = self._component_spec("VALVE-1602-CW-01")
        valve = self._semantic_root("VALVE-1602-CW-01", "SYSTEMS", parent=layer, interactive=True, default_visible=False, view_layers=diagnostic_views, allowed_states=["OPEN", "CLOSED"])
        vo = valve_spec["geometry"]["localOrigin"]
        vs = valve_spec["geometry"]["size"]
        valve_centre = (vo["x"] + vs["x"] / 2.0, vo["y"] + vs["y"] / 2.0, vo["z"] + vs["z"] / 2.0)
        self._sphere("MESH-VALVE-BODY", valve_centre, (0.09, 0.07, 0.07), "MAT-VALVE", collection, valve)
        handle = self._box("MESH-VALVE-1602-CW-01-HANDLE", (0.2, 0.035, 0.035), (valve_centre[0], valve_centre[1], valve_centre[2] + 0.1), "MAT-VALVE", collection, valve, bevel=0.008)
        valve["valvePosition"] = "OPEN"
        valve["authorizationRequired"] = True
        valve["authorizationState"] = "NOT_REQUESTED"
        valve["valveClosed"] = 0.0
        driver = handle.driver_add("rotation_euler", 2).driver
        variable = driver.variables.new()
        variable.name = "closed"
        variable.type = "SINGLE_PROP"
        variable.targets[0].id = valve
        variable.targets[0].data_path = '["valveClosed"]'
        driver.expression = "1.57079632679 * closed"
        self.valve_handle = handle

        fitting_spec = self._component_spec("J-1602-CW-03")
        fitting = self._semantic_root("J-1602-CW-03", "SYSTEMS", parent=layer, interactive=True, default_visible=False, view_layers=diagnostic_views)
        fo = fitting_spec["geometry"]["localOrigin"]
        fs = fitting_spec["geometry"]["size"]
        fitting_centre = (fo["x"] + fs["x"] / 2.0, fo["y"] + fs["y"] / 2.0, fo["z"] + fs["z"] / 2.0)
        self._cylinder("MESH-J-1602-CW-03", 0.075, fs["x"], fitting_centre, "MAT-JOINT", collection, fitting, rotation=(0.0, math.pi / 2.0, 0.0))
        self._torus("MESH-JOINT-HIGHLIGHT-RING", fitting_centre, 0.11, 0.012, (1.0, 1.0, 1.0), "MAT-JOINT", collection, fitting)

        sensor_spec = self._component_spec("SENSOR-1602-HUM-01")
        sensor = self._semantic_root("SENSOR-1602-HUM-01", "SYSTEMS", parent=layer, interactive=True, default_visible=False, view_layers=diagnostic_views)
        so = sensor_spec["geometry"]["localOrigin"]
        ss = sensor_spec["geometry"]["size"]
        self._box("MESH-SENSOR-1602-HUM-01", (ss["x"], ss["y"], ss["z"]), (so["x"] + ss["x"] / 2.0, so["y"] + ss["y"] / 2.0, so["z"] + ss["z"] / 2.0), "MAT-SENSOR", collection, sensor, bevel=0.025)
        self._box("MESH-SENSOR-INDICATOR", (0.07, 0.012, 0.018), (so["x"] + ss["x"] / 2.0, so["y"] - 0.002, so["z"] + 0.14), "MAT-LIGHT", collection, sensor, bevel=0.004)

    def _create_waterproofing(self) -> None:
        collection = self.collections["WATERPROOFING"]
        layer = self.layers["WATERPROOFING"]
        root = self._semantic_root("WP-1602-BATHROOM", "WATERPROOFING", parent=layer, interactive=True, default_visible=False, view_layers=["VIEW_CONSTRUCTION_MEMORY"])
        display = self.detail["waterproofing"]["displayThickness"]
        upturn = self.detail["waterproofing"]["wallUpturnHeight"]
        self._box("MESH-WP-FLOOR", (self.width, self.depth, display), (self.width / 2.0, self.depth / 2.0, display / 2.0 + 0.04), "MAT-WATERPROOF", collection, root)
        for suffix, size, location in (
            ("WEST", (display, self.depth, upturn), (display / 2.0, self.depth / 2.0, upturn / 2.0)),
            ("EAST", (display, self.depth, upturn), (self.width - display / 2.0, self.depth / 2.0, upturn / 2.0)),
            ("NORTH", (self.width, display, upturn), (self.width / 2.0, self.depth - display / 2.0, upturn / 2.0)),
        ):
            self._box(f"MESH-WP-{suffix}", size, location, "MAT-WATERPROOF", collection, root)

    def _create_visual_states(self) -> None:
        moisture_collection = self.collections["MOISTURE"]
        moisture_layer = self.layers["MOISTURE"]
        state_specs = {
            "DAMP_LIGHT": ((0.34, 0.018, 0.42), (1.36, self.depth - 0.012, 1.06), "MAT-DAMP-LIGHT"),
            "DAMP_MODERATE": ((0.54, 0.02, 0.68), (1.36, self.depth - 0.01, 0.94), "MAT-DAMP-MODERATE"),
            "DAMP_SEVERE": ((0.78, 0.022, 0.96), (1.36, self.depth - 0.008, 0.82), "MAT-DAMP-SEVERE"),
        }
        for state, (size, location, material) in state_specs.items():
            root = self._visual_root(f"STATE-{state}", "MOISTURE", parent=moisture_layer, default_visible=False, view_layers=["VIEW_DIAGNOSTIC", "VIEW_MAINTENANCE"])
            self._box(f"MESH-STATE-{state}", size, location, material, moisture_collection, root, bevel=0.05)
            root.scale = (0.0, 0.0, 0.0)
            self.state_nodes[state] = root

        maintenance_collection = self.collections["MAINTENANCE"]
        maintenance_layer = self.layers["MAINTENANCE"]
        repair_open = self._visual_root("STATE-REPAIR-OPEN", "MAINTENANCE", parent=maintenance_layer, default_visible=False, view_layers=["VIEW_MAINTENANCE"])
        self._box("MESH-STATE-REPAIR-OPEN", (0.62, 0.08, 0.72), (1.36, self.depth - 0.015, 1.08), "MAT-REPAIR", maintenance_collection, repair_open, bevel=0.02)
        repair_open.scale = (0.0, 0.0, 0.0)
        self.state_nodes["REPAIR_OPEN"] = repair_open

        repaired = self._visual_root("STATE-REPAIRED", "MAINTENANCE", parent=maintenance_layer, default_visible=False, view_layers=["VIEW_MAINTENANCE"])
        self._box("MESH-STATE-REPAIRED", (0.64, 0.035, 0.74), (1.36, self.depth - 0.025, 1.08), "MAT-TILE-WALL", maintenance_collection, repaired, bevel=0.015)
        repaired.scale = (0.0, 0.0, 0.0)
        self.state_nodes["REPAIRED"] = repaired

        dry = self._empty("STATE-DRY", moisture_collection, parent=moisture_layer)
        dry["neutralState"] = True
        self.state_nodes["DRY"] = dry

    def _create_evidence_anchors(self) -> None:
        collection = self.collections["EVIDENCE"]
        layer = self.layers["EVIDENCE"]
        for anchor_spec in self.visual["evidenceAnchors"]:
            anchor_id = anchor_spec["businessId"]
            anchor = self._empty(anchor_id, collection, parent=layer, location=tuple(anchor_spec["localPosition"]), display_type="SPHERE")
            anchor["visualOnly"] = True
            anchor["evidenceContentCreated"] = False
            anchor["relatedBusinessIds"] = json.dumps(anchor_spec["relatedBusinessIds"])
            self._sphere(f"VIS-{anchor_id}-MARKER", tuple(anchor_spec["localPosition"]), (0.045, 0.045, 0.045), "MAT-EVIDENCE", collection, layer)
            self.anchor_nodes[anchor_id] = anchor
            self.nodes[anchor_id] = {
                "nodeName": anchor_id,
                "businessId": anchor_id,
                "ifcGlobalId": None,
                "ifcClass": "VisualEvidenceAnchor",
                "interactive": True,
                "visualOnly": True,
                "defaultVisible": False,
                "viewLayers": ["VIEW_CONSTRUCTION_MEMORY"],
                "allowedVisualStates": self.visual["visualStates"]["states"],
            }

    def _create_view_controllers(self) -> None:
        for view_name, view_spec in self.visual["views"].items():
            controller = self._empty(
                f"{view_name}-CONTROLLER",
                self.collections[view_name],
            )
            controller["viewName"] = view_name
            controller["camera"] = view_spec["camera"]
            controller["visibleLayers"] = json.dumps(view_spec["visibleLayers"])
            controller["hiddenLayers"] = json.dumps(view_spec["hiddenLayers"])
            controller["hiddenNodes"] = json.dumps(view_spec["hiddenNodes"])

    def _camera(self, name: str, offset: tuple[float, float, float], target_local: tuple[float, float, float], lens: float) -> bpy.types.Object:
        data = bpy.data.cameras.new(name)
        data.lens = lens
        data.sensor_width = 36.0
        data.clip_start = 0.03
        data.clip_end = 250.0
        camera = bpy.data.objects.new(name, data)
        self.collections["CAMERAS"].objects.link(camera)
        camera.location = self.room_global_origin + Vector(offset)
        target = self.room_global_origin + Vector(target_local)
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera["preset"] = name
        self.cameras[name] = camera
        return camera

    def _create_cameras_and_lights(self) -> None:
        self._camera("CAM_RESIDENT_OVERVIEW", (3.55, -3.9, 3.15), (1.18, 0.9, 1.05), 46.0)
        self._camera("CAM_DIAGNOSTIC_CUTAWAY", (3.4, -3.05, 2.75), (1.2, 1.25, 1.15), 52.0)
        self._camera("CAM_JOINT_CLOSEUP", (2.1, -2.25, 1.65), (0.95, 1.56, 1.14), 54.0)
        self._camera("CAM_CONSTRUCTION_MEMORY", (3.5, -3.45, 3.45), (1.18, 1.0, 0.95), 48.0)

        lights = [
            ("LIGHT-CEILING-KEY", "AREA", (1.2, 0.9, 2.58), 320.0, 1.8),
            ("LIGHT-FILL-SOUTH", "AREA", (1.2, -1.8, 2.1), 220.0, 2.4),
            ("LIGHT-RIM-NORTH", "AREA", (1.2, 2.5, 2.2), 160.0, 1.5),
        ]
        for name, light_type, local_position, energy, size in lights:
            data = bpy.data.lights.new(name, light_type)
            data.energy = energy
            data.color = (1.0, 0.9, 0.78)
            data.shape = "DISK"
            data.size = size
            obj = bpy.data.objects.new(name, data)
            self.collections["LIGHTS"].objects.link(obj)
            obj.location = self.room_global_origin + Vector(local_position)
            target = self.room_global_origin + Vector((1.2, 0.9, 0.7))
            obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()

        light_visual = self._visual_root("VIS-CEILING-LIGHT-01", "ARCHITECTURE", parent=self.layers["ARCHITECTURE"])
        self._cylinder("MESH-VIS-CEILING-LIGHT-01", 0.24, 0.035, (1.2, 0.9, 2.67), "MAT-LIGHT", self.collections["ARCHITECTURE"], light_visual)

    @staticmethod
    def _set_recursive_render(root: bpy.types.Object, hidden: bool) -> None:
        root.hide_render = hidden
        for child in root.children_recursive:
            child.hide_render = hidden

    def _apply_view(self, view_name: str) -> None:
        view = self.visual["views"][view_name]
        visible = set(view["visibleLayers"])
        for layer_name, layer in self.layers.items():
            layer.scale = (1.0, 1.0, 1.0) if layer_name in visible or layer_name == "MOISTURE" else (0.0, 0.0, 0.0)
        for semantic_root in self.semantic_roots.values():
            self._set_recursive_render(semantic_root, False)
        for node_name in view["hiddenNodes"]:
            if node_name in self.semantic_roots:
                self._set_recursive_render(self.semantic_roots[node_name], True)
        self._reset_state_nodes()
        self.scene_root["activeView"] = view_name
        bpy.context.scene.camera = self.cameras[view["camera"]]

    def _reset_state_nodes(self) -> None:
        for name, node in self.state_nodes.items():
            node.scale = (1.0, 1.0, 1.0) if name == "DRY" else (0.0, 0.0, 0.0)
        valve = self.semantic_roots.get("VALVE-1602-CW-01")
        if valve:
            valve["valveClosed"] = 0.0
            valve["valvePosition"] = "OPEN"

    def _watermark(self, camera: bpy.types.Object) -> bpy.types.Object:
        curve = bpy.data.curves.new("WATERMARK-DATA", "FONT")
        curve.body = "SYNTHETIC DEMONSTRATION MODEL  /  NOT FOR CONSTRUCTION"
        curve.align_x = "LEFT"
        curve.size = 0.035
        curve.extrude = 0.0
        text = bpy.data.objects.new("WATERMARK", curve)
        self.collections["CAMERAS"].objects.link(text)
        text.parent = camera
        text.location = (-0.82, -0.44, -1.0)
        text.rotation_euler = (0.0, 0.0, 0.0)
        text.data.materials.append(self.materials["MAT-LIGHT"])
        return text

    def _render(self, view_name: str, camera_name: str, filename: str) -> None:
        self._apply_view(view_name)
        camera = self.cameras[camera_name]
        bpy.context.scene.camera = camera
        watermark = self._watermark(camera)
        self.args.screenshots.mkdir(parents=True, exist_ok=True)
        bpy.context.scene.render.filepath = str((self.args.screenshots / filename).resolve())
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(watermark, do_unlink=True)

    def _render_screenshots(self) -> None:
        self._render("VIEW_RESIDENT", "CAM_RESIDENT_OVERVIEW", "01-resident-overview.png")
        self._render("VIEW_DIAGNOSTIC", "CAM_DIAGNOSTIC_CUTAWAY", "02-diagnostic-cutaway.png")
        self._render("VIEW_DIAGNOSTIC", "CAM_JOINT_CLOSEUP", "03-joint-valve-closeup.png")
        self._render("VIEW_CONSTRUCTION_MEMORY", "CAM_CONSTRUCTION_MEMORY", "04-construction-memory.png")

    @staticmethod
    def _mesh_triangle_count() -> int:
        triangles = 0
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
        return triangles

    def _manifest_payload(self) -> dict[str, Any]:
        state_names = self.visual["visualStates"]["states"]
        moisture_nodes = {
            state: f"STATE-{state}"
            for state in ("DAMP_LIGHT", "DAMP_MODERATE", "DAMP_SEVERE")
        }
        state_bindings = {
            "DRY": {"visibleNodes": [], "hiddenNodes": list(moisture_nodes.values()) + ["STATE-REPAIR-OPEN", "STATE-REPAIRED"]},
            "DAMP_LIGHT": {"visibleNodes": ["STATE-DAMP_LIGHT"], "hiddenNodes": ["STATE-DAMP_MODERATE", "STATE-DAMP_SEVERE"]},
            "DAMP_MODERATE": {"visibleNodes": ["STATE-DAMP_MODERATE"], "hiddenNodes": ["STATE-DAMP_LIGHT", "STATE-DAMP_SEVERE"]},
            "DAMP_SEVERE": {"visibleNodes": ["STATE-DAMP_SEVERE"], "hiddenNodes": ["STATE-DAMP_LIGHT", "STATE-DAMP_MODERATE"]},
            "REPAIR_OPEN": {"visibleNodes": ["STATE-REPAIR-OPEN"], "hiddenNodes": ["STATE-REPAIRED"]},
            "REPAIRED": {"visibleNodes": ["STATE-REPAIRED"], "hiddenNodes": ["STATE-REPAIR-OPEN"]},
        }
        anchors = {
            item["businessId"]: {
                "nodeName": item["businessId"],
                "localPosition": item["localPosition"],
                "globalPosition": [
                    self.room_global_origin[index] + item["localPosition"][index]
                    for index in range(3)
                ],
                "relatedBusinessIds": item["relatedBusinessIds"],
                "evidenceContentCreated": False,
            }
            for item in self.visual["evidenceAnchors"]
        }
        return {
            "sceneId": self.visual["sceneId"],
            "sourceBuildingId": self.visual["sourceBuildingId"],
            "sourceStoreyId": self.visual["sourceStoreyId"],
            "sourceUnitId": self.visual["sourceUnitId"],
            "sourceSpaceId": self.visual["sourceSpaceId"],
            "sourceIfc": "../output/ZS-DEMO-001.ifc",
            "sourceSpec": "../building-spec.json",
            "sourceMemory": "../data/building-memory.seed.json",
            "ifcSchema": self.spec["meta"]["ifcSchema"],
            "syntheticDemo": True,
            "disclaimer": self.spec["meta"]["disclaimerZh"],
            "coordinateSystem": {
                "mode": self.visual["coordinateMode"],
                "roomGlobalOrigin": list(self.room_global_origin),
                "roomSize": [self.width, self.depth, self.height],
                "axes": {"x": "east", "y": "north", "z": "up"},
            },
            "nodes": dict(sorted(self.nodes.items())),
            "views": self.visual["views"],
            "visualStates": {
                "states": state_names,
                "defaultState": self.visual["visualStates"]["defaultState"],
                "stateBindings": state_bindings,
                "moistureLevel": self.visual["visualStates"]["moistureLevel"],
                "valvePosition": {
                    **self.visual["visualStates"]["valvePosition"],
                    "nodeName": "MESH-VALVE-1602-CW-01-HANDLE",
                    "transforms": {
                        "OPEN": {"rotationEuler": [0.0, 0.0, 0.0]},
                        "CLOSED": {"rotationEuler": [0.0, 0.0, math.pi / 2.0]},
                    },
                    "doesNotGrantAuthorization": True,
                },
                "repairState": self.visual["visualStates"]["repairState"],
                "neutralVisualOnly": True,
                "containsDiagnosticConclusion": False,
            },
            "evidenceAnchors": anchors,
            "materials": self.visual["materials"],
            "performance": {
                "triangleCount": self._mesh_triangle_count(),
                "maxTriangles": self.visual["performance"]["maxTriangles"],
                "glbBytes": self.args.glb.stat().st_size if self.args.glb.exists() else None,
                "maxGlbBytes": self.visual["performance"]["maxGlbBytes"],
                "externalTextures": 0,
            },
        }

    def _write_manifest(self, *, pre_export: bool) -> None:
        payload = self._manifest_payload()
        if pre_export:
            payload["performance"]["glbBytes"] = None
        self.args.manifest.parent.mkdir(parents=True, exist_ok=True)
        self.args.manifest.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def _export_glb(self) -> None:
        self.args.glb.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(self.args.glb.resolve()),
            export_format="GLB",
            use_selection=False,
            export_cameras=True,
            export_lights=True,
            export_extras=True,
            export_apply=True,
            export_yup=True,
            export_materials="EXPORT",
        )


def main() -> int:
    args = script_arguments()
    for path in (args.spec, args.memory):
        if not path.resolve().exists():
            raise FileNotFoundError(path.resolve())
    builder = BathroomSceneBuilder(read_json(args.spec), read_json(args.memory), args)
    builder.build()
    manifest = read_json(args.manifest)
    print(
        "BATHROOM_SCENE_BUILT",
        args.blend.resolve(),
        args.glb.resolve(),
        f"triangles={manifest['performance']['triangleCount']}",
        f"glbBytes={manifest['performance']['glbBytes']}",
    )
    return 0


if __name__ == "__main__":
    try:
        exit_code = main()
    except Exception:
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    raise SystemExit(exit_code)
