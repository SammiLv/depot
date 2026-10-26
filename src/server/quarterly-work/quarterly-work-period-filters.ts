import { parseQuarterCode } from "@/server/quarterly-work/overdue-utils";

export type ActivePeriod = {
  year: number;
  quarter: number | "all";
};

export function compareYearQuarter(
  left: { year: number; quarter: number },
  right: { year: number; quarter: number },
) {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  return left.quarter - right.quarter;
}

export function isPastCalendarQuarter(period: ActivePeriod, now: Date) {
  if (period.quarter === "all") {
    return false;
  }
  const refYear = now.getFullYear();
  const refQuarter = Math.floor(now.getMonth() / 3) + 1;
  return period.year < refYear || (period.year === refYear && period.quarter < refQuarter);
}

export function isCurrentCalendarQuarter(period: ActivePeriod, now: Date) {
  if (period.quarter === "all") {
    return false;
  }
  const refYear = now.getFullYear();
  const refQuarter = Math.floor(now.getMonth() / 3) + 1;
  return period.year === refYear && period.quarter === refQuarter;
}

export function projectRangeHasQuarter(
  project: { startQuarter: string | null; endQuarter: string | null },
  year: number,
  quarter: number,
) {
  const start = parseQuarterCode(project.startQuarter);
  const end = parseQuarterCode(project.endQuarter ?? project.startQuarter);
  if (!start || !end) {
    return true;
  }
  const target = { year, quarter };
  return compareYearQuarter(start, target) <= 0 && compareYearQuarter(target, end) <= 0;
}

export function projectRangeOverlapsYear(
  project: { startQuarter: string | null; endQuarter: string | null },
  year: number,
) {
  const start = parseQuarterCode(project.startQuarter);
  const end = parseQuarterCode(project.endQuarter ?? project.startQuarter);
  if (!start || !end) {
    return true;
  }
  return start.year <= year && year <= end.year;
}

export type QuarterlyWorkPeriodInput = {
  year: number;
  quarter: number;
  startMonth: number | null;
  endMonth: number | null;
  status: string;
  completedAt: Date | null;
};

/** 需求规划周期（月区间或 quarter 字段）是否覆盖所选自然季度 */
export function workPeriodIncludesQuarter(
  work: Pick<QuarterlyWorkPeriodInput, "year" | "quarter" | "startMonth" | "endMonth">,
  year: number,
  quarter: number,
) {
  if (work.year !== year) {
    return false;
  }
  const quarterStartMonth = (quarter - 1) * 3 + 1;
  const quarterEndMonth = quarter * 3;
  const startMonth = work.startMonth ?? work.endMonth;
  const endMonth = work.endMonth ?? work.startMonth;
  if (startMonth != null || endMonth != null) {
    const periodStart = Math.min(startMonth ?? endMonth!, endMonth ?? startMonth!);
    const periodEnd = Math.max(startMonth ?? endMonth!, endMonth ?? startMonth!);
    return periodStart <= quarterEndMonth && periodEnd >= quarterStartMonth;
  }
  return work.quarter === quarter;
}

function eventInCalendarQuarter(date: Date | null | undefined, year: number, quarter: number) {
  if (!date) {
    return false;
  }
  return date.getFullYear() === year && getQuarterByDate(date) === quarter;
}

function isWorkCompletedInQuarter(work: QuarterlyWorkPeriodInput, year: number, quarter: number) {
  if (work.status === "CLOSED" || !work.completedAt) {
    return false;
  }
  if (work.status !== "COMPLETED" && work.status !== "DELAYED_COMPLETED") {
    return false;
  }
  return eventInCalendarQuarter(work.completedAt, year, quarter);
}

function isWorkStillIncompleteForQuarterView(work: Pick<QuarterlyWorkPeriodInput, "status">) {
  return work.status !== "COMPLETED" && work.status !== "DELAYED_COMPLETED" && work.status !== "CLOSED";
}

/** 全部季度：所选年度全部需求 + 上一年度仍未完成的需求 */
export function isQuarterlyWorkVisibleInYearAllView(
  work: QuarterlyWorkPeriodInput,
  year: number,
) {
  if (work.year === year) {
    return true;
  }
  return work.year === year - 1 && isWorkStillIncompleteForQuarterView(work);
}

/** 全部季度：规划周期与所选年度有交集的项目 + 上一年度仍未完成的项目 */
export function isProjectVisibleInYearAllView(project: ProjectPeriodInput, year: number) {
  if (projectRangeOverlapsYear(project, year)) {
    return true;
  }
  return isProjectStillIncompleteForQuarterView(project) && projectRangeOverlapsYear(project, year - 1);
}

/**
 * 需求季度筛选：
 * - 全部季度：见 isQuarterlyWorkVisibleInYearAllView；
 * - 任意具体季度：规划周期包含该季度，或在该自然季完成（与周期无关）；
 * - 仅当前自然季度额外：仍未完成（与周期无关）。
 */
export function isQuarterlyWorkVisibleInPeriod(
  work: QuarterlyWorkPeriodInput,
  period: ActivePeriod,
  now: Date,
) {
  if (period.quarter === "all") {
    return isQuarterlyWorkVisibleInYearAllView(work, period.year);
  }
  const { year, quarter } = period;
  if (work.year !== year) {
    return false;
  }
  if (workPeriodIncludesQuarter(work, year, quarter)) {
    return true;
  }
  if (isWorkCompletedInQuarter(work, year, quarter)) {
    return true;
  }
  if (isCurrentCalendarQuarter(period, now) && isWorkStillIncompleteForQuarterView(work)) {
    return true;
  }
  return false;
}

export type ProjectPeriodInput = {
  startQuarter: string | null;
  endQuarter: string | null;
  status: string;
  completedAt: Date | null;
};

function isProjectStillIncompleteForQuarterView(project: Pick<ProjectPeriodInput, "status">) {
  return project.status !== "COMPLETED" && project.status !== "CLOSED";
}

/**
 * 项目季度筛选（与需求同口径；「在该季完成」指 status=COMPLETED 且 completedAt 落在该季）。
 */
export function isProjectVisibleInPeriod(
  project: ProjectPeriodInput,
  period: ActivePeriod,
  now: Date,
) {
  if (period.quarter === "all") {
    return isProjectVisibleInYearAllView(project, period.year);
  }
  const { year, quarter } = period;
  if (projectRangeHasQuarter(project, year, quarter)) {
    return true;
  }
  if (project.status === "COMPLETED" && eventInCalendarQuarter(project.completedAt, year, quarter)) {
    return true;
  }
  if (isCurrentCalendarQuarter(period, now) && isProjectStillIncompleteForQuarterView(project)) {
    return true;
  }
  return false;
}

export function getQuarterByDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }
  return Math.floor(date.getMonth() / 3) + 1;
}

function getPeriodRange(period: ActivePeriod): { start: Date; end: Date } {
  if (period.quarter === "all") {
    return { start: new Date(period.year, 0, 1), end: new Date(period.year + 1, 0, 1) };
  }
  const start = new Date(period.year, (period.quarter - 1) * 3, 1);
  return { start, end: new Date(period.year, period.quarter * 3, 1) };
}

export function isLaunchedProjectVisibleInPeriod(
  project: { status: string; launchedAt: Date | null },
  period: ActivePeriod,
  isOverdue: boolean,
) {
  if (project.status !== "LAUNCHED" || isOverdue) {
    return false;
  }
  if (period.quarter === "all") {
    return (project.launchedAt?.getFullYear() ?? period.year) === period.year;
  }
  return getQuarterByDate(project.launchedAt) === period.quarter
    && (project.launchedAt?.getFullYear() ?? period.year) === period.year;
}

/**
 * 跟踪任务是否在所选自然季度可见：
 * 任务的跟踪周期（periodStartAt ~ deadlineAt）与所选季度有交集即可见；
 * 历史记录缺少周期字段时回退为按填报时间所在季度判断。
 */
export function isValueTrackVisibleInPeriod(
  track: { trackedAt: Date; periodStartAt?: Date | null; deadlineAt?: Date | null },
  period: ActivePeriod,
) {
  const { start, end } = getPeriodRange(period);
  if (track.periodStartAt && track.deadlineAt) {
    return track.periodStartAt < end && track.deadlineAt >= start;
  }
  if (period.quarter === "all") {
    return track.trackedAt.getFullYear() === period.year;
  }
  return getQuarterByDate(track.trackedAt) === period.quarter
    && track.trackedAt.getFullYear() === period.year;
}

/** 工作区侧栏状态筛选：进行中/未启动等逾期归入「延期」；已完成/已关闭以库内状态为准（逾期完成仍算已完成） */
export function resolveProjectWorkspaceStatusFilterKey(
  status: string,
  isOverdue: boolean,
): "DELAYED" | "NOT_STARTED" | "IN_PROGRESS" | "LAUNCHED" | "COMPLETED" | "CLOSED" {
  if (status === "COMPLETED" || status === "CLOSED") {
    return status;
  }
  if (isOverdue) {
    return "DELAYED";
  }
  return status as "NOT_STARTED" | "IN_PROGRESS" | "LAUNCHED";
}

export function matchesDepartmentAndTeamScope(
  item: { teamOrgNodeId: string | null; departmentOrgNodeId: string | null },
  departmentTab: string,
  teamTab: string,
  teamDepartmentMap: Map<string, string>,
) {
  const belongsToDepartment = item.departmentOrgNodeId
    ? item.departmentOrgNodeId === departmentTab
    : Boolean(item.teamOrgNodeId && teamDepartmentMap.get(item.teamOrgNodeId) === departmentTab);
  if (!belongsToDepartment) {
    return false;
  }
  if (teamTab === "all") {
    return true;
  }
  return item.teamOrgNodeId === teamTab;
}
