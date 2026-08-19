import type { ScheduleConfig } from "@/server/notifications/types";

function parseTimeOfDay(timeOfDay: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!match) return { hour: 9, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

/** 定时任务去重槽位（按东八区自然日）。 */
export function getScheduleSlot(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

/** 按 Asia/Shanghai 近似：使用本地时区（服务器应设为东八区）。 */
export function computeNextRunAt(
  schedule: ScheduleConfig,
  from = new Date(),
  options?: { skipGrace?: boolean },
) {
  const { hour, minute } = parseTimeOfDay(schedule.timeOfDay || "09:00");
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  const advanceOneDay = () => {
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(hour, minute, 0, 0);
  };

  if (candidate.getTime() <= from.getTime()) {
    if (!options?.skipGrace) {
      const missedMs = from.getTime() - candidate.getTime();
      const graceMs = 30 * 60 * 1000;
      if (missedMs <= graceMs) {
        const immediate = new Date(from);
        immediate.setSeconds(0, 0);
        immediate.setMilliseconds(0);
        if (immediate.getTime() <= from.getTime()) {
          immediate.setMinutes(immediate.getMinutes() + 1);
        }
        return immediate;
      }
    }
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

export type ScheduleNextRunPreview = {
  nextRunAt: Date;
  mode: "future" | "catchup_now" | "tomorrow";
};

/** 预览保存后的下次执行计划（不含 skipGrace，与保存逻辑一致）。 */
export function previewScheduleNextRun(schedule: ScheduleConfig, from = new Date()): ScheduleNextRunPreview {
  const { hour, minute } = parseTimeOfDay(schedule.timeOfDay || "09:00");
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMilliseconds(0);
  candidate.setHours(hour, minute, 0, 0);

  if (candidate.getTime() > from.getTime()) {
    return { nextRunAt: candidate, mode: "future" };
  }

  const missedMs = from.getTime() - candidate.getTime();
  const graceMs = 30 * 60 * 1000;
  if (missedMs <= graceMs) {
    const immediate = new Date(from);
    immediate.setSeconds(0, 0);
    immediate.setMilliseconds(0);
    if (immediate.getTime() <= from.getTime()) {
      immediate.setMinutes(immediate.getMinutes() + 1);
    }
    return { nextRunAt: immediate, mode: "catchup_now" };
  }

  return {
    nextRunAt: computeNextRunAt(schedule, from, { skipGrace: true }),
    mode: "tomorrow",
  };
}

export function formatScheduleNextRunHint(preview: ScheduleNextRunPreview, timeOfDay: string) {
  const when = preview.nextRunAt.toLocaleString("zh-CN", { hour12: false });
  if (preview.mode === "future") {
    return `保存后将于 ${when} 首次执行。建议在执行时间之前保存，以确保准时触发。`;
  }
  if (preview.mode === "catchup_now") {
    return `当前已超过今日 ${timeOfDay}。保存后将立即补跑一次（约 ${when}），之后仍按每天 ${timeOfDay} 定时执行。`;
  }
  return `当前已超过今日 ${timeOfDay} 30 分钟以上。保存后将推迟到 ${when} 执行，今日不会补跑。`;
}

export function parseScheduleConfig(value: unknown): ScheduleConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ScheduleConfig>;
  if (
    raw.scanType !== "kpi_initialization_pending"
    && raw.scanType !== "kpi_self_review_pending"
    && raw.scanType !== "todo_due"
    && raw.scanType !== "annual_goal_weekly_progress_pending"
    && raw.scanType !== "annual_goal_quarter_target_missing"
  ) {
    return null;
  }
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
