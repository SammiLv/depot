import test from "node:test";
import assert from "node:assert/strict";
import type { RoleType } from "@prisma/client";
import {
  getAnnualGoalCapabilities,
  getAnnualGoalPlanPermissions,
} from "@/server/organization/annual-goal-permissions";

type PermissionCode =
  | "annualGoal.viewDepartmentPlans"
  | "annualGoal.editDepartmentPlans"
  | "annualGoal.viewTeamPlans"
  | "annualGoal.editTeamPlans"
  | "annualGoal.updateProgress";

function createPermissionMap(roleType: RoleType, codes: PermissionCode[]) {
  return new Map<RoleType, Set<PermissionCode>>([
    [roleType, new Set(codes)],
  ]);
}

test("edit permissions require matching view permissions", () => {
  const teamOnlyEdit = getAnnualGoalCapabilities(
    "TEAM_LEADER",
    createPermissionMap("TEAM_LEADER", ["annualGoal.editTeamPlans"]),
  );
  const departmentOnlyEdit = getAnnualGoalCapabilities(
    "DEPARTMENT_MANAGER",
    createPermissionMap("DEPARTMENT_MANAGER", ["annualGoal.editDepartmentPlans"]),
  );

  assert.equal(teamOnlyEdit.canViewTeamPlans, false);
  assert.equal(teamOnlyEdit.canEditTeamPlans, false);
  assert.equal(departmentOnlyEdit.canViewDepartmentPlans, false);
  assert.equal(departmentOnlyEdit.canEditDepartmentPlans, false);
});

test("department manager can edit any team plan in their department with team view+edit", () => {
  const capabilities = getAnnualGoalCapabilities(
    "DEPARTMENT_MANAGER",
    createPermissionMap("DEPARTMENT_MANAGER", [
      "annualGoal.viewTeamPlans",
      "annualGoal.editTeamPlans",
    ]),
  );

  const permissions = getAnnualGoalPlanPermissions(
    {
      roleType: "DEPARTMENT_MANAGER",
      orgNodeId: "org_dept_dept-1",
    },
    capabilities,
    {
      ownerType: "TEAM",
      ownerOrgNodeId: "org_team_team-a",
      deletedAt: null,
    },
    {
      deptScopeIds: new Set(["org_dept_dept-1", "org_team_team-a", "org_team_team-b"]),
      teamScopeIds: new Set(["org_dept_dept-1", "org_team_team-a", "org_team_team-b"]),
      deptAncestorId: "org_dept_dept-1",
    },
  );

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditTeamPlan, true);
  assert.equal(permissions.canEditMetrics, true);
  assert.equal(permissions.canManageQuarterTargets, true);
  assert.equal(permissions.canUpdateQuarterProgress, false);
});

test("department manager with team view can view every team under their department", () => {
  const capabilities = getAnnualGoalCapabilities(
    "DEPARTMENT_MANAGER",
    createPermissionMap("DEPARTMENT_MANAGER", ["annualGoal.viewTeamPlans"]),
  );

  const permissions = getAnnualGoalPlanPermissions(
    {
      roleType: "DEPARTMENT_MANAGER",
      orgNodeId: "org_dept_dept-1",
    },
    capabilities,
    {
      ownerType: "TEAM",
      ownerOrgNodeId: "org_team_team-b",
      deletedAt: null,
    },
    {
      deptScopeIds: new Set(["org_dept_dept-1", "org_team_team-a", "org_team_team-b"]),
      teamScopeIds: new Set(["org_dept_dept-1", "org_team_team-a", "org_team_team-b"]),
      deptAncestorId: "org_dept_dept-1",
    },
  );

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditTeamPlan, false);
});

test("team leader with team view can only view their own team", () => {
  const capabilities = getAnnualGoalCapabilities(
    "TEAM_LEADER",
    createPermissionMap("TEAM_LEADER", ["annualGoal.viewTeamPlans"]),
  );

  const ownTeamPermissions = getAnnualGoalPlanPermissions(
    {
      roleType: "TEAM_LEADER",
      orgNodeId: "org_team_team-a",
    },
    capabilities,
    {
      ownerType: "TEAM",
      ownerOrgNodeId: "org_team_team-a",
      deletedAt: null,
    },
    {
      deptScopeIds: new Set(["org_team_team-a"]),
      teamScopeIds: new Set(["org_team_team-a"]),
      deptAncestorId: null,
    },
  );
  const siblingTeamPermissions = getAnnualGoalPlanPermissions(
    {
      roleType: "TEAM_LEADER",
      orgNodeId: "org_team_team-a",
    },
    capabilities,
    {
      ownerType: "TEAM",
      ownerOrgNodeId: "org_team_team-b",
      deletedAt: null,
    },
    {
      deptScopeIds: new Set(["org_team_team-a"]),
      teamScopeIds: new Set(["org_team_team-a"]),
      deptAncestorId: null,
    },
  );

  assert.equal(ownTeamPermissions.canViewPlan, true);
  assert.equal(siblingTeamPermissions.canViewPlan, false);
});


test("updateProgress alone does not grant team visibility or edit", () => {
  const capabilities = getAnnualGoalCapabilities(
    "MEMBER",
    createPermissionMap("MEMBER", ["annualGoal.updateProgress"]),
  );

  const permissions = getAnnualGoalPlanPermissions(
    {
      roleType: "MEMBER",
      orgNodeId: "org_team_team-a",
    },
    capabilities,
    {
      ownerType: "TEAM",
      ownerOrgNodeId: "org_team_team-a",
      deletedAt: null,
    },
    {
      deptScopeIds: new Set(["org_team_team-a"]),
      teamScopeIds: new Set(["org_team_team-a"]),
      deptAncestorId: null,
    },
  );

  assert.equal(capabilities.canViewTeamPlans, false);
  assert.equal(capabilities.canEditTeamPlans, false);
  assert.equal(permissions.canViewPlan, false);
  assert.equal(permissions.canEditTeamPlan, false);
  assert.equal(permissions.canUpdateTeamProgress, true);
  assert.equal(permissions.canUpdateQuarterProgress, true);
});

test("member with department view can view department plan across department scope", () => {
  const capabilities = getAnnualGoalCapabilities(
    "MEMBER",
    createPermissionMap("MEMBER", ["annualGoal.viewDepartmentPlans"]),
  );

  const permissions = getAnnualGoalPlanPermissions(
    {
      roleType: "MEMBER",
      orgNodeId: "org_team_team-a",
    },
    capabilities,
    {
      ownerType: "DEPARTMENT",
      ownerOrgNodeId: "org_dept_dept-1",
      deletedAt: null,
    },
    {
      deptScopeIds: new Set(["org_dept_dept-1", "org_team_team-a", "org_team_team-b"]),
      teamScopeIds: new Set(["org_team_team-a"]),
      deptAncestorId: "org_dept_dept-1",
    },
  );

  assert.equal(capabilities.canViewDepartmentPlans, true);
  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditDepartmentPlan, false);
});

test("admin with department view+edit can edit department plans without org node", () => {
  const capabilities = getAnnualGoalCapabilities(
    "ADMIN",
    createPermissionMap("ADMIN", [
      "annualGoal.viewDepartmentPlans",
      "annualGoal.editDepartmentPlans",
    ]),
  );

  const permissions = getAnnualGoalPlanPermissions(
    {
      roleType: "ADMIN",
      orgNodeId: null,
    },
    capabilities,
    {
      ownerType: "DEPARTMENT",
      ownerOrgNodeId: "org_dept_dept-1",
      deletedAt: null,
    },
  );

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditDepartmentPlan, true);
  assert.equal(permissions.canManageSources, true);
  assert.equal(permissions.canUpdateQuarterProgress, true);
});

test("admin with team view+edit can edit team plans without department/team ids", () => {
  const capabilities = getAnnualGoalCapabilities(
    "ADMIN",
    createPermissionMap("ADMIN", [
      "annualGoal.viewTeamPlans",
      "annualGoal.editTeamPlans",
    ]),
  );

  const permissions = getAnnualGoalPlanPermissions(
    {
      roleType: "ADMIN",
      orgNodeId: null,
    },
    capabilities,
    {
      ownerType: "TEAM",
      ownerOrgNodeId: "org_team_team-a",
      deletedAt: null,
    },
  );

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditTeamPlan, true);
  assert.equal(permissions.canManageQuarterTargets, true);
});
