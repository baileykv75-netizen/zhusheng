import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const shellUrl = new URL("../components/shell.tsx", import.meta.url);
const tokensUrl = new URL("../app/product-tokens.css", import.meta.url);
const polishUrl = new URL("../app/product-polish.css", import.meta.url);
const routePolishUrl = new URL("../app/product-route-polish.css", import.meta.url);
const finishingUrl = new URL("../app/product-finishing.css", import.meta.url);
const buildingAiCssUrl = new URL("../components/BuildingIntelligenceWorkspace.module.css", import.meta.url);
const workerUrl = new URL("../app/worker/page.tsx", import.meta.url);
const groupUrl = new URL("../app/group/page.tsx", import.meta.url);

test("shared product visual layers load after legacy CSS", async () => {
  const source = await readFile(layoutUrl, "utf8");
  const legacy = source.indexOf('import "./v6.css"');
  const tokens = source.indexOf('import "./product-tokens.css"');
  const polish = source.indexOf('import "./product-polish.css"');
  const routePolish = source.indexOf('import "./product-route-polish.css"');
  const finishing = source.indexOf('import "./product-finishing.css"');

  assert.ok(legacy >= 0 && tokens > legacy);
  assert.ok(polish > tokens);
  assert.ok(routePolish > polish);
  assert.ok(finishing > routePolish);
});

test("work mode uses one product topbar instead of exposing the legacy admin rail", async () => {
  const [shell, polish] = await Promise.all([readFile(shellUrl, "utf8"), readFile(polishUrl, "utf8")]);

  assert.match(shell, /className="floating-project-bar journey-project-bar product-topbar"/);
  assert.match(shell, /className="work-brand"/);
  assert.match(shell, /className="topbar-agent"/);
  assert.match(polish, /\.compact-brand-rail \{\s*display: none !important;/);
  assert.match(polish, /\.app-shell,[\s\S]*padding-left: 0;/);
});

test("visual system defines restrained colors spacing type and reduced-motion behavior", async () => {
  const source = await readFile(tokensUrl, "utf8");

  assert.match(source, /--zs-charcoal:/);
  assert.match(source, /--zs-paper:/);
  assert.match(source, /--zs-accent:/);
  assert.match(source, /--zs-type-display:/);
  assert.match(source, /--zs-type-page:/);
  assert.match(source, /prefers-reduced-motion/);
});

test("work headings prevent Chinese orphan wrapping without forcing every page into one layout", async () => {
  const source = await readFile(polishUrl, "utf8");

  assert.match(source, /word-break: keep-all/);
  assert.match(source, /line-break: strict/);
  assert.match(source, /text-wrap: balance/);
  assert.match(source, /\.resident-service-title h1/);
  assert.match(source, /\.worker-stage-heading h1/);
  assert.match(source, /\.group-learning-workbench\.task-mode/);
});

test("work page primary headings no longer depend on hard-coded line breaks", async () => {
  const [worker, group] = await Promise.all([readFile(workerUrl, "utf8"), readFile(groupUrl, "utf8")]);

  assert.doesNotMatch(worker, /<h1>[^<]*<br\s*\/>/);
  assert.doesNotMatch(worker, /<h2>[^<]*<br\s*\/>/);
  assert.doesNotMatch(group, /<h1>[^<]*<br\s*\/>/);
});

test("case uses four time-stage columns and legacy event rail compensation is neutralized", async () => {
  const source = await readFile(routePolishUrl, "utf8");

  assert.match(source, /\.case-workspace > nav \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(source, /\.event-center \{\s*padding-left: 0;/);
});

test("group task mode removes repeated dashboard-card treatment while preserving governance as a decision panel", async () => {
  const source = await readFile(polishUrl, "utf8");

  assert.match(source, /\.group-learning-workbench\.task-mode \.source-proof,[\s\S]*border: 0;/);
  assert.match(source, /\.group-learning-workbench\.task-mode \.group-governance \{[\s\S]*border: 1px solid/);
});

test("Building AI reasoning reads as one evidence flow rather than a grid of hypothesis cards", async () => {
  const source = await readFile(buildingAiCssUrl, "utf8");

  assert.match(source, /\.hypothesisGrid \{\s*display: grid;\s*grid-template-columns: 1fr;/);
  assert.match(source, /\.hypothesisCard \{[\s\S]*border-radius: 0;[\s\S]*background: transparent;/);
  assert.match(source, /\.reasoningStack \{[\s\S]*border-top:/);
});

test("Ask Building uses the same restrained product interaction language as work mode", async () => {
  const source = await readFile(finishingUrl, "utf8");

  assert.match(source, /\.building-agent-drawer \{[\s\S]*background: var\(--zs-paper\)/);
  assert.match(source, /\.agent-drawer-header \{[\s\S]*background: var\(--zs-charcoal\)/);
  assert.match(source, /\.building-agent-shell :focus-visible/);
  assert.match(source, /\.building-ai-form button \{\s*background: var\(--zs-accent\)/);
});

test("shared mobile navigation remains available on resident events and group work routes", async () => {
  const source = await readFile(finishingUrl, "utf8");

  assert.match(source, /:has\(\.resident-service\) \.mobile-task-nav/);
  assert.match(source, /:has\(\.event-center\) \.mobile-task-nav/);
  assert.match(source, /:has\(\.group-workspace-shell\) \.mobile-task-nav/);
  assert.match(source, /display: grid;/);
});
