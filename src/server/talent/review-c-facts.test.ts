import assert from "node:assert/strict";
import test from "node:test";
import { computeReviewCFacts, periodOfDate } from "./review-c-facts";

test("periodOfDate：上下半年划分", () => {
  assert.deepEqual(periodOfDate(new Date("2026-01-15")), { year: 2026, half: 1 });
  assert.deepEqual(periodOfDate(new Date("2026-06-30")), { year: 2026, half: 1 });
  assert.deepEqual(periodOfDate(new Date("2026-07-01")), { year: 2026, half: 2 });
});

const reviews = [
  { year: 2024, half: 1, grade: "B" },
  { year: 2024, half: 2, grade: "C" },
  { year: 2025, half: 1, grade: "C" },
  { year: 2025, half: 2, grade: "A" },
  { year: 2026, half: 1, grade: "C" },
];

test("无聘期信息：三项均无法判定", () => {
  assert.deepEqual(computeReviewCFacts(reviews, null, null), {
    hasTwoC: null,
    consecutiveTwoC: null,
    preRenewalC: null,
  });
});

test("聘期内 C 级计数与连续判定", () => {
  // 聘期 2024-07 ~ 2026-06：覆盖 2024H2(C)、2025H1(C)、2025H2(A)、2026H1(C) → 3 次 C，最近两次 A/C 不连续
  const facts = computeReviewCFacts(reviews, new Date("2024-07-01"), new Date("2026-06-30"));
  assert.equal(facts.hasTwoC, true);
  assert.equal(facts.consecutiveTwoC, false);
  // 聘期前（2024H1）最近一次为 B
  assert.equal(facts.preRenewalC, false);
});

test("连续两次 C 判定：最近两次均为 C", () => {
  const facts = computeReviewCFacts(reviews, new Date("2024-12-01"), new Date("2025-06-30"));
  // 聘期覆盖 2024H2(C)、2025H1(C)
  assert.equal(facts.hasTwoC, true);
  assert.equal(facts.consecutiveTwoC, true);
  assert.equal(facts.preRenewalC, false); // 聘期前 2024H1 为 B
});

test("续聘前盘点 C：取聘期开始前最近一次", () => {
  const facts = computeReviewCFacts(reviews, new Date("2025-01-01"), null);
  // 聘期前 2024H2 为 C
  assert.equal(facts.preRenewalC, true);
});

test("区间内无盘点记录：无法判定为 null，不等同于否", () => {
  const facts = computeReviewCFacts([], new Date("2024-07-01"), null);
  assert.deepEqual(facts, { hasTwoC: null, consecutiveTwoC: null, preRenewalC: null });
});

test("聘期内只有一次盘点：连续判定为 null", () => {
  const facts = computeReviewCFacts([{ year: 2025, half: 1, grade: "C" }], new Date("2025-01-01"), null);
  assert.equal(facts.hasTwoC, false);
  assert.equal(facts.consecutiveTwoC, null);
});

test("输入乱序也能正确排序计算", () => {
  const shuffled = [reviews[3], reviews[0], reviews[4], reviews[1], reviews[2]];
  const facts = computeReviewCFacts(shuffled, new Date("2024-07-01"), new Date("2026-06-30"));
  assert.equal(facts.hasTwoC, true);
  assert.equal(facts.consecutiveTwoC, false);
  assert.equal(facts.preRenewalC, false);
});
