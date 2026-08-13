import path from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const root = process.cwd();
const jobs = [
  ["public/assets/v6/evidence/construction-pipe-install.png", "public/assets/v6/evidence/construction-pipe-install.webp", 1200],
  ["public/assets/v6/evidence/property-joint-inspection.png", "public/assets/v6/evidence/property-joint-inspection.webp", 1200],
  ["public/assets/v6/evidence/resident-north-wall.png", "public/assets/v6/evidence/resident-north-wall.webp", 1200],
  ["public/assets/v6/evidence/water-meter-observation.png", "public/assets/v6/evidence/water-meter-observation.webp", 1200],
  ["public/assets/v6/evidence/repair-record.png", "public/assets/v6/evidence/repair-record.webp", 1200],
  ["public/assets/v6/evidence/post-repair-dry.png", "public/assets/v6/evidence/post-repair-dry.webp", 1200],
  ["public/assets/v6/model/north-wall-locator.png", "public/assets/v6/model/north-wall-locator.webp", 1280],
  ["public/assets/v6/group/learning-constellation.png", "public/assets/v6/group/learning-constellation.webp", 1440]
];

for (const [source, destination, width] of jobs) {
  const sourcePath = path.join(root, source);
  const destinationPath = path.join(root, destination);
  if (!existsSync(sourcePath)) {
    if (!existsSync(destinationPath)) throw new Error(`Missing both source and optimized asset: ${source}`);
    console.log(`${destination} already exists; source PNG not retained`);
    continue;
  }
  await sharp(path.join(root, source))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(destinationPath);
  console.log(`${source} -> ${destination}`);
}

const demoEvidence = [
  ["public/assets/v6/evidence/construction-pipe-install.webp", "public/assets/demo-evidence/1602-construction-cold-water-joint.webp"],
  ["public/assets/v6/evidence/resident-north-wall.webp", "public/assets/demo-evidence/1602-resident-damp-wall.webp"],
  ["public/assets/v6/evidence/water-meter-observation.webp", "public/assets/demo-evidence/1602-water-meter-observation.webp"],
  ["public/assets/v6/evidence/repair-record.webp", "public/assets/demo-evidence/1602-repair-open-wall.webp"],
  ["public/assets/v6/evidence/post-repair-dry.webp", "public/assets/demo-evidence/1602-post-repair-wall.webp"]
];
mkdirSync(path.join(root, "public/assets/demo-evidence"), { recursive: true });
for (const [source, destination] of demoEvidence) {
  copyFileSync(path.join(root, source), path.join(root, destination));
  console.log(`${source} => ${destination}`);
}
