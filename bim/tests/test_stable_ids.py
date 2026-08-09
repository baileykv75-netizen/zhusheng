from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell


BIM_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BIM_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from generate_ifc import generate_ifc_file, load_spec, stable_global_id  # noqa: E402
from validate_ifc import collect_identity_map  # noqa: E402


def test_global_ids_are_stable_across_regeneration(tmp_path: Path) -> None:
    first = tmp_path / "first.ifc"
    second = tmp_path / "second.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", first)
    generate_ifc_file(BIM_ROOT / "building-spec.json", second)
    first_map = collect_identity_map(ifcopenshell.open(str(first)))
    second_map = collect_identity_map(ifcopenshell.open(str(second)))
    assert first_map == second_map
    assert len(first_map) == len(set(first_map.values()))


def test_guid_derivation_is_order_independent() -> None:
    seed = load_spec()["identity"]["globalIdSeedNamespace"]
    business_ids = ["UNIT-1602", "SPACE-1602-BATHROOM", "SLAB-1602-BATHROOM"]
    forward = {item: stable_global_id(item, seed) for item in business_ids}
    reverse = {item: stable_global_id(item, seed) for item in reversed(business_ids)}
    assert forward == reverse


def test_every_business_object_uses_the_deterministic_guid_rule(tmp_path: Path) -> None:
    output = tmp_path / "deterministic.ifc"
    generate_ifc_file(BIM_ROOT / "building-spec.json", output)
    model = ifcopenshell.open(str(output))
    identity_map = collect_identity_map(model)
    seed = load_spec()["identity"]["globalIdSeedNamespace"]
    assert identity_map
    for item_id, global_id in identity_map.items():
        assert global_id == stable_global_id(item_id, seed)

    for relation in model.by_type("IfcRelConnectsPorts"):
        assert relation.Name
        assert relation.GlobalId == stable_global_id(relation.Name, seed)
