export type KpiPeriodOptions = {
  selectedYear?: number;
  selectedQuarter?: number;
};

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function resolveKpiPeriod(now: Date, options: KpiPeriodOptions = {}) {
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const year = finiteNumber(options.selectedYear) ?? currentYear;
  const filterAllQuarters = options.selectedQuarter === 0;
  const selectedQuarter = ([1, 2, 3, 4] as const).includes(options.selectedQuarter as 1 | 2 | 3 | 4)
    ? options.selectedQuarter as number
    : currentQuarter;

  return {
    year,
    quarter: filterAllQuarters ? 0 : selectedQuarter,
    quarterFilter: filterAllQuarters ? null : selectedQuarter,
    // 模板有效期仍需一个具体季度；全年列表下沿用当前季度。
    templateQuarter: filterAllQuarters ? currentQuarter : selectedQuarter,
    filterAllQuarters,
  };
}
