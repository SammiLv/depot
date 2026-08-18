import assert from "node:assert/strict";
import test from "node:test";
import { assertValidJobLevelStep, assertValidSalaryCap, salaryCapScopesOverlap } from "./foundation";

test("职级分档支持 R3-1/R3-2/R3-3 的正整数顺序", () => {
  assert.doesNotThrow(() => assertValidJobLevelStep(3));
  assert.throws(() => assertValidJobLevelStep(0));
  assert.throws(() => assertValidJobLevelStep(1.5));
});

test("薪资上限必须为正整数", () => {
  assert.doesNotThrow(() => assertValidSalaryCap(20_000));
  assert.throws(() => assertValidSalaryCap(-1));
});

test("同一职级、相交有效期会被识别", () => {
  const base = { jobLevelGroupId: "R3", jobLevelId: "R3-2" };
  assert.equal(salaryCapScopesOverlap(
    { ...base, effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-12-31") },
    { ...base, effectiveFrom: new Date("2026-06-01"), effectiveTo: null },
  ), true);
  assert.equal(salaryCapScopesOverlap(
    { ...base, effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-03-31") },
    { ...base, effectiveFrom: new Date("2026-04-01"), effectiveTo: null },
  ), false);
});
