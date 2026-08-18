import assert from "node:assert/strict";
import test from "node:test";
import { calculateTalentReview, validateGradeThresholds } from "./review-engine";

const thresholds = [
  { gradeCode: "D", minScore: 0, maxScore: 6 }, { gradeCode: "C", minScore: 7, maxScore: 12 },
  { gradeCode: "B", minScore: 13, maxScore: 18 }, { gradeCode: "A", minScore: 19, maxScore: 24 },
  { gradeCode: "S", minScore: 25, maxScore: 30 },
];

test("人才等级区间覆盖 0-30 且不重叠", () => {
  assert.doesNotThrow(() => validateGradeThresholds(thresholds));
  assert.throws(() => validateGradeThresholds([{ gradeCode: "D", minScore: 0, maxScore: 7 }, { gradeCode: "C", minScore: 7, maxScore: 30 }]));
});

test("六维 S/A/B/C/D 分数按 5/4/3/2/1 汇总", () => {
  const definitions = [
    ["LOYALTY", "忠诚度", "VALUE"], ["ATTITUDE", "工作态度", "VALUE"], ["FIT", "匹配度", "POTENTIAL"],
    ["GROWTH", "成长度", "POTENTIAL"], ["CAPABILITY", "能力度", "PERFORMANCE"], ["OUTPUT", "产出度", "PERFORMANCE"],
  ];
  const dimensions = definitions.map(([code, name, category], index) => ({ id: `d${index}`, code, name, category, weight: 1, maxScore: 5, isRequired: true }));
  const ratings = [5, 4, 4, 4, 5, 5].map((numericScore, index) => ({ dimensionId: `d${index}`, ratingCode: numericScore === 5 ? "S" : "A", numericScore }));
  const result = calculateTalentReview(dimensions, ratings, thresholds, [{ code: "HIGH_HIGH", potentialMin: 12, potentialMax: 15, performanceMin: 12, performanceMax: 15 }]);
  assert.deepEqual(result, { totalScore: 27, gradeCode: "S", potentialScore: 13, performanceScore: 14, nineBoxCode: "HIGH_HIGH" });
});

test("缺少必填维度时不计算结果", () => {
  assert.throws(() => calculateTalentReview([{ id: "d1", category: "POTENTIAL", weight: 1, maxScore: 5, isRequired: true }], [], thresholds, []));
});

test("维度满分可独立配置并按评分档比例折算", () => {
  const result = calculateTalentReview(
    [{ id: "d1", category: "VALUE", weight: 1, maxScore: 10, isRequired: true }],
    [{ dimensionId: "d1", ratingCode: "A", numericScore: 4 }],
    [{ gradeCode: "A", minScore: 0, maxScore: 10 }],
    [],
    5,
  );
  assert.equal(result.totalScore, 8);
});
