import type { ScheduleConfig } from "@/server/notifications/types";

function parseTimeOfDay(timeOfDay: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!match) return { hour: 9, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

/** 按 Asia/Shanghai 近似：使用本地时区（服务器应设为东八区）。 */
export function computeNextRunAt(schedule: ScheduleConfig, from = new Date()) {
  const { hour, minute } = parseTimeOfDay(schedule.timeOfDay || "09:00");
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  const advanceOneDay = () => {
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(hour, minute, 0, 0);
  };

  if (candidate.getTime() <= from.getTime()) {
    advanceOneDay();
  }

  if (schedule.frequency === "weekly") {
    const weekdays = (schedule.weekdays?.length ? schedule.weekdays : [1]).map((day) => Number(day));
    for (let i = 0; i < 14; i += 1) {
      if (weekdays.includes(candidate.getDay())) break;
      advanceOneDay();
    }
  }

  return candidate;
}

export function parseScheduleConfig(value: unknown): ScheduleConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ScheduleConfig>;
  if (raw.scanType !== "kpi_self_review_pending" && raw.scanType !== "todo_due") return null;
  if (raw.frequency !== "daily" && raw.frequency !== "weekly") return null;
  return {
    frequency: raw.frequency,
    timeOfDay: typeof raw.timeOfDay === "string" ? raw.timeOfDay : "09:00",
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number) : undefined,
    scanType: raw.scanType,
    daysBefore: typeof raw.daysBefore === "number" ? raw.daysBefore : Number(raw.daysBefore ?? 0) || 0,
    timezone: typeof raw.timezone === "string" ? raw.timezone : "Asia/Shanghai",
  };
}
