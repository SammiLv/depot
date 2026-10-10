import test from "node:test";
import assert from "node:assert/strict";
import { resolveKpiPeriod } from "@/server/kpi/kpi-period";

const now = new Date(2026, 9, 10); // 2026 Q4

test("未指定季度时使用当前季度", () => {
  assert.deepEqual(resolveKpiPeriod(now), {
    year: 2026,
    quarter: 4,
    quarterFilter: 4,
    templateQuarter: 4,
    filterAllQuarters: false,
  });
});

test("quarter=0 表示所选年份全部季度", () => {
  assert.deepEqual(resolveKpiPeriod(now, { selectedYear: 2026, selectedQuarter: 0 }), {
    year: 2026,
    quarter: 0,
    quarterFilter: null,
    templateQuarter: 4,
    filterAllQuarters: true,
  });
});

test("指定季度保持原筛选", () => {
  assert.deepEqual(resolveKpiPeriod(now, { selectedYear: 2025, selectedQuarter: 2 }), {
    year: 2025,
    quarter: 2,
    quarterFilter: 2,
    templateQuarter: 2,
    filterAllQuarters: false,
  });
});
