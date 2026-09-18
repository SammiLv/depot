import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";
import { getCurrentYearQuarter, buildNearestDepartmentByOrgNodeId } from "@/server/notifications/kpi-initialization-scan";
import { isWithinQuarterEndWindow } from "@/server/notifications/schedule-utils";
import { evaluateKpiDistribution } from "@/server/kpi/kpi-distribution";

// KPI 绩效分布预警扫描：距季度末 ≤ daysBefore 天时，检查各部门已发布分布规则，
// 分差或低分占比任一不达标（红色预警）即通知部门主管。
// 季度 KPI 初始化后才统计（部门无本季度单据则跳过）。

type ScanEmitOptions = { scenarioIds: string[]; testRunId?: number | string; scheduleSlot?: string };

function formatAlertNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function evaluateDepartmentDistributions(year: number, quarter: number) {
  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true, name: true },
  });
  if (!departments.length) return [];

  const rules = await prisma.kpiRatingRuleVersion.findMany({
    where: { departmentOrgNodeId: { in: departments.map((d) => d.id) }, status: "ACTIVE", deletedAt: null, distributionEnabled: true },
    orderBy: { publishedAt: "desc" },
  });
  if (!rules.length) return [];
  const ruleByDepartment = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    if (!ruleByDepartment.has(rule.departmentOrgNodeId)) ruleByDepartment.set(rule.departmentOrgNodeId, rule);
  }

  const [users, kpis] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null, orgNodeId: { not: null } },
      select: { id: true, name: true, orgNodeId: true, roleType: true },
    }),
    prisma.personalKpi.findMany({
      where: { year, quarter, deletedAt: null },
      select: { id: true, userId: true, orgNodeId: true, status: true, finalScore: true },
    }),
  ]);

  // 组织闭包：把成员/KPI 的归属节点解析到最近部门
  const departmentIds = new Set(departments.map((d) => d.id));
  const orgNodeIds = [...new Set([
    ...users.map((user) => user.orgNodeId),
    ...kpis.map((kpi) => kpi.orgNodeId),
  ].filter((id): id is string => Boolean(id)))];
  const closureRows = orgNodeIds.length
    ? await prisma.orgClosure.findMany({
        where: { descendantId: { in: orgNodeIds } },
        select: { descendantId: true, ancestorId: true, depth: true },
      })
    : [];
  const departmentByOrgNodeId = buildNearestDepartmentByOrgNodeId(departmentIds, closureRows);

  return departments.flatMap((department) => {
    const rule = ruleByDepartment.get(department.id);
    if (!rule) return [];
    const members = users.filter((user) => departmentByOrgNodeId.get(user.orgNodeId!) === department.id);
    const countedMembers = rule.distributionExcludeManager
      ? members.filter((member) => member.roleType !== "DEPARTMENT_MANAGER")
      : members;
    const managerUserIds = new Set(
      members.filter((member) => rule.distributionExcludeManager && member.roleType === "DEPARTMENT_MANAGER").map((member) => member.id),
    );
    // 分数统计：KPI 归属部门的所有单据（含已删除成员的历史单据），仅排除现任主管
    const departmentKpis = kpis.filter((kpi) => {
      const kpiDepartment = (kpi.orgNodeId ? departmentByOrgNodeId.get(kpi.orgNodeId) : undefined)
        ?? departmentByOrgNodeId.get(users.find((user) => user.id === kpi.userId)?.orgNodeId ?? "");
      if (kpiDepartment !== department.id) return false;
      return !managerUserIds.has(kpi.userId);
    });
    const completedScores = departmentKpis
      .filter((kpi) => kpi.status === "COMPLETED" && kpi.finalScore !== null)
      .map((kpi) => kpi.finalScore!);
    const evaluation = evaluateKpiDistribution(
      {
        enabled: rule.distributionEnabled,
        minHeadcount: rule.distributionMinHeadcount,
        minGap: rule.distributionMinGap,
        belowScore: rule.distributionBelowScore,
        belowMinPercent: rule.distributionBelowMinPercent,
      },
      { initialized: departmentKpis.length > 0, headcount: countedMembers.length, completedScores },
    );
    const subjectUser = countedMembers[0] ?? members[0] ?? null;
    return [{ department, rule, evaluation, subjectUser }];
  });
}

/** 测试通知用：取一个当前季度不达标的部门样例 */
export async function findKpiDistributionAlertSample() {
  const { year, quarter } = getCurrentYearQuarter();
  const evaluations = await evaluateDepartmentDistributions(year, quarter);
  const failing = evaluations.find((item) => item.evaluation.status === "fail");
  if (!failing || !failing.subjectUser) return null;
  return { year, quarter, ...failing };
}

export async function runKpiDistributionAlertScan(scenarioId: string, daysBefore: number, options?: ScanEmitOptions) {
  const now = new Date();
  // 仅「距季度末 daysBefore 天内」扫描并通知；窗口外直接跳过（daysBefore=1 表示仅最后一天）
  if (!isWithinQuarterEndWindow(now, daysBefore)) return;

  const { year, quarter } = getCurrentYearQuarter(now);
  const evaluations = await evaluateDepartmentDistributions(year, quarter);

  for (const item of evaluations) {
    if (item.evaluation.status !== "fail" || !item.subjectUser) continue;
    const { rule, evaluation } = item;
    const failReasons = [
      evaluation.gapPass === false
        ? `最高最低分差距 ${formatAlertNumber(evaluation.gap!)} 分（要求 ≥ ${rule.distributionMinGap} 分）`
        : null,
      evaluation.belowPass
        ? null
        : `低于 ${rule.distributionBelowScore} 分员工占比 ${formatAlertNumber(evaluation.belowPercent)}%（要求 ≥ ${rule.distributionBelowMinPercent}%）`,
    ].filter(Boolean).join("；");
    await emitNotificationEvent("kpi.distribution.alert", {
      userId: item.subjectUser.id,
      subjectUserId: item.subjectUser.id,
      userName: item.subjectUser.name,
      year,
      quarter,
      departmentOrgNodeId: item.department.id,
      departmentName: item.department.name,
      gap: evaluation.gap,
      belowPercent: evaluation.belowPercent,
      belowCount: evaluation.belowCount,
      headcount: evaluation.headcount,
      failReasons,
      targetType: "OrgNode",
      targetId: item.department.id,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}
