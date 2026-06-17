import type { AnnualGoalOwnerType, PermissionScopeType, RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";

export const annualGoalPermissionCodes = [
  "annualGoal.viewDepartmentPlans",
  "annualGoal.editDepartmentPlans",
  "annualGoal.viewTeamPlans",
  "annualGoal.editTeamPlans",
  "annualGoal.updateProgress",
] as const;

export type AnnualGoalPermissionCode = (typeof annualGoalPermissionCodes)[number];

export type AnnualGoalCapabilities = {
  canViewDepartmentPlans: boolean;
  canEditDepartmentPlans: boolean;
  canViewTeamPlans: boolean;
  canEditTeamPlans: boolean;
  canUpdateProgress: boolean;
};

export type AnnualGoalScopeUser = {
  roleType: RoleType;
  orgNodeId?: string | null;
};

export type AnnualGoalPlanScope = {
  ownerType: AnnualGoalOwnerType;
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

/** Pre-computed org-tree scope context, used to avoid per-plan DB queries. */
export type OrgScopeContext = {
  /** All org node IDs within the user's department scope (dept ancestor descendants). */
  deptScopeIds: Set<string>;
  /** All org node IDs within the user's team scope (own org node descendants). */
  teamScopeIds: Set<string>;
  /** The nearest department ancestor org node ID (for scope anchor). */
  deptAncestorId: string | null;
};

export const annualGoalPermissionDefinitions: Array<{
  code: AnnualGoalPermissionCode;
  name: string;
  description: string;
  sortOrder: number;
}> = [
  {
    code: "annualGoal.viewDepartmentPlans",
    name: "查看部门方案",
    description: "允许查看本部门的年度方案、年度指标、元指标与季度指标。",
    sortOrder: 10,
  },
  {
    code: "annualGoal.editDepartmentPlans",
    name: "编辑部门方案",
    description: "允许维护本部门方案及其年度指标、元指标、季度指标与进度更新；生效前必须同时具备查看部门方案权限。",
    sortOrder: 20,
  },
  {
    code: "annualGoal.viewTeamPlans",
    name: "查看小组指标",
    description: "允许查看本小组的年度指标与季度指标数据。",
    sortOrder: 30,
  },
  {
    code: "annualGoal.editTeamPlans",
    name: "编辑小组指标",
    description: "允许维护本小组年度指标、拆解季度指标；生效前必须同时具备查看小组指标权限，不包含季度/周进度更新。",
    sortOrder: 40,
  },
  {
    code: "annualGoal.updateProgress",
    name: "更新季度进度",
    description: "允许仅更新本小组季度指标的当前进度与周进度。",
    sortOrder: 50,
  },
];

export type AnnualGoalPermissionItem = {
  id: string;
  code: AnnualGoalPermissionCode;
  name: string;
  description: string;
  sortOrder: number;
};

export type RoleAnnualGoalPermissionItem = {
  scopeType: PermissionScopeType;
  departmentOrgNodeId: string;
  roleType: RoleType;
  annualGoalPermissionId: string;
  allowed: boolean;
};

export type PermissionScopeInput = {
  scopeType: PermissionScopeType;
  departmentOrgNodeId?: string | null;
};

export type AnnualGoalPermissionScopeUser = {
  roleType: RoleType;
  orgNodeId?: string | null;
};

export type PermissionCellState = {
  allowed: boolean;
  source: PermissionScopeType;
  inherited: boolean;
  explicit: boolean;
};

export type ScopedAnnualGoalPermissionMatrixRow = {
  id: string;
  code: AnnualGoalPermissionCode;
  name: string;
  description: string;
  sortOrder: number;
  cells: Record<RoleType, PermissionCellState>;
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

// ---- Org-tree scope context builder ----

async function findNearestDeptAncestor(orgNodeId: string): Promise<string | null> {
  const ancestorRows = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    orderBy: { depth: "desc" },
    select: { ancestorId: true },
  });
  if (ancestorRows.length === 0) return null;

  const deptNodes = await prisma.orgNode.findMany({
    where: {
      id: { in: ancestorRows.map((r) => r.ancestorId) },
      nodeType: "DEPARTMENT",
    },
    select: { id: true },
  });
  const deptIdSet = new Set(deptNodes.map((n) => n.id));
  // Ancestors sorted by depth desc (closest first → nearest dept)
  return ancestorRows.find((r) => deptIdSet.has(r.ancestorId))?.ancestorId ?? null;
}

/**
 * Build a pre-computed OrgScopeContext from the current user and capabilities.
 * Call this once per request, then pass the context to synchronous permission checks.
 */
export async function buildOrgScopeContext(
  user: AnnualGoalScopeUser,
  capabilities: AnnualGoalCapabilities,
): Promise<OrgScopeContext | null> {
  if (user.roleType === "ADMIN") {
    return null;
  }

  const userOrgNodeId = user.orgNodeId ?? null;
  if (!userOrgNodeId) return null;

  const teamIds = await getDescendantOrgNodeIds(userOrgNodeId);
  const teamScopeIds = new Set(teamIds);

  let deptScopeIds = teamScopeIds;
  let deptAncestorId: string | null = null;
  if (capabilities.canViewDepartmentPlans || capabilities.canEditDepartmentPlans) {
    deptAncestorId = await findNearestDeptAncestor(userOrgNodeId);
    if (deptAncestorId) {
      const deptIds = await getDescendantOrgNodeIds(deptAncestorId);
      deptScopeIds = new Set(deptIds);
    }
  }

  const ownScopeIds = new Set(teamIds);

  return { deptScopeIds, teamScopeIds, deptAncestorId };
}

// ---- Permission check helpers (synchronous, require pre-computed context) ----

function isOrgNodeInScope(orgNodeId: string | null | undefined, scope: Set<string>): boolean {
  if (!orgNodeId) return false;
  return scope.has(orgNodeId);
}

export function getAnnualGoalPlanPermissions(
  user: AnnualGoalScopeUser,
  capabilities: AnnualGoalCapabilities,
  plan: AnnualGoalPlanScope,
  context?: OrgScopeContext | null,
): AnnualGoalPlanPermissions {
  if (plan.deletedAt || !plan.ownerOrgNodeId) {
    return emptyAnnualGoalPlanPermissions;
  }

  if (user.roleType === "ADMIN") {
    const isDeptPlan = plan.ownerType === "DEPARTMENT";
    const isTeamPlan = plan.ownerType === "TEAM";
    const canViewDepartmentPlan = Boolean(isDeptPlan && capabilities.canViewDepartmentPlans);
    const canEditDepartmentPlan = Boolean(isDeptPlan && capabilities.canEditDepartmentPlans);
    const canViewTeamPlan = Boolean(isTeamPlan && capabilities.canViewTeamPlans);
    const canEditTeamPlan = Boolean(isTeamPlan && capabilities.canEditTeamPlans);
    const canUpdateTeamProgress = Boolean(isTeamPlan && capabilities.canUpdateProgress);

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

  if (!context) {
    return emptyAnnualGoalPlanPermissions;
  }

  const isDeptPlan = plan.ownerType === "DEPARTMENT";
  const isTeamPlan = plan.ownerType === "TEAM";
  const inDeptScope = isOrgNodeInScope(plan.ownerOrgNodeId, context.deptScopeIds);
  const inTeamScope = isOrgNodeInScope(plan.ownerOrgNodeId, context.teamScopeIds);

  const canViewDepartmentPlan = Boolean(
    isDeptPlan && capabilities.canViewDepartmentPlans && inDeptScope,
  );
  const canEditDepartmentPlan = Boolean(
    isDeptPlan && capabilities.canEditDepartmentPlans && inDeptScope,
  );
  const canViewTeamPlan = Boolean(
    isTeamPlan && capabilities.canViewTeamPlans && inTeamScope,
  );
  const canEditTeamPlan = Boolean(
    isTeamPlan && capabilities.canEditTeamPlans && inTeamScope,
  );
  const canUpdateTeamProgress = Boolean(
    isTeamPlan && capabilities.canUpdateProgress && inTeamScope,
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

// ---- Permission matrix / capabilities (unchanged) ----

export async function ensureAnnualGoalPermissions() {
  await prisma.$transaction(
    annualGoalPermissionDefinitions.map((definition) =>
      prisma.annualGoalPermission.upsert({
        where: { code: definition.code },
        update: {
          name: definition.name,
          description: definition.description,
          sortOrder: definition.sortOrder,
        },
        create: definition,
      })
    )
  );
}

function normalizeScope(scope: PermissionScopeInput): { scopeType: PermissionScopeType; departmentOrgNodeId: string } {
  return {
    scopeType: scope.scopeType,
    departmentOrgNodeId: scope.scopeType === "SYSTEM" ? "" : (scope.departmentOrgNodeId ?? ""),
  };
}

export async function resolveAnnualGoalPermissionScope(user: AnnualGoalPermissionScopeUser): Promise<PermissionScopeInput> {
  if (user.roleType === "ADMIN") {
    return { scopeType: "SYSTEM" };
  }

  const orgNodeId = user.orgNodeId ?? null;
  if (!orgNodeId) {
    return { scopeType: "SYSTEM" };
  }

  const departmentOrgNodeId = await findNearestDeptAncestor(orgNodeId);
  if (!departmentOrgNodeId) {
    return { scopeType: "SYSTEM" };
  }

  return {
    scopeType: "DEPARTMENT",
    departmentOrgNodeId,
  };
}

export async function getAnnualGoalPermissionMapForUser(user: AnnualGoalPermissionScopeUser) {
  return getAnnualGoalPermissionMap(await resolveAnnualGoalPermissionScope(user));
}

export async function getAnnualGoalCapabilitiesForUser(user: AnnualGoalPermissionScopeUser) {
  const permissionMap = await getAnnualGoalPermissionMapForUser(user);
  return getAnnualGoalCapabilities(user.roleType, permissionMap);
}

const roleTypes: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

export async function getScopedAnnualGoalPermissionMatrix(scope: PermissionScopeInput) {
  await ensureAnnualGoalPermissions();
  const normalizedScope = normalizeScope(scope);

  const [permissions, systemRows, scopedRows] = await Promise.all([
    prisma.annualGoalPermission.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.roleAnnualGoalPermission.findMany({
      where: { scopeType: "SYSTEM", departmentOrgNodeId: "" },
    }),
    normalizedScope.scopeType === "SYSTEM"
      ? Promise.resolve([])
      : prisma.roleAnnualGoalPermission.findMany({
          where: {
            scopeType: normalizedScope.scopeType,
            departmentOrgNodeId: normalizedScope.departmentOrgNodeId,
          },
        }),
  ]);

  const systemMap = new Map(systemRows.map((row) => [`${row.roleType}:${row.annualGoalPermissionId}`, row]));
  const scopedMap = new Map(scopedRows.map((row) => [`${row.roleType}:${row.annualGoalPermissionId}`, row]));

  const rows: ScopedAnnualGoalPermissionMatrixRow[] = permissions.map((permission) => {
    const cells = Object.fromEntries(roleTypes.map((roleType) => {
      const key = `${roleType}:${permission.id}`;
      const scopedRow = scopedMap.get(key);
      const systemRow = systemMap.get(key);
      const sourceRow = scopedRow ?? systemRow;
      const allowed = sourceRow?.allowed ?? false;
      const source = scopedRow ? scopedRow.scopeType : "SYSTEM";
      const explicit = Boolean(scopedRow || (normalizedScope.scopeType === "SYSTEM" && systemRow));
      const inherited = normalizedScope.scopeType !== "SYSTEM" && !scopedRow;
      return [roleType, { allowed, source, explicit, inherited } satisfies PermissionCellState];
    })) as Record<RoleType, PermissionCellState>;

    return {
      id: permission.id,
      code: permission.code as AnnualGoalPermissionCode,
      name: permission.name,
      description: permission.description,
      sortOrder: permission.sortOrder,
      cells,
    };
  });

  return rows;
}

export async function getAnnualGoalPermissionMatrix() {
  const rows = await getScopedAnnualGoalPermissionMatrix({ scopeType: "SYSTEM" });

  return {
    permissions: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      sortOrder: row.sortOrder,
    })),
    rolePermissions: rows.flatMap((row) =>
      roleTypes
        .filter((roleType) => row.cells[roleType].allowed)
        .map((roleType) => ({
          scopeType: "SYSTEM" as const,
          departmentOrgNodeId: "",
          roleType,
          annualGoalPermissionId: row.id,
          allowed: true,
        }))
    ),
  };
}

export async function getAnnualGoalPermissionMap(scope: PermissionScopeInput = { scopeType: "SYSTEM" }) {
  const rows = await getScopedAnnualGoalPermissionMatrix(scope);
  const map = new Map<RoleType, Set<AnnualGoalPermissionCode>>();

  for (const roleType of roleTypes) {
    const allowedCodes = rows
      .filter((row) => row.cells[roleType].allowed)
      .map((row) => row.code);
    map.set(roleType, new Set(allowedCodes));
  }

  return map;
}

export function getAnnualGoalCapabilities(
  roleType: RoleType,
  permissionMap: Map<RoleType, Set<AnnualGoalPermissionCode>>
): AnnualGoalCapabilities {
  const rolePermissions = permissionMap.get(roleType) ?? new Set<AnnualGoalPermissionCode>();
  const canViewDepartmentPlans = rolePermissions.has("annualGoal.viewDepartmentPlans");
  const canViewTeamPlans = rolePermissions.has("annualGoal.viewTeamPlans");

  return {
    canViewDepartmentPlans,
    canEditDepartmentPlans: canViewDepartmentPlans && rolePermissions.has("annualGoal.editDepartmentPlans"),
    canViewTeamPlans,
    canEditTeamPlans: canViewTeamPlans && rolePermissions.has("annualGoal.editTeamPlans"),
    canUpdateProgress: rolePermissions.has("annualGoal.updateProgress"),
  };
}

export function canAccessDepartmentPlans(capabilities: AnnualGoalCapabilities) {
  return capabilities.canViewDepartmentPlans;
}

export function canAccessTeamPlans(capabilities: AnnualGoalCapabilities) {
  return capabilities.canViewTeamPlans;
}

// ---- Where builders ----

export async function getAnnualGoalPlanWhere(
  user: AnnualGoalScopeUser,
  capabilities: AnnualGoalCapabilities,
) {
  if (user.roleType === "ADMIN") {
    return {
      deletedAt: null,
      OR: [
        ...(capabilities.canViewDepartmentPlans ? [{ ownerType: "DEPARTMENT" as const }] : []),
        ...(capabilities.canViewTeamPlans ? [{ ownerType: "TEAM" as const }] : []),
      ],
    };
  }

  if (!user.orgNodeId) {
    return { id: "__no_annual_plan__", deletedAt: null };
  }

  let scopeIds: string[];
  if (canAccessDepartmentPlans(capabilities)) {
    const deptAncestorId = await findNearestDeptAncestor(user.orgNodeId);
    scopeIds = await getDescendantOrgNodeIds(deptAncestorId ?? user.orgNodeId);
  } else {
    scopeIds = await getDescendantOrgNodeIds(user.orgNodeId);
  }

  if (scopeIds.length === 0) {
    return { id: "__no_annual_plan__", deletedAt: null };
  }

  const or: Array<Record<string, unknown>> = [];

  if (canAccessDepartmentPlans(capabilities)) {
    or.push({ ownerType: "DEPARTMENT", ownerOrgNodeId: { in: scopeIds } });
  }

  if (canAccessTeamPlans(capabilities)) {
    or.push({ ownerType: "TEAM", ownerOrgNodeId: { in: scopeIds } });
  }

  if (or.length === 0) {
    return { id: "__no_annual_plan__", deletedAt: null };
  }

  return { deletedAt: null, ...(or.length === 1 ? or[0] : { OR: or }) };
}

export async function getAnnualGoalTeamWhere(
  user: AnnualGoalScopeUser,
  capabilities: AnnualGoalCapabilities,
) {
  if (user.roleType === "ADMIN") {
    const canAccessDept = capabilities.canEditDepartmentPlans || capabilities.canViewDepartmentPlans;
    if (canAccessDept || capabilities.canViewTeamPlans) {
      return {};
    }
    return { id: "__no_team__" };
  }

  if (!user.orgNodeId || !canAccessTeamPlans(capabilities)) {
    return { id: "__no_team__" };
  }

  const teamIds = await getDescendantOrgNodeIds(user.orgNodeId);
  if (teamIds.length === 0) {
    return { id: "__no_team__" };
  }

  return { id: { in: teamIds } };
}
