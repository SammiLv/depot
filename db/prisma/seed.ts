import "dotenv/config";
import { randomUUID, scryptSync } from "node:crypto";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { AnnualMetricCalculationType, PrismaClient, RoleType } from "@prisma/client";
import { annualGoalPermissionDefinitions } from "../../src/server/organization/annual-goal-permissions";
import {
  kpiDefaultPermissionGrants,
  notificationDefaultPermissionGrants,
  productManagementDefaultPermissionGrants,
  talentDefaultPermissionGrants,
} from "../../src/server/permissions/permission-constants";
import { computeNextRunAt } from "../../src/server/notifications/schedule-utils";
import { removePermissionMatrixIntegrationTestArtifacts } from "../../src/server/organization/integration-test-artifacts";
import { ensureAnnualGoalDemoData } from "./seed-annual-goals-demo";
import { ensurePresetNotificationScenarios } from "../../src/server/notifications/preset-scenarios";

function resolveDatabaseUrl() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "file:./dev.db") {
    return `file:${path.resolve(process.cwd(), "db/dev.db")}`;
  }

  if (process.env.DATABASE_URL.startsWith("file:")) {
    const rawPath = process.env.DATABASE_URL.slice("file:".length);
    if (path.isAbsolute(rawPath)) {
      return process.env.DATABASE_URL;
    }
    return `file:${path.resolve(process.cwd(), rawPath)}`;
  }

  return process.env.DATABASE_URL;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

/** 本地 seed 账号默认密码；与 scripts/set-admin-password.ts、login 校验算法一致 */
const SEED_DEFAULT_PASSWORD = "admin1234";

function hashSeedPassword(password: string) {
  return scryptSync(password, "department-management", 64).toString("hex");
}

const seedPasswordHash = hashSeedPassword(SEED_DEFAULT_PASSWORD);

/** 本地密码登录测试所需角色：主管 / 组长 / 组员（不含 admin） */
const SEED_PASSWORD_TEST_ROLES = [
  RoleType.DEPARTMENT_MANAGER,
  RoleType.TEAM_LEADER,
  RoleType.MEMBER,
] as const;

const defaultSeedTestAccountByRole = {
  [RoleType.DEPARTMENT_MANAGER]: {
    loginName: "test-dept-manager",
    name: "测试部门主管",
    title: "部门主管",
  },
  [RoleType.TEAM_LEADER]: {
    loginName: "test-team-leader",
    name: "测试组长",
    title: "组长",
  },
  [RoleType.MEMBER]: {
    loginName: "test-member",
    name: "测试组员",
    title: "产品经理",
  },
} satisfies Record<(typeof SEED_PASSWORD_TEST_ROLES)[number], { loginName: string; name: string; title: string }>;

function getPasswordLoginUserWhere(roleType: RoleType) {
  return {
    deletedAt: null,
    isActive: true,
    passwordLoginEnabled: true,
    passwordHash: { not: null },
    loginName: { not: null },
    roleType,
  };
}

/** 已配置密码登录的账号不参与 sample 用户清理 */
function getSampleUserDeletionWhere(sampleUserNames: string[]) {
  return {
    name: { in: sampleUserNames },
    NOT: {
      passwordLoginEnabled: true,
      passwordHash: { not: null },
      loginName: { not: null },
    },
  };
}

/** 补建密码测试账号时优先挂载的部门；生产环境默认平台部，可通过环境变量覆盖 */
const SEED_TEST_DEPARTMENT_NAME = process.env.SEED_TEST_DEPARTMENT_NAME?.trim() || "平台部";

async function resolvePreferredTestDepartment() {
  const preferred = await prisma.orgNode.findFirst({
    where: { nodeType: "DEPARTMENT", name: SEED_TEST_DEPARTMENT_NAME },
    select: { id: true, name: true },
  });
  if (preferred) {
    return preferred;
  }

  const fallback = await prisma.orgNode.findFirst({
    where: { nodeType: "DEPARTMENT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (fallback && SEED_TEST_DEPARTMENT_NAME) {
    console.warn(
      `[seed] 未找到部门「${SEED_TEST_DEPARTMENT_NAME}」，测试账号将挂到「${fallback.name}」`,
    );
  }
  return fallback ?? null;
}

async function resolveSeedOrgNodeIdForRole(roleType: RoleType) {
  const department = await resolvePreferredTestDepartment();
  if (!department) {
    return null;
  }

  if (roleType === RoleType.DEPARTMENT_MANAGER) {
    return department.id;
  }

  const team = await prisma.orgNode.findFirst({
    where: { nodeType: "TEAM", parentId: department.id },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (team) {
    return team.id;
  }

  const fallbackTeam = await prisma.orgNode.findFirst({
    where: { nodeType: "TEAM" },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (fallbackTeam) {
    console.warn(
      `[seed] 部门「${department.name}」下无小组，${roleType} 测试账号将挂到其他小组`,
    );
  }
  return fallbackTeam?.id ?? null;
}

async function ensureSeedPasswordTestAccountsIfMissing() {
  const missingRoles: RoleType[] = [];
  for (const roleType of SEED_PASSWORD_TEST_ROLES) {
    const count = await prisma.user.count({ where: getPasswordLoginUserWhere(roleType) });
    if (count === 0) {
      missingRoles.push(roleType);
    }
  }

  if (missingRoles.length === 0) {
    return;
  }

  let created = 0;
  for (const roleType of missingRoles) {
    const orgNodeId = await resolveSeedOrgNodeIdForRole(roleType);
    if (!orgNodeId) {
      console.warn(`[seed] 跳过 ${roleType} 测试账号：未找到可用组织节点`);
      continue;
    }

    const template = defaultSeedTestAccountByRole[roleType];
    const loginTaken = await prisma.user.findFirst({
      where: { loginName: template.loginName },
      select: { id: true },
    });
    if (loginTaken) {
      console.warn(`[seed] 跳过 ${template.loginName}：登录名已占用`);
      continue;
    }

    await prisma.user.create({
      data: {
        name: template.name,
        loginName: template.loginName,
        roleType,
        orgNodeId,
        title: template.title,
        passwordHash: seedPasswordHash,
        passwordLoginEnabled: true,
      },
    });
    created += 1;
  }

  if (created > 0) {
    console.info(
      `[seed] 已补建 ${created} 个密码登录测试账号（${missingRoles.join(" / ")}，挂载部门：${SEED_TEST_DEPARTMENT_NAME}，密码：${SEED_DEFAULT_PASSWORD}）`,
    );
  }
}

const PRODUCT_TEAM_PASSWORD_ACCOUNTS = [
  {
    loginName: "b-leader",
    name: "采购组组长",
    title: "组长",
    roleType: RoleType.TEAM_LEADER,
  },
  {
    loginName: "b-member",
    name: "采购组组员",
    title: "组员",
    roleType: RoleType.MEMBER,
  },
] as const;

async function ensureProductProcurementPasswordAccounts() {
  const department = await prisma.orgNode.findFirst({
    where: { nodeType: "DEPARTMENT", name: "产品部" },
    select: { id: true, name: true },
  });
  if (!department) {
    console.warn("[seed] 未找到部门「产品部」，跳过 b-leader / b-member");
    return;
  }

  const team = await prisma.orgNode.findFirst({
    where: { nodeType: "TEAM", name: "采购组", parentId: department.id },
    select: { id: true, name: true },
  });
  if (!team) {
    console.warn("[seed] 未找到产品部下的「采购组」，跳过 b-leader / b-member");
    return;
  }

  let created = 0;
  let updated = 0;
  for (const account of PRODUCT_TEAM_PASSWORD_ACCOUNTS) {
    const existing = await prisma.user.findFirst({
      where: { loginName: account.loginName },
      select: { id: true },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: account.name,
          title: account.title,
          roleType: account.roleType,
          orgNodeId: team.id,
          passwordHash: seedPasswordHash,
          passwordLoginEnabled: true,
          isActive: true,
          deletedAt: null,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.user.create({
      data: {
        name: account.name,
        loginName: account.loginName,
        title: account.title,
        roleType: account.roleType,
        orgNodeId: team.id,
        passwordHash: seedPasswordHash,
        passwordLoginEnabled: true,
      },
    });
    created += 1;
  }

  if (created > 0 || updated > 0) {
    console.info(
      `[seed] 产品部/采购组密码账号：新建 ${created}、更新 ${updated}（b-leader / b-member，密码：${SEED_DEFAULT_PASSWORD}）`,
    );
  }
}

async function ensureOrgPermissionGrants() {
  const root = await prisma.orgNode.findFirst({ where: { nodeType: "ROOT" }, select: { id: true } });
  const departments = await prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });
  const teams = await prisma.orgNode.findMany({ where: { nodeType: "TEAM" }, select: { id: true } });

  if (!root || departments.length === 0) {
    console.warn("[seed] 缺少组织根节点或部门，跳过默认权限补全");
    return;
  }

  const allGrants = [
    ...kpiDefaultPermissionGrants,
    ...talentDefaultPermissionGrants,
    ...notificationDefaultPermissionGrants,
    ...productManagementDefaultPermissionGrants,
  ];

  let created = 0;
  let updated = 0;
  for (const grant of allGrants) {
    const orgNodeIds = grant.orgNodeSeedKey === null
      ? [null]
      : grant.orgNodeSeedKey === "ROOT"
        ? [root.id]
        : grant.orgNodeSeedKey === "DEPARTMENT"
          ? departments.map((d) => d.id)
          : teams.map((t) => t.id);

    for (const orgNodeId of orgNodeIds) {
      const existing = await prisma.orgPermissionGrant.findFirst({
        where: {
          moduleKey: grant.moduleKey,
          abilityKey: grant.abilityKey,
          scopeType: grant.scopeType,
          subjectType: grant.subjectType,
          roleType: grant.roleType,
          userId: null,
          orgNodeId,
        },
      });
      if (existing) {
        if (!existing.isActive) {
          await prisma.orgPermissionGrant.update({
            where: { id: existing.id },
            data: { isActive: true },
          });
          updated++;
        }
        continue;
      }
      await prisma.orgPermissionGrant.create({
        data: {
          moduleKey: grant.moduleKey,
          abilityKey: grant.abilityKey,
          scopeType: grant.scopeType,
          subjectType: grant.subjectType,
          roleType: grant.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        },
      });
      created++;
    }
  }

  if (created > 0 || updated > 0) {
    console.info(`[seed] 已补全默认组织权限：新建 ${created} 条，更新 ${updated} 条`);
  }
}

function createOrgNodeId() {
  return randomUUID();
}

type OrgNodeSeed = {
  id: string;
  name: string;
  nodeType: "ROOT" | "DEPARTMENT" | "TEAM";
  parentId: string | null;
  dingtalkDeptId?: string | null;
};

async function rebuildOrgTree(nodes: OrgNodeSeed[]) {
  await prisma.orgClosure.deleteMany();
  await prisma.orgNode.deleteMany();

  for (const node of nodes) {
    await prisma.orgNode.create({
      data: {
        id: node.id,
        name: node.name,
        nodeType: node.nodeType,
        parentId: node.parentId,
        dingtalkDeptId: node.dingtalkDeptId ?? null,
      },
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    const ancestors: string[] = [];
    let currentId: string | null = node.id;

    while (currentId) {
      ancestors.push(currentId);
      currentId = nodeById.get(currentId)?.parentId ?? null;
    }

    for (let i = 0; i < ancestors.length; i += 1) {
      await prisma.orgClosure.create({
        data: {
          id: randomUUID(),
          ancestorId: ancestors[i],
          descendantId: node.id,
          depth: ancestors.length - i - 1,
        },
      });
    }
  }
}

async function syncLegacyOrgReferences(rootNodeId: string) {
  await prisma.user.updateMany({
    where: { roleType: RoleType.ADMIN },
    data: { orgNodeId: rootNodeId },
  });

  const nonAdminUsers = await prisma.user.findMany({
    where: { roleType: { not: RoleType.ADMIN } },
    select: { id: true, orgNodeId: true },
  });
  for (const user of nonAdminUsers) {
    if (user.orgNodeId) continue;
    throw new Error(`用户缺少 orgNodeId: ${user.id}`);
  }

  const annualGoalPlans = await prisma.annualGoalPlan.findMany({
    select: { id: true, departmentOrgNodeId: true },
  });
  for (const plan of annualGoalPlans) {
    if (plan.departmentOrgNodeId) continue;
    throw new Error(`年度方案缺少 departmentOrgNodeId: ${plan.id}`);
  }

  const projects = await prisma.project.findMany({
    select: { id: true, orgNodeId: true },
  });
  for (const project of projects) {
    if (project.orgNodeId) continue;
    throw new Error(`项目缺少 orgNodeId: ${project.id}`);
  }

  const quarterlyWorks = await prisma.quarterlyWork.findMany({
    select: { id: true, orgNodeId: true },
  });
  for (const work of quarterlyWorks) {
    if (work.orgNodeId) continue;
    throw new Error(`季度工作缺少 orgNodeId: ${work.id}`);
  }

  const personalKpis = await prisma.personalKpi.findMany({
    select: { id: true, orgNodeId: true, userId: true },
  });
  for (const kpi of personalKpis) {
    if (kpi.orgNodeId) continue;
    const owner = await prisma.user.findUnique({ where: { id: kpi.userId }, select: { orgNodeId: true } });
    if (!owner?.orgNodeId) {
      throw new Error(`个人 KPI 缺少 orgNodeId: ${kpi.id}`);
    }
    await prisma.personalKpi.update({
      where: { id: kpi.id },
      data: { orgNodeId: owner.orgNodeId },
    });
  }
}

async function main() {
  await removePermissionMatrixIntegrationTestArtifacts(prisma);

  const fullReset = process.env.SEED_FULL_RESET === "true";
  if (!fullReset) {
    console.info("[seed] 增量模式：不清理通知/指标/组织；按角色检测密码测试账号，三者齐全则不补建。全量重建请使用 npm run seed:full");
    await ensureOrgPermissionGrants();
    await ensureSeedPasswordTestAccountsIfMissing();
    await ensureProductProcurementPasswordAccounts();
    await ensurePresetNotificationScenarios();
    await ensureAnnualGoalDemoData(prisma);
    return;
  }

  const department = {
    id: "seed_dept_product",
    name: "产品部",
    dingtalkDeptId: "product-dept",
  };
  const secondDepartment = {
    id: "seed_dept_platform",
    name: "平台部",
    dingtalkDeptId: "platform-dept",
  };

  const rootOrgNodeId = createOrgNodeId();
  const departmentOrgNodeId = createOrgNodeId();
  const secondDepartmentOrgNodeId = createOrgNodeId();

  const teamDefinitions = [
    { id: "seed_team_procurement", name: "采购组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_procurement_business", name: "采购业务组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_b_end", name: "B端组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_b_end_business", name: "B端业务组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_c_end", name: "C端组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_c_end_business", name: "C端业务组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_design", name: "设计组", orgNodeId: createOrgNodeId() },
  ] as const;
  const secondTeamDefinitions = [
    { id: "seed_team_platform_arch", name: "平台架构组", orgNodeId: createOrgNodeId() },
    { id: "seed_team_data_strategy", name: "数据策略组", orgNodeId: createOrgNodeId() },
  ] as const;
  const teamNames = teamDefinitions.map((team) => team.name);
  const secondTeamNames = secondTeamDefinitions.map((team) => team.name);
  const sampleUserNames = [
    "系统管理员",
    "产品部主管",
    "平台部主管",
    ...teamNames.flatMap((teamName) => [`${teamName}组长`, `${teamName}成员A`]),
    ...secondTeamNames.flatMap((teamName) => [`${teamName}组长`, `${teamName}成员A`]),
  ];

  await prisma.todoItem.deleteMany();
  // 不清理 Notification：seed 可能中途失败或仅需补预设数据，清空会导致「全部通知」历史丢失
  await prisma.annualGoalProgress.deleteMany();
  await prisma.annualGoalQuarterTarget.deleteMany();
  await prisma.annualGoalMetricAssignment.deleteMany();
  await prisma.annualGoalMetricSource.deleteMany();
  await prisma.annualGoalMetric.deleteMany();
  await prisma.annualGoalPlan.deleteMany();
  await prisma.kpiTemplateAssignment.deleteMany();
  await prisma.kpiTemplateItem.deleteMany();
  await prisma.kpiTemplate.deleteMany({ where: { templateKey: { startsWith: "kpi-template-" } } });
  await prisma.user.deleteMany({ where: getSampleUserDeletionWhere(sampleUserNames) });

  const admin = await prisma.user.upsert({
    where: { loginName: "admin" },
    update: {
      name: "系统管理员",
      passwordHash: seedPasswordHash,
      passwordLoginEnabled: true,
      roleType: RoleType.ADMIN,
      orgNodeId: rootOrgNodeId,
      title: "管理员",
    },
    create: {
      name: "系统管理员",
      loginName: "admin",
      passwordHash: seedPasswordHash,
      passwordLoginEnabled: true,
      roleType: RoleType.ADMIN,
      orgNodeId: rootOrgNodeId,
      title: "管理员",
    },
  });

  const existingProductManager = await prisma.user.findFirst({
    where: { loginName: "product-manager", deletedAt: null },
    select: { id: true },
  });
  const manager = existingProductManager
    ? await prisma.user.update({
        where: { id: existingProductManager.id },
        data: {
          passwordHash: seedPasswordHash,
          passwordLoginEnabled: true,
          orgNodeId: departmentOrgNodeId,
          roleType: RoleType.DEPARTMENT_MANAGER,
        },
      })
    : await prisma.user.create({
        data: {
          name: "产品部主管",
          loginName: "product-manager",
          passwordHash: seedPasswordHash,
          passwordLoginEnabled: true,
          roleType: RoleType.DEPARTMENT_MANAGER,
          orgNodeId: departmentOrgNodeId,
          title: "部门主管",
        },
      });

  const secondDepartmentManager = await prisma.user.create({
    data: {
      name: "平台部主管",
      roleType: RoleType.DEPARTMENT_MANAGER,
      orgNodeId: secondDepartmentOrgNodeId,
      title: "部门主管",
    },
  });

  const teams = Object.fromEntries(teamDefinitions.map((team) => [team.name, team])) as Record<string, { id: string; name: string; orgNodeId: string }>;
  let sampleLeaderId = "";
  let sampleMemberId = "";

  for (const team of teamDefinitions) {
    const leader = await prisma.user.create({
      data: {
        name: `${team.name}组长`,
        roleType: RoleType.TEAM_LEADER,
        orgNodeId: team.orgNodeId,
        title: "组长",
      },
    });

    const member = await prisma.user.create({
      data: {
        name: `${team.name}成员A`,
        roleType: RoleType.MEMBER,
        orgNodeId: team.orgNodeId,
        title: "产品经理",
      },
    });

    if (team.name === "C端组") {
      sampleLeaderId = leader.id;
      sampleMemberId = member.id;
    }
  }

  for (const team of secondTeamDefinitions) {
    await prisma.user.create({
      data: {
        name: `${team.name}组长`,
        roleType: RoleType.TEAM_LEADER,
        orgNodeId: team.orgNodeId,
        title: "组长",
      },
    });

    await prisma.user.create({
      data: {
        name: `${team.name}成员A`,
        roleType: RoleType.MEMBER,
        orgNodeId: team.orgNodeId,
        title: "产品经理",
      },
    });
  }

  await rebuildOrgTree([
    {
      id: rootOrgNodeId,
      name: "组织根节点",
      nodeType: "ROOT",
      parentId: null,
      dingtalkDeptId: "__root__",
    },
    {
      id: departmentOrgNodeId,
      name: department.name,
      nodeType: "DEPARTMENT",
      parentId: rootOrgNodeId,
      dingtalkDeptId: department.dingtalkDeptId,
    },
    ...teamDefinitions.map((team) => ({
      id: team.orgNodeId,
      name: team.name,
      nodeType: "TEAM" as const,
      parentId: departmentOrgNodeId,
      dingtalkDeptId: null,
    })),
    {
      id: secondDepartmentOrgNodeId,
      name: secondDepartment.name,
      nodeType: "DEPARTMENT",
      parentId: rootOrgNodeId,
      dingtalkDeptId: secondDepartment.dingtalkDeptId,
    },
    ...secondTeamDefinitions.map((team) => ({
      id: team.orgNodeId,
      name: team.name,
      nodeType: "TEAM" as const,
      parentId: secondDepartmentOrgNodeId,
      dingtalkDeptId: null,
    })),
  ]);

  const menus = [
    ["dashboard", "首页工作台", "/dashboard", 10, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
    ["annual-goals", "年度指标", "/annual-goals", 20, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER]],
    ["quarterly-work", "季度工作", "/quarterly-work", 30, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
    ["kpi", "KPI 管理", "/kpi", 40, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
    ["talent", "人才发展", "/talent", 50, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
    ["todos", "我的待办", "/todos", 60, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
    ["notifications", "通知中心", "/notifications", 70, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER, RoleType.TEAM_LEADER, RoleType.MEMBER]],
    ["organization", "组织与权限", "/organization", 80, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER]],
  ] as const;

  for (const [code, name, path, sortOrder, allowedRoles] of menus) {
    const menu = await prisma.menuPermission.upsert({
      where: { code },
      update: { name, path, sortOrder, isEnabled: true },
      create: { code, name, path, sortOrder },
    });

    await prisma.roleMenuPermission.deleteMany({
      where: {
        menuPermissionId: menu.id,
        roleType: { notIn: [...allowedRoles] },
      },
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

  for (const permission of annualGoalPermissionDefinitions) {
    await prisma.annualGoalPermission.upsert({
      where: { code: permission.code },
      update: {
        name: permission.name,
        description: permission.description,
        sortOrder: permission.sortOrder,
      },
      create: permission,
    });
  }

  const annualGoalPermissions = await prisma.annualGoalPermission.findMany();
  const annualGoalPermissionIdByCode = new Map(annualGoalPermissions.map((permission) => [permission.code, permission.id]));
  const annualGoalRoleDefaults: Array<[RoleType, string[]]> = [
    [RoleType.ADMIN, annualGoalPermissionDefinitions.map((permission) => permission.code)],
    [RoleType.DEPARTMENT_MANAGER, annualGoalPermissionDefinitions.map((permission) => permission.code)],
    [RoleType.TEAM_LEADER, ["annualGoal.viewDepartmentPlans", "annualGoal.editTeamPlans", "annualGoal.updateProgress"]],
    [RoleType.MEMBER, ["annualGoal.viewDepartmentPlans", "annualGoal.updateProgress"]],
  ];

  await prisma.roleAnnualGoalPermission.deleteMany();
  await prisma.orgPermissionGrant.deleteMany();
  for (const [roleType, codes] of annualGoalRoleDefaults) {
    for (const code of codes) {
      const annualGoalPermissionId = annualGoalPermissionIdByCode.get(code);
      if (!annualGoalPermissionId) continue;
      await prisma.roleAnnualGoalPermission.create({
        data: {
          scopeType: "SYSTEM",
          departmentOrgNodeId: "",
          roleType,
          annualGoalPermissionId,
          allowed: true,
        },
      });
    }
  }

  for (const grant of [...kpiDefaultPermissionGrants, ...talentDefaultPermissionGrants, ...notificationDefaultPermissionGrants, ...productManagementDefaultPermissionGrants]) {
    const orgNodeIds = grant.orgNodeSeedKey === null
      ? [null]
      : grant.orgNodeSeedKey === "ROOT"
        ? [rootOrgNodeId]
        : grant.orgNodeSeedKey === "DEPARTMENT"
          ? [departmentOrgNodeId]
          : Object.values(teams).map((team) => team.orgNodeId);
    for (const orgNodeId of orgNodeIds) {
      await prisma.orgPermissionGrant.create({
        data: {
          moduleKey: grant.moduleKey,
          abilityKey: grant.abilityKey,
          scopeType: grant.scopeType,
          subjectType: grant.subjectType,
          roleType: grant.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        },
      });
    }
  }

  const obsoleteMenus = await prisma.menuPermission.findMany({
    where: { OR: [{ code: "value-tracking" }, { path: "/value-tracking" }] },
    select: { id: true },
  });
  const obsoleteMenuIds = obsoleteMenus.map((menu) => menu.id);
  if (obsoleteMenuIds.length > 0) {
    await prisma.roleMenuPermission.deleteMany({ where: { menuPermissionId: { in: obsoleteMenuIds } } });
    await prisma.menuPermission.deleteMany({ where: { id: { in: obsoleteMenuIds } } });
  }

  await prisma.todoItem.createMany({
    data: [
      {
        userId: manager.id,
        title: "确认第一刀功能切片范围",
        description: "检查模拟登录、Dashboard、基础组织和待办入口是否符合 MVP 范围。",
        targetType: "SYSTEM_TASK",
        targetId: "first-slice-scope",
        dueDate: new Date("2026-06-07"),
      },
      {
        userId: sampleLeaderId,
        title: "补充 C 端组成员信息",
        description: "完善 C 端组成员岗位和基础资料，便于后续权限验证。",
        targetType: "USER_PROFILE",
        targetId: sampleLeaderId,
        dueDate: new Date("2026-06-10"),
      },
      {
        userId: sampleMemberId,
        title: "查看产品部管理工作台试用说明",
        description: "先确认登录、首页和我的待办入口。",
        targetType: "SYSTEM_TASK",
        targetId: "trial-guide",
        dueDate: new Date("2026-06-12"),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: manager.id,
        type: "SYSTEM",
        title: "第一刀功能切片已准备",
        content: "当前版本先支持模拟登录、基础权限、Dashboard 和待办通知入口。",
      },
      {
        userId: secondDepartmentManager.id,
        type: "SYSTEM",
        title: "平台部并行测试数据已准备",
        content: "你可以从平台部视角验证跨部门并行流程和数据隔离。",
      },
      {
        userId: sampleLeaderId,
        type: "SYSTEM",
        title: "你可以开始验证本组数据范围",
        content: "组长视角默认只展示本组成员和本组数据。",
      },
      {
        userId: sampleMemberId,
        type: "SYSTEM",
        title: "欢迎试用产品部管理工作台",
        content: "普通成员视角默认只展示本人相关数据。",
      },
    ],
  });

  const initializationReminderSchedule = {
    frequency: "weekly" as const,
    timeOfDay: "09:00",
    weekdays: [1],
    scanType: "kpi_initialization_pending" as const,
    daysBefore: 0,
    timezone: "Asia/Shanghai",
  };

  const selfReviewSchedule = {
    frequency: "daily" as const,
    timeOfDay: "09:00",
    weekdays: [1, 2, 3, 4, 5],
    scanType: "kpi_self_review_pending" as const,
    daysBefore: 0,
    timezone: "Asia/Shanghai",
  };

  await prisma.notificationScenario.createMany({
    data: [
      {
        name: "季度 KPI 初始化提醒",
        description: "每季度到达指定时间后，提醒负责人为尚未生成 KPI 的成员执行初始化",
        module: "KPI管理",
        triggerType: "SCHEDULE",
        triggerEvent: "kpi.initialization.pending",
        scheduleConfig: initializationReminderSchedule,
        nextRunAt: computeNextRunAt(initializationReminderSchedule),
        recipientConfig: { rules: [{ type: "DEPARTMENT_MANAGER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 待初始化（{{pendingCount}}人）",
          contentTemplate: "{{departmentName}} 仍有 {{pendingCount}} 名成员未生成本季度 KPI，请尽快完成初始化。",
          messageUrlTemplate: "{{appUrl}}/kpi",
        },
        isActive: true,
        sortOrder: 5,
        createdById: manager.id,
        updatedById: manager.id,
      },
      {
        name: "KPI 初始化提醒自评",
        description: "季度 KPI 初始化后，通知被考核人开始自评",
        module: "KPI管理",
        triggerType: "EVENT",
        triggerEvent: "kpi.initialized",
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 已开启，请开始自评",
          contentTemplate: "{{userName}}，您的季度 KPI 已初始化，请及时完成自评。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 10,
        createdById: manager.id,
        updatedById: manager.id,
      },
      {
        name: "KPI 提交后通知审批人",
        description: "自评提交后通知当前审批人处理",
        module: "KPI管理",
        triggerType: "EVENT",
        triggerEvent: "kpi.approval.pending",
        recipientConfig: { rules: [{ type: "CURRENT_APPROVER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "APPROVAL_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{userName}} 的 {{year}}年Q{{quarter}} KPI 待您处理",
          contentTemplate: "请及时完成评分或审批。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 20,
        createdById: manager.id,
        updatedById: manager.id,
      },
      {
        name: "KPI 审批驳回通知",
        description: "审批驳回后通知被考核人修改",
        module: "KPI管理",
        triggerType: "EVENT",
        triggerEvent: "kpi.approval.rejected",
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 已驳回，请修改后重提",
          contentTemplate: "{{userName}}，驳回原因：{{comment}}",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 30,
        createdById: manager.id,
        updatedById: manager.id,
      },
      {
        name: "KPI 终评完成通知",
        description: "KPI 完成后通知被考核人",
        module: "KPI管理",
        triggerType: "EVENT",
        triggerEvent: "kpi.completed",
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 已完成终评",
          contentTemplate: "{{userName}}，您的季度 KPI 已完成，可前往查看结果。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 40,
        createdById: manager.id,
        updatedById: manager.id,
      },
      {
        name: "每日提醒未完成自评",
        description: "每天 09:00 扫描仍处于自评阶段的 KPI",
        module: "KPI管理",
        triggerType: "SCHEDULE",
        triggerEvent: "kpi.self_review.pending",
        scheduleConfig: selfReviewSchedule,
        nextRunAt: computeNextRunAt(selfReviewSchedule),
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 20 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "提醒：{{year}}年Q{{quarter}} KPI 自评尚未完成",
          contentTemplate: "{{userName}}，请尽快完成自评提交。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 50,
        createdById: manager.id,
        updatedById: manager.id,
      },
    ],
  });

  const productAnnualPlan = await prisma.annualGoalPlan.create({
    data: {
      year: 2026,
      name: "产品部 2026 年度业绩指标",
      description: "产品部承接公司下达年度业绩指标，并拆解最细指标元数据分配到小组",
      departmentOrgNodeId,
      status: "ACTIVE",
      createdById: manager.id,
      metrics: {
        create: [
          {
            metricCode: "AG-2026-001",
            name: "单位拓展业绩分值",
            targetValue: 267,
            currentValue: 120,
            unit: "分",
            weight: 50,
            calculationType: AnnualMetricCalculationType.RATIO,
            sortOrder: 10,
          },
          {
            metricCode: "AG-2026-002",
            name: "创新 ToB 营收",
            description: "由伏羲慧眼、其他创新 ToB 端等最细指标项支撑",
            targetValue: 5000000,
            currentValue: 800000,
            unit: "元",
            weight: 20,
            calculationType: AnnualMetricCalculationType.RATIO,
            sortOrder: 20,
          },
          {
            metricCode: "AG-2026-003",
            name: "创新 ToC 用户增量",
            description: "由 C 端产品、公共平台、移动商城等最细指标项支撑",
            targetValue: 35000,
            currentValue: 4200,
            unit: "人",
            weight: 30,
            calculationType: AnnualMetricCalculationType.RATIO,
            sortOrder: 30,
          },
        ],
      },
    },
    include: { metrics: true },
  });

  const departmentMetricByCode = Object.fromEntries(productAnnualPlan.metrics.map((metric) => [metric.metricCode, metric]));
  const sourceMetrics = await prisma.annualGoalMetricSource.createManyAndReturn({
    data: [
      {
        parentMetricId: departmentMetricByCode["AG-2026-001"].id,
        metricCode: "AGM-2026-001",
        name: "单位拓展业绩分值",
        targetValue: 267,
        currentValue: 120,
        unit: "分",
        calculationType: AnnualMetricCalculationType.RATIO,
        createdById: manager.id,
      },
      {
        parentMetricId: departmentMetricByCode["AG-2026-002"].id,
        metricCode: "AGM-2026-002",
        name: "伏羲慧眼",
        targetValue: 4000000,
        currentValue: 620000,
        unit: "元",
        calculationType: AnnualMetricCalculationType.RATIO,
        createdById: manager.id,
      },
      {
        parentMetricId: departmentMetricByCode["AG-2026-002"].id,
        metricCode: "AGM-2026-003",
        name: "其他创新 ToB 端",
        targetValue: 1000000,
        currentValue: 180000,
        unit: "元",
        calculationType: AnnualMetricCalculationType.RATIO,
        createdById: manager.id,
      },
      {
        parentMetricId: departmentMetricByCode["AG-2026-003"].id,
        metricCode: "AGM-2026-004",
        name: "C 端产品",
        targetValue: 30000,
        currentValue: 3600,
        unit: "人",
        calculationType: AnnualMetricCalculationType.RATIO,
        createdById: manager.id,
      },
      {
        parentMetricId: departmentMetricByCode["AG-2026-003"].id,
        metricCode: "AGM-2026-005",
        name: "公共平台",
        targetValue: 3700,
        currentValue: 420,
        unit: "人",
        calculationType: AnnualMetricCalculationType.RATIO,
        createdById: manager.id,
      },
      {
        parentMetricId: departmentMetricByCode["AG-2026-003"].id,
        metricCode: "AGM-2026-006",
        name: "移动商城",
        targetValue: 1300,
        currentValue: 180,
        unit: "人",
        calculationType: AnnualMetricCalculationType.RATIO,
        createdById: manager.id,
      },
    ],
  });
  const sourceByCode = Object.fromEntries(sourceMetrics.map((metric) => [metric.metricCode, metric]));

  const teamAnnualPlans = [
    {
      teamName: "采购组",
      metrics: [
        ["AGM-2026-001", 80],
        ["AGM-2026-005", 20],
      ],
    },
    {
      teamName: "采购业务组",
      metrics: [],
    },
    {
      teamName: "B端组",
      metrics: [
        ["AGM-2026-001", 80],
        ["AGM-2026-003", 20],
      ],
    },
    {
      teamName: "B端业务组",
      metrics: [],
    },
    {
      teamName: "C端组",
      metrics: [
        ["AGM-2026-001", 20],
        ["AGM-2026-004", 50],
        ["AGM-2026-002", 30],
      ],
    },
    {
      teamName: "C端业务组",
      metrics: [],
    },
    {
      teamName: "设计组",
      metrics: [
        ["AGM-2026-001", 80],
        ["AGM-2026-006", 20],
      ],
    },
  ] as const;

  for (const plan of teamAnnualPlans) {
    const team = teams[plan.teamName];

    await prisma.annualGoalMetricAssignment.createMany({
      data: plan.metrics.map(([metricCode, weight], index) => ({
        teamOrgNodeId: team.orgNodeId,
        sourceMetricId: sourceByCode[metricCode].id,
        weight,
        sortOrder: (index + 1) * 10,
        createdById: manager.id,
      })),
    });
  }

  await prisma.annualGoalPlan.create({
    data: {
      year: 2026,
      name: "平台部 2026 年度业绩指标",
      description: "用于验证多部门并行推进时的平台部年度目标和数据隔离。",
      departmentOrgNodeId: secondDepartmentOrgNodeId,
      status: "ACTIVE",
      createdById: secondDepartmentManager.id,
      metrics: {
        create: [
          {
            metricCode: "PLATFORM-AG-2026-001",
            name: "平台稳定性改进项交付",
            targetValue: 12,
            currentValue: 5,
            unit: "项",
            weight: 55,
            calculationType: AnnualMetricCalculationType.RATIO,
            sortOrder: 10,
          },
          {
            metricCode: "PLATFORM-AG-2026-002",
            name: "跨部门数据服务支撑",
            targetValue: 8,
            currentValue: 3,
            unit: "项",
            weight: 45,
            calculationType: AnnualMetricCalculationType.RATIO,
            sortOrder: 20,
          },
        ],
      },
    },
  });

  const defaultTemplate = await prisma.kpiTemplate.create({
    data: {
      templateKey: `kpi-template-${departmentOrgNodeId}-default`,
      departmentOrgNodeId,
      name: "季度 KPI 默认模板",
      description: "MVP 阶段默认模板，后续根据部门制度调整",
      status: "APPROVED",
      version: 1,
      isLatest: true,
      approvedAt: new Date("2026-01-05"),
      createdById: admin.id,
    },
  });

  await prisma.kpiTemplateItem.createMany({
    data: [
      {
        templateId: defaultTemplate.id,
        name: "季度重点工作达成",
        description: "围绕本季度核心工作目标评估完成情况",
        weight: 50,
        scoringStandard: "按季度重点工作的完成质量、进度与结果评分",
        sortOrder: 10,
      },
      {
        templateId: defaultTemplate.id,
        name: "协作与交付质量",
        description: "跨团队协作、响应及时性与交付稳定性",
        weight: 30,
        scoringStandard: "按协作效率、反馈质量与交付结果评分",
        sortOrder: 20,
      },
      {
        templateId: defaultTemplate.id,
        name: "复盘与改进",
        description: "复盘总结、问题闭环与持续优化动作",
        weight: 20,
        scoringStandard: "按复盘深度、改进动作与落地效果评分",
        sortOrder: 30,
      },
    ],
  });

  await prisma.kpiTemplateAssignment.create({
    data: {
      templateId: defaultTemplate.id,
      targetType: "ORG_NODE",
      targetOrgNodeId: departmentOrgNodeId,
      isActive: true,
    },
  });

  const secondDepartmentTemplate = await prisma.kpiTemplate.create({
    data: {
      templateKey: `kpi-template-${secondDepartmentOrgNodeId}-default`,
      departmentOrgNodeId: secondDepartmentOrgNodeId,
      name: "平台部季度 KPI 默认模板",
      description: "平台部默认季度 KPI 模板",
      status: "APPROVED",
      version: 1,
      isLatest: true,
      approvedAt: new Date("2026-01-05"),
      createdById: admin.id,
    },
  });

  await prisma.kpiTemplateItem.createMany({
    data: [
      {
        templateId: secondDepartmentTemplate.id,
        name: "平台稳定性改进",
        description: "围绕平台稳定性与质量改进评估完成情况",
        score: 40,
        weight: 40,
        scoringStandard: "按平台稳定性目标完成质量评分",
        sortOrder: 10,
      },
      {
        templateId: secondDepartmentTemplate.id,
        name: "跨部门支撑协作",
        description: "跨团队支撑、响应时效与交付结果",
        score: 30,
        weight: 30,
        scoringStandard: "按跨部门协同质量与反馈效率评分",
        sortOrder: 20,
      },
      {
        templateId: secondDepartmentTemplate.id,
        name: "技术复盘与优化",
        description: "技术问题复盘、优化动作与落地效果",
        score: 30,
        weight: 30,
        scoringStandard: "按复盘深度与优化落地效果评分",
        sortOrder: 30,
      },
    ],
  });

  await prisma.kpiTemplateAssignment.create({
    data: {
      templateId: secondDepartmentTemplate.id,
      targetType: "ORG_NODE",
      targetOrgNodeId: secondDepartmentOrgNodeId,
      isActive: true,
    },
  });

  await ensureSeedPasswordTestAccountsIfMissing();
  await ensureProductProcurementPasswordAccounts();
  await syncLegacyOrgReferences(rootOrgNodeId);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
