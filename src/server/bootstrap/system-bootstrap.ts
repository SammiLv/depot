import { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { ensureAnnualGoalPermissions, annualGoalPermissionDefinitions } from "@/server/organization/annual-goal-permissions";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";

const systemMenus = [
  ["dashboard", "首页工作台", "/dashboard", 10, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["annual-goals", "年度指标", "/annual-goals", 20, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER]],
  ["quarterly-work", "季度工作", "/quarterly-work", 30, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["kpi", "KPI 管理", "/kpi", 40, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["talent", "人才发展", "/talent", 50, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER]],
  ["todos", "我的待办", "/todos", 60, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["notifications", "通知中心", "/notifications", 70, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["organization", "组织与权限", "/organization", 80, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER]],
] as const;

export async function ensureInitialSystemBootstrap() {
  await ensureSystemMenus();
  await ensureAnnualGoalPermissions();
  await ensureSystemAnnualGoalRolePermissions();
  await ensureAdminKpiPermissions();
}

async function ensureSystemMenus() {
  for (const [code, name, path, sortOrder, allowedRoles] of systemMenus) {
    const menu = await prisma.menuPermission.upsert({
      where: { code },
      update: { name, path, sortOrder, isEnabled: true },
      create: { code, name, path, sortOrder },
    });

    for (const roleType of allowedRoles) {
      await prisma.roleMenuPermission.upsert({
        where: {
          scopeType_departmentOrgNodeId_roleType_menuPermissionId: {
            scopeType: "SYSTEM",
            departmentOrgNodeId: "",
            roleType,
            menuPermissionId: menu.id,
          },
        },
        update: { allowed: true },
        create: {
          scopeType: "SYSTEM",
          departmentOrgNodeId: "",
          roleType,
          menuPermissionId: menu.id,
          allowed: true,
        },
      });
    }
  }
}

async function ensureSystemAnnualGoalRolePermissions() {
  const annualGoalPermissions = await prisma.annualGoalPermission.findMany({
    select: { id: true, code: true },
  });
  const permissionIdByCode = new Map(annualGoalPermissions.map((permission) => [permission.code, permission.id]));

  for (const code of annualGoalPermissionDefinitions.map((permission) => permission.code)) {
    const annualGoalPermissionId = permissionIdByCode.get(code);
    if (!annualGoalPermissionId) continue;

    await prisma.roleAnnualGoalPermission.upsert({
      where: {
        scopeType_departmentOrgNodeId_roleType_annualGoalPermissionId: {
          scopeType: "SYSTEM",
          departmentOrgNodeId: "",
          roleType: RoleType.ADMIN,
          annualGoalPermissionId,
        },
      },
      update: { allowed: true },
      create: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        roleType: RoleType.ADMIN,
        annualGoalPermissionId,
        allowed: true,
      },
    });
  }
}

async function ensureAdminKpiPermissions() {
  for (const abilityKey of Object.values(kpiAbilityKeys)) {
    const result = await prisma.orgPermissionGrant.updateMany({
      where: {
        moduleKey: orgPermissionModuleKeys.kpi,
        abilityKey,
        scopeType: "ALL",
        subjectType: "ROLE",
        roleType: RoleType.ADMIN,
        userId: null,
        orgNodeId: null,
      },
      data: { isActive: true },
    });

    if (result.count === 0) {
      await prisma.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.kpi,
          abilityKey,
          scopeType: "ALL",
          subjectType: "ROLE",
          roleType: RoleType.ADMIN,
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });
    }
  }
}
