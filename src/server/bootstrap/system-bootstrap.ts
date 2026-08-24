import { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  annualGoalDefaultPermissionGrants,
  kpiAbilityKeys,
  notificationAbilityKeys,
  orgPermissionModuleKeys,
  talentAbilityKeys,
  talentOrdinaryPermissionAbilityKeys,
} from "@/server/permissions/permission-constants";
import { ensurePresetNotificationScenarios } from "@/server/notifications/preset-scenarios";
import { removePermissionMatrixIntegrationTestArtifacts } from "@/server/organization/integration-test-artifacts";

const systemMenus = [
  ["dashboard", "首页工作台", "/dashboard", 10, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["annual-goals", "年度指标", "/annual-goals", 20, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER]],
  ["quarterly-work", "季度工作", "/quarterly-work", 30, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["kpi", "KPI 管理", "/kpi", 40, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["talent", "人才发展", "/talent", 50, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["todos", "我的待办", "/todos", 60, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["notifications", "通知中心", "/notifications", 70, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
  ["organization", "组织与权限", "/organization", 80, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER]],
] as const;

export async function ensureInitialSystemBootstrap() {
  await removePermissionMatrixIntegrationTestArtifacts();
  await ensureSystemMenus();
  await ensureAnnualGoalPermissionGrants();
  await ensureAdminKpiPermissions();
  await ensureDefaultTalentPermissions();
  await ensureInitialTalentSalaryConfig();
  await ensureNotificationScenarioPermissions();
  await ensurePresetNotificationScenarios();
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

// 指标管理默认授权（幂等）：按 annualGoalDefaultPermissionGrants 发系统模板行（orgNodeId=null）
// + 按部门/组物化行。服务启动与初始化引导都会调用，可重复执行。
async function ensureAnnualGoalRoleGrant(
  roleType: RoleType,
  scopeType: "ALL" | "SUBTREE" | "NODE" | "SELF",
  orgNodeId: string | null,
  abilityKey: (typeof annualGoalDefaultPermissionGrants)[number]["abilityKey"],
) {
  const result = await prisma.orgPermissionGrant.updateMany({
    where: {
      moduleKey: orgPermissionModuleKeys.annualGoal,
      abilityKey,
      scopeType,
      subjectType: "ROLE",
      roleType,
      userId: null,
      orgNodeId,
    },
    data: { isActive: true },
  });

  if (result.count === 0) {
    await prisma.orgPermissionGrant.create({
      data: {
        moduleKey: orgPermissionModuleKeys.annualGoal,
        abilityKey,
        scopeType,
        subjectType: "ROLE",
        roleType,
        userId: null,
        orgNodeId,
        isActive: true,
      },
    });
  }
}

export async function ensureAnnualGoalPermissionGrants() {
  const [departments, teams] = await Promise.all([
    prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } }),
    prisma.orgNode.findMany({ where: { nodeType: "TEAM" }, select: { id: true } }),
  ]);

  for (const grant of annualGoalDefaultPermissionGrants) {
    // 系统模板行（权限矩阵「系统」视图读取的就是 null 节点行）
    await ensureAnnualGoalRoleGrant(grant.roleType, grant.scopeType, null, grant.abilityKey);
    const orgNodeIds = grant.orgNodeSeedKey === "DEPARTMENT"
      ? departments.map((department) => department.id)
      : grant.orgNodeSeedKey === "TEAM"
        ? teams.map((team) => team.id)
        : [];
    for (const orgNodeId of orgNodeIds) {
      await ensureAnnualGoalRoleGrant(grant.roleType, grant.scopeType, orgNodeId, grant.abilityKey);
    }
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

async function ensureTalentRoleGrant(
  roleType: RoleType,
  scopeType: "ALL" | "SUBTREE" | "NODE" | "SELF",
  orgNodeId: string | null,
  abilityKey: (typeof talentAbilityKeys)[keyof typeof talentAbilityKeys],
) {
    const result = await prisma.orgPermissionGrant.updateMany({
      where: {
        moduleKey: orgPermissionModuleKeys.talent,
        abilityKey,
        scopeType,
        subjectType: "ROLE",
        roleType,
        userId: null,
        orgNodeId,
      },
      data: { isActive: true },
    });

    if (result.count === 0) {
      await prisma.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.talent,
          abilityKey,
          scopeType,
          subjectType: "ROLE",
          roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        },
      });
    }
}

async function ensureDefaultTalentPermissions() {
  for (const abilityKey of Object.values(talentAbilityKeys)) {
    await ensureTalentRoleGrant(RoleType.ADMIN, "ALL", null, abilityKey);
  }

  const [departments, teams] = await Promise.all([
    prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } }),
    prisma.orgNode.findMany({ where: { nodeType: "TEAM" }, select: { id: true } }),
  ]);
  for (const department of departments) {
    for (const abilityKey of Object.values(talentAbilityKeys)) {
      await ensureTalentRoleGrant(RoleType.DEPARTMENT_MANAGER, "SUBTREE", department.id, abilityKey);
    }
  }

  const leaderAbilities = [
    talentAbilityKeys.viewProfile,
    talentAbilityKeys.viewReview,
    talentAbilityKeys.manageReview,
    talentAbilityKeys.viewRecommendation,
    talentAbilityKeys.manageRecommendation,
    talentAbilityKeys.viewHistory,
  ];
  for (const team of teams) {
    for (const abilityKey of leaderAbilities) {
      await ensureTalentRoleGrant(RoleType.TEAM_LEADER, "NODE", team.id, abilityKey);
    }
    for (const abilityKey of talentOrdinaryPermissionAbilityKeys) {
      await ensureTalentRoleGrant(RoleType.MEMBER, "SELF", team.id, abilityKey);
    }
  }
}

// 幂等保障（老库升级用）：自动补发新增能力点 VIEW_TALENT_CONFIG 的默认授权
//（管理员 ALL + 各部门主管 SUBTREE）。只覆盖这一个新 key，不回填其它能力点，
// 避免覆盖管理员在权限矩阵里对存量 key 的主动调整。服务启动时调用，可重复执行。
export async function ensureTalentViewConfigPermissionGrants() {
  await ensureTalentRoleGrant(RoleType.ADMIN, "ALL", null, talentAbilityKeys.viewConfig);
  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });
  for (const department of departments) {
    await ensureTalentRoleGrant(RoleType.DEPARTMENT_MANAGER, "SUBTREE", department.id, talentAbilityKeys.viewConfig);
  }
}

async function ensureInitialTalentSalaryConfig() {
  const creator = await prisma.user.findFirst({
    where: { roleType: RoleType.ADMIN, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!creator) return;

  const definitions = [
    { code: "R1", maxSalary: 10_000 },
    { code: "R2", maxSalary: 15_000 },
    { code: "R3", maxSalary: 20_000 },
    { code: "R4", maxSalary: 30_000 },
    { code: "R5", maxSalary: 40_000 },
    { code: "R6", maxSalary: 50_000 },
  ];
  const departments = await prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  for (const [index, definition] of definitions.entries()) {
    const group = await prisma.jobLevelGroup.upsert({
      where: { code: definition.code },
      update: {},
      create: {
        code: definition.code,
        name: `${definition.code} 职级`,
        rankOrder: index + 1,
        description: "系统基础职级段；具体职级档由部门按实际情况配置。",
        createdById: creator.id,
      },
    });

    for (const department of departments) {
      const existing = await prisma.salaryCapConfig.findFirst({
        where: {
          departmentOrgNodeId: department.id,
          jobLevelGroupId: group.id,
          jobLevelId: null,
          versionStatus: "ACTIVE",
          deletedAt: null,
        },
      });
      if (existing) continue;

      const row = await prisma.salaryCapConfig.create({
        data: {
          departmentOrgNodeId: department.id,
          jobLevelGroupId: group.id,
          maxSalary: definition.maxSalary,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          versionStatus: "ACTIVE",
          version: 1,
          publishedAt: new Date(),
          createdById: creator.id,
        },
      });
      await prisma.talentActionLog.create({
        data: {
          targetType: "SalaryCapConfig",
          targetId: row.id,
          action: "SYSTEM_INITIALIZE",
          actorId: creator.id,
          afterJson: JSON.stringify({
            departmentOrgNodeId: row.departmentOrgNodeId,
            levelCode: definition.code,
            maxSalary: row.maxSalary,
            version: row.version,
          }),
        },
      });
    }
  }
}

async function ensureNotificationScenarioPermissions() {
  const abilityKey = notificationAbilityKeys.manageNotificationScenario;
  const where = {
    moduleKey: orgPermissionModuleKeys.notification,
    abilityKey,
    scopeType: "ALL" as const,
    subjectType: "ROLE" as const,
    roleType: RoleType.ADMIN,
    userId: null,
    orgNodeId: null,
  };
  const result = await prisma.orgPermissionGrant.updateMany({
    where,
    data: { isActive: true },
  });
  if (result.count === 0) {
    await prisma.orgPermissionGrant.create({
      data: {
        ...where,
        isActive: true,
      },
    });
  }
}
