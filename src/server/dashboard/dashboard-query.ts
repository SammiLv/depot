import type { RoleType, AnnualGoalOwnerType, OrgNodeType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope } from "@/server/permissions/data-scope";
import { getDataScopeLabel, getRoleLabel } from "@/server/permissions/role-labels";
import { buildKpiWhereByPermission, resolvePermissionScope } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import {
  buildOrgScopeContext,
  getAnnualGoalCapabilitiesForUser,
  getAnnualGoalPlanPermissions,
  getAnnualGoalPlanWhere,
} from "@/server/organization/annual-goal-permissions";

type CurrentUser = {
  id: string;
  name: string;
  roleType: RoleType;
  orgNodeId?: string | null;
  title: string | null;
};

type OrgNodeSummary = {
  id: string;
  name: string;
  nodeType: OrgNodeType;
  parentId: string | null;
};

function getPlanOwnerName(
  plan: { ownerType: AnnualGoalOwnerType; ownerOrgNodeId: string | null },
  orgNodeById: Map<string, OrgNodeSummary>
) {
  if (!plan.ownerOrgNodeId) {
    return plan.ownerType === "DEPARTMENT" ? "部门" : "小组";
  }

  return orgNodeById.get(plan.ownerOrgNodeId)?.name ?? (plan.ownerType === "DEPARTMENT" ? "部门" : "小组");
}

function roundValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumValues<T>(items: T[], selector: (item: T) => number) {
  return roundValue(items.reduce((sum, item) => sum + selector(item), 0));
}

export async function getDashboardData(currentUser: CurrentUser) {
  const annualGoalCapabilities = await getAnnualGoalCapabilitiesForUser(currentUser);
  const [
    viewKpiWhere,
    scoreSelfScope,
    scoreLeaderScope,
    scoreManagerScope,
    scoreFinalScope,
  ] = await Promise.all([
    buildKpiWhereByPermission(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.viewKpi),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreSelf),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreLeader),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreManager),
    resolvePermissionScope(currentUser, orgPermissionModuleKeys.kpi, kpiAbilityKeys.scoreFinal),
  ]);

  const [currentOrgNode, todoCount, latestTodos, latestNotifications, activePlans, quarterlyWorks, kpis] = await Promise.all([
    currentUser.orgNodeId
      ? prisma.orgNode.findUnique({
          where: { id: currentUser.orgNodeId },
          select: { id: true, name: true, nodeType: true, parentId: true },
        })
      : null,
    prisma.todoItem.count({ where: { userId: currentUser.id, isDone: false } }),
    prisma.todoItem.findMany({
      where: { userId: currentUser.id, isDone: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.notification.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.annualGoalPlan.findMany({
      where: await getAnnualGoalPlanWhere(currentUser, annualGoalCapabilities),
      include: { metrics: { where: { deletedAt: null } } },
      orderBy: [{ ownerType: "asc" }, { year: "desc" }, { createdAt: "desc" }],
    }),
    prisma.quarterlyWork.findMany({ where: await getOwnerWhereByScope(currentUser) }),
    prisma.personalKpi.findMany({
      where: viewKpiWhere,
      select: { id: true, status: true, userId: true },
    }),
  ]);

  const relatedOrgNodeIds = Array.from(new Set([
    ...(currentOrgNode ? [currentOrgNode.id] : []),
    ...(currentOrgNode?.parentId ? [currentOrgNode.parentId] : []),
    ...activePlans.map((plan) => plan.ownerOrgNodeId).filter((id): id is string => Boolean(id)),
  ]));
  const relatedOrgNodes = relatedOrgNodeIds.length
    ? await prisma.orgNode.findMany({
        where: { id: { in: relatedOrgNodeIds } },
        select: { id: true, name: true, nodeType: true, parentId: true },
      })
    : [];
  const orgNodeById = new Map(relatedOrgNodes.map((node) => [node.id, node]));
  const currentParentNode = currentOrgNode?.parentId ? orgNodeById.get(currentOrgNode.parentId) ?? null : null;

  const scopeContext = await buildOrgScopeContext(currentUser, annualGoalCapabilities);
  const visibleAnnualPlans = activePlans.filter((plan) =>
    getAnnualGoalPlanPermissions(currentUser, annualGoalCapabilities, plan, scopeContext).canViewPlan
  );

  function getPlanScopeDepartmentOrgNodeId(plan: { ownerOrgNodeId?: string | null }) {
    const ownerOrgNodeId = plan.ownerOrgNodeId;
    if (!ownerOrgNodeId) return null;
    const ownerNode = orgNodeById.get(ownerOrgNodeId);
    if (!ownerNode) return null;
    return ownerNode.nodeType === "TEAM" ? ownerNode.parentId : ownerNode.id;
  }

  const visiblePlanMetricIds = Array.from(new Set(visibleAnnualPlans.flatMap((plan) => plan.metrics.map((metric) => metric.id))));
  const visiblePlanMetricSourceIds = Array.from(new Set(visibleAnnualPlans.flatMap((plan) =>
    plan.metrics
      .map((metric) => metric.sourceMetricId)
      .filter((sourceMetricId): sourceMetricId is string => Boolean(sourceMetricId))
  )));

  const [metricSources, quarterTargets] = await Promise.all([
    visiblePlanMetricIds.length || visiblePlanMetricSourceIds.length
      ? prisma.annualGoalMetricSource.findMany({
          where: {
            deletedAt: null,
            OR: [
              ...(visiblePlanMetricIds.length ? [{ parentMetricId: { in: visiblePlanMetricIds } }] : []),
              ...(visiblePlanMetricSourceIds.length ? [{ id: { in: visiblePlanMetricSourceIds } }] : []),
            ],
          },
        })
      : [],
    visiblePlanMetricIds.length || visiblePlanMetricSourceIds.length
      ? prisma.annualGoalQuarterTarget.findMany({
          where: {
            deletedAt: null,
            OR: [
              ...(visiblePlanMetricIds.length ? [{ metricId: { in: visiblePlanMetricIds } }] : []),
              ...(visiblePlanMetricSourceIds.length ? [{ sourceMetricId: { in: visiblePlanMetricSourceIds } }] : []),
            ],
          },
        })
      : [],
  ]);

  const sourceById = new Map(metricSources.map((source) => [source.id, source]));
  const departmentMetricByPlan = new Map(
    visibleAnnualPlans
      .filter((plan) => plan.ownerType === "DEPARTMENT")
      .flatMap((plan) =>
        plan.metrics.map((metric) => [`${getPlanScopeDepartmentOrgNodeId(plan) ?? ""}:${plan.year}:${metric.metricCode}`, metric] as const)
      )
  );

  const targetsByMetric = new Map<string, typeof quarterTargets>();
  const targetsBySourceMetric = new Map<string, typeof quarterTargets>();
  for (const quarterTarget of quarterTargets) {
    if (quarterTarget.sourceMetricId) {
      const key = `${quarterTarget.metricId}:${quarterTarget.sourceMetricId}`;
      const list = targetsBySourceMetric.get(key) ?? [];
      list.push(quarterTarget);
      targetsBySourceMetric.set(key, list);
    } else {
      const list = targetsByMetric.get(quarterTarget.metricId) ?? [];
      list.push(quarterTarget);
      targetsByMetric.set(quarterTarget.metricId, list);
    }
  }

  const sourcesByParentMetric = new Map<string, typeof metricSources>();
  for (const source of metricSources) {
    const list = sourcesByParentMetric.get(source.parentMetricId) ?? [];
    list.push(source);
    sourcesByParentMetric.set(source.parentMetricId, list);
  }

  function getSourceCurrentValue(parentMetricId: string, source: (typeof metricSources)[number]) {
    const sourceQuarterTargets = targetsBySourceMetric.get(`${parentMetricId}:${source.id}`) ?? [];
    return sourceQuarterTargets.length > 0
      ? sumValues(sourceQuarterTargets, (target) => target.currentValue)
      : roundValue(source.currentValue);
  }

  function getMetricQuarterTargets(plan: (typeof visibleAnnualPlans)[number], metric: (typeof visibleAnnualPlans)[number]["metrics"][number]) {
    const sourceMetricForInheritance = plan.ownerType === "TEAM" && metric.sourceMetricId ? sourceById.get(metric.sourceMetricId) : null;
    const parentMetricForInheritance = plan.ownerType === "TEAM" && !metric.sourceMetricId
      ? departmentMetricByPlan.get(`${getPlanScopeDepartmentOrgNodeId(plan) ?? ""}:${plan.year}:${metric.metricCode}`)
      : null;

    return sourceMetricForInheritance
      ? targetsBySourceMetric.get(`${sourceMetricForInheritance.parentMetricId}:${sourceMetricForInheritance.id}`) ?? []
      : parentMetricForInheritance
        ? targetsByMetric.get(parentMetricForInheritance.id) ?? []
        : targetsByMetric.get(metric.id) ?? [];
  }

  function getMetricCurrentValue(plan: (typeof visibleAnnualPlans)[number], metric: (typeof visibleAnnualPlans)[number]["metrics"][number]) {
    const sources = sourcesByParentMetric.get(metric.id) ?? [];
    const quarterTargetValues = getMetricQuarterTargets(plan, metric);
    if (quarterTargetValues.length > 0) {
      return sumValues(quarterTargetValues, (target) => target.currentValue);
    }
    if (plan.ownerType === "DEPARTMENT" && sources.length > 0) {
      return sumValues(sources, (source) => getSourceCurrentValue(metric.id, source));
    }
    return roundValue(metric.currentValue);
  }

  function getPlanWeightedProgress(plan: (typeof visibleAnnualPlans)[number]) {
    const totalWeight = plan.metrics.reduce((sum, metric) => sum + metric.weight, 0);
    if (totalWeight <= 0) return 0;
    return Math.round(plan.metrics.reduce((sum, metric) => {
      const currentValue = getMetricCurrentValue(plan, metric);
      const progress = metric.targetValue > 0 ? (currentValue / metric.targetValue) * metric.weight : 0;
      return sum + progress;
    }, 0) / totalWeight * 100);
  }

  const activeApprovalSteps = kpis.length
    ? await prisma.personalKpiApprovalStep.findMany({
        where: {
          personalKpiId: { in: kpis.map((kpi) => kpi.id) },
          status: "PENDING",
        },
        orderBy: [{ personalKpiId: "asc" }, { stepOrder: "asc" }],
        select: {
          personalKpiId: true,
          approverId: true,
          stageKey: true,
        },
      })
    : [];

  const activeApprovalStepByKpiId = new Map<string, typeof activeApprovalSteps[number]>();
  const hasApprovalChainByKpiId = new Map<string, boolean>();
  for (const step of activeApprovalSteps) {
    hasApprovalChainByKpiId.set(step.personalKpiId, true);
    if (!activeApprovalStepByKpiId.has(step.personalKpiId)) {
      activeApprovalStepByKpiId.set(step.personalKpiId, step);
    }
  }

  const canScoreSelf = Boolean(scoreSelfScope);
  const canScoreLeader = Boolean(scoreLeaderScope);
  const canScoreManager = Boolean(scoreManagerScope);
  const canScoreFinal = Boolean(scoreFinalScope);

  const actionableKpis = kpis.filter((kpi) => {
    if (canScoreSelf && kpi.userId === currentUser.id && (kpi.status === "DRAFT" || kpi.status === "PENDING_SELF_REVIEW")) {
      return true;
    }

    const activeStep = activeApprovalStepByKpiId.get(kpi.id);
    const hasApprovalChain = hasApprovalChainByKpiId.get(kpi.id) ?? false;

    if (canScoreLeader && kpi.status === "PENDING_LEADER_SCORE") {
      return !hasApprovalChain || activeStep?.approverId === currentUser.id;
    }

    if (canScoreManager && kpi.status === "PENDING_MANAGER_SCORE") {
      return !hasApprovalChain || activeStep?.approverId === currentUser.id;
    }

    if (canScoreFinal && kpi.status === "PENDING_FINAL_REVIEW") {
      return !hasApprovalChain || activeStep?.approverId === currentUser.id;
    }

    return false;
  });

  const kpiStatusCounts = actionableKpis.reduce((acc, kpi) => {
    acc[kpi.status] = (acc[kpi.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingApprovals =
    (kpiStatusCounts.PENDING_LEADER_SCORE ?? 0) + (kpiStatusCounts.PENDING_MANAGER_SCORE ?? 0) + (kpiStatusCounts.PENDING_FINAL_REVIEW ?? 0);
  const selfReviewCount =
    (kpiStatusCounts.DRAFT ?? 0) + (kpiStatusCounts.PENDING_SELF_REVIEW ?? 0);

  const riskCount = visibleAnnualPlans.reduce(
    (s, p) => s + p.metrics.filter((m) => m.riskStatus === "RISK").length,
    0
  );

  const overdueTodos = await prisma.todoItem.count({
    where: { userId: currentUser.id, isDone: false, dueDate: { lt: new Date() } },
  });

  const summaryCards = [
    { title: "年度指标完成度", value: "—", tone: "primary" as const, description: "加载中…" },
    { title: "待我评分", value: pendingApprovals, tone: "warning" as const, description: pendingApprovals > 0 ? `${kpiStatusCounts.PENDING_LEADER_SCORE ?? 0} 项组长评分待处理 · ${kpiStatusCounts.PENDING_MANAGER_SCORE ?? 0} 项主管评分待处理 · ${kpiStatusCounts.PENDING_FINAL_REVIEW ?? 0} 项终审待处理` : "暂无评分待处理" },
    { title: "待自评", value: selfReviewCount, tone: "info" as const, description: `${kpiStatusCounts.DRAFT ?? 0} 项初始化 · ${kpiStatusCounts.PENDING_SELF_REVIEW ?? 0} 项自评中` },
    { title: "风险预警", value: riskCount, tone: "brand" as const, description: riskCount > 0 ? `${riskCount} 项指标有风险` : "全部正常" },
  ];

  const annualGoals = visibleAnnualPlans
    .slice(0, 4)
    .map((plan) => {
      const weightedProgress = getPlanWeightedProgress(plan);
      return {
        id: plan.id,
        name: plan.name,
        progress: weightedProgress,
        owner: getPlanOwnerName(plan, orgNodeById),
        tone: (weightedProgress >= 80 ? "success" : weightedProgress >= 60 ? "primary" : weightedProgress >= 30 ? "yellow" : "orange") as "success" | "primary" | "yellow" | "orange",
        metricCount: plan.metrics.length,
      };
    });

  const allMetrics = visibleAnnualPlans.flatMap((p) => p.metrics);
  const totalWeight = allMetrics.reduce((s, m) => s + m.weight, 0);
  const overallAnnualProgress = totalWeight > 0
    ? Math.round(visibleAnnualPlans.reduce((sum, plan) => {
        return sum + plan.metrics.reduce((planSum, metric) => {
          const currentValue = getMetricCurrentValue(plan, metric);
          const progress = metric.targetValue > 0 ? (currentValue / metric.targetValue) * metric.weight : 0;
          return planSum + progress;
        }, 0);
      }, 0) / totalWeight * 100)
    : 0;

  summaryCards[0] = {
    title: "年度指标完成度",
    value: allMetrics.length > 0 ? `${overallAnnualProgress}%` : "暂无数据",
    tone: "primary" as const,
    description: `${activePlans.length} 个计划 · ${allMetrics.length} 项指标`,
  };

  const kpiStages = [
    { label: "初始化", key: "DRAFT", tone: "default" as const },
    { label: "自评", key: "PENDING_SELF_REVIEW", tone: "info" as const },
    { label: "组长评", key: "PENDING_LEADER_SCORE", tone: "warning" as const },
    { label: "主管评", key: "PENDING_MANAGER_SCORE", tone: "primary" as const },
    { label: "已完成", key: "COMPLETED", tone: "success" as const },
  ];

  const kpiStageData = kpiStages.map((s) => ({
    ...s,
    count: kpiStatusCounts[s.key] ?? 0,
  }));

  const qwCompleted = quarterlyWorks.filter((w) => w.status === "COMPLETED").length;
  const qwInProgress = quarterlyWorks.filter((w) => w.status === "IN_PROGRESS").length;
  const qwDelayed = quarterlyWorks.filter((w) => w.status === "DELAYED_COMPLETED").length;
  const qwNotStarted = quarterlyWorks.filter((w) => w.status === "NOT_STARTED").length;
  const quarterlyProgress = quarterlyWorks.length > 0
    ? Math.round((qwCompleted / quarterlyWorks.length) * 100)
    : 0;

  const recentNotifications = await prisma.notification.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  const activityFeed = recentNotifications.map((n) => ({
    id: n.id,
    who: "系统",
    what: n.title,
    time: n.createdAt.toISOString(),
    type: n.type,
    isRead: n.isRead,
  }));

  return {
    currentUser: {
      id: currentUser.id,
      name: currentUser.name,
      roleLabel: getRoleLabel(currentUser.roleType),
      dataScopeLabel: getDataScopeLabel(currentUser.roleType),
      title: currentUser.title,
      departmentName: currentOrgNode?.nodeType === "TEAM"
        ? currentParentNode?.name ?? "未设置部门"
        : currentOrgNode?.name ?? "未设置部门",
      teamName: currentOrgNode?.nodeType === "TEAM"
        ? currentOrgNode.name
        : "未设置小组",
    },
    summaryCards,
    annualGoals,
    kpiStages: kpiStageData,
    quarterlyWork: {
      completed: qwCompleted,
      inProgress: qwInProgress,
      delayed: qwDelayed,
      notStarted: qwNotStarted,
      total: quarterlyWorks.length,
      progress: quarterlyProgress,
    },
    activityFeed,
    latestTodos: latestTodos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      description: todo.description,
      targetType: todo.targetType,
      dueDate: todo.dueDate,
    })),
    latestNotifications: latestNotifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      content: notification.content,
      type: notification.type,
      isRead: notification.isRead,
    })),
  };
}
