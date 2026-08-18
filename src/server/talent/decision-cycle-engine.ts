export type DecisionQuarter = { year: number; quarter: 1 | 2 | 3 | 4 };

export type DecisionPeriod = {
  year: number;
  decisionMonth: 4 | 10;
  name: string;
  observationStartDate: Date;
  observationEndDate: Date;
  decisionDate: Date;
  dataCutoffDate: Date;
  reviewYear: number;
  reviewHalfYear: 1 | 2;
  quarters: [DecisionQuarter, DecisionQuarter];
};

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function utcEndOfDay(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999));
}

export function resolveDecisionPeriod(year: number, decisionMonth: number): DecisionPeriod {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("决策年份无效");
  if (decisionMonth !== 4 && decisionMonth !== 10) throw new Error("决策节点只能选择 4 月或 10 月");
  if (decisionMonth === 4) {
    return {
      year,
      decisionMonth,
      name: `${year}年4月晋升与加薪评估`,
      observationStartDate: utcDate(year - 1, 9, 1),
      observationEndDate: utcEndOfDay(year, 2, 31),
      decisionDate: utcDate(year, 3, 1),
      dataCutoffDate: utcEndOfDay(year, 2, 31),
      reviewYear: year,
      reviewHalfYear: 1,
      quarters: [{ year: year - 1, quarter: 4 }, { year, quarter: 1 }],
    };
  }
  return {
    year,
    decisionMonth,
    name: `${year}年10月晋升与加薪评估`,
    observationStartDate: utcDate(year, 3, 1),
    observationEndDate: utcEndOfDay(year, 8, 30),
    decisionDate: utcDate(year, 9, 1),
    dataCutoffDate: utcEndOfDay(year, 8, 30),
    reviewYear: year,
    reviewHalfYear: 2,
    quarters: [{ year, quarter: 2 }, { year, quarter: 3 }],
  };
}

export function isRestrictionActiveAt(
  restriction: { isActive: boolean; status: string; effectiveFrom: Date; effectiveTo: Date | null },
  decisionDate: Date,
) {
  return restriction.isActive
    && restriction.status === "ACTIVE"
    && restriction.effectiveFrom.getTime() <= decisionDate.getTime()
    && (restriction.effectiveTo === null || restriction.effectiveTo.getTime() >= decisionDate.getTime());
}

export function findMissingHalfYearEvidence(input: {
  quarters: DecisionQuarter[];
  kpis: Array<{ year: number; quarter: number; finalScore: number | null }>;
  hasTalentReview: boolean;
  assessments: Array<{ year: number; quarter: number; hasSummary: boolean }>;
}) {
  const missing: string[] = [];
  for (const quarter of input.quarters) {
    const label = `${quarter.year}年Q${quarter.quarter}`;
    const kpi = input.kpis.find((row) => row.year === quarter.year && row.quarter === quarter.quarter);
    if (!kpi || kpi.finalScore === null) missing.push(`${label}终审KPI`);
    const assessment = input.assessments.find((row) => row.year === quarter.year && row.quarter === quarter.quarter);
    if (!assessment?.hasSummary) missing.push(`${label}业务考核最终结果`);
  }
  if (!input.hasTalentReview) missing.push("对应半年已确认人才盘点");
  return missing;
}
