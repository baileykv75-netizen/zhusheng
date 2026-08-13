import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const binaryExtensions = new Set([".glb", ".blend", ".ifc", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".woff", ".woff2", ".zip", ".pdf"]);
const placeholderKeys = new Set(["sk-test-redacted-not-real", "sk-abcdefghijklmnop12345"]);

function matchedSecretKeys(content) {
  return [...content.matchAll(/(^|[^A-Za-z0-9_-])(sk-[A-Za-z0-9_-]{20,})/g)].map((match) => match[2]);
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(absolute));
    else if (!binaryExtensions.has(path.extname(entry.name).toLowerCase()) && statSync(absolute).size <= 20 * 1024 * 1024) output.push(absolute);
  }
  return output;
}

const findings = [];
const buildFiles = [path.join(root, "out"), path.join(root, "dist"), path.join(root, ".next", "static")].flatMap(filesUnder);
for (const file of buildFiles) {
  const content = readFileSync(file, "utf8");
  const keys = matchedSecretKeys(content);
  if (content.includes("OPENAI_API_KEY") || content.includes("DEEPSEEK_API_KEY") || keys.some((value) => !placeholderKeys.has(value))) findings.push({ scope: "browser-build", file: path.relative(root, file) });
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
for (const relative of tracked) {
  const file = path.join(root, relative);
  if (!existsSync(file) || binaryExtensions.has(path.extname(file).toLowerCase()) || statSync(file).size > 20 * 1024 * 1024) continue;
  const content = readFileSync(file, "utf8");
  const matches = matchedSecretKeys(content);
  if (matches.some((value) => !placeholderKeys.has(value))) findings.push({ scope: "tracked-source", file: relative });
}

if (findings.length) {
  console.error(`SECRET_SCAN_FAILED count=${findings.length}`);
  for (const finding of findings) console.error(`${finding.scope}: ${finding.file}`);
  process.exit(1);
}
console.log(`SECRET_SCAN_OK buildFiles=${buildFiles.length} trackedFiles=${tracked.length} valuesRedacted=true`);
