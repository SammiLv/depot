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

export function isCompletedProjectVisibleInPeriod(
  project: { status: string; completedAt: Date | null },
  period: ActivePeriod,
  isOverdue: boolean,
) {
  if (project.status !== "COMPLETED" || isOverdue) {
    return false;
  }
  if (period.quarter === "all") {
    return (project.completedAt?.getFullYear() ?? period.year) === period.year;
  }
  return getQuarterByDate(project.completedAt) === period.quarter
    && (project.completedAt?.getFullYear() ?? period.year) === period.year;
}

export function isValueTrackVisibleInPeriod(
  track: { trackedAt: Date },
  period: ActivePeriod,
) {
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
