import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveAnnualGoalCapabilities,
  getAnnualGoalAssignmentPermissions,
  getAnnualGoalPlanPermissions,
  type AnnualGoalAbilityCoverage,
  type AnnualGoalPermissionContext,
} from "@/server/organization/annual-goal-permissions";

type ScopeInput = { hasAllAccess?: boolean; orgNodeIds?: string[] };

function toCoverage(input: ScopeInput | undefined): AnnualGoalAbilityCoverage & { hasPermission: boolean } {
  const hasAllAccess = input?.hasAllAccess ?? false;
  const orgNodeIds = new Set(input?.orgNodeIds ?? []);
  return { hasAllAccess, orgNodeIds, hasPermission: hasAllAccess || orgNodeIds.size > 0 };
}

function createPermissionContext(input: {
  departmentView?: ScopeInput;
  departmentEdit?: ScopeInput;
  teamView?: ScopeInput;
  teamEdit?: ScopeInput;
  progress?: ScopeInput;
}): AnnualGoalPermissionContext {
  const departmentView = toCoverage(input.departmentView);
  const departmentEdit = toCoverage(input.departmentEdit);
  const teamView = toCoverage(input.teamView);
  const teamEdit = toCoverage(input.teamEdit);
  const progress = toCoverage(input.progress);

  return {
    capabilities: deriveAnnualGoalCapabilities({
      canViewDepartmentPlans: departmentView.hasPermission,
      canEditDepartmentPlans: departmentEdit.hasPermission,
      canViewTeamPlans: teamView.hasPermission,
      canEditTeamPlans: teamEdit.hasPermission,
      canUpdateProgress: progress.hasPermission,
    }),
    departmentView,
    departmentEdit,
    teamView,
    teamEdit,
    progress,
  };
}

test("edit permissions require matching view permissions", () => {
  const teamOnlyEdit = deriveAnnualGoalCapabilities({
    canViewDepartmentPlans: false,
    canEditDepartmentPlans: false,
    canViewTeamPlans: false,
    canEditTeamPlans: true,
    canUpdateProgress: false,
  });
  const departmentOnlyEdit = deriveAnnualGoalCapabilities({
    canViewDepartmentPlans: false,
    canEditDepartmentPlans: true,
    canViewTeamPlans: false,
    canEditTeamPlans: false,
    canUpdateProgress: false,
  });

  assert.equal(teamOnlyEdit.canViewTeamPlans, false);
  assert.equal(teamOnlyEdit.canEditTeamPlans, false);
  assert.equal(departmentOnlyEdit.canViewDepartmentPlans, false);
  assert.equal(departmentOnlyEdit.canEditDepartmentPlans, false);
});

test("department manager can edit any team plan in their department with team view+edit", () => {
  const context = createPermissionContext({
    teamView: { orgNodeIds: ["org_dept_dept-1", "org_team_team-a", "org_team_team-b"] },
    teamEdit: { orgNodeIds: ["org_dept_dept-1", "org_team_team-a", "org_team_team-b"] },
  });

  const permissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "TEAM",
    ownerOrgNodeId: "org_team_team-a",
    deletedAt: null,
  });

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditTeamPlan, true);
  assert.equal(permissions.canEditMetrics, true);
  assert.equal(permissions.canManageQuarterTargets, true);
  assert.equal(permissions.canUpdateQuarterProgress, false);
});

test("department manager with team view can view every team under their department", () => {
  const context = createPermissionContext({
    teamView: { orgNodeIds: ["org_dept_dept-1", "org_team_team-a", "org_team_team-b"] },
  });

  const permissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "TEAM",
    ownerOrgNodeId: "org_team_team-b",
    deletedAt: null,
  });

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditTeamPlan, false);
});

test("team leader with team view can only view their own team", () => {
  const context = createPermissionContext({
    teamView: { orgNodeIds: ["org_team_team-a"] },
  });

  const ownTeamPermissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "TEAM",
    ownerOrgNodeId: "org_team_team-a",
    deletedAt: null,
  });
  const siblingTeamPermissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "TEAM",
    ownerOrgNodeId: "org_team_team-b",
    deletedAt: null,
  });

  assert.equal(ownTeamPermissions.canViewPlan, true);
  assert.equal(siblingTeamPermissions.canViewPlan, false);
});

test("updateProgress alone does not grant team visibility or edit", () => {
  const context = createPermissionContext({
    progress: { orgNodeIds: ["org_team_team-a"] },
  });

  const permissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "TEAM",
    ownerOrgNodeId: "org_team_team-a",
    deletedAt: null,
  });

  assert.equal(context.capabilities.canViewTeamPlans, false);
  assert.equal(context.capabilities.canEditTeamPlans, false);
  assert.equal(permissions.canViewPlan, false);
  assert.equal(permissions.canEditTeamPlan, false);
  assert.equal(permissions.canUpdateTeamProgress, true);
  assert.equal(permissions.canUpdateQuarterProgress, true);
});

test("member with department view can view department plan across department scope", () => {
  const context = createPermissionContext({
    departmentView: { orgNodeIds: ["org_dept_dept-1", "org_team_team-a", "org_team_team-b"] },
  });

  const permissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "DEPARTMENT",
    ownerOrgNodeId: "org_dept_dept-1",
    deletedAt: null,
  });

  assert.equal(context.capabilities.canViewDepartmentPlans, true);
  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditDepartmentPlan, false);
});

test("admin with department view+edit can edit department plans without org node", () => {
  const context = createPermissionContext({
    departmentView: { hasAllAccess: true },
    departmentEdit: { hasAllAccess: true },
  });

  const permissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "DEPARTMENT",
    ownerOrgNodeId: "org_dept_dept-1",
    deletedAt: null,
  });

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditDepartmentPlan, true);
  assert.equal(permissions.canManageSources, true);
  assert.equal(permissions.canUpdateQuarterProgress, true);
});

test("admin with team view+edit can edit team plans without department/team ids", () => {
  const context = createPermissionContext({
    teamView: { hasAllAccess: true },
    teamEdit: { hasAllAccess: true },
  });

  const permissions = getAnnualGoalPlanPermissions(context, {
    ownerType: "TEAM",
    ownerOrgNodeId: "org_team_team-a",
    deletedAt: null,
  });

  assert.equal(permissions.canViewPlan, true);
  assert.equal(permissions.canEditTeamPlan, true);
  assert.equal(permissions.canManageQuarterTargets, true);
});

test("assignment permissions require team scope and become read-only when closed", () => {
  const context = createPermissionContext({
    teamView: { orgNodeIds: ["org_team_team-a"] },
    teamEdit: { orgNodeIds: ["org_team_team-a"] },
    progress: { orgNodeIds: ["org_team_team-a"] },
  });

  const active = getAnnualGoalAssignmentPermissions(context, "org_team_team-a", "ACTIVE");
  const sibling = getAnnualGoalAssignmentPermissions(context, "org_team_team-b", "ACTIVE");
  const closed = getAnnualGoalAssignmentPermissions(context, "org_team_team-a", "CLOSED");

  assert.equal(active.canViewPlan, true);
  assert.equal(active.canEditMetrics, true);
  assert.equal(active.canUpdateQuarterProgress, true);
  assert.equal(sibling.canViewPlan, false);
  assert.equal(closed.canViewPlan, true);
  assert.equal(closed.canEditMetrics, false);
  assert.equal(closed.canUpdateQuarterProgress, false);
});
