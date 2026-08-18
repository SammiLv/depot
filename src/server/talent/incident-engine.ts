export function calculateIncidentPenalty(levels: Array<"S" | "A" | "B" | "C" | "D">) { const hasSevereIncident = levels.some((level) => ["S", "A", "B"].includes(level)); const cCount = levels.filter((level) => level === "C").length; const dCount = levels.filter((level) => level === "D").length; return { cCount, dCount, hasSevereIncident, kpiPenalty: hasSevereIncident ? -110 : -Math.min(110, cCount * 40 + dCount * 10) }; }

export type IncidentRestrictionDefinition = {
  controlledType: "PROMOTION" | "SALARY_ADJUSTMENT" | "QUARTERLY_REWARD" | "ANNUAL_REWARD" | "TERMINATION";
  legacyType: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export function addCalendarMonthsClamped(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

export function endOfCalendarQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
}

export function endOfCalendarYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function buildIncidentRestrictions(level: "S" | "A" | "B" | "C" | "D", confirmedAt: Date): IncidentRestrictionDefinition[] {
  const months = level === "A" || level === "B" ? 12 : level === "C" ? 6 : 0;
  if (level === "S") return [{ controlledType: "TERMINATION", legacyType: "TERMINATION", effectiveFrom: confirmedAt, effectiveTo: null }];
  if (level === "D") return [{ controlledType: "QUARTERLY_REWARD", legacyType: "NO_QUARTER_REWARD", effectiveFrom: confirmedAt, effectiveTo: endOfCalendarQuarter(confirmedAt) }];
  const effectiveTo = addCalendarMonthsClamped(confirmedAt, months);
  const restrictions: IncidentRestrictionDefinition[] = [
    { controlledType: "PROMOTION", legacyType: "NO_PROMOTION", effectiveFrom: confirmedAt, effectiveTo },
    { controlledType: "SALARY_ADJUSTMENT", legacyType: "NO_SALARY_ADJUSTMENT", effectiveFrom: confirmedAt, effectiveTo },
    { controlledType: "QUARTERLY_REWARD", legacyType: "NO_QUARTER_REWARD", effectiveFrom: confirmedAt, effectiveTo },
  ];
  if (level === "A") restrictions.push({ controlledType: "ANNUAL_REWARD", legacyType: "NO_ANNUAL_REWARD", effectiveFrom: confirmedAt, effectiveTo: endOfCalendarYear(confirmedAt) });
  return restrictions;
}

export function legacyRestrictionControlledTypes(value: string) {
  const mapping: Record<string, IncidentRestrictionDefinition["controlledType"][]> = {
    NO_PROMOTION_RAISE: ["PROMOTION", "SALARY_ADJUSTMENT"],
    NO_PROMOTION: ["PROMOTION"],
    NO_SALARY_ADJUSTMENT: ["SALARY_ADJUSTMENT"],
    NO_QUARTER_REWARD: ["QUARTERLY_REWARD"],
    NO_ANNUAL_REWARD: ["ANNUAL_REWARD"],
    TERMINATION: ["TERMINATION"],
  };
  return mapping[value] ?? [];
}
