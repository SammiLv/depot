import { SCHEDULE_SCAN_REGISTRY } from "@/server/notifications/event-registry";
import type { ScheduleConfig, ScheduleScanType } from "@/server/notifications/types";

const SCHEDULE_SCANS_WITHOUT_DAYS_BEFORE = new Set<ScheduleScanType>([
  "kpi_initialization_pending",
  "annual_goal_quarter_target_missing",
  "quarterly_work_overdue",
  "project_overdue",
]);

export function scheduleScanUsesDaysBefore(scanType: ScheduleScanType): boolean {
  return !SCHEDULE_SCANS_WITHOUT_DAYS_BEFORE.has(scanType);
}

export function scheduleScanDaysBeforeLabel(scanType: ScheduleScanType): string {
  if (scanType === "annual_goal_weekly_progress_pending") return "未更新天数";
  if (scanType === "project_value_track_pending") return "季度末提前天数";
  return "提前天数";
}

export function scheduleScanDaysBeforeHint(scanType: ScheduleScanType): string | null {
  if (scanType === "annual_goal_weekly_progress_pending") {
    return "扫描小组承接的当前季度指标：距本次扫描时间超过该天数仍未更新进度时通知责任人。";
  }
  if (scanType === "quarterly_work_due_soon") {
    return "到执行时间后，扫描距离任务结束月份不足该天数的未完成任务并提醒。";
  }
  if (scanType === "project_due_soon") {
    return "到执行时间后，扫描距离项目结束季度不足该天数的未完成项目并提醒。";
  }
  if (scanType === "project_value_track_pending") {
    return "到执行时间后，扫描距本季度结束不足该天数且价值跟踪尚未完成的项目并提醒。";
  }
  if (scanType === "quarterly_work_overdue" || scanType === "project_overdue") {
    return "到执行时间后直接扫描已延期的记录，无需设置提前天数。";
  }
  return null;
}

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

  if (schedule.frequency === "weekly" || schedule.frequency === "daily") {
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
  const scanType = raw.scanType;
  if (!scanType || !(scanType in SCHEDULE_SCAN_REGISTRY)) return null;
  if (raw.frequency !== "daily" && raw.frequency !== "weekly") return null;
  return {
    frequency: raw.frequency,
    timeOfDay: typeof raw.timeOfDay === "string" ? raw.timeOfDay : "09:00",
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number) : undefined,
    scanType: scanType as ScheduleScanType,
    daysBefore: typeof raw.daysBefore === "number" ? raw.daysBefore : Number(raw.daysBefore ?? 0) || 0,
    timezone: typeof raw.timezone === "string" ? raw.timezone : "Asia/Shanghai",
  };
}
