import { loadBrowserGroupLearningSource } from "../../../group-learning/adapters/browser/index.ts";
import { createBrowserLifeEventEngine, loadBrowserLifeEventAssets } from "../../../life-event-engine/adapters/browser/index.ts";
import { BuildingAgentOrchestrator } from "../../orchestrator.ts";
import type { BuildingAgentProvider } from "../../types.ts";

export async function createBrowserBuildingAgent(fetcher: typeof fetch = fetch, provider?: BuildingAgentProvider) {
  const [lifeAssets, groupSource] = await Promise.all([loadBrowserLifeEventAssets(fetcher), loadBrowserGroupLearningSource(fetcher)]);
  const engine = createBrowserLifeEventEngine(lifeAssets);
  return new BuildingAgentOrchestrator({ memory: lifeAssets.memory, manifest: lifeAssets.manifest, engine, groupSource }, provider);
}

