import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const files = ["sources.json", "spaces.json", "systems.json", "components.json", "ports.json", "connections.json", "spatial-relations.json", "records.json", "visual-manifest.json"];
const root = resolve(process.cwd());
const sourceRoot = resolve(root, "data/building/1602");
const publicRoot = resolve(root, "public/assets/v6/intelligence/1602");
const check = process.argv.includes("--check");
const descriptors: Record<string, { sha256: string; bytes: number }> = {};
await mkdir(publicRoot, { recursive: true });
for (const filename of files) {
  const source = await readFile(resolve(sourceRoot, filename));
  descriptors[filename] = { sha256: createHash("sha256").update(source).digest("hex"), bytes: source.byteLength };
  const targetPath = resolve(publicRoot, filename);
  if (check) {
    const target = await readFile(targetPath).catch(() => null);
    if (!target || !source.equals(target)) throw new Error(`building intelligence asset drift: ${filename}`);
  } else await writeFile(targetPath, source);
}
const integrity = `${JSON.stringify({ schemaVersion: 1, datasetId: "ZS-DEMO-001/UNIT-1602/BATHROOM", syntheticEngineeringDataPresent: true, files: descriptors }, null, 2)}\n`;
const integrityPath = resolve(publicRoot, "assets-integrity.json");
if (check) {
  const current = await readFile(integrityPath, "utf8").catch(() => "");
  if (current !== integrity) throw new Error("building intelligence integrity manifest drift");
} else await writeFile(integrityPath, integrity, "utf8");
console.log(`${check ? "verified" : "synced"} ${files.length} building intelligence assets`);
