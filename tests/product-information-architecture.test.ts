import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { productInformationHierarchy } from "../lib/product/information-hierarchy.ts";
import { productNavigation } from "../lib/product/product-navigation.ts";

const memoryPage = readFileSync(new URL("../app/memory/page.tsx", import.meta.url), "utf8");

test("primary navigation is organized by building capabilities rather than role apps", () => {
  assert.deepEqual(productNavigation.map((item) => item.label), ["建筑总览", "生命事件", "建筑记忆", "协同处理", "经验治理"]);
  const collaboration = productNavigation.find((item) => item.id === "COLLABORATION");
  assert.ok(collaboration?.children);
  assert.deepEqual(collaboration.children.map((item) => item.label), ["物业运行", "住户任务", "施工记录"]);
});

test("memory navigation is enabled only after the dedicated building-memory view exists", () => {
  const memory = productNavigation.find((item) => item.id === "MEMORY");
  assert.equal(memory?.href, "/memory");
  assert.equal(memory?.available, true);
  assert.match(memoryPage, /BuildingMemoryWorkspace/);
});

test("technical proof is never part of the property primary information tier", () => {
  assert.ok(productInformationHierarchy.property.PRIMARY.includes("assessment"));
  assert.ok(productInformationHierarchy.property.PRIMARY.includes("relevant-memory"));
  assert.ok(productInformationHierarchy.property.PRIMARY.includes("next-action"));
  assert.ok(productInformationHierarchy.property.PROOF.includes("tool-trace"));
  assert.ok(productInformationHierarchy.property.PROOF.includes("provenance"));
  assert.ok(!productInformationHierarchy.property.PRIMARY.includes("tool-trace" as never));
});
