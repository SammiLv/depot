import type { RoleType, AnnualGoalOwnerType, OrgNodeType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope, getKpiWhereByScope } from "@/server/permissions/data-scope";
import { getDataScopeLabel, getRoleLabel } from "@/server/permissions/role-labels";
import {
  buildOrgScopeContext,
  getAnnualGoalCapabilities,
  getAnnualGoalPermissionMap,
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

export async function getDashboardData(currentUser: CurrentUser) {
  const annualGoalPermissionMap = await getAnnualGoalPermissionMap();
  const annualGoalCapabilities = getAnnualGoalCapabilities(currentUser.roleType, annualGoalPermissionMap);

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
    prisma.personalKpi.findMany({ where: await getKpiWhereByScope(currentUser) }),
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

  const kpiStatusCounts = kpis.reduce((acc, k) => {
    const s = k.status;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingApprovals =
    (kpiStatusCounts.PENDING_LEADER ?? 0) + (kpiStatusCounts.PENDING_MANAGER ?? 0);

  const riskCount = visibleAnnualPlans.reduce(
    (s, p) => s + p.metrics.filter((m) => m.riskStatus === "RISK").length,
    0
  );

  const overdueTodos = await prisma.todoItem.count({
    where: { userId: currentUser.id, isDone: false, dueDate: { lt: new Date() } },
  });

  const summaryCards = [
    { title: "年度指标完成度", value: "—", tone: "primary" as const, description: "加载中…" },
    { title: "待我审批", value: pendingApprovals, tone: "warning" as const, description: `${kpiStatusCounts.PENDING_LEADER ?? 0} 项 KPI 待处理` },
    { title: "未完成待办", value: todoCount, tone: "info" as const, description: overdueTodos > 0 ? `${overdueTodos} 项已逾期` : "暂无逾期" },
    { title: "风险预警", value: riskCount, tone: "brand" as const, description: riskCount > 0 ? `${riskCount} 项指标有风险` : "全部正常" },
  ];

  const annualGoals = visibleAnnualPlans
    .slice(0, 4)
    .map((plan) => {
      const totalWeight = plan.metrics.reduce((s, m) => s + m.weight, 0);
      const weightedProgress = totalWeight > 0
        ? Math.round(plan.metrics.reduce((s, m) => {
            const p = m.targetValue > 0 ? (m.currentValue / m.targetValue) * m.weight : 0;
            return s + p;
          }, 0) / totalWeight * 100)
        : 0;
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
    ? Math.round(allMetrics.reduce((s, m) => {
        const p = m.targetValue > 0 ? (m.currentValue / m.targetValue) * m.weight : 0;
        return s + p;
      }, 0) / totalWeight * 100)
    : 0;

  summaryCards[0] = {
    title: "年度指标完成度",
    value: allMetrics.length > 0 ? `${overallAnnualProgress}%` : "暂无数据",
    tone: "primary" as const,
    description: `${activePlans.length} 个计划 · ${allMetrics.length} 项指标`,
  };

  const kpiStages = [
    { label: "待制定", key: "DRAFT", tone: "default" as const },
    { label: "待审批", key: "PENDING", tone: "warning" as const },
    { label: "自评中", key: "PENDING_SELF_REVIEW", tone: "info" as const },
    { label: "已评分", key: "SCORE", tone: "primary" as const },
    { label: "已完成", key: "COMPLETED", tone: "success" as const },
  ];

  const kpiStageData = kpiStages.map((s) => {
    let count = 0;
    if (s.key === "PENDING") {
      count = (kpiStatusCounts.PENDING_LEADER ?? 0) + (kpiStatusCounts.PENDING_MANAGER ?? 0);
    } else if (s.key === "SCORE") {
      count = (kpiStatusCounts.PENDING_LEADER_SCORE ?? 0) + (kpiStatusCounts.PENDING_MANAGER_SCORE ?? 0);
    } else {
      count = kpiStatusCounts[s.key] ?? 0;
    }
    return { ...s, count };
  });

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
