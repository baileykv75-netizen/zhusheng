import { LifeEventEngine, type LifeEventEngineOptions } from "../../engine.ts";
import { loadLifeEventContext } from "../../memory-loader.ts";

export function createDefaultLifeEventEngine(options: Partial<LifeEventEngineOptions> = {}) {
  const context = options.memory && options.manifest
    ? { memory: options.memory, manifest: options.manifest }
    : loadLifeEventContext();
  return new LifeEventEngine({ ...context, clock: options.clock });
}
