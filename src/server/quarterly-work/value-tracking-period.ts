/**
 * 价值跟踪周期计算（纯函数）。
 *
 * 业务规则：
 * - 项目首次上线日起连续跟踪 6 个自然月；
 * - 第 1 检查点 = 上线日 + 3 个自然月，第 2 检查点 = 上线日 + 6 个自然月；
 * - 每条任务的填报截止日期 = 检查点 + 7 个自然日；
 * - 月份加法必须按自然月并处理月末钳制（如 2026-01-31 + 3 个月 = 2026-04-30）。
 *
 * 所有日期比较统一使用服务器本地时区的「业务日期」（年月日），
 * 不允许直接拿 UTC 时间戳与当天零点比较。
 */

export const VALUE_TRACKING_TOTAL_MONTHS = 6;
export const VALUE_TRACKING_CHECKPOINT_INTERVAL_MONTHS = 3;
export const VALUE_TRACKING_FILL_GRACE_DAYS = 7;

export type ValueTrackingSequence = 1 | 2;

export type ValueTrackingTaskDates = {
  periodStartAt: Date;
  checkpointAt: Date;
  deadlineAt: Date;
};

/** 归一化为业务日期（本地时区当天零点） */
export function toBusinessDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** 自然月加法，月末钳制：2026-01-31 + 3 → 2026-04-30 */
export function addCalendarMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const firstOfTarget = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(day, daysInTargetMonth));
}

/** 自然日加法，支持跨月跨年 */
export function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 6 个月跟踪窗口：[上线日, 上线日 + 6 个月)，右开区间 */
export function getValueTrackingWindow(launchedAt: Date): { start: Date; end: Date } {
  const start = toBusinessDate(launchedAt);
  return { start, end: addCalendarMonthsClamped(start, VALUE_TRACKING_TOTAL_MONTHS) };
}

/** 第 sequence 条跟踪任务的周期起点、检查点和填报截止日期 */
export function getValueTrackingTaskDates(launchedAt: Date, sequence: ValueTrackingSequence): ValueTrackingTaskDates {
  const start = toBusinessDate(launchedAt);
  const periodStartAt = sequence === 1
    ? start
    : addCalendarMonthsClamped(start, VALUE_TRACKING_CHECKPOINT_INTERVAL_MONTHS);
  const checkpointAt = addCalendarMonthsClamped(start, VALUE_TRACKING_CHECKPOINT_INTERVAL_MONTHS * sequence);
  const deadlineAt = addCalendarDays(checkpointAt, VALUE_TRACKING_FILL_GRACE_DAYS);
  return { periodStartAt, checkpointAt, deadlineAt };
}

/** 最终填报截止日期（第 2 检查点 + 7 个自然日） */
export function getValueTrackingDeadline(launchedAt: Date): Date {
  return getValueTrackingTaskDates(launchedAt, 2).deadlineAt;
}

/** 所选自然季度与 6 个月跟踪窗口是否相交（季度右开、窗口右开） */
export function doesCalendarQuarterOverlapTrackingWindow(launchedAt: Date, year: number, quarter: number): boolean {
  const { start, end } = getValueTrackingWindow(launchedAt);
  const quarterStart = new Date(year, (quarter - 1) * 3, 1);
  const quarterEnd = addCalendarMonthsClamped(quarterStart, 3);
  return start < quarterEnd && quarterStart < end;
}

/** 年度「全部季度」视图：窗口与所选年份是否相交 */
export function doesYearOverlapTrackingWindow(launchedAt: Date, year: number): boolean {
  const { start, end } = getValueTrackingWindow(launchedAt);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  return start < yearEnd && yearStart < end;
}

/**
 * 根据填报时间推断历史记录属于第几次检查。
 * 超出第 2 检查点的记录无法明确归类，返回 null（由迁移流程输出冲突清单）。
 */
export function getValueTrackingSequence(launchedAt: Date, trackedAt: Date): ValueTrackingSequence | null {
  const tracked = toBusinessDate(trackedAt);
  const first = getValueTrackingTaskDates(launchedAt, 1);
  if (tracked < first.checkpointAt) return 1;
  const second = getValueTrackingTaskDates(launchedAt, 2);
  if (tracked < second.checkpointAt) return 2;
  return null;
}

export type ValueTrackTaskState = "COMPLETED" | "NOT_DUE" | "PENDING" | "OVERDUE";

/**
 * 任务显示状态（派生，不落库）：
 * - 已完成：completedAt 非空；
 * - 未到期：当前业务日期早于检查点；
 * - 待处理：检查点（含）至截止日期（含）；
 * - 逾期：晚于截止日期仍未完成。
 */
export function getValueTrackTaskState(
  task: { completedAt: Date | null; checkpointAt: Date | null; deadlineAt: Date | null },
  now: Date = new Date(),
): ValueTrackTaskState {
  if (task.completedAt) return "COMPLETED";
  if (!task.checkpointAt || !task.deadlineAt) return "PENDING";
  const today = toBusinessDate(now);
  if (today < toBusinessDate(task.checkpointAt)) return "NOT_DUE";
  if (today <= toBusinessDate(task.deadlineAt)) return "PENDING";
  return "OVERDUE";
}

/** 项目是否已超出最终填报截止日期且尚未完成最终确认（逾期待完成） */
export function isValueTrackingOverdue(
  project: { launchedAt: Date | null },
  hasFinalCompletion: boolean,
  now: Date = new Date(),
): boolean {
  if (!project.launchedAt || hasFinalCompletion) return false;
  return toBusinessDate(now) > getValueTrackingDeadline(project.launchedAt);
}
