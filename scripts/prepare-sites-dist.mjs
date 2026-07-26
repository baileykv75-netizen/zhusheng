import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, ".open-next");
const target = join(root, "dist");

if (!existsSync(source)) {
  throw new Error("OpenNext output was not generated.");
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
mkdirSync(join(target, ".openai"), { recursive: true });
cpSync(join(root, ".openai", "hosting.json"), join(target, ".openai", "hosting.json"));
mkdirSync(join(target, "server"), { recursive: true });
writeFileSync(
  join(target, "server", "index.js"),
  'import worker from "../worker.js";\nexport default worker;\n',
  "utf8"
);

console.log("Sites dist prepared from .open-next.");
