import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const drawer = readFileSync(new URL("../components/building-agent/BuildingAgentDrawer.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/BuildingIntelligenceWorkspace.tsx", import.meta.url), "utf8");

test("Ask the Building uses the same Building Intelligence workspace and shared product context", () => {
  assert.match(drawer, /<BuildingIntelligenceWorkspace/);
  assert.match(drawer, /idPrefix="global-building-agent"/);
  assert.match(drawer, /result=\{product\.agentResult\}/);
  assert.match(drawer, /onResult=\{product\.setAgentResult\}/);
  assert.match(drawer, /const hasSharedVisualScene = \["\/case-1602", "\/property"\]\.includes\(product\.currentPath\) && Boolean\(product\.queryVisual\)/);
  assert.match(drawer, /showVisualState=\{hasSharedVisualScene\}/);
  assert.match(drawer, /building1602Dataset\.records\.length/);
  assert.match(drawer, /进入物业事件处理/);
});

test("legacy draft-to-event drawer flow is no longer the Ask Building experience", () => {
  assert.doesNotMatch(drawer, /createBrowserBuildingAgent/);
  assert.doesNotMatch(drawer, /confirmAndEvaluate/);
  assert.doesNotMatch(drawer, /待确认草稿/);
  assert.doesNotMatch(drawer, /确认并调用事件引擎/);
});

test("reusable Building Intelligence workspace avoids duplicate form ids and only reports 3D response where the shared product scene can show it", () => {
  assert.match(workspace, /idPrefix\?: string/);
  assert.match(workspace, /showVisualState\?: boolean/);
  assert.match(workspace, /const id = `\$\{idPrefix\}-\$\{compact \? "next" : "question"\}`/);
  assert.match(workspace, /showVisualState && result\.visualDirective/);
});
