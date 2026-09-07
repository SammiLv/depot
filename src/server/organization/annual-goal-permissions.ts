import type { PermissionScopeType, RoleType } from "@prisma/client";
import { getAncestorOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolvePermissionCoverage, type ResolvedPermissionCoverage } from "@/server/permissions/permission-resolver";
import { annualGoalAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";

/** 权限矩阵编辑器的作用域入参（组织与权限页保存动作共用）。 */
export type PermissionScopeInput = {
  scopeType: PermissionScopeType;
  departmentOrgNodeId?: string | null;
};

export type AnnualGoalCapabilities = {
  canViewDepartmentPlans: boolean;
  canEditDepartmentPlans: boolean;
  canViewTeamPlans: boolean;
  canEditTeamPlans: boolean;
  canUpdateProgress: boolean;
};

export type AnnualGoalScopeUser = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

export type AnnualGoalPlanScope = {
  ownerType: "DEPARTMENT" | "TEAM";
  ownerOrgNodeId?: string | null;
  deletedAt?: Date | null;
};

export type AnnualGoalPlanPermissions = {
  canViewPlan: boolean;
  canEditDepartmentPlan: boolean;
  canEditTeamPlan: boolean;
  canUpdateTeamProgress: boolean;
  canEditPlan: boolean;
  canEditMetrics: boolean;
  canManageSources: boolean;
  canManageQuarterTargets: boolean;
  canUpdateQuarterProgress: boolean;
  canUpdateWeeklyProgress: boolean;
};

/** 单个能力点的授权覆盖：hasAllAccess 直通，否则按 orgNodeIds 集合判定。 */
export type AnnualGoalAbilityCoverage = {
  hasAllAccess: boolean;
  orgNodeIds: Set<string>;
};

/**
 * 一次请求内预解析的指标管理权限上下文：五个能力点的授权覆盖 + 派生能力布尔。
 * 由 OrgPermissionGrant（moduleKey=ANNUAL_GOAL）驱动，替代旧的 roleType 硬编码作用域。
 */
export type AnnualGoalPermissionContext = {
  capabilities: AnnualGoalCapabilities;
  departmentView: AnnualGoalAbilityCoverage;
  departmentEdit: AnnualGoalAbilityCoverage;
  teamView: AnnualGoalAbilityCoverage;
  teamEdit: AnnualGoalAbilityCoverage;
  progress: AnnualGoalAbilityCoverage;
};

const emptyAnnualGoalPlanPermissions: AnnualGoalPlanPermissions = {
  canViewPlan: false,
  canEditDepartmentPlan: false,
  canEditTeamPlan: false,
  canUpdateTeamProgress: false,
  canEditPlan: false,
  canEditMetrics: false,
  canManageSources: false,
  canManageQuarterTargets: false,
  canUpdateQuarterProgress: false,
  canUpdateWeeklyProgress: false,
};

/** 派生能力布尔：保留「编辑前置查看」约束（有编辑授权但无查看授权时编辑不生效）。 */
export function deriveAnnualGoalCapabilities(input: {
  canViewDepartmentPlans: boolean;
  canEditDepartmentPlans: boolean;
  canViewTeamPlans: boolean;
  canEditTeamPlans: boolean;
  canUpdateProgress: boolean;
}): AnnualGoalCapabilities {
  return {
    canViewDepartmentPlans: input.canViewDepartmentPlans,
    canEditDepartmentPlans: input.canViewDepartmentPlans && input.canEditDepartmentPlans,
    canViewTeamPlans: input.canViewTeamPlans,
    canEditTeamPlans: input.canViewTeamPlans && input.canEditTeamPlans,
    canUpdateProgress: input.canUpdateProgress,
  };
}

function toAbilityCoverage(coverage: ResolvedPermissionCoverage): AnnualGoalAbilityCoverage {
  return { hasAllAccess: coverage.hasAllAccess, orgNodeIds: new Set(coverage.orgNodeIds) };
}

/** 并行解析五个能力点的授权覆盖，构建请求级权限上下文。 */
export async function resolveAnnualGoalPermissionContext(user: AnnualGoalScopeUser): Promise<AnnualGoalPermissionContext> {
  const [departmentViewCoverage, departmentEditCoverage, teamViewCoverage, teamEditCoverage, progressCoverage] = await Promise.all([
    resolvePermissionCoverage(user, orgPermissionModuleKeys.annualGoal, annualGoalAbilityKeys.viewDepartmentPlans),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.annualGoal, annualGoalAbilityKeys.editDepartmentPlans),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.annualGoal, annualGoalAbilityKeys.viewTeamPlans),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.annualGoal, annualGoalAbilityKeys.editTeamPlans),
    resolvePermissionCoverage(user, orgPermissionModuleKeys.annualGoal, annualGoalAbilityKeys.updateProgress),
  ]);

  return {
    capabilities: deriveAnnualGoalCapabilities({
      canViewDepartmentPlans: departmentViewCoverage.hasPermission,
      canEditDepartmentPlans: departmentEditCoverage.hasPermission,
      canViewTeamPlans: teamViewCoverage.hasPermission,
      canEditTeamPlans: teamEditCoverage.hasPermission,
      canUpdateProgress: progressCoverage.hasPermission,
    }),
    departmentView: toAbilityCoverage(departmentViewCoverage),
    departmentEdit: toAbilityCoverage(departmentEditCoverage),
    teamView: toAbilityCoverage(teamViewCoverage),
    teamEdit: toAbilityCoverage(teamEditCoverage),
    progress: toAbilityCoverage(progressCoverage),
  };
}

// ---- Permission check helpers (synchronous, require pre-computed context) ----

function isOrgNodeInCoverage(orgNodeId: string, coverage: AnnualGoalAbilityCoverage): boolean {
  return coverage.hasAllAccess || coverage.orgNodeIds.has(orgNodeId);
}

export function getAnnualGoalPlanPermissions(
  context: AnnualGoalPermissionContext,
  plan: AnnualGoalPlanScope,
): AnnualGoalPlanPermissions {
  if (plan.deletedAt || !plan.ownerOrgNodeId) {
    return emptyAnnualGoalPlanPermissions;
  }

  const { capabilities } = context;
  const ownerOrgNodeId = plan.ownerOrgNodeId;
  const isDeptPlan = plan.ownerType === "DEPARTMENT";
  const isTeamPlan = plan.ownerType === "TEAM";

  const canViewDepartmentPlan = Boolean(
    isDeptPlan && capabilities.canViewDepartmentPlans && isOrgNodeInCoverage(ownerOrgNodeId, context.departmentView),
  );
  const canEditDepartmentPlan = Boolean(
    isDeptPlan && capabilities.canEditDepartmentPlans && isOrgNodeInCoverage(ownerOrgNodeId, context.departmentEdit),
  );
  const canViewTeamPlan = Boolean(
    isTeamPlan && capabilities.canViewTeamPlans && isOrgNodeInCoverage(ownerOrgNodeId, context.teamView),
  );
  const canEditTeamPlan = Boolean(
    isTeamPlan && capabilities.canEditTeamPlans && isOrgNodeInCoverage(ownerOrgNodeId, context.teamEdit),
  );
  const canUpdateTeamProgress = Boolean(
    isTeamPlan && capabilities.canUpdateProgress && isOrgNodeInCoverage(ownerOrgNodeId, context.progress),
  );

  return {
    canViewPlan: canViewDepartmentPlan || canViewTeamPlan,
    canEditDepartmentPlan,
    canEditTeamPlan,
    canUpdateTeamProgress,
    canEditPlan: canEditDepartmentPlan || canEditTeamPlan,
    canEditMetrics: canEditDepartmentPlan || canEditTeamPlan,
    canManageSources: canEditDepartmentPlan,
    canManageQuarterTargets: canEditDepartmentPlan || canEditTeamPlan,
    canUpdateQuarterProgress: canEditDepartmentPlan || canUpdateTeamProgress,
    canUpdateWeeklyProgress: canEditDepartmentPlan || canUpdateTeamProgress,
  };
}

export function getAnnualGoalAssignmentPermissions(
  context: AnnualGoalPermissionContext,
  teamOrgNodeId: string,
  authorityStatus: "DRAFT" | "ACTIVE" | "CLOSED",
): AnnualGoalPlanPermissions {
  const permissions = getAnnualGoalPlanPermissions(
    context,
    { ownerType: "TEAM", ownerOrgNodeId: teamOrgNodeId, deletedAt: null },
  );
  if (authorityStatus !== "CLOSED") return permissions;
  return {
    ...permissions,
    canEditDepartmentPlan: false,
    canEditTeamPlan: false,
    canUpdateTeamProgress: false,
    canEditPlan: false,
    canEditMetrics: false,
    canManageSources: false,
    canManageQuarterTargets: false,
    canUpdateQuarterProgress: false,
    canUpdateWeeklyProgress: false,
  };
}

// ---- Where builders ----

export async function getAnnualGoalPlanWhere(context: AnnualGoalPermissionContext) {
  const { capabilities } = context;
  if (!capabilities.canViewDepartmentPlans && !capabilities.canViewTeamPlans) {
    return { id: "__no_annual_plan__", deletedAt: null };
  }

  if (context.departmentView.hasAllAccess || context.teamView.hasAllAccess) {
    return { deletedAt: null };
  }

  const scopeIds = new Set([...context.departmentView.orgNodeIds, ...context.teamView.orgNodeIds]);
  if (scopeIds.size === 0) {
    return { id: "__no_annual_plan__", deletedAt: null };
  }

  // 仅覆盖小组节点时，把其祖先（含所属部门）一并纳入：plan.departmentOrgNodeId 记的是部门节点。
  const ancestorIds = await Promise.all([...scopeIds].map((orgNodeId) => getAncestorOrgNodeIds(orgNodeId)));
  for (const ids of ancestorIds) {
    for (const id of ids) scopeIds.add(id);
  }

  return {
    deletedAt: null,
    departmentOrgNodeId: { in: [...scopeIds] },
  };
}
