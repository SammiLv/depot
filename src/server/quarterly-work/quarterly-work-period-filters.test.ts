import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuarterByDate,
  isCompletedProjectVisibleInPeriod,
  isValueTrackVisibleInPeriod,
  matchesDepartmentAndTeamScope,
} from "@/server/quarterly-work/quarterly-work-period-filters";

test("getQuarterByDate returns calendar quarter", () => {
  assert.equal(getQuarterByDate(new Date(2026, 7, 3)), 3);
  assert.equal(getQuarterByDate(null), null);
});

test("isCompletedProjectVisibleInPeriod filters by completedAt year and quarter", () => {
  const period = { year: 2026, quarter: 3 as const };
  const completedProject = {
    status: "COMPLETED",
    completedAt: new Date(2026, 7, 15),
  };

  assert.equal(isCompletedProjectVisibleInPeriod(completedProject, period, false), true);
  assert.equal(isCompletedProjectVisibleInPeriod(completedProject, { year: 2026, quarter: 2 }, false), false);
  assert.equal(isCompletedProjectVisibleInPeriod(completedProject, { year: 2026, quarter: "all" }, false), true);
  assert.equal(isCompletedProjectVisibleInPeriod({ ...completedProject, status: "IN_PROGRESS" }, period, false), false);
  assert.equal(isCompletedProjectVisibleInPeriod(completedProject, period, true), false);
});

test("isValueTrackVisibleInPeriod filters by trackedAt year and quarter", () => {
  const period = { year: 2026, quarter: 3 as const };
  const track = { trackedAt: new Date(2026, 8, 3, 17, 7) };

  assert.equal(isValueTrackVisibleInPeriod(track, period), true);
  assert.equal(isValueTrackVisibleInPeriod(track, { year: 2026, quarter: 2 }), false);
  assert.equal(isValueTrackVisibleInPeriod(track, { year: 2025, quarter: 3 }), false);
  assert.equal(isValueTrackVisibleInPeriod(track, { year: 2026, quarter: "all" }), true);
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
