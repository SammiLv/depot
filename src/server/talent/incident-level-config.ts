export type IncidentLevelOption = { value: string; label: string };

export function parseIncidentLevelOptions(value: string): IncidentLevelOption[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const options: IncidentLevelOption[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const optionValue = typeof row.level === "string" ? row.level.trim() : "";
    if (!optionValue || seen.has(optionValue)) continue;
    const configuredName = typeof row.name === "string" ? row.name.trim() : "";
    options.push({ value: optionValue, label: configuredName || `${optionValue}级事故` });
    seen.add(optionValue);
  }
  return options;
}
