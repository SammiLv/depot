import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuarterByDate,
  isLaunchedProjectVisibleInPeriod,
  isValueTrackVisibleInPeriod,
  matchesDepartmentAndTeamScope,
} from "@/server/quarterly-work/quarterly-work-period-filters";

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
