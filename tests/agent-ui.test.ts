import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawer = readFileSync("components/building-agent/BuildingAgentDrawer.tsx", "utf8");
const workspace = readFileSync("components/BuildingIntelligenceWorkspace.tsx", "utf8");
const tokens = readFileSync("app/product-tokens.css", "utf8");
const agentCss = readFileSync("app/agent-ui.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

test("UI-0 exposes one shared width and surface vocabulary", () => {
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

test("UI-1 keeps Ask the Building to three visual layers instead of a dashboard stack", () => {
  assert.match(drawer, /data-agent-layout="wide"/);
  assert.match(drawer, /className="agent-context-meta"/);
  assert.match(drawer, /className="agent-header-boundary"/);
  assert.match(drawer, /className="agent-footer-actions"/);
  assert.doesNotMatch(drawer, /className="agent-boundary"/);
  assert.doesNotMatch(drawer, /className="agent-mode"/);

  assert.match(agentCss, /width: min\(var\(--zs-panel-wide\), 58vw\)/);
  assert.match(agentCss, /min-width: 760px/);
  assert.match(agentCss, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(agentCss, /\.building-agent-drawer \.building-ai-empty[\s\S]*display: flex/);
  assert.match(agentCss, /\.building-agent-drawer \.building-ai-examples[\s\S]*display: flex/);
  assert.match(agentCss, /@media \(max-width: 780px\)[\s\S]*width: 100vw/);
});

test("Agent empty and result states reduce visual noise without changing query behavior", () => {
  assert.match(workspace, /从这栋房子的记忆开始问/);
  assert.doesNotMatch(workspace, /问这栋房子<br \/>任何问题/);
  assert.match(workspace, /building-ai-memory-scope/);
  assert.match(workspace, /<details className="building-ai-hypothesis-details">/);
  assert.match(workspace, /查看诊断候选与验证顺序/);
  assert.match(workspace, /queryBuildingAgent\(input, selectedBusinessId\)/);
  assert.match(workspace, /probeBuildingAgentGateway/);
});
