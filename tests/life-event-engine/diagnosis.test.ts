import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLifeEventEngine } from "../../lib/life-event-engine/index.ts";
import { clone, scenario } from "./helpers.ts";

test("same input and fixed clock produce identical results", () => {
  const document = scenario("joint-leak-supported");
  const first = createDefaultLifeEventEngine().runScenario(document);
  const second = createDefaultLifeEventEngine().runScenario(document);
  assert.deepEqual(second, first);
});

test("raising humidity changes the evidence result without changing scenario code", () => {
  const engine = createDefaultLifeEventEngine();
  const low = clone(scenario("humidity-only"));
  low.steps[0].observations.find((item) => item.metric === "RELATIVE_HUMIDITY")!.value = 62;
  const high = scenario("humidity-only");
  const lowResult = engine.runScenario(low);
  const highResult = engine.runScenario(high);
  assert.ok(highResult.rankedHypotheses[0].rawScore > lowResult.rankedHypotheses[0].rawScore);
});

test("microflow change moves support away from cold-water leakage", () => {
  const engine = createDefaultLifeEventEngine();
  const abnormal = scenario("joint-leak-supported");
  const normal = clone(abnormal);
  normal.steps[0].observations.find((item) => item.metric === "MICRO_FLOW")!.value = 0;
  const abnormalScore = engine.runScenario(abnormal).rankedHypotheses.find((item) => item.hypothesis === "COLD_WATER_JOINT_LEAK")!.rawScore;
  const normalScore = engine.runScenario(normal).rankedHypotheses.find((item) => item.hypothesis === "COLD_WATER_JOINT_LEAK")!.rawScore;
  assert.ok(normalScore < abnormalScore);
});

test("deleting critical evidence never raises confidence and removes action", () => {
  const engine = createDefaultLifeEventEngine();
  const complete = engine.runScenario(scenario("joint-leak-supported"));
  const incomplete = clone(scenario("joint-leak-supported"));
  incomplete.steps[0].evidence = incomplete.steps[0].evidence.filter((item) => !["METER_READING", "RESIDENT_WALL_PHOTO"].includes(item.type));
  const result = engine.runScenario(incomplete);
  assert.notEqual(result.decisionConfidence, "HIGH");
  assert.ok(result.rankedHypotheses[0].rawScore < complete.rankedHypotheses[0].rawScore);
  assert.equal(result.authorizedActions.length, 0);
});

test("contradictory evidence lowers trust, requests retest and pauses action", () => {
  const result = createDefaultLifeEventEngine().runScenario(scenario("contradictory-evidence"));
  assert.equal(result.decisionConfidence, "LOW");
  assert.equal(result.state, "INCONCLUSIVE");
  assert.equal(result.authorizedActions.length, 0);
  assert.ok(result.visualDirective.allowedActions.includes("REQUEST_METER_RETEST"));
});

test("humidity alone cannot establish a high-confidence cold-water joint leak", () => {
  const result = createDefaultLifeEventEngine().runScenario(scenario("humidity-only"));
  assert.equal(result.rankedHypotheses[0].hypothesis, "CONDENSATION_OR_AMBIENT_HUMIDITY");
  const cold = result.rankedHypotheses.find((item) => item.hypothesis === "COLD_WATER_JOINT_LEAK")!;
  assert.notEqual(cold.confidence, "HIGH");
  assert.equal(result.authorizedActions.length, 0);
});

test("scenario description and file name are not diagnostic inputs", () => {
  const original = scenario("joint-leak-supported");
  const renamed = clone(original);
  renamed.description = "humidity-only-but-this-name-must-not-matter";
  const engine = createDefaultLifeEventEngine();
  assert.deepEqual(engine.runScenario(renamed).rankedHypotheses, engine.runScenario(original).rankedHypotheses);
});

test("five scenario documents yield materially different states or leaders", () => {
  const engine = createDefaultLifeEventEngine();
  const names = ["joint-leak-supported", "humidity-only", "missing-evidence", "contradictory-evidence", "post-isolation-recovery"];
  const signatures = names.map((name) => {
    const result = engine.runScenario(scenario(name));
    return `${result.state}:${result.rankedHypotheses[0].hypothesis}:${result.decisionConfidence}`;
  });
  assert.ok(new Set(signatures).size >= 4);
});
