import type { OrgPermissionAbilityKey, OrgPermissionGrantScopeType, OrgPermissionModuleKey, RoleType } from "@prisma/client";

export const orgPermissionModuleKeys = {
  annualGoal: "ANNUAL_GOAL",
  kpi: "KPI",
} satisfies Record<string, OrgPermissionModuleKey>;

export const kpiAbilityKeys = {
  viewKpi: "VIEW_KPI",
  initializeKpi: "INITIALIZE_KPI",
  viewKpiTemplate: "VIEW_KPI_TEMPLATE",
  manageKpiTemplate: "MANAGE_KPI_TEMPLATE",
  toggleKpiTemplate: "TOGGLE_KPI_TEMPLATE",
  scoreSelf: "SCORE_SELF",
  scoreLeader: "SCORE_LEADER",
  scoreManager: "SCORE_MANAGER",
  scoreFinal: "SCORE_FINAL",
} satisfies Record<string, OrgPermissionAbilityKey>;

export const orgPermissionScopePriority: Record<OrgPermissionGrantScopeType, number> = {
  SELF: 0,
  NODE: 1,
  SUBTREE: 2,
  ALL: 3,
};

export const manageableRoleTypes: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

export const kpiDefaultPermissionGrants: Array<{
  moduleKey: OrgPermissionModuleKey;
  abilityKey: OrgPermissionAbilityKey;
  scopeType: OrgPermissionGrantScopeType;
  roleType: RoleType;
  orgNodeSeedKey: "ROOT" | "DEPARTMENT" | "TEAM" | null;
}> = [
  ...Object.values(kpiAbilityKeys).map((abilityKey) => ({
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey,
    scopeType: "ALL" as const,
    roleType: "ADMIN" as const,
    orgNodeSeedKey: null,
  })),
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpi,
    scopeType: "SUBTREE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpiTemplate,
    scopeType: "SUBTREE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.manageKpiTemplate,
    scopeType: "SUBTREE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.toggleKpiTemplate,
    scopeType: "SUBTREE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.initializeKpi,
    scopeType: "SUBTREE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.scoreManager,
    scopeType: "SUBTREE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpi,
    scopeType: "NODE",
    roleType: "TEAM_LEADER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpiTemplate,
    scopeType: "NODE",
    roleType: "TEAM_LEADER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.scoreLeader,
    scopeType: "NODE",
    roleType: "TEAM_LEADER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpi,
    scopeType: "SELF",
    roleType: "MEMBER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpiTemplate,
    scopeType: "SELF",
    roleType: "MEMBER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.scoreSelf,
    scopeType: "SELF",
    roleType: "MEMBER",
    orgNodeSeedKey: "TEAM",
  },
];
