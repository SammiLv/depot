import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getDataScopeLabel, getRoleLabel, getAnnualPlanWhereByScope, getOwnerWhereByScope, getKpiWhereByScope } from "@/server/permissions/data-scope";

type CurrentUser = {
  id: string;
  name: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
  title: string | null;
};

export async function getDashboardData(currentUser: CurrentUser) {
  const [department, team, todoCount, latestTodos, latestNotifications, activePlans, quarterlyWorks, kpis] = await Promise.all([
    currentUser.departmentId ? prisma.department.findUnique({ where: { id: currentUser.departmentId } }) : null,
    currentUser.teamId ? prisma.team.findUnique({ where: { id: currentUser.teamId } }) : null,
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
      where: getAnnualPlanWhereByScope(currentUser),
      include: { metrics: { where: { deletedAt: null } } },
      take: 4,
    }),
    prisma.quarterlyWork.findMany({ where: getOwnerWhereByScope(currentUser) }),
    prisma.personalKpi.findMany({ where: getKpiWhereByScope(currentUser) }),
  ]);

  // === Summary cards ===
  const kpiStatusCounts = kpis.reduce((acc, k) => {
    const s = k.status;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingApprovals =
    (kpiStatusCounts.PENDING_LEADER ?? 0) + (kpiStatusCounts.PENDING_MANAGER ?? 0);

  const riskCount = activePlans.reduce(
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

  // === Annual goals progress ===
  const annualGoals = activePlans.map((plan) => {
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
      owner: plan.ownerType === "DEPARTMENT" ? "产品部" : "小组",
      tone: (weightedProgress >= 80 ? "success" : weightedProgress >= 60 ? "primary" : weightedProgress >= 30 ? "yellow" : "orange") as "success" | "primary" | "yellow" | "orange",
      metricCount: plan.metrics.length,
    };
  });

  // Overall annual goal progress
  const allMetrics = activePlans.flatMap((p) => p.metrics);
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

  // === KPI stage distribution ===
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

  // === Quarterly work stats ===
  const qwCompleted = quarterlyWorks.filter((w) => w.status === "COMPLETED").length;
  const qwInProgress = quarterlyWorks.filter((w) => w.status === "IN_PROGRESS").length;
  const qwDelayed = quarterlyWorks.filter((w) => w.status === "DELAYED_COMPLETED").length;
  const qwNotStarted = quarterlyWorks.filter((w) => w.status === "NOT_STARTED").length;
  const quarterlyProgress = quarterlyWorks.length > 0
    ? Math.round((qwCompleted / quarterlyWorks.length) * 100)
    : 0;

  // === Recent activity ===
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
      dataScopeLabel: getDataScopeLabel(currentUser),
      title: currentUser.title,
      departmentName: department?.name ?? "未设置部门",
      teamName: team?.name ?? "未设置小组",
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
