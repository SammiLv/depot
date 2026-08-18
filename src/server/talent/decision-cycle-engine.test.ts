import assert from "node:assert/strict";
import test from "node:test";
import { findMissingHalfYearEvidence, isRestrictionActiveAt, resolveDecisionPeriod } from "./decision-cycle-engine";

test("4月节点跨年聚合上年Q4和当年Q1", () => {
  const period = resolveDecisionPeriod(2026, 4);
  assert.deepEqual(period.quarters, [{ year: 2025, quarter: 4 }, { year: 2026, quarter: 1 }]);
  assert.equal(period.observationStartDate.toISOString(), "2025-10-01T00:00:00.000Z");
  assert.equal(period.observationEndDate.toISOString(), "2026-03-31T23:59:59.999Z");
});

test("10月节点聚合当年Q2和Q3", () => {
  const period = resolveDecisionPeriod(2026, 10);
  assert.deepEqual(period.quarters, [{ year: 2026, quarter: 2 }, { year: 2026, quarter: 3 }]);
  assert.equal(period.observationStartDate.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(period.observationEndDate.toISOString(), "2026-09-30T23:59:59.999Z");
});

test("限制在节点当天到期仍然生效，节点前一天到期则失效", () => {
  const decisionDate = new Date("2026-10-01T00:00:00.000Z");
  assert.equal(isRestrictionActiveAt({ isActive: true, status: "ACTIVE", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: decisionDate }, decisionDate), true);
  assert.equal(isRestrictionActiveAt({ isActive: true, status: "ACTIVE", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: new Date("2026-09-30T23:59:59.999Z") }, decisionDate), false);
});

test("任一季度KPI、业务考核或半年盘点缺失均标记资料不完整", () => {
  const missing = findMissingHalfYearEvidence({
    quarters: [{ year: 2026, quarter: 2 }, { year: 2026, quarter: 3 }],
    kpis: [{ year: 2026, quarter: 2, finalScore: 101 }],
    hasTalentReview: false,
    assessments: [{ year: 2026, quarter: 2, hasSummary: true }, { year: 2026, quarter: 3, hasSummary: false }],
  });
  assert.deepEqual(missing, ["2026年Q3终审KPI", "2026年Q3业务考核最终结果", "对应半年已确认人才盘点"]);
});
