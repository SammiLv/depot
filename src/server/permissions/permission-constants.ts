import type { OrgPermissionAbilityKey, OrgPermissionGrantScopeType, OrgPermissionModuleKey, RoleType } from "@prisma/client";

export const orgPermissionModuleKeys = {
  annualGoal: "ANNUAL_GOAL",
  kpi: "KPI",
  talent: "TALENT",
  notification: "NOTIFICATION",
  productManagement: "PRODUCT_MANAGEMENT",
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
  manageBusinessAssessment: "MANAGE_BUSINESS_ASSESSMENT",
  manageWorkIncident: "MANAGE_WORK_INCIDENT",
} satisfies Record<string, OrgPermissionAbilityKey>;

export const talentAbilityKeys = {
  viewProfile: "VIEW_TALENT_PROFILE",
  editProfile: "EDIT_TALENT_PROFILE",
  viewReview: "VIEW_TALENT_REVIEW",
  manageReview: "MANAGE_TALENT_REVIEW",
  calibrateReview: "CALIBRATE_TALENT_REVIEW",
  viewRecommendation: "VIEW_RECOMMENDATION",
  manageRecommendation: "MANAGE_RECOMMENDATION",
  viewHistory: "VIEW_TALENT_HISTORY",
  manageHistory: "MANAGE_TALENT_HISTORY",
  viewSensitive: "VIEW_TALENT_SENSITIVE",
  viewConfig: "VIEW_TALENT_CONFIG",
  manageConfig: "MANAGE_TALENT_CONFIG",
} satisfies Record<string, OrgPermissionAbilityKey>;

export const notificationAbilityKeys = {
  manageNotificationScenario: "MANAGE_NOTIFICATION_SCENARIO",
} satisfies Record<string, OrgPermissionAbilityKey>;

export const productManagementAbilityKeys = {
  manageProductGoal: "MANAGE_PRODUCT_GOAL",
  manageProjectAndValueTracking: "MANAGE_PROJECT_AND_VALUE_TRACKING",
  manageProductTask: "MANAGE_PRODUCT_TASK",
} satisfies Record<string, OrgPermissionAbilityKey>;

export const annualGoalAbilityKeys = {
  viewDepartmentPlans: "VIEW_ANNUAL_GOAL_DEPARTMENT_PLANS",
  editDepartmentPlans: "EDIT_ANNUAL_GOAL_DEPARTMENT_PLANS",
  viewTeamPlans: "VIEW_ANNUAL_GOAL_TEAM_PLANS",
  editTeamPlans: "EDIT_ANNUAL_GOAL_TEAM_PLANS",
  updateProgress: "UPDATE_ANNUAL_GOAL_PROGRESS",
} satisfies Record<string, OrgPermissionAbilityKey>;

export type AnnualGoalAbilityKey = (typeof annualGoalAbilityKeys)[keyof typeof annualGoalAbilityKeys];

export const orgPermissionScopePriority: Record<OrgPermissionGrantScopeType, number> = {
  SELF: 0,
  NODE: 1,
  SUBTREE: 2,
  ALL: 3,
};

export const manageableRoleTypes: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

export const kpiOrdinaryPermissionAbilityKeys = [
  kpiAbilityKeys.viewKpi,
  kpiAbilityKeys.initializeKpi,
  kpiAbilityKeys.viewKpiTemplate,
  kpiAbilityKeys.manageKpiTemplate,
  kpiAbilityKeys.toggleKpiTemplate,
  kpiAbilityKeys.scoreSelf,
  kpiAbilityKeys.manageBusinessAssessment,
  kpiAbilityKeys.manageWorkIncident,
] satisfies OrgPermissionAbilityKey[];

export const kpiDefaultPermissionGrants: Array<{
  moduleKey: OrgPermissionModuleKey;
  abilityKey: OrgPermissionAbilityKey;
  scopeType: OrgPermissionGrantScopeType;
  subjectType: "ROLE";
  roleType: RoleType;
  orgNodeSeedKey: "ROOT" | "DEPARTMENT" | "TEAM" | null;
}> = [
  ...Object.values(kpiAbilityKeys).map((abilityKey) => ({
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey,
    scopeType: "ALL" as const,
    subjectType: "ROLE" as const,
    roleType: "ADMIN" as const,
    orgNodeSeedKey: null,
  })),
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpi,
    scopeType: "SUBTREE",
    subjectType: "ROLE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpiTemplate,
    scopeType: "SUBTREE",
    subjectType: "ROLE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.manageKpiTemplate,
    scopeType: "SUBTREE",
    subjectType: "ROLE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.toggleKpiTemplate,
    scopeType: "SUBTREE",
    subjectType: "ROLE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.initializeKpi,
    scopeType: "SUBTREE",
    subjectType: "ROLE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.scoreManager,
    scopeType: "SUBTREE",
    subjectType: "ROLE",
    roleType: "DEPARTMENT_MANAGER",
    orgNodeSeedKey: "DEPARTMENT",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpi,
    scopeType: "NODE",
    subjectType: "ROLE",
    roleType: "TEAM_LEADER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpiTemplate,
    scopeType: "NODE",
    subjectType: "ROLE",
    roleType: "TEAM_LEADER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.scoreLeader,
    scopeType: "NODE",
    subjectType: "ROLE",
    roleType: "TEAM_LEADER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpi,
    scopeType: "SELF",
    subjectType: "ROLE",
    roleType: "MEMBER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.viewKpiTemplate,
    scopeType: "SELF",
    subjectType: "ROLE",
    roleType: "MEMBER",
    orgNodeSeedKey: "TEAM",
  },
  {
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey: kpiAbilityKeys.scoreSelf,
    scopeType: "SELF",
    subjectType: "ROLE",
    roleType: "MEMBER",
    orgNodeSeedKey: "TEAM",
  },
];

export const talentOrdinaryPermissionAbilityKeys = [
  talentAbilityKeys.viewProfile,
  talentAbilityKeys.viewReview,
  talentAbilityKeys.viewHistory,
] satisfies OrgPermissionAbilityKey[];

// 组织与权限页的「人才发展权限」矩阵能力项，按所在 tab 归类排序：
// 人才总览 → 人才盘点 → 人才决策 → 人才履历 → 规则配置。
export const talentMatrixPermissionAbilityKeys = [
  talentAbilityKeys.viewProfile,
  talentAbilityKeys.viewReview,
  talentAbilityKeys.manageReview,
  talentAbilityKeys.calibrateReview,
  talentAbilityKeys.viewRecommendation,
  talentAbilityKeys.manageRecommendation,
  talentAbilityKeys.viewHistory,
  talentAbilityKeys.manageHistory,
  talentAbilityKeys.editProfile,
  talentAbilityKeys.viewSensitive,
  talentAbilityKeys.viewConfig,
  talentAbilityKeys.manageConfig,
] satisfies OrgPermissionAbilityKey[];

export const notificationOrdinaryPermissionAbilityKeys: OrgPermissionAbilityKey[] = [
  notificationAbilityKeys.manageNotificationScenario,
];

// 组织与权限页的「指标管理权限」矩阵能力项：部门方案 → 小组指标 → 进度更新。
export const annualGoalMatrixPermissionAbilityKeys = [
  annualGoalAbilityKeys.viewDepartmentPlans,
  annualGoalAbilityKeys.editDepartmentPlans,
  annualGoalAbilityKeys.viewTeamPlans,
  annualGoalAbilityKeys.editTeamPlans,
  annualGoalAbilityKeys.updateProgress,
] satisfies OrgPermissionAbilityKey[];

// 指标管理按「能力 × 角色」分别定义作用域（组员可查看部门方案、可更新本组进度，
// 无法套用 KPI/人才发展的统一角色映射）。矩阵保存/同步/读取共用本表；
// 非默认开启的格子被管理员手动勾选时，也按本表锚定作用域。
export const annualGoalPermissionScopeByAbilityRole: Record<AnnualGoalAbilityKey, Record<RoleType, OrgPermissionGrantScopeType>> = {
  [annualGoalAbilityKeys.viewDepartmentPlans]: {
    ADMIN: "ALL",
    DEPARTMENT_MANAGER: "SUBTREE",
    TEAM_LEADER: "SUBTREE",
    MEMBER: "SUBTREE",
  },
  [annualGoalAbilityKeys.editDepartmentPlans]: {
    ADMIN: "ALL",
    DEPARTMENT_MANAGER: "SUBTREE",
    TEAM_LEADER: "SUBTREE",
    MEMBER: "SUBTREE",
  },
  [annualGoalAbilityKeys.viewTeamPlans]: {
    ADMIN: "ALL",
    DEPARTMENT_MANAGER: "SUBTREE",
    TEAM_LEADER: "NODE",
    MEMBER: "NODE",
  },
  [annualGoalAbilityKeys.editTeamPlans]: {
    ADMIN: "ALL",
    DEPARTMENT_MANAGER: "SUBTREE",
    TEAM_LEADER: "NODE",
    MEMBER: "NODE",
  },
  [annualGoalAbilityKeys.updateProgress]: {
    ADMIN: "ALL",
    DEPARTMENT_MANAGER: "SUBTREE",
    TEAM_LEADER: "NODE",
    MEMBER: "NODE",
  },
};

export const productManagementOrdinaryPermissionAbilityKeys: OrgPermissionAbilityKey[] = [
  productManagementAbilityKeys.manageProductGoal,
  productManagementAbilityKeys.manageProjectAndValueTracking,
  productManagementAbilityKeys.manageProductTask,
];

type DefaultPermissionGrant = {
  moduleKey: OrgPermissionModuleKey;
  abilityKey: OrgPermissionAbilityKey;
  scopeType: OrgPermissionGrantScopeType;
  subjectType: "ROLE";
  roleType: RoleType;
  orgNodeSeedKey: "ROOT" | "DEPARTMENT" | "TEAM" | null;
};

// 默认矩阵：ADMIN 全部(ALL)；部门主管全部(本部门 SUBTREE，含薪资敏感字段)；
// 组长查看类 + 盘点录入/决策操作(本组 NODE)；组员查看类(本人 SELF)。
export const talentDefaultPermissionGrants: DefaultPermissionGrant[] = [
  ...Object.values(talentAbilityKeys)
    .map((abilityKey) => ({
      moduleKey: orgPermissionModuleKeys.talent,
      abilityKey,
      scopeType: "ALL" as const,
      subjectType: "ROLE" as const,
      roleType: "ADMIN" as const,
      orgNodeSeedKey: null,
    })),
  ...Object.values(talentAbilityKeys)
    .map((abilityKey) => ({
      moduleKey: orgPermissionModuleKeys.talent,
      abilityKey,
      scopeType: "SUBTREE" as const,
      subjectType: "ROLE" as const,
      roleType: "DEPARTMENT_MANAGER" as const,
      orgNodeSeedKey: "DEPARTMENT" as const,
    })),
  ...[
    talentAbilityKeys.viewProfile,
    talentAbilityKeys.viewReview,
    talentAbilityKeys.manageReview,
    talentAbilityKeys.viewRecommendation,
    talentAbilityKeys.manageRecommendation,
    talentAbilityKeys.viewHistory,
  ].map((abilityKey) => ({
    moduleKey: orgPermissionModuleKeys.talent,
    abilityKey,
    scopeType: "NODE" as const,
    subjectType: "ROLE" as const,
    roleType: "TEAM_LEADER" as const,
    orgNodeSeedKey: "TEAM" as const,
  })),
  ...talentOrdinaryPermissionAbilityKeys.map((abilityKey) => ({
    moduleKey: orgPermissionModuleKeys.talent,
    abilityKey,
    scopeType: "SELF" as const,
    subjectType: "ROLE" as const,
    roleType: "MEMBER" as const,
    orgNodeSeedKey: "TEAM" as const,
  })),
];

export const productManagementDefaultPermissionGrants: DefaultPermissionGrant[] = productManagementOrdinaryPermissionAbilityKeys.flatMap((abilityKey) => ([
  {
    moduleKey: orgPermissionModuleKeys.productManagement,
    abilityKey,
    scopeType: "ALL" as const,
    subjectType: "ROLE" as const,
    roleType: "ADMIN" as const,
    orgNodeSeedKey: null,
  },
  {
    moduleKey: orgPermissionModuleKeys.productManagement,
    abilityKey,
    scopeType: "SUBTREE" as const,
    subjectType: "ROLE" as const,
    roleType: "DEPARTMENT_MANAGER" as const,
    orgNodeSeedKey: "DEPARTMENT" as const,
  },
  {
    moduleKey: orgPermissionModuleKeys.productManagement,
    abilityKey,
    scopeType: "NODE" as const,
    subjectType: "ROLE" as const,
    roleType: "TEAM_LEADER" as const,
    orgNodeSeedKey: "TEAM" as const,
  },
  {
    moduleKey: orgPermissionModuleKeys.productManagement,
    abilityKey,
    scopeType: "SELF" as const,
    subjectType: "ROLE" as const,
    roleType: "MEMBER" as const,
    orgNodeSeedKey: "TEAM" as const,
  },
]));

/** 场景全系统共享：有能力即可配置，默认给管理角色 ALL 作用域。 */
export const notificationDefaultPermissionGrants: DefaultPermissionGrant[] = (
  ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER"] as const
).map((roleType) => ({
  moduleKey: orgPermissionModuleKeys.notification,
  abilityKey: notificationAbilityKeys.manageNotificationScenario,
  scopeType: "ALL" as const,
  subjectType: "ROLE" as const,
  roleType,
  orgNodeSeedKey: null,
}));

// 指标管理默认矩阵（对齐收归前实况）：ADMIN 全部(ALL)；查看部门方案 主管/组长/组员 SUBTREE@部门；
// 编辑部门方案 主管 SUBTREE@部门；查看/编辑小组指标 主管 SUBTREE@部门 + 组长 NODE@本组；
// 更新季度进度 主管 SUBTREE@部门 + 组长/组员 NODE@本组。
const annualGoalDefaultEnabledRoles: Record<AnnualGoalAbilityKey, RoleType[]> = {
  [annualGoalAbilityKeys.viewDepartmentPlans]: ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"],
  [annualGoalAbilityKeys.editDepartmentPlans]: ["ADMIN", "DEPARTMENT_MANAGER"],
  [annualGoalAbilityKeys.viewTeamPlans]: ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER"],
  [annualGoalAbilityKeys.editTeamPlans]: ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER"],
  [annualGoalAbilityKeys.updateProgress]: ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"],
};

export const annualGoalDefaultPermissionGrants: DefaultPermissionGrant[] = annualGoalMatrixPermissionAbilityKeys.flatMap((abilityKey) =>
  annualGoalDefaultEnabledRoles[abilityKey].map((roleType) => {
    const scopeType = annualGoalPermissionScopeByAbilityRole[abilityKey][roleType];
    return {
      moduleKey: orgPermissionModuleKeys.annualGoal,
      abilityKey,
      scopeType,
      subjectType: "ROLE" as const,
      roleType,
      orgNodeSeedKey: scopeType === "ALL" ? null : scopeType === "SUBTREE" ? "DEPARTMENT" as const : "TEAM" as const,
    };
  })
);
