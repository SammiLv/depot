import test from "node:test";
import assert from "node:assert/strict";
import { sumStageTotal, validateScoreByDirection } from "@/server/kpi/kpi-score-direction";

test("扣分项：负数与 0 通过，正数拒绝", () => {
  assert.equal(validateScoreByDirection(-5, "DEDUCTION"), null);
  assert.equal(validateScoreByDirection(0, "DEDUCTION"), null);
  assert.equal(validateScoreByDirection(3, "DEDUCTION"), "为扣分项，只能填写 ≤0");
});

test("加分项：正数与 0 通过，负数拒绝", () => {
  assert.equal(validateScoreByDirection(5, "BONUS"), null);
  assert.equal(validateScoreByDirection(0, "BONUS"), null);
  assert.equal(validateScoreByDirection(-2, "BONUS"), "为加分项，只能填写 ≥0");
});

test("阶段汇总：扣分项负向扣减、加分项正向计入、null 按 0", () => {
  // 100 满分，扣分项 -5，奖励项 +3，一项未评（null）
  assert.equal(sumStageTotal(100, [-5, 3, null]), 98);
  // 全部未评 = 满分（仅草稿展示用，列表按阶段完成标记决定是否显示）
  assert.equal(sumStageTotal(100, [null, undefined]), 100);
});

test("混合场景：旧口径丢正分的回归钉死", () => {
  // 模板 3 项满分合计 100：两项扣分 -3 -2，一项加分 +5
  // 旧口径（满分 − Σ|负|）= 100 − 5 = 95，正分被丢 → 新口径必须算 100
  const scoreTotal = 100;
  const values = [-3, -2, 5];
  assert.equal(sumStageTotal(scoreTotal, values), 100);
});

test("阶段汇总：字符串数值不参与（仅 number|null|undefined）", () => {
  // 类型层面已约束；此处钉死 0 值语义
  assert.equal(sumStageTotal(110, [0, 0, -5]), 105);
});
