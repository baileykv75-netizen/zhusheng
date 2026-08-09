import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ScenarioDocument } from "../../lib/life-event-engine/index.ts";

export function scenario(name: string): ScenarioDocument {
  return JSON.parse(readFileSync(resolve("data/life-event-scenarios", `${name}.json`), "utf8")) as ScenarioDocument;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
