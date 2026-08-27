import { AnnualMetricCalculationType, type PrismaClient } from "@prisma/client";

const TEAM_NAME_CANDIDATES: Record<string, string[]> = {
  采购组: ["采购组", "采购业务组"],
  采购业务组: ["采购业务组"],
  B端组: ["B端组", "B端业务组"],
  B端业务组: ["B端业务组"],
  C端组: ["C端组", "C端业务组"],
  C端业务组: ["C端业务组"],
  设计组: ["设计组"],
};

function resolveTeamOrgNodeId(teamName: string, teamsByName: Map<string, string>) {
  for (const candidate of TEAM_NAME_CANDIDATES[teamName] ?? [teamName]) {
    const orgNodeId = teamsByName.get(candidate);
    if (orgNodeId) return orgNodeId;
  }
  return null;
}

export async function ensureAnnualGoalDemoData(
  prisma: PrismaClient,
  options?: { force?: boolean },
) {
  const existingCount = await prisma.annualGoalPlan.count({ where: { deletedAt: null } });
  if (existingCount > 0 && !options?.force) {
    console.info("[seed] 年度指标数据已存在，跳过 demo 写入");
    return false;
  }

  if (options?.force) {
    await prisma.annualGoalProgress.deleteMany();
    await prisma.annualGoalQuarterTarget.deleteMany();
    await prisma.annualGoalMetricAssignment.deleteMany();
    await prisma.annualGoalMetricSource.deleteMany();
    await prisma.annualGoalMetric.deleteMany();
    await prisma.annualGoalPlan.deleteMany();
  }

  const productDepartment = await prisma.orgNode.findFirst({
    where: { name: "产品部", nodeType: "DEPARTMENT" },
    select: { id: true },
  });
  if (!productDepartment) {
    throw new Error("未找到「产品部」组织节点，无法写入年度指标 demo 数据");
  }

  const platformDepartment = await prisma.orgNode.findFirst({
    where: { name: "平台部", nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  const teamNodes = await prisma.orgNode.findMany({
    where: { nodeType: "TEAM" },
    select: { id: true, name: true },
  });
  const teamsByName = new Map(teamNodes.map((team) => [team.name, team.id]));

  const manager = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { loginName: "product-manager" },
        { roleType: "DEPARTMENT_MANAGER", orgNodeId: productDepartment.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!manager) {
    throw new Error("未找到产品部主管账号，无法写入年度指标 demo 数据");
  }

  const admin = await prisma.user.findFirst({
    where: { roleType: "ADMIN", deletedAt: null, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const createdById = admin?.id ?? manager.id;

  const productAnnualPlan = await prisma.annualGoalPlan.create({
    data: {
      year: 2026,
      name: "产品部 2026 年度业绩指标",
      description: "产品部承接公司下达年度业绩指标，并拆解最细指标元数据分配到小组",
      departmentOrgNodeId: productDepartment.id,
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
    { teamName: "采购组", metrics: [["AGM-2026-001", 80], ["AGM-2026-005", 20]] },
    { teamName: "采购业务组", metrics: [] },
    { teamName: "B端组", metrics: [["AGM-2026-001", 80], ["AGM-2026-003", 20]] },
    { teamName: "B端业务组", metrics: [] },
    { teamName: "C端组", metrics: [["AGM-2026-001", 20], ["AGM-2026-004", 50], ["AGM-2026-002", 30]] },
    { teamName: "C端业务组", metrics: [] },
    { teamName: "设计组", metrics: [["AGM-2026-001", 80], ["AGM-2026-006", 20]] },
  ] as const;

  for (const plan of teamAnnualPlans) {
    const teamOrgNodeId = resolveTeamOrgNodeId(plan.teamName, teamsByName);
    if (!teamOrgNodeId || plan.metrics.length === 0) continue;

    await prisma.annualGoalMetricAssignment.createMany({
      data: plan.metrics.map(([metricCode, weight], index) => ({
        teamOrgNodeId,
        sourceMetricId: sourceByCode[metricCode].id,
        weight,
        sortOrder: (index + 1) * 10,
        createdById: manager.id,
      })),
    });
  }

  if (platformDepartment) {
    await prisma.annualGoalPlan.create({
      data: {
        year: 2026,
        name: "平台部 2026 年度业绩指标",
        description: "用于验证多部门并行推进时的平台部年度目标和数据隔离。",
        departmentOrgNodeId: platformDepartment.id,
        status: "ACTIVE",
        createdById: createdById,
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
  }

  console.info("[seed] 已写入年度指标 demo 数据（产品部 2026）");
  return true;
}
