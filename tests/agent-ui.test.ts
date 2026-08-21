import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawer = readFileSync("components/building-agent/BuildingAgentDrawer.tsx", "utf8");
const workspace = readFileSync("components/BuildingIntelligenceWorkspace.tsx", "utf8");
const tokens = readFileSync("app/product-tokens.css", "utf8");
const agentCss = readFileSync("app/agent-ui.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

test("UI-0 keeps one shared width and surface vocabulary", () => {
  for (const token of [
    "--zs-content-reading: 760px",
    "--zs-content-work: 1280px",
    "--zs-content-wide: 1480px",
    "--zs-panel-wide: 920px",
    "--zs-panel-narrow: 680px",
    "--zs-surface-subtle",
    "--zs-shadow-floating"
  ]) assert.match(tokens, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(layout, /import "\.\/agent-ui\.css";/);
  assert.ok(layout.indexOf('import "./agent-ui.css";') > layout.indexOf('import "./product-finishing.css";'));
});

test("Agent Drawer 2.0 is a right-side workspace instead of a narrow stacked drawer", () => {
  assert.match(drawer, /data-agent-layout="wide"/);
  assert.match(drawer, /className="agent-context-meta"/);
  assert.match(drawer, /className="agent-header-boundary"/);
  assert.doesNotMatch(drawer, /className="agent-boundary"/);
  assert.doesNotMatch(drawer, /className="agent-mode"/);

  assert.match(agentCss, /width: min\(1160px, 68vw\)/);
  assert.match(agentCss, /min-width: 980px/);
  assert.match(agentCss, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(agentCss, /\.building-agent-drawer \.building-ai-start[\s\S]*grid-template-columns: minmax\(0, 1\.28fr\) minmax\(300px, \.72fr\)/);
  assert.match(agentCss, /\.building-agent-drawer \.building-ai-start-prompts[\s\S]*border-left: 1px solid var\(--zs-line-soft\)/);
  assert.match(agentCss, /\.building-agent-drawer \.building-ai-form[\s\S]*min-height: 94px/);
  assert.match(agentCss, /@media \(max-width: 900px\)[\s\S]*width: 100vw/);
});

test("Agent start state uses one generous workspace and lightweight prompt list", () => {
  assert.match(workspace, /className="building-ai-start"/);
  assert.match(workspace, /className="building-ai-start-primary"/);
  assert.match(workspace, /className="building-ai-start-prompts"/);
  assert.match(workspace, /className="building-ai-prompt-heading"/);
  assert.match(workspace, /可以直接这样问/);
  assert.match(workspace, /从这栋房子的记忆开始问/);
  assert.doesNotMatch(workspace, /问这栋房子<br \/>任何问题/);
  assert.match(workspace, /building-ai-memory-scope/);
  assert.match(agentCss, /\.building-agent-drawer \.building-ai-examples button[\s\S]*border-bottom: 1px solid var\(--zs-line-soft\)/);
  assert.doesNotMatch(agentCss, /flex: 1 1 calc\(50% - 4px\)/);
});

test("Agent result state keeps details progressive without changing query behavior", () => {
  assert.match(workspace, /<details className="building-ai-hypothesis-details">/);
  assert.match(workspace, /查看诊断候选与验证顺序/);
  assert.match(workspace, /queryBuildingAgent\(input, selectedBusinessId\)/);
  assert.match(workspace, /probeBuildingAgentGateway/);
  assert.match(agentCss, /\.building-agent-drawer \.ai-answer h2[\s\S]*max-width: 920px/);
});
