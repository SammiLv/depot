import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const annualGoalPermissionCodes = [
  "annualGoal.viewDepartmentPlans",
  "annualGoal.editDepartmentPlans",
  "annualGoal.editTeamPlans",
  "annualGoal.updateProgress",
] as const;

export type AnnualGoalPermissionCode = (typeof annualGoalPermissionCodes)[number];

export type AnnualGoalCapabilities = {
  canViewDepartmentPlans: boolean;
  canEditDepartmentPlans: boolean;
  canEditTeamPlans: boolean;
  canUpdateProgress: boolean;
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
    description: "允许查看本部门下的部门年度指标方案。",
    sortOrder: 10,
  },
  {
    code: "annualGoal.editDepartmentPlans",
    name: "编辑部门方案",
    description: "允许编辑本部门的部门年度指标方案及其指标主数据。",
    sortOrder: 20,
  },
  {
    code: "annualGoal.editTeamPlans",
    name: "编辑小组指标",
    description: "允许编辑本小组年度指标方案及其指标主数据。",
    sortOrder: 30,
  },
  {
    code: "annualGoal.updateProgress",
    name: "更新季度进度",
    description: "允许更新年度指标季度/周进度。",
    sortOrder: 40,
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
  roleType: RoleType;
  annualGoalPermissionId: string;
};

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

export async function getAnnualGoalPermissionMatrix() {
  await ensureAnnualGoalPermissions();
  const [permissions, rolePermissions] = await Promise.all([
    prisma.annualGoalPermission.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.roleAnnualGoalPermission.findMany(),
  ]);

  return {
    permissions: permissions.map((permission) => ({
      id: permission.id,
      code: permission.code as AnnualGoalPermissionCode,
      name: permission.name,
      description: permission.description,
      sortOrder: permission.sortOrder,
    })),
    rolePermissions: rolePermissions.map((permission) => ({
      roleType: permission.roleType,
      annualGoalPermissionId: permission.annualGoalPermissionId,
    })),
  };
}

export async function getAnnualGoalPermissionMap() {
  await ensureAnnualGoalPermissions();
  const rolePermissions = await prisma.roleAnnualGoalPermission.findMany({
    include: { annualGoalPermission: true },
  });

  const map = new Map<RoleType, Set<AnnualGoalPermissionCode>>();
  for (const permission of rolePermissions) {
    const current = map.get(permission.roleType) ?? new Set<AnnualGoalPermissionCode>();
    current.add(permission.annualGoalPermission.code as AnnualGoalPermissionCode);
    map.set(permission.roleType, current);
  }

  return map;
}

export function getAnnualGoalCapabilities(
  roleType: RoleType,
  permissionMap: Map<RoleType, Set<AnnualGoalPermissionCode>>
): AnnualGoalCapabilities {
  if (roleType === "ADMIN" || roleType === "DEPARTMENT_MANAGER") {
    return {
      canViewDepartmentPlans: true,
      canEditDepartmentPlans: true,
      canEditTeamPlans: true,
      canUpdateProgress: true,
    };
  }

  const rolePermissions = permissionMap.get(roleType) ?? new Set<AnnualGoalPermissionCode>();

  return {
    canViewDepartmentPlans: rolePermissions.has("annualGoal.viewDepartmentPlans"),
    canEditDepartmentPlans: rolePermissions.has("annualGoal.editDepartmentPlans"),
    canEditTeamPlans: rolePermissions.has("annualGoal.editTeamPlans"),
    canUpdateProgress: rolePermissions.has("annualGoal.updateProgress"),
  };
}
