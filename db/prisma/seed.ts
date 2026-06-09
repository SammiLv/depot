import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { AnnualGoalOwnerType, AnnualMetricCalculationType, ApprovalStatus, PrismaClient, RoleType } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const department = await prisma.department.upsert({
    where: { dingtalkDeptId: "product-dept" },
    update: {},
    create: {
      dingtalkDeptId: "product-dept",
      name: "产品部",
      description: "部门内部管理网站 MVP 试点部门",
    },
  });

  const teamNames = ["采购组", "B端组", "C端组", "设计组"];
  const sampleUserNames = [
    "系统管理员",
    "产品部主管",
    ...teamNames.flatMap((teamName) => [`${teamName}组长`, `${teamName}成员A`]),
  ];

  await prisma.department.update({
    where: { id: department.id },
    data: { managerId: null },
  });

  await prisma.todoItem.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.annualGoalProgress.deleteMany();
  await prisma.annualGoalRevisionLog.deleteMany();
  await prisma.annualGoalQuarterTarget.deleteMany();
  await prisma.annualGoalMetric.deleteMany();
  await prisma.annualGoalMetricSource.deleteMany();
  await prisma.annualGoalPlan.deleteMany();
  await prisma.kpiTemplate.deleteMany({ where: { name: "季度 KPI 默认模板" } });
  await prisma.team.deleteMany({ where: { departmentId: department.id, name: { in: teamNames } } });
  await prisma.user.deleteMany({ where: { departmentId: department.id, name: { in: sampleUserNames } } });

  const admin = await prisma.user.create({
    data: {
      name: "系统管理员",
      roleType: RoleType.ADMIN,
      departmentId: department.id,
      title: "管理员",
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: "产品部主管",
      roleType: RoleType.DEPARTMENT_MANAGER,
      departmentId: department.id,
      title: "部门主管",
    },
  });

  await prisma.department.update({
    where: { id: department.id },
    data: { managerId: manager.id },
  });

  const teams: Record<string, { id: string }> = {};
  let sampleLeaderId = "";
  let sampleMemberId = "";

  for (const teamName of teamNames) {
    const leader = await prisma.user.create({
      data: {
        name: `${teamName}组长`,
        roleType: RoleType.TEAM_LEADER,
        departmentId: department.id,
        title: "组长",
      },
    });

    const team = await prisma.team.create({
      data: {
        departmentId: department.id,
        name: teamName,
        leaderId: leader.id,
      },
    });

    teams[teamName] = team;

    await prisma.user.update({
      where: { id: leader.id },
      data: { teamId: team.id },
    });

    const member = await prisma.user.create({
      data: {
        name: `${teamName}成员A`,
        roleType: RoleType.MEMBER,
        departmentId: department.id,
        teamId: team.id,
        title: "产品经理",
      },
    });

    if (teamName === "C端组") {
      sampleLeaderId = leader.id;
      sampleMemberId = member.id;
    }
  }

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
          roleType_menuPermissionId: {
            roleType,
            menuPermissionId: menu.id,
          },
        },
        update: {},
        create: {
          roleType,
          menuPermissionId: menu.id,
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
      departmentId: department.id,
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
      teamName: "B端组",
      metrics: [
        ["AGM-2026-001", 80],
        ["AGM-2026-003", 20],
      ],
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
        departmentId: department.id,
        teamId: team.id,
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

  await prisma.kpiTemplate.create({
    data: {
      name: "季度 KPI 默认模板",
      description: "MVP 阶段默认模板，后续根据部门制度调整",
      createdById: admin.id,
    },
  });
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
