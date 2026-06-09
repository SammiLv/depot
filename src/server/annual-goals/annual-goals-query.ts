import { prisma } from "@/server/db/prisma";
import { getAnnualPlanWhereByScope, getTeamWhereByScope } from "@/server/permissions/data-scope";
import { getAnnualGoalCapabilities, getAnnualGoalPermissionMap } from "@/server/organization/annual-goal-permissions";
import type { AnnualGoalOwnerType, AnnualMetricCalculationType, ApprovalStatus, RiskStatus, RoleType } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
};

type MemberOption = {
  id: string;
  name: string;
  title: string | null;
  departmentId: string | null;
  teamId: string | null;
};

type ResponsibleUserSummary = {
  id: string;
  name: string;
  title: string | null;
};

type MetricSourceData = {
  id: string;
  parentMetricId: string;
  metricCode: string;
  name: string;
  description: string | null;
  targetValue: number;
  currentValue: number;
  unit: string;
  calculationType: AnnualMetricCalculationType;
  riskStatus: RiskStatus;
  responsibleUserId: string | null;
  responsibleUser: ResponsibleUserSummary | null;
  progress: number;
  tone: "warning" | "primary";
  createdAt: Date;
  adjustedAt: Date | null;
  progressUpdatedAt: Date | null;
  quarterTargets: { id: string; metricId: string; sourceMetricId: string | null; quarter: number; targetValue: number; currentValue: number; weeklyIncrement: number; createdAt: Date; adjustedAt: Date | null; progressUpdatedAt: Date | null }[];
};

type MetricData = {
  id: string;
  sourceMetricId: string | null;
  metricCode: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  responsibleUserId: string | null;
  responsibleUser: ResponsibleUserSummary | null;
  rawTargetValue: number;
  targetValue: number;
  currentValue: number;
  unit: string;
  weight: number;
  calculationType: AnnualMetricCalculationType;
  riskStatus: RiskStatus;
  sortOrder: number;
  progress: number;
  tone: "warning" | "primary";
  createdAt: Date;
  adjustedAt: Date | null;
  progressUpdatedAt: Date | null;
  quarterTargets: { id: string; metricId: string; sourceMetricId: string | null; quarter: number; targetValue: number; currentValue: number; weeklyIncrement: number; createdAt: Date; adjustedAt: Date | null; progressUpdatedAt: Date | null }[];
  sources: MetricSourceData[];
};

type PlanPermissionFlags = {
  canEditPlan: boolean;
  canArchivePlan: boolean;
  canEditMetrics: boolean;
  canManageSources: boolean;
  canManageQuarterTargets: boolean;
  canUpdateQuarterProgress: boolean;
  canUpdateWeeklyProgress: boolean;
};

type PlanData = {
  id: string;
  year: number;
  name: string;
  description: string | null;
  ownerType: AnnualGoalOwnerType;
  ownerName: string;
  departmentId: string | null;
  teamId: string | null;
  version: string;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  revisionReason: string | null;
  deletedAt: Date | null;
  weightedProgress: number;
  metrics: MetricData[];
  totalWeight: number;
  permissions: PlanPermissionFlags;
  createdAt: Date;
};

type AnnualGoalsResult = {
  plans: PlanData[];
  archivedPlans: PlanData[];
  availableSourceMetrics: MetricSourceData[];
  availableParentMetrics: MetricData[];
  departments: { id: string; name: string }[];
  teams: { id: string; name: string; departmentId: string }[];
  memberOptionsByDepartment: Record<string, MemberOption[]>;
  memberOptionsByTeam: Record<string, MemberOption[]>;
  canManage: boolean;
  permissions: {
    canCreatePlan: boolean;
    canRestorePlan: boolean;
    canViewDepartmentPlans: boolean;
    canEditDepartmentPlans: boolean;
    canEditTeamPlans: boolean;
    canUpdateProgress: boolean;
  };
  currentDepartmentId: string | null;
  summary: {
    planCount: number;
    metricCount: number;
    riskCount: number;
    revisionCount: number;
    overallWeightedProgress: number;
  };
};

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function roundValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumValues<T>(items: T[], getValue: (item: T) => number) {
  return roundValue(items.reduce((sum, item) => sum + getValue(item), 0));
}

function mapResponsibleUser(user: { id: string; name: string; title: string | null } | null | undefined) {
  if (!user) return null;
  return { id: user.id, name: user.name, title: user.title };
}

function mapMemberOption(user: { id: string; name: string; title: string | null; departmentId: string | null; teamId: string | null }) {
  return {
    id: user.id,
    name: user.name,
    title: user.title,
    departmentId: user.departmentId,
    teamId: user.teamId,
  };
}

const chinesePinyinInitialBoundaries = [
  ["A", "阿"],
  ["B", "八"],
  ["C", "嚓"],
  ["D", "搭"],
  ["E", "蛾"],
  ["F", "发"],
  ["G", "噶"],
  ["H", "哈"],
  ["J", "击"],
  ["K", "喀"],
  ["L", "垃"],
  ["M", "妈"],
  ["N", "拿"],
  ["O", "哦"],
  ["P", "啪"],
  ["Q", "期"],
  ["R", "然"],
  ["S", "撒"],
  ["T", "塌"],
  ["W", "挖"],
  ["X", "昔"],
  ["Y", "压"],
  ["Z", "匝"],
] as const;

const zhPinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin");

function getNameSortMeta(name: string) {
  const trimmed = name.trim();
  const firstChar = trimmed.charAt(0);

  if (/^[A-Za-z]$/.test(firstChar)) {
    return {
      initial: firstChar.toUpperCase(),
      isEnglish: true,
      normalizedName: trimmed.toUpperCase(),
    };
  }

  if (/^[\u4E00-\u9FFF]$/.test(firstChar)) {
    let initial = "#";

    for (let i = 0; i < chinesePinyinInitialBoundaries.length; i += 1) {
      const [letter, boundary] = chinesePinyinInitialBoundaries[i];
      const nextBoundary = chinesePinyinInitialBoundaries[i + 1]?.[1];
      const isAfterCurrent = zhPinyinCollator.compare(firstChar, boundary) >= 0;
      const isBeforeNext = !nextBoundary || zhPinyinCollator.compare(firstChar, nextBoundary) < 0;

      if (isAfterCurrent && isBeforeNext) {
        initial = letter;
        break;
      }
    }

    return {
      initial,
      isEnglish: false,
      normalizedName: trimmed,
    };
  }

  return {
    initial: firstChar.toUpperCase() || "#",
    isEnglish: false,
    normalizedName: trimmed,
  };
}

function compareTeamNames(a: string, b: string) {
  const aMeta = getNameSortMeta(a);
  const bMeta = getNameSortMeta(b);

  if (aMeta.initial !== bMeta.initial) {
    return aMeta.initial.localeCompare(bMeta.initial, "en");
  }

  if (aMeta.isEnglish !== bMeta.isEnglish) {
    return aMeta.isEnglish ? -1 : 1;
  }

  if (aMeta.isEnglish) {
    return aMeta.normalizedName.localeCompare(bMeta.normalizedName, "en");
  }

  return zhPinyinCollator.compare(aMeta.normalizedName, bMeta.normalizedName);
}

function comparePlans(a: { ownerType: AnnualGoalOwnerType; ownerName: string; year: number; createdAt: Date }, b: { ownerType: AnnualGoalOwnerType; ownerName: string; year: number; createdAt: Date }) {
  if (a.ownerType !== b.ownerType) {
    return a.ownerType === "DEPARTMENT" ? -1 : 1;
  }

  if (a.ownerType === "TEAM" && b.ownerType === "TEAM") {
    const teamNameCompare = compareTeamNames(a.ownerName, b.ownerName);
    if (teamNameCompare !== 0) return teamNameCompare;
  }

  if (a.year !== b.year) {
    return b.year - a.year;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function getPlanPermissions(
  currentUser: DataScopeInput,
  plan: { ownerType: AnnualGoalOwnerType; departmentId: string | null; teamId: string | null; deletedAt: Date | null },
  capabilities: {
    canEditDepartmentPlans: boolean;
    canEditTeamPlans: boolean;
    canUpdateProgress: boolean;
  }
): PlanPermissionFlags {
  if (plan.deletedAt) {
    return {
      canEditPlan: false,
      canArchivePlan: false,
      canEditMetrics: false,
      canManageSources: false,
      canManageQuarterTargets: false,
      canUpdateQuarterProgress: false,
      canUpdateWeeklyProgress: false,
    };
  }

  const isAdmin = currentUser.roleType === "ADMIN";
  const isDepartmentManager = currentUser.roleType === "DEPARTMENT_MANAGER" && currentUser.departmentId === plan.departmentId;
  const canEditDepartmentPlan = plan.ownerType === "DEPARTMENT" && (isAdmin || isDepartmentManager || capabilities.canEditDepartmentPlans && currentUser.departmentId === plan.departmentId);
  const canEditTeamPlan = plan.ownerType === "TEAM" && (isAdmin || isDepartmentManager || capabilities.canEditTeamPlans && currentUser.teamId === plan.teamId);
  const canUpdateProgress = capabilities.canUpdateProgress && (
    (plan.ownerType === "DEPARTMENT" && currentUser.departmentId === plan.departmentId)
    || (plan.ownerType === "TEAM" && currentUser.teamId === plan.teamId)
  );

  return {
    canEditPlan: canEditDepartmentPlan || canEditTeamPlan,
    canArchivePlan: canEditDepartmentPlan || canEditTeamPlan,
    canEditMetrics: canEditDepartmentPlan || canEditTeamPlan,
    canManageSources: canEditDepartmentPlan,
    canManageQuarterTargets: canEditDepartmentPlan,
    canUpdateQuarterProgress: isAdmin || isDepartmentManager || canUpdateProgress,
    canUpdateWeeklyProgress: isAdmin || isDepartmentManager || canUpdateProgress,
  };
}

export async function getAnnualGoalsData(currentUser: DataScopeInput): Promise<AnnualGoalsResult> {
  const annualGoalPermissionMap = await getAnnualGoalPermissionMap();
  const annualGoalCapabilities = getAnnualGoalCapabilities(currentUser.roleType, annualGoalPermissionMap);
  const activeWhere = getAnnualPlanWhereByScope(currentUser, annualGoalCapabilities);
  const archivedWhere = { ...activeWhere, deletedAt: { not: null } };

  const [plans, archivedPlans] = await Promise.all([
    prisma.annualGoalPlan.findMany({
      where: activeWhere,
      orderBy: [{ ownerType: "asc" }, { year: "desc" }, { createdAt: "desc" }],
      include: {
        metrics: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.annualGoalPlan.findMany({
      where: archivedWhere,
      orderBy: [{ deletedAt: "desc" }, { year: "desc" }, { createdAt: "desc" }],
      include: {
        metrics: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  ]);
  const [departments, teams] = await Promise.all([
    currentUser.roleType === "ADMIN"
      ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : currentUser.departmentId
        ? prisma.department.findMany({ where: { id: currentUser.departmentId }, select: { id: true, name: true } })
        : [],
    prisma.team.findMany({ where: getTeamWhereByScope(currentUser), orderBy: { name: "asc" }, select: { id: true, name: true, departmentId: true } }),
  ]);
  const scopedDepartmentIds = Array.from(new Set([
    ...departments.map((department) => department.id),
    ...teams.map((team) => team.departmentId),
    ...plans.map((plan) => plan.departmentId).filter((departmentId): departmentId is string => Boolean(departmentId)),
    ...archivedPlans.map((plan) => plan.departmentId).filter((departmentId): departmentId is string => Boolean(departmentId)),
  ]));
  const scopedTeamIds = Array.from(new Set([
    ...teams.map((team) => team.id),
    ...plans.map((plan) => plan.teamId).filter((teamId): teamId is string => Boolean(teamId)),
    ...archivedPlans.map((plan) => plan.teamId).filter((teamId): teamId is string => Boolean(teamId)),
  ]));

  // Get quarter targets and source metadata for all metrics.
  // Team plans inherit quarter targets from the selected department metric/source metric.
  const allPlans = [...plans, ...archivedPlans];
  const metricIds = allPlans.flatMap((p) => p.metrics.map((m) => m.id));
  const teamMetrics = allPlans.filter((p) => p.ownerType === "TEAM").flatMap((p) => p.metrics.map((m) => ({ plan: p, metric: m })));
  const selectedSourceMetricIds = Array.from(new Set(teamMetrics.flatMap(({ metric }) => metric.sourceMetricId ? [metric.sourceMetricId] : [])));
  const selectedParentMetricCodes = Array.from(new Set(teamMetrics.flatMap(({ metric }) => metric.sourceMetricId ? [] : [metric.metricCode])));

  const [baseQuarterTargets, metricSources, selectedDepartmentMetrics, scopedUsers] = await Promise.all([
    metricIds.length
      ? prisma.annualGoalQuarterTarget.findMany({
          where: { metricId: { in: metricIds }, deletedAt: null },
          orderBy: { quarter: "asc" },
        })
      : [],
    metricIds.length || selectedSourceMetricIds.length
      ? prisma.annualGoalMetricSource.findMany({
          where: {
            deletedAt: null,
            OR: [
              ...(metricIds.length ? [{ parentMetricId: { in: metricIds } }] : []),
              ...(selectedSourceMetricIds.length ? [{ id: { in: selectedSourceMetricIds } }] : []),
            ],
          },
          orderBy: { createdAt: "asc" },
        })
      : [],
    selectedParentMetricCodes.length
      ? prisma.annualGoalMetric.findMany({
          where: {
            metricCode: { in: selectedParentMetricCodes },
            deletedAt: null,
            plan: { ownerType: "DEPARTMENT", deletedAt: null },
          },
          include: { plan: true },
        })
      : [],
    scopedDepartmentIds.length || scopedTeamIds.length
      ? prisma.user.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            OR: [
              ...(scopedDepartmentIds.length ? [{ departmentId: { in: scopedDepartmentIds } }] : []),
              ...(scopedTeamIds.length ? [{ teamId: { in: scopedTeamIds } }] : []),
            ],
          },
          orderBy: [{ teamId: "asc" }, { name: "asc" }],
          select: { id: true, name: true, title: true, departmentId: true, teamId: true },
        })
      : [],
  ]);

  const inheritedMetricIds = new Set<string>();
  const selectedSourceMetricIdSet = new Set(selectedSourceMetricIds);
  for (const source of metricSources) {
    if (selectedSourceMetricIdSet.has(source.id)) inheritedMetricIds.add(source.parentMetricId);
  }
  for (const metric of selectedDepartmentMetrics) inheritedMetricIds.add(metric.id);
  const missingInheritedMetricIds = Array.from(inheritedMetricIds).filter((id) => !metricIds.includes(id));
  const inheritedQuarterTargets = missingInheritedMetricIds.length
    ? await prisma.annualGoalQuarterTarget.findMany({
        where: { metricId: { in: missingInheritedMetricIds }, deletedAt: null },
        orderBy: { quarter: "asc" },
      })
    : [];
  const quarterTargets = [...baseQuarterTargets, ...inheritedQuarterTargets];
  const sourceById = new Map(metricSources.map((source) => [source.id, source]));
  const userById = new Map(scopedUsers.map((user) => [user.id, user]));
  const memberOptionsByDepartment = Object.fromEntries(
    scopedDepartmentIds.map((departmentId) => [
      departmentId,
      scopedUsers.filter((user) => user.departmentId === departmentId).map(mapMemberOption),
    ])
  );
  const memberOptionsByTeam = Object.fromEntries(
    scopedTeamIds.map((teamId) => [
      teamId,
      scopedUsers.filter((user) => user.teamId === teamId).map(mapMemberOption),
    ])
  );
  const departmentMetricByPlan = new Map(selectedDepartmentMetrics.map((metric) => [`${metric.plan.departmentId}:${metric.plan.year}:${metric.metricCode}`, metric]));

  const targetsByMetric = new Map<string, typeof quarterTargets>();
  const targetsBySourceMetric = new Map<string, typeof quarterTargets>();
  for (const qt of quarterTargets) {
    if (qt.sourceMetricId) {
      const key = `${qt.metricId}:${qt.sourceMetricId}`;
      const list = targetsBySourceMetric.get(key) ?? [];
      list.push(qt);
      targetsBySourceMetric.set(key, list);
    } else {
      const list = targetsByMetric.get(qt.metricId) ?? [];
      list.push(qt);
      targetsByMetric.set(qt.metricId, list);
    }
  }

  const sourcesByParentMetric = new Map<string, typeof metricSources>();
  for (const source of metricSources) {
    const list = sourcesByParentMetric.get(source.parentMetricId) ?? [];
    list.push(source);
    sourcesByParentMetric.set(source.parentMetricId, list);
  }

  function getMetricQuarterTargets(plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number]) {
    const sourceMetricForInheritance = plan.ownerType === "TEAM" && metric.sourceMetricId ? sourceById.get(metric.sourceMetricId) : null;
    const parentMetricForInheritance = plan.ownerType === "TEAM" && !metric.sourceMetricId ? departmentMetricByPlan.get(`${plan.departmentId}:${plan.year}:${metric.metricCode}`) : null;
    return sourceMetricForInheritance
      ? targetsBySourceMetric.get(`${sourceMetricForInheritance.parentMetricId}:${sourceMetricForInheritance.id}`) ?? []
      : parentMetricForInheritance
        ? targetsByMetric.get(parentMetricForInheritance.id) ?? []
        : targetsByMetric.get(metric.id) ?? [];
  }

  function getSourceCurrentValue(parentMetricId: string, source: (typeof metricSources)[number]) {
    const sourceQuarterTargets = targetsBySourceMetric.get(`${parentMetricId}:${source.id}`) ?? [];
    return sourceQuarterTargets.length > 0
      ? sumValues(sourceQuarterTargets, (target) => target.currentValue)
      : roundValue(source.currentValue);
  }

  function getMetricTargetValue(plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number], sources: typeof metricSources) {
    return plan.ownerType === "DEPARTMENT" && sources.length > 0
      ? sumValues(sources, (source) => source.targetValue)
      : roundValue(metric.targetValue);
  }

  function getMetricCurrentValue(plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number], sources: typeof metricSources, qTargets: typeof quarterTargets) {
    if (qTargets.length > 0) return sumValues(qTargets, (target) => target.currentValue);
    if (plan.ownerType === "DEPARTMENT" && sources.length > 0) {
      return sumValues(sources, (source) => getSourceCurrentValue(metric.id, source));
    }
    return roundValue(metric.currentValue);
  }

  function mapPlan(plan: (typeof allPlans)[number]): PlanData {
    const totalWeight = plan.metrics.reduce((s, m) => s + m.weight, 0);
    const weightedProgress = totalWeight > 0
      ? plan.metrics.reduce((s, m) => {
          const sources = sourcesByParentMetric.get(m.id) ?? [];
          const qTargets = getMetricQuarterTargets(plan, m);
          const targetValue = getMetricTargetValue(plan, m, sources);
          const currentValue = getMetricCurrentValue(plan, m, sources, qTargets);
          const progress = targetValue > 0 ? (currentValue / targetValue) * m.weight : 0;
          return s + progress;
        }, 0) / totalWeight * 100
      : 0;

    const metricsData: MetricData[] = plan.metrics.map((m) => {
      const sources = sourcesByParentMetric.get(m.id) ?? [];
      const qTargets = getMetricQuarterTargets(plan, m);
      const targetValue = getMetricTargetValue(plan, m, sources);
      const currentValue = getMetricCurrentValue(plan, m, sources, qTargets);
      const progress = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;
      return {
        id: m.id,
        sourceMetricId: m.sourceMetricId,
        metricCode: m.metricCode,
        name: m.name,
        description: m.description,
        departmentId: plan.departmentId,
        responsibleUserId: m.responsibleUserId,
        responsibleUser: mapResponsibleUser(m.responsibleUserId ? userById.get(m.responsibleUserId) : null),
        rawTargetValue: roundValue(m.targetValue),
        targetValue,
        currentValue,
        unit: m.unit,
        weight: m.weight,
        calculationType: m.calculationType,
        riskStatus: m.riskStatus,
        sortOrder: m.sortOrder,
        progress: roundPercent(progress),
        tone: (m.riskStatus === "RISK" ? "warning" : "primary") as "warning" | "primary",
        createdAt: m.createdAt,
        adjustedAt: m.adjustedAt,
        progressUpdatedAt: m.progressUpdatedAt,
        quarterTargets: qTargets.map((qt) => ({
          id: qt.id,
          metricId: qt.metricId,
          sourceMetricId: qt.sourceMetricId,
          quarter: qt.quarter,
          targetValue: roundValue(qt.targetValue),
          currentValue: roundValue(qt.currentValue),
          weeklyIncrement: roundValue(qt.weeklyIncrement),
          createdAt: qt.createdAt,
          adjustedAt: qt.adjustedAt,
          progressUpdatedAt: qt.progressUpdatedAt,
        })),
        sources: (sourcesByParentMetric.get(m.id) ?? []).map((source) => {
          const sourceQuarterTargets = targetsBySourceMetric.get(`${m.id}:${source.id}`) ?? [];
          const sourceCurrentValue = getSourceCurrentValue(m.id, source);
          const sourceProgress = source.targetValue > 0 ? (sourceCurrentValue / source.targetValue) * 100 : 0;
          return {
            id: source.id,
            parentMetricId: source.parentMetricId,
            metricCode: source.metricCode,
            name: source.name,
            description: source.description,
            targetValue: roundValue(source.targetValue),
            currentValue: sourceCurrentValue,
            unit: source.unit,
            calculationType: source.calculationType,
            riskStatus: source.riskStatus,
            responsibleUserId: source.responsibleUserId,
            responsibleUser: mapResponsibleUser(source.responsibleUserId ? userById.get(source.responsibleUserId) : null),
            progress: roundPercent(sourceProgress),
            tone: (source.riskStatus === "RISK" ? "warning" : "primary") as "warning" | "primary",
            createdAt: source.createdAt,
            adjustedAt: source.adjustedAt,
            progressUpdatedAt: source.progressUpdatedAt,
            quarterTargets: sourceQuarterTargets.map((qt) => ({
              id: qt.id,
              metricId: qt.metricId,
              sourceMetricId: qt.sourceMetricId,
              quarter: qt.quarter,
              targetValue: roundValue(qt.targetValue),
              currentValue: roundValue(qt.currentValue),
              weeklyIncrement: roundValue(qt.weeklyIncrement),
              createdAt: qt.createdAt,
              adjustedAt: qt.adjustedAt,
              progressUpdatedAt: qt.progressUpdatedAt,
            })),
          };
        }),
      };
    });

    const departmentName = departments.find((d) => d.id === plan.departmentId)?.name;
    const teamName = teams.find((t) => t.id === plan.teamId)?.name;

    const permissions = getPlanPermissions(currentUser, plan, annualGoalCapabilities);

    return {
      id: plan.id,
      year: plan.year,
      name: plan.name,
      description: plan.description,
      ownerType: plan.ownerType,
      ownerName: plan.ownerType === "DEPARTMENT" ? departmentName ?? "部门" : teamName ?? "小组",
      departmentId: plan.departmentId,
      teamId: plan.teamId,
      version: `v${plan.version}`,
      isActive: plan.isActive,
      approvalStatus: plan.approvalStatus,
      revisionReason: plan.revisionReason,
      deletedAt: plan.deletedAt,
      weightedProgress: roundPercent(weightedProgress),
      metrics: metricsData,
      totalWeight: roundPercent(totalWeight),
      permissions,
      createdAt: plan.createdAt,
    };
  }

  const plansWithProgress = plans.map(mapPlan).sort(comparePlans);
  const archivedPlansWithProgress = archivedPlans.map(mapPlan).sort(comparePlans);
  const availableParentMetrics = plansWithProgress
    .filter((p) => p.ownerType === "DEPARTMENT")
    .flatMap((p) => p.metrics);
  const availableSourceMetrics = availableParentMetrics.flatMap((m) => m.sources);

  // Summary stats
  const totalMetrics = plans.reduce((s, p) => s + p.metrics.length, 0);
  const riskCount = plans.reduce(
    (s, p) => s + p.metrics.filter((m) => m.riskStatus === "RISK").length,
    0
  );
  const revisionCount = plans.filter((p) => p.revisionReason).length;

  // Overall weighted progress only counts department-owned annual performance metrics.
  let overallWeightedProgress = 0;
  const departmentMetrics = plans
    .filter((p) => p.ownerType === "DEPARTMENT")
    .flatMap((p) => p.metrics.map((m) => ({ plan: p, metric: m })));
  const overallTotalWeight = departmentMetrics.reduce((s, { metric }) => s + metric.weight, 0);
  if (overallTotalWeight > 0) {
    overallWeightedProgress = roundPercent(
      departmentMetrics.reduce((s, { plan, metric }) => {
        const sources = sourcesByParentMetric.get(metric.id) ?? [];
        const qTargets = getMetricQuarterTargets(plan, metric);
        const targetValue = getMetricTargetValue(plan, metric, sources);
        const currentValue = getMetricCurrentValue(plan, metric, sources, qTargets);
        const progress = targetValue > 0 ? (currentValue / targetValue) * metric.weight : 0;
        return s + progress;
      }, 0) / overallTotalWeight * 100
    );
  }

  const canManage = currentUser.roleType === "ADMIN" || currentUser.roleType === "DEPARTMENT_MANAGER";

  return {
    plans: plansWithProgress,
    archivedPlans: archivedPlansWithProgress,
    availableSourceMetrics,
    availableParentMetrics,
    departments,
    teams,
    memberOptionsByDepartment,
    memberOptionsByTeam,
    canManage,
    permissions: {
      canCreatePlan: canManage,
      canRestorePlan: canManage,
      canViewDepartmentPlans: annualGoalCapabilities.canViewDepartmentPlans,
      canEditDepartmentPlans: annualGoalCapabilities.canEditDepartmentPlans,
      canEditTeamPlans: annualGoalCapabilities.canEditTeamPlans,
      canUpdateProgress: annualGoalCapabilities.canUpdateProgress,
    },
    currentDepartmentId: currentUser.departmentId,
    summary: {
      planCount: plans.length,
      metricCount: totalMetrics,
      riskCount,
      revisionCount,
      overallWeightedProgress,
    },
  };
}
