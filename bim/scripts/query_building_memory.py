from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path
from typing import Any

from generate_memory_seed import DEFAULT_MEMORY_OUTPUT


COMMANDS = ("component", "upstream-valve", "trace-space", "related-evidence")


def load_memory(path: Path | str = DEFAULT_MEMORY_OUTPUT) -> dict[str, Any]:
    with Path(path).resolve().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def component_index(memory: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["businessId"]: item for item in memory["components"]}


def get_component(memory: dict[str, Any], component_id: str) -> dict[str, Any]:
    component = component_index(memory).get(component_id)
    if component is None:
        raise KeyError(f"Unknown component BusinessId: {component_id}")
    return component


def find_upstream_components(
    memory: dict[str, Any],
    component_id: str,
    ifc_class: str,
) -> list[dict[str, Any]]:
    components = component_index(memory)
    if component_id not in components:
        raise KeyError(f"Unknown component BusinessId: {component_id}")
    queue = deque(components[component_id]["upstreamIds"])
    visited: set[str] = set()
    matches: list[dict[str, Any]] = []
    while queue:
        current_id = queue.popleft()
        if current_id in visited:
            continue
        visited.add(current_id)
        current = components.get(current_id)
        if current is None:
            raise ValueError(f"Broken topology: missing upstream component {current_id}")
        if current["ifcClass"] == ifc_class:
            matches.append(current)
        queue.extend(current["upstreamIds"])
    return sorted(matches, key=lambda item: item["businessId"])


def find_upstream_valves(memory: dict[str, Any], component_id: str) -> list[dict[str, Any]]:
    return find_upstream_components(memory, component_id, "IfcValve")


def run_query(memory: dict[str, Any], command: str, component_id: str) -> dict[str, Any]:
    component = get_component(memory, component_id)
    if command == "component":
        valves = find_upstream_valves(memory, component_id)
        meters = find_upstream_components(memory, component_id, "IfcFlowMeter")
        sensors = sorted(
            (
                item
                for item in memory["components"]
                if item["ifcClass"] == "IfcSensor"
                and item["spaceId"] == component["spaceId"]
            ),
            key=lambda item: item["businessId"],
        )
        return {
            **component,
            "isolationValveIds": [item["businessId"] for item in valves],
            "relatedMeterIds": [item["businessId"] for item in meters],
            "relatedSensorIds": [item["businessId"] for item in sensors],
            "isolationRequiresHumanAuthorization": any(
                item["humanAuthorizationRequired"] for item in valves
            ),
        }
    if command == "upstream-valve":
        valves = find_upstream_valves(memory, component_id)
        return {
            "componentId": component_id,
            "upstreamValveIds": [item["businessId"] for item in valves],
            "valves": [
                {
                    "businessId": item["businessId"],
                    "humanAuthorizationRequired": item["humanAuthorizationRequired"],
                }
                for item in valves
            ],
        }
    if command == "trace-space":
        return {
            "componentId": component_id,
            "spaceId": component["spaceId"],
            "unitId": component["unitId"],
            "storeyId": component["storeyId"],
            "buildingId": component["buildingId"],
        }
    if command == "related-evidence":
        return {
            "componentId": component_id,
            "evidenceTypes": component["evidenceTypes"],
            "lifecycleStatus": component["lifecycleStatus"],
        }
    raise ValueError(f"Unsupported query command: {command}")


def format_text(command: str, result: dict[str, Any]) -> str:
    if command == "upstream-valve":
        return "\n".join(result["upstreamValveIds"]) or "No upstream valve found"
    if command == "trace-space":
        return " -> ".join(
            result[key] for key in ("buildingId", "storeyId", "unitId", "spaceId")
        )
    if command == "related-evidence":
        return "\n".join(result["evidenceTypes"])
    return json.dumps(result, ensure_ascii=False, indent=2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Query the Zhusheng building memory seed.")
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("component_id")
    parser.add_argument("--memory", type=Path, default=DEFAULT_MEMORY_OUTPUT)
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = run_query(load_memory(args.memory), args.command, args.component_id)
    except (FileNotFoundError, KeyError, ValueError, json.JSONDecodeError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1
    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(format_text(args.command, result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
