export function parseIntParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export type PeriodSearchParams = {
  year?: string | string[];
  quarter?: string | string[];
  tab?: string | string[];
  error?: string | string[];
};

export function parsePeriodFromSearchParams(params: PeriodSearchParams | undefined) {
  return {
    selectedYear: parseIntParam(params?.year),
    selectedQuarter: parseIntParam(params?.quarter),
    tab: Array.isArray(params?.tab) ? params.tab[0] : params?.tab,
  };
}
