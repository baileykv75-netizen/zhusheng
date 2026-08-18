import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const concept = readFileSync(new URL("../components/ConceptExhibit.tsx", import.meta.url), "utf8");
const caseExhibit = readFileSync(new URL("../components/Case1602Exhibit.tsx", import.meta.url), "utf8");
const headlineCss = readFileSync(new URL("../app/display-headlines.css", import.meta.url), "utf8");

test("cinematic display headlines do not end with full-stop punctuation", () => {
  for (const stale of ["过去仍在原来的位置。", "发生了一件事。", "成为下一栋房子的经验。", "拥有一生不会中断的记忆。", "唤醒一栋房子的记忆。"]) {
    assert.ok(!concept.includes(stale), `stale punctuated concept headline: ${stale}`);
    assert.ok(!caseExhibit.includes(stale), `stale punctuated case headline: ${stale}`);
  }

  const chapterTitles = [...caseExhibit.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(chapterTitles.length >= 5);
  assert.ok(chapterTitles.every((title) => !/[。！？]$/.test(title)), "case chapter display titles must not carry terminal sentence punctuation");
});

test("homepage chapter copy keeps authored wide-screen lines intact without orphaning the final Han characters", () => {
  assert.match(concept, /display-headline-line">过去仍在原来的位置</);
  assert.match(headlineCss, /\.v6-chapter-copy h2\.display-headline/);
  assert.match(headlineCss, /font-size: clamp\(36px, 3\.7vw, 60px\)/);
  assert.match(headlineCss, /@media \(min-width: 1450px\)/);
  assert.match(headlineCss, /white-space: nowrap/);
});
