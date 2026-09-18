import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKpiDistribution } from "@/server/kpi/kpi-distribution";

const rule = {
  enabled: true,
  minHeadcount: 5,
  minGap: 10,
  belowScore: 100,
  belowMinPercent: 10,
};

test("规则未启用 → inactive", () => {
  const result = evaluateKpiDistribution({ ...rule, enabled: false }, { initialized: true, headcount: 10, completedScores: [90, 110] });
  assert.equal(result.status, "inactive");
});

test("季度 KPI 未初始化 → not_initialized", () => {
  const result = evaluateKpiDistribution(rule, { initialized: false, headcount: 10, completedScores: [] });
  assert.equal(result.status, "not_initialized");
});

test("人数不足门槛 → below_headcount", () => {
  const result = evaluateKpiDistribution(rule, { initialized: true, headcount: 4, completedScores: [90, 110] });
  assert.equal(result.status, "below_headcount");
});

test("分母含未完成考核的人：5 人部门仅 1 人终审且 <100 → 占比 20% 达标", () => {
  const result = evaluateKpiDistribution(rule, { initialized: true, headcount: 5, completedScores: [90] });
  assert.equal(result.belowCount, 1);
  assert.equal(result.belowPercent, 20);
  assert.equal(result.belowPass, true);
  // 仅 1 人终审，分差暂不判定
  assert.equal(result.gap, null);
  assert.equal(result.gapPass, null);
  assert.equal(result.status, "pass");
});

test("分差不足 → fail；分差达标 → pass", () => {
  const fail = evaluateKpiDistribution(rule, { initialized: true, headcount: 5, completedScores: [95, 100, 100] });
  assert.equal(fail.gap, 5);
  assert.equal(fail.gapPass, false);
  assert.equal(fail.status, "fail");

  const pass = evaluateKpiDistribution(rule, { initialized: true, headcount: 5, completedScores: [90, 100, 100] });
  assert.equal(pass.gap, 10);
  assert.equal(pass.gapPass, true);
  assert.equal(pass.belowPercent, 20);
  assert.equal(pass.status, "pass");
});

test("低分占比不足 → fail（含边界：恰好等于阈值视为达标）", () => {
  const fail = evaluateKpiDistribution(rule, { initialized: true, headcount: 20, completedScores: [100, 105, 110] });
  assert.equal(fail.belowPercent, 0);
  assert.equal(fail.status, "fail");

  const edge = evaluateKpiDistribution(rule, { initialized: true, headcount: 10, completedScores: [90, 120] });
  assert.equal(edge.belowPercent, 10);
  assert.equal(edge.belowPass, true);
  assert.equal(edge.status, "pass");
});
