export type ConfiguredLevelOption = { value: string; label: string };

export function kpiRatingBandOptions(rows: Array<{ name: string; description: string | null }>): ConfiguredLevelOption[] {
  return rows.map((row) => ({
    value: row.name,
    label: row.description ? `${row.name} · ${row.description}` : row.name,
  }));
}

export function talentGradeThresholdOptions(rows: Array<{ gradeCode: string; label: string }>): ConfiguredLevelOption[] {
  return rows.map((row) => ({
    value: row.gradeCode,
    label: row.label ? `${row.gradeCode} · ${row.label}` : row.gradeCode,
  }));
}
