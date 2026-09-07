import type { ProjectStatus } from "@prisma/client";

const PROJECT_NOTIFY_STATUSES: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS"];

export function parseQuarterCode(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  return {
    year: Number.parseInt(match[1], 10),
    quarter: Number.parseInt(match[2], 10),
  };
}

export function getQuarterEndDate(value: string | null | undefined) {
  const parsed = parseQuarterCode(value);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.quarter * 3, 0, 23, 59, 59, 999);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(endDate: Date, now: Date) {
  return Math.round((startOfDay(endDate).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000));
}

type ProjectOverdueInput = {
  endQuarter: string | null;
  status: ProjectStatus;
};

/** 项目延期天数：仅依据项目自身的 endQuarter，与下属任务无关。未延期返回 null。 */
export function getProjectOverdueDays(project: ProjectOverdueInput, now = new Date()) {
  if (!PROJECT_NOTIFY_STATUSES.includes(project.status)) {
    return null;
  }
  if (!project.endQuarter) {
    return null;
  }
  const endDate = getQuarterEndDate(project.endQuarter);
  if (!endDate) {
    return null;
  }
  const remainingDays = daysUntil(endDate, now);
  return remainingDays < 0 ? Math.abs(remainingDays) : null;
}

export function isProjectOverdueForNotification(project: ProjectOverdueInput, now = new Date()) {
  return getProjectOverdueDays(project, now) != null;
}

/** 距项目 endQuarter 截止还剩几天（含 0）；不在窗口内或未设置 endQuarter 时返回 null。 */
export function getProjectDaysUntilDue(project: ProjectOverdueInput, windowDays: number, now = new Date()) {
  if (!PROJECT_NOTIFY_STATUSES.includes(project.status)) {
    return null;
  }
  if (!project.endQuarter) {
    return null;
  }
  const endDate = getQuarterEndDate(project.endQuarter);
  if (!endDate) {
    return null;
  }
  const remainingDays = daysUntil(endDate, now);
  if (remainingDays < 0 || remainingDays > windowDays) {
    return null;
  }
  return remainingDays;
}

export function getMonthEndDate(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

type WorkOverdueInput = {
  year: number;
  endMonth: number | null;
  status: string;
};

/** 任务延期天数：仅依据任务自身的 endMonth。 */
export function getWorkOverdueDays(work: WorkOverdueInput, now = new Date()) {
  if (work.status !== "NOT_STARTED" && work.status !== "IN_PROGRESS") {
    return null;
  }
  if (!work.endMonth) {
    return null;
  }
  const endDate = getMonthEndDate(work.year, work.endMonth);
  const remainingDays = daysUntil(endDate, now);
  return remainingDays < 0 ? Math.abs(remainingDays) : null;
}

export function getWorkDaysUntilDue(work: WorkOverdueInput, windowDays: number, now = new Date()) {
  if (work.status !== "NOT_STARTED" && work.status !== "IN_PROGRESS") {
    return null;
  }
  if (!work.endMonth) {
    return null;
  }
  const remainingDays = daysUntil(getMonthEndDate(work.year, work.endMonth), now);
  if (remainingDays < 0 || remainingDays > windowDays) {
    return null;
  }
  return remainingDays;
}
