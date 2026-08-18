import assert from "node:assert/strict";
import test from "node:test";
import { kpiRatingBandOptions, talentGradeThresholdOptions } from "./configured-level-options";

test("人才决策 KPI 等级选项读取绩效等级名称和说明", () => {
  assert.deepEqual(kpiRatingBandOptions([
    { name: "A", description: "绩效良好" },
    { name: "B", description: null },
  ]), [
    { value: "A", label: "A · 绩效良好" },
    { value: "B", label: "B" },
  ]);
});

test("人才决策盘点等级选项读取模型等级编码和名称", () => {
  assert.deepEqual(talentGradeThresholdOptions([
    { gradeCode: "S", label: "杰出" },
    { gradeCode: "C", label: "略差" },
  ]), [
    { value: "S", label: "S · 杰出" },
    { value: "C", label: "C · 略差" },
  ]);
});
