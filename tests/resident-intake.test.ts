import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { derive1602ResidentFollowUp } from "../lib/product/resident-intake.ts";

const residentUrl = new URL("../components/ResidentService.tsx", import.meta.url);

test("resident sees observed-fact intake before any water-meter follow-up", async () => {
  const source = await readFile(residentUrl, "utf8");

  assert.match(source, /type IntakeStage = "OBSERVATION" \| "FOLLOW_UP"/);
  assert.match(source, /提交初步情况，让筑生决定还缺什么/);
  assert.match(source, /intakeStage === "OBSERVATION"/);
  assert.match(source, /intakeStage === "FOLLOW_UP"/);
  assert.match(source, /为什么现在问这个/);
  assert.match(source, /不代表筑生已经判断为管道漏水/);
  assert.match(source, /useState\(""\)/);
  assert.match(source, /不继续要求水表观察/);
});

test("1602 follow-up explains why meter evidence is discriminating rather than diagnostic", () => {
  const request = derive1602ResidentFollowUp({
    description: "卫生间北侧墙角最近持续返潮",
    photoFinding: "MOISTURE_VISIBLE"
  });

  assert.ok(request);
  assert.equal(request.id, "METER_READING");
  assert.match(request.reason, /区分供水侧持续微流量与防水、冷凝等其他方向/);
  assert.match(request.boundary, /不代表筑生已经判断为管道漏水/);
  assert.deepEqual(request.triggeredBy, ["SPACE_CONTEXT", "DESCRIPTION", "PHOTO"]);
});

test("photo-confirmed moisture can trigger meter follow-up even when resident wording is vague", () => {
  const request = derive1602ResidentFollowUp({
    description: "这里看起来不太对，但我说不清是什么",
    photoFinding: "MOISTURE_VISIBLE"
  });

  assert.ok(request);
  assert.equal(request.id, "METER_READING");
  assert.deepEqual(request.triggeredBy, ["SPACE_CONTEXT", "PHOTO"]);
});

test("moisture wording alone cannot override a photo that shows no visible moisture", () => {
  const request = derive1602ResidentFollowUp({
    description: "卫生间墙角一直很潮，感觉像在渗水",
    photoFinding: "NO_VISIBLE_MOISTURE"
  });

  assert.equal(request, null);
});

test("unreadable photo stops the meter branch even when the description mentions moisture", () => {
  const request = derive1602ResidentFollowUp({
    description: "卫生间墙角最近返潮",
    photoFinding: "UNREADABLE"
  });

  assert.equal(request, null);
});

test("non-moisture resident symptoms never get forced into the water-meter leak workflow", () => {
  const request = derive1602ResidentFollowUp({
    description: "卫生间镜前灯一直闪烁",
    photoFinding: "UNREADABLE"
  });

  assert.equal(request, null);
});
