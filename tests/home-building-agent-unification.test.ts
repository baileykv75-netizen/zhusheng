import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const drawer = readFileSync(new URL("../components/building-agent/BuildingAgentDrawer.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/BuildingIntelligenceWorkspace.tsx", import.meta.url), "utf8");

test("homepage Ask the Building uses the same Building Intelligence workspace as property", () => {
  assert.match(drawer, /<BuildingIntelligenceWorkspace/);
  assert.match(drawer, /idPrefix="homepage-building-agent"/);
  assert.match(drawer, /showVisualState=\{false\}/);
  assert.match(drawer, /building1602Dataset\.records\.length/);
  assert.match(drawer, /进入受控事件处理/);
});

test("legacy draft-to-event drawer flow is no longer the homepage ask-building experience", () => {
  assert.doesNotMatch(drawer, /createBrowserBuildingAgent/);
  assert.doesNotMatch(drawer, /confirmAndEvaluate/);
  assert.doesNotMatch(drawer, /待确认草稿/);
  assert.doesNotMatch(drawer, /确认并调用事件引擎/);
});

test("reusable Building Intelligence workspace avoids duplicate form ids and can suppress false 3D feedback in drawer", () => {
  assert.match(workspace, /idPrefix\?: string/);
  assert.match(workspace, /showVisualState\?: boolean/);
  assert.match(workspace, /const id = `\$\{idPrefix\}-\$\{compact \? "next" : "question"\}`/);
  assert.match(workspace, /showVisualState && result\.visualDirective/);
});
