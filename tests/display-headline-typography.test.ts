import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const concept = readFileSync(new URL("../components/ConceptExhibit.tsx", import.meta.url), "utf8");
const caseExhibit = readFileSync(new URL("../components/Case1602Exhibit.tsx", import.meta.url), "utf8");
const headlineCss = readFileSync(new URL("../app/display-headlines.css", import.meta.url), "utf8");

test("cinematic authored display lines do not carry sentence punctuation", () => {
  const conceptDisplayLines = [...concept.matchAll(/display-headline-line">([^<]+)</g)].map((match) => match[1]);
  const caseDisplayLines = [...caseExhibit.matchAll(/display-headline-line">([^<]+)</g)].map((match) => match[1]);
  assert.ok(conceptDisplayLines.length >= 8);
  assert.ok(caseDisplayLines.length >= 2);
  for (const line of [...conceptDisplayLines, ...caseDisplayLines]) {
    assert.ok(!/[，。！？；：]$/.test(line), `cinematic display line ends with punctuation: ${line}`);
  }

  assert.match(caseExhibit, /"past", "present", "action", "result"/);
  assert.match(caseExhibit, /墙封起来以后 施工经历没有消失/);
  assert.doesNotMatch(caseExhibit, /墙封起来以后 施工经历没有消失[，。！？；：]/);
});

test("authored Chinese display lines stay atomic at medium widths instead of orphaning the final characters", () => {
  assert.match(concept, /display-headline-line">一栋房子的经历</);
  assert.match(concept, /display-headline-line">成为下一栋房子的经验</);
  assert.match(headlineCss, /\.display-headline-line \{[\s\S]*white-space: nowrap/);
  assert.match(headlineCss, /font-size: clamp\(28px, 5\.2vw, 60px\)/);
  assert.doesNotMatch(headlineCss, /max-width: 1449px[\s\S]*white-space: normal/);
});
