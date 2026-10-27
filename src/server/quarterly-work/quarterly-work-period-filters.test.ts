import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuarterByDate,
  isLaunchedProjectVisibleInPeriod,
  isProjectVisibleInPeriod,
  isProjectVisibleInYearAllView,
  isQuarterlyWorkVisibleInPeriod,
  isQuarterlyWorkVisibleInYearAllView,
  isValueTrackVisibleInPeriod,
  matchesDepartmentAndTeamScope,
  resolveProjectWorkspaceStatusFilterKey,
  workPeriodIncludesQuarter,
} from "@/server/quarterly-work/quarterly-work-period-filters";

test("resolveProjectWorkspaceStatusFilterKey keeps completed/closed out of delayed bucket", () => {
  assert.equal(resolveProjectWorkspaceStatusFilterKey("COMPLETED", true), "COMPLETED");
  assert.equal(resolveProjectWorkspaceStatusFilterKey("CLOSED", true), "CLOSED");
  assert.equal(resolveProjectWorkspaceStatusFilterKey("IN_PROGRESS", true), "DELAYED");
  assert.equal(resolveProjectWorkspaceStatusFilterKey("IN_PROGRESS", false), "IN_PROGRESS");
});

test("getQuarterByDate returns calendar quarter", () => {
  assert.equal(getQuarterByDate(new Date(2026, 7, 3)), 3);
  assert.equal(getQuarterByDate(null), null);
});

test("isLaunchedProjectVisibleInPeriod filters by launchedAt year and quarter", () => {
  const period = { year: 2026, quarter: 3 as const };
  const launchedProject = {
    status: "LAUNCHED",
    launchedAt: new Date(2026, 7, 15),
  };

  assert.equal(isLaunchedProjectVisibleInPeriod(launchedProject, period, false), true);
  assert.equal(isLaunchedProjectVisibleInPeriod(launchedProject, { year: 2026, quarter: 2 }, false), false);
  assert.equal(isLaunchedProjectVisibleInPeriod(launchedProject, { year: 2026, quarter: "all" }, false), true);
  assert.equal(isLaunchedProjectVisibleInPeriod({ ...launchedProject, status: "COMPLETED" }, period, false), false);
  assert.equal(isLaunchedProjectVisibleInPeriod({ ...launchedProject, status: "IN_PROGRESS" }, period, false), false);
  assert.equal(isLaunchedProjectVisibleInPeriod(launchedProject, period, true), false);
});

test("isValueTrackVisibleInPeriod filters by trackedAt year and quarter (legacy records)", () => {
  const period = { year: 2026, quarter: 3 as const };
  const track = { trackedAt: new Date(2026, 8, 3, 17, 7) };

  assert.equal(isValueTrackVisibleInPeriod(track, period), true);
  assert.equal(isValueTrackVisibleInPeriod(track, { year: 2026, quarter: 2 }), false);
  assert.equal(isValueTrackVisibleInPeriod(track, { year: 2025, quarter: 3 }), false);
  assert.equal(isValueTrackVisibleInPeriod(track, { year: 2026, quarter: "all" }), true);
});

test("isValueTrackVisibleInPeriod 按任务跟踪周期与所选季度相交判断", () => {
  // 2026-06-30 上线：第 1 周期 6-30 ~ 10-07，第 2 周期 9-30 ~ 2027-01-06
  const track1 = { trackedAt: new Date(2026, 5, 30), periodStartAt: new Date(2026, 5, 30), deadlineAt: new Date(2026, 9, 7) };
  const track2 = { trackedAt: new Date(2026, 5, 30), periodStartAt: new Date(2026, 8, 30), deadlineAt: new Date(2027, 0, 6) };

  assert.equal(isValueTrackVisibleInPeriod(track1, { year: 2026, quarter: 2 }), true);
  assert.equal(isValueTrackVisibleInPeriod(track1, { year: 2026, quarter: 3 }), true);
  assert.equal(isValueTrackVisibleInPeriod(track1, { year: 2026, quarter: 4 }), true);
  assert.equal(isValueTrackVisibleInPeriod(track1, { year: 2027, quarter: 1 }), false);
  assert.equal(isValueTrackVisibleInPeriod(track2, { year: 2026, quarter: 3 }), true);
  assert.equal(isValueTrackVisibleInPeriod(track2, { year: 2027, quarter: 1 }), true);
  assert.equal(isValueTrackVisibleInPeriod(track2, { year: 2027, quarter: "all" }), true);
  assert.equal(isValueTrackVisibleInPeriod(track2, { year: 2025, quarter: "all" }), false);
});

test("year all view includes prior-year unfinished work and projects", () => {
  const periodAll2026 = { year: 2026, quarter: "all" as const };
  const now = new Date(2026, 9, 15);
  const unfinished2025 = {
    year: 2025,
    quarter: 4,
    startMonth: 10,
    endMonth: 12,
    status: "IN_PROGRESS",
    completedAt: null,
  };
  const finished2025 = { ...unfinished2025, status: "COMPLETED", completedAt: new Date(2025, 11, 20) };

  assert.equal(isQuarterlyWorkVisibleInYearAllView(unfinished2025, 2026), true);
  assert.equal(isQuarterlyWorkVisibleInYearAllView(finished2025, 2026), false);
  assert.equal(isQuarterlyWorkVisibleInPeriod(unfinished2025, periodAll2026, now), true);

  const unfinishedProject2025 = {
    startQuarter: "2025-Q4",
    endQuarter: "2025-Q4",
    status: "IN_PROGRESS",
    completedAt: null,
  };
  assert.equal(isProjectVisibleInYearAllView(unfinishedProject2025, 2026), true);
  assert.equal(
    isProjectVisibleInPeriod(unfinishedProject2025, periodAll2026, now),
    true,
  );
});

test("workPeriodIncludesQuarter intersects month range with calendar quarter", () => {
  const work = { year: 2026, quarter: 3, startMonth: 8, endMonth: 9 };
  assert.equal(workPeriodIncludesQuarter(work, 2026, 2), false);
  assert.equal(workPeriodIncludesQuarter(work, 2026, 3), true);
  assert.equal(workPeriodIncludesQuarter({ ...work, startMonth: 6, endMonth: 10 }, 2026, 2), true);
  assert.equal(workPeriodIncludesQuarter({ ...work, startMonth: 6, endMonth: 10 }, 2026, 4), true);
});

test("isQuarterlyWorkVisibleInPeriod past quarter only by period; current quarter adds carry-forward", () => {
  const now = new Date(2026, 9, 15); // 2026 Q4
  const periodQ2 = { year: 2026, quarter: 2 as const };
  const periodQ4 = { year: 2026, quarter: 4 as const };
  const overdueQ3Period = {
    year: 2026,
    quarter: 3,
    startMonth: 8,
    endMonth: 9,
    status: "IN_PROGRESS",
    completedAt: null,
  };

  assert.equal(isQuarterlyWorkVisibleInPeriod(overdueQ3Period, periodQ2, now), false);
  assert.equal(isQuarterlyWorkVisibleInPeriod(overdueQ3Period, periodQ4, now), true);

  const completedInQ4PeriodQ1 = {
    year: 2026,
    quarter: 1,
    startMonth: 1,
    endMonth: 3,
    status: "COMPLETED",
    completedAt: new Date(2026, 9, 10),
  };
  assert.equal(isQuarterlyWorkVisibleInPeriod(completedInQ4PeriodQ1, periodQ2, now), false);
  assert.equal(isQuarterlyWorkVisibleInPeriod(completedInQ4PeriodQ1, periodQ4, now), true);

  const completedInQ2PeriodQ1 = {
    year: 2026,
    quarter: 1,
    startMonth: 1,
    endMonth: 3,
    status: "COMPLETED",
    completedAt: new Date(2026, 4, 10),
  };
  assert.equal(workPeriodIncludesQuarter(completedInQ2PeriodQ1, 2026, 2), false);
  assert.equal(isQuarterlyWorkVisibleInPeriod(completedInQ2PeriodQ1, periodQ2, now), true);

  const closedCarry = { ...overdueQ3Period, status: "CLOSED" };
  assert.equal(isQuarterlyWorkVisibleInPeriod(closedCarry, periodQ4, now), false);
});

test("isProjectVisibleInPeriod aligns with work rules", () => {
  const now = new Date(2026, 9, 15);
  const periodQ2 = { year: 2026, quarter: 2 as const };
  const periodQ4 = { year: 2026, quarter: 4 as const };
  const overdueProject = {
    startQuarter: "2026-Q3",
    endQuarter: "2026-Q3",
    status: "IN_PROGRESS",
    completedAt: null,
  };

  assert.equal(isProjectVisibleInPeriod(overdueProject, periodQ2, now), false);
  assert.equal(isProjectVisibleInPeriod(overdueProject, periodQ4, now), true);

  const completedInQ2 = {
    startQuarter: "2026-Q1",
    endQuarter: "2026-Q1",
    status: "COMPLETED",
    completedAt: new Date(2026, 4, 10),
  };
  assert.equal(isProjectVisibleInPeriod(completedInQ2, periodQ2, now), true);
  assert.equal(isProjectVisibleInPeriod(completedInQ2, periodQ4, now), false);
});

test("matchesDepartmentAndTeamScope respects department and team tabs", () => {
  const teamDepartmentMap = new Map([
    ["team-a", "dept-a"],
    ["team-b", "dept-b"],
  ]);

  const item = { departmentOrgNodeId: "dept-a", teamOrgNodeId: "team-a" };

  assert.equal(matchesDepartmentAndTeamScope(item, "dept-a", "all", teamDepartmentMap), true);
  assert.equal(matchesDepartmentAndTeamScope(item, "dept-a", "team-a", teamDepartmentMap), true);
  assert.equal(matchesDepartmentAndTeamScope(item, "dept-a", "team-b", teamDepartmentMap), false);
  assert.equal(matchesDepartmentAndTeamScope(item, "dept-b", "all", teamDepartmentMap), false);
  assert.equal(
    matchesDepartmentAndTeamScope(
      { departmentOrgNodeId: null, teamOrgNodeId: "team-a" },
      "dept-a",
      "all",
      teamDepartmentMap,
    ),
    true,
  );
});
