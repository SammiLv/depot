import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { AnnualGoalOwnerType, AnnualMetricCalculationType, ApprovalStatus, PrismaClient, RoleType } from "@prisma/client";
import { annualGoalPermissionDefinitions } from "../../src/server/organization/annual-goal-permissions";

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

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
    select: { id: true, ownerOrgNodeId: true },
  });
  for (const plan of annualGoalPlans) {
    if (plan.ownerOrgNodeId) continue;
    throw new Error(`年度方案缺少 ownerOrgNodeId: ${plan.id}`);
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
  await prisma.notification.deleteMany();
  await prisma.annualGoalProgress.deleteMany();
  await prisma.annualGoalRevisionLog.deleteMany();
  await prisma.annualGoalQuarterTarget.deleteMany();
  await prisma.annualGoalMetricSource.deleteMany();
  await prisma.annualGoalMetric.deleteMany();
  await prisma.annualGoalPlan.deleteMany();
  await prisma.kpiTemplateAssignment.deleteMany();
  await prisma.kpiTemplateItem.deleteMany();
  await prisma.kpiTemplate.deleteMany({ where: { templateKey: { startsWith: "kpi-template-" } } });
  await prisma.user.deleteMany({ where: { name: { in: sampleUserNames } } });

  const admin = await prisma.user.create({
    data: {
      name: "系统管理员",
      loginName: "admin",
      passwordHash: "d6ad2d7161306be4e93af1276e8dafb7f945d9a25df0b193ad1f9817031e1f7025a1c8b5afb9692d8772387a8ad2fd39553f31bf5349bce78630358f2dbc58a3",
      passwordLoginEnabled: true,
      roleType: RoleType.ADMIN,
      orgNodeId: rootOrgNodeId,
      title: "管理员",
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: "产品部主管",
      loginName: "product-manager",
      passwordHash: "d6ad2d7161306be4e93af1276e8dafb7f945d9a25df0b193ad1f9817031e1f7025a1c8b5afb9692d8772387a8ad2fd39553f31bf5349bce78630358f2dbc58a3",
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
    ["talent", "人才发展", "/talent", 50, [RoleType.ADMIN, RoleType.DEPARTMENT_MANAGER]],
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

  const productAnnualPlan = await prisma.annualGoalPlan.create({
    data: {
      year: 2026,
      name: "产品部 2026 年度业绩指标",
      description: "产品部承接公司下达年度业绩指标，并拆解最细指标元数据分配到小组",
      ownerType: AnnualGoalOwnerType.DEPARTMENT,
      ownerOrgNodeId: departmentOrgNodeId,
      version: 1,
      isActive: true,
      approvalStatus: ApprovalStatus.APPROVED,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: new Date("2026-12-31"),
      approvedAt: new Date("2026-01-05"),
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

    await prisma.annualGoalPlan.create({
      data: {
        year: 2026,
        name: `${plan.teamName} 2026 年度业绩指标`,
        ownerType: AnnualGoalOwnerType.TEAM,
        ownerOrgNodeId: team.orgNodeId,
        parentPlanId: productAnnualPlan.id,
        version: 1,
        isActive: true,
        approvalStatus: ApprovalStatus.APPROVED,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: new Date("2026-12-31"),
        approvedAt: new Date("2026-01-08"),
        createdById: manager.id,
        metrics: {
          create: plan.metrics.map(([metricCode, weight], index) => {
            const source = sourceByCode[metricCode];
            return {
              sourceMetricId: source.id,
              metricCode: source.metricCode,
              name: source.name,
              targetValue: source.targetValue,
              currentValue: source.currentValue,
              unit: source.unit,
              weight,
              calculationType: source.calculationType,
              riskStatus: source.riskStatus,
              sortOrder: (index + 1) * 10,
            };
          }),
        },
      },
    });
  }

  await prisma.annualGoalPlan.create({
    data: {
      year: 2026,
      name: "平台部 2026 年度业绩指标",
      description: "用于验证多部门并行推进时的平台部年度目标和数据隔离。",
      ownerType: AnnualGoalOwnerType.DEPARTMENT,
      ownerOrgNodeId: secondDepartmentOrgNodeId,
      version: 1,
      isActive: true,
      approvalStatus: ApprovalStatus.APPROVED,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: new Date("2026-12-31"),
      approvedAt: new Date("2026-01-06"),
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
