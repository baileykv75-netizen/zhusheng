import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayLifeEventArtifact, verifyLifeEventArtifact } from "../lib/life-event-engine/index.ts";
import type { LifeEventArtifact } from "../lib/life-event-engine/index.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function main() {
  const args = process.argv.slice(2).filter((item) => item !== "--");
  const inputIndex = args.indexOf("--input");
  if (inputIndex < 0 || !args[inputIndex + 1]) throw new Error("Provide --input <artifact-path>");
  const artifact = JSON.parse(readFileSync(resolve(repoRoot, args[inputIndex + 1]), "utf8")) as LifeEventArtifact;
  const modeIndex = args.indexOf("--mode");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : "replay";
  if (mode === "verify") {
    verifyLifeEventArtifact(artifact);
    console.log(JSON.stringify({ valid: true, eventId: artifact.eventId, auditEntries: artifact.auditLog.length }, null, 2));
    return;
  }
  const replayed = replayLifeEventArtifact(artifact);
  console.log(JSON.stringify({ eventId: artifact.eventId, ...replayed }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
