import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const jobs = [
  ["public/assets/v6/evidence/construction-pipe-install.png", "public/assets/v6/evidence/construction-pipe-install.webp", 1200],
  ["public/assets/v6/evidence/property-joint-inspection.png", "public/assets/v6/evidence/property-joint-inspection.webp", 1200],
  ["public/assets/v6/evidence/resident-north-wall.png", "public/assets/v6/evidence/resident-north-wall.webp", 1200],
  ["public/assets/v6/evidence/repair-record.png", "public/assets/v6/evidence/repair-record.webp", 1200],
  ["public/assets/v6/evidence/post-repair-dry.png", "public/assets/v6/evidence/post-repair-dry.webp", 1200],
  ["public/assets/v6/model/north-wall-locator.png", "public/assets/v6/model/north-wall-locator.webp", 1280],
  ["public/assets/v6/group/learning-constellation.png", "public/assets/v6/group/learning-constellation.webp", 1440]
];

for (const [source, destination, width] of jobs) {
  await sharp(path.join(root, source))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(root, destination));
  console.log(`${source} -> ${destination}`);
}
