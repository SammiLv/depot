export type ActivePeriod = {
  year: number;
  quarter: number | "all";
};

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
