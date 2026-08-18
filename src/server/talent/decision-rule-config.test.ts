import assert from "node:assert/strict";
import test from "node:test";
import { resolveKpiRating, validateKpiRatingBands } from "./decision-rule-config";

const validBands = [
  { name: "S", minScore: 110, maxScore: null, isUnbounded: true, sortOrder: 1 },
  { name: "A", minScore: 100, maxScore: 109, isUnbounded: false, sortOrder: 2 },
  { name: "B", minScore: 90, maxScore: 99, isUnbounded: false, sortOrder: 3 },
  { name: "C", minScore: 70, maxScore: 89, isUnbounded: false, sortOrder: 4 },
  { name: "D", minScore: 0, maxScore: 69, isUnbounded: false, sortOrder: 5 },
];

test("KPI 等级默认区间连续且只有最高等级不设上限", () => {
  assert.equal(validateKpiRatingBands(validBands).length, 5);
  assert.equal(resolveKpiRating(110, validBands)?.name, "S");
  assert.equal(resolveKpiRating(109, validBands)?.name, "A");
  assert.equal(resolveKpiRating(109.5, validBands)?.name, "A");
  assert.equal(resolveKpiRating(69, validBands)?.name, "D");
});

test("KPI 等级区间拒绝重叠、断档和多个不设上限等级", () => {
  assert.throws(() => validateKpiRatingBands(validBands.map((band) => band.name === "B" ? { ...band, minScore: 89 } : band)), /重叠/);
  assert.throws(() => validateKpiRatingBands(validBands.map((band) => band.name === "B" ? { ...band, minScore: 91 } : band)), /断档/);
  assert.throws(() => validateKpiRatingBands(validBands.map((band) => band.name === "A" ? { ...band, maxScore: null, isUnbounded: true } : band)), /只能有一个/);
});
