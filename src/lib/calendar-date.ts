const APP_TIMEZONE = "Asia/Shanghai";

/** 日历日期展示 / `<input type="date">` 值（东八区 yyyy-mm-dd） */
export function formatCalendarDate(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

/** 解析表单 yyyy-mm-dd，按日历日存 UTC 正午，避免时区导致 ±1 天 */
export function parseCalendarDateInput(raw: unknown, label: string): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) throw new Error(`${label}无效`);
    return raw;
  }
  const text = String(raw).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    const fallback = new Date(text);
    if (Number.isNaN(fallback.getTime())) throw new Error(`${label}无效，请使用 yyyy-mm-dd 格式`);
    return fallback;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}
