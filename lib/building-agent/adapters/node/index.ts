import { createDefaultLifeEventEngine } from "../../../life-event-engine/adapters/node/index.ts";
import { loadLifeEventContext } from "../../../life-event-engine/memory-loader.ts";
import { loadDefaultGroupLearningSource } from "../../../group-learning/adapters/node/index.ts";
import { BuildingAgentOrchestrator } from "../../orchestrator.ts";
import type { BuildingAgentProvider } from "../../types.ts";

export function createDefaultBuildingAgent(provider?: BuildingAgentProvider, now = () => new Date().toISOString()) {
  const assets = loadLifeEventContext();
  const groupSource = loadDefaultGroupLearningSource();
  const engine = createDefaultLifeEventEngine({ ...assets, clock: { now } });
  return new BuildingAgentOrchestrator({ ...assets, engine, groupSource }, provider);
}

