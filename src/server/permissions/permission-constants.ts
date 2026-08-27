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
  viewCareerModel: "VIEW_CAREER_MODEL",
  manageCareerModel: "MANAGE_CAREER_MODEL",
  viewBusinessAssessment: "VIEW_BUSINESS_ASSESSMENT",
  manageBusinessAssessment: "MANAGE_BUSINESS_ASSESSMENT",
  viewWorkIncident: "VIEW_WORK_INCIDENT",
  manageWorkIncident: "MANAGE_WORK_INCIDENT",
  viewRecommendation: "VIEW_RECOMMENDATION",
  manageRecommendation: "MANAGE_RECOMMENDATION",
  viewHistory: "VIEW_TALENT_HISTORY",
  manageHistory: "MANAGE_TALENT_HISTORY",
  viewSensitive: "VIEW_TALENT_SENSITIVE",
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
  talentAbilityKeys.viewCareerModel,
  talentAbilityKeys.viewBusinessAssessment,
  talentAbilityKeys.viewWorkIncident,
  talentAbilityKeys.viewHistory,
] satisfies OrgPermissionAbilityKey[];

export const notificationOrdinaryPermissionAbilityKeys: OrgPermissionAbilityKey[] = [
  notificationAbilityKeys.manageNotificationScenario,
];

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

const migratedToKpiTalentAbilityKeys = new Set<OrgPermissionAbilityKey>([
  talentAbilityKeys.manageBusinessAssessment,
  talentAbilityKeys.manageWorkIncident,
]);

export const talentDefaultPermissionGrants: DefaultPermissionGrant[] = [
  ...Object.values(talentAbilityKeys)
    .filter((abilityKey) => !migratedToKpiTalentAbilityKeys.has(abilityKey))
    .map((abilityKey) => ({
      moduleKey: orgPermissionModuleKeys.talent,
      abilityKey,
      scopeType: "ALL" as const,
      subjectType: "ROLE" as const,
      roleType: "ADMIN" as const,
      orgNodeSeedKey: null,
    })),
  ...Object.values(talentAbilityKeys)
    .filter((abilityKey) => !migratedToKpiTalentAbilityKeys.has(abilityKey))
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
    talentAbilityKeys.viewCareerModel,
    talentAbilityKeys.viewBusinessAssessment,
    talentAbilityKeys.viewWorkIncident,
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
