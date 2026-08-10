import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "out");
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "/zhusheng").replace(/\/$/, "");
const routes = ["", "events", "case-1602", "worker", "resident", "property", "group"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = join(directory, name);
    return statSync(file).isDirectory() ? filesUnder(file) : [file];
  });
}

assert(existsSync(out), "Next static export is missing");
assert(existsSync(join(out, ".nojekyll")), "out/.nojekyll is missing");

for (const route of routes) {
  const htmlPath = route ? join(out, route, "index.html") : join(out, "index.html");
  assert(existsSync(htmlPath), `Missing exported route: /${route}`);
  const html = readFileSync(htmlPath, "utf8");
  assert(html.includes(`${basePath}/_next/`), `Route /${route} does not use ${basePath} for Next assets`);

  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = match[1].split(/[?#]/)[0];
    if (!url.startsWith(`${basePath}/`)) continue;
    const relative = url.slice(basePath.length + 1);
    const target = join(out, relative);
    assert(existsSync(target), `Exported reference is missing: ${url}`);
  }
}

const chunks = filesUnder(join(out, "_next", "static", "chunks"))
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(file, "utf8"));
const lifeEventChunk = chunks.find((source) => source.includes("/assets/life-event"));
assert(lifeEventChunk, "Life-event browser adapter is missing from the export");
assert(lifeEventChunk.includes(basePath), "Life-event runtime assets are missing the Pages base path");

for (const asset of [
  "assets/life-event/bathroom-1602.glb",
  "assets/v6/model/north-wall-locator.webp",
  "assets/v6/evidence/resident-north-wall.webp",
  "assets/v6/evidence/water-meter-observation.webp",
  "assets/v6/group/learning-constellation.webp"
]) {
  assert(existsSync(join(out, asset)), `Required public asset is missing: ${asset}`);
}

console.log(`GitHub Pages export OK: ${routes.length} routes, basePath=${basePath}`);
