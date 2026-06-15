import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import {
  buildOrgScopeContext,
  getAnnualGoalCapabilities,
  getAnnualGoalPermissionMapForUser,
  getAnnualGoalPlanPermissions,
  getAnnualGoalPlanWhere,
  type OrgScopeContext,
} from "@/server/organization/annual-goal-permissions";
import type { AnnualGoalOwnerType, AnnualMetricCalculationType, ApprovalStatus, OrgNodeType, RiskStatus, RoleType } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type OrgNodeSummary = {
  id: string;
  name: string;
  nodeType: OrgNodeType;
  parentId: string | null;
};

type MemberOption = {
  id: string;
  name: string;
  title: string | null;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
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
  departmentOrgNodeId: string | null;
  scopeDepartmentOrgNodeId: string | null;
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
  departmentOrgNodeId: string | null;
  scopeDepartmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  ownerOrgNodeId: string | null;
  version: string;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  revisionReason: string | null;
  weightedProgress: number;
  metrics: MetricData[];
  totalWeight: number;
  permissions: PlanPermissionFlags;
  linkedTeamOrgNodeIds: string[];
  createdAt: Date;
};

type ScopeDepartment = {
  orgNodeId: string;
  name: string;
};

type ScopeItem = {
  type: "DEPARTMENT" | "TEAM";
  orgNodeId: string;
  name: string;
  scopeDepartmentOrgNodeId: string;
  teamOrgNodeId: string | null;
  ownerOrgNodeId: string | null;
  plan: PlanData | null;
};

type HistoryYearGroup = {
  year: number;
  plans: PlanData[];
};

type AnnualGoalsResult = {
  scopeDepartments: ScopeDepartment[];
  scopeItems: ScopeItem[];
  plans: PlanData[];
  historyPlansByYear: HistoryYearGroup[];
  availableSourceMetrics: MetricSourceData[];
  availableParentMetrics: MetricData[];
  teams: { orgNodeId: string; name: string; departmentOrgNodeId: string }[];
  memberOptionsByDepartment: Record<string, MemberOption[]>;
  memberOptionsByTeam: Record<string, MemberOption[]>;
  canManage: boolean;
  permissions: {
    canCreatePlan: boolean;
    canViewDepartmentPlans: boolean;
    canEditDepartmentPlans: boolean;
    canViewTeamPlans: boolean;
    canEditTeamPlans: boolean;
    canUpdateProgress: boolean;
  };
  defaultDepartmentOrgNodeId: string | null;
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

function buildDepartmentAndTeamMaps(orgNodes: OrgNodeSummary[]) {
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const departmentOrgNodeIdByTeamOrgNodeId = new Map<string, string>();
  const departmentNameByOrgNodeId = new Map<string, string>();
  const teamNameByOrgNodeId = new Map<string, string>();

  for (const node of orgNodes) {
    if (node.nodeType === "DEPARTMENT") {
      departmentNameByOrgNodeId.set(node.id, node.name);
      continue;
    }

    if (node.nodeType !== "TEAM") {
      continue;
    }

    teamNameByOrgNodeId.set(node.id, node.name);

    const parentNode = node.parentId ? orgNodeById.get(node.parentId) ?? null : null;
    if (parentNode?.nodeType === "DEPARTMENT") {
      departmentOrgNodeIdByTeamOrgNodeId.set(node.id, parentNode.id);
    }
  }

  return { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId, departmentNameByOrgNodeId, teamNameByOrgNodeId };
}

function getDepartmentOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  orgNodeById: Map<string, OrgNodeSummary>,
  departmentOrgNodeIdByTeamOrgNodeId: Map<string, string>,
) {
  if (!orgNodeId) {
    return null;
  }

  const node = orgNodeById.get(orgNodeId) ?? null;
  if (!node) {
    return null;
  }

  if (node.nodeType === "DEPARTMENT") {
    return node.id;
  }

  if (node.nodeType === "TEAM") {
    return departmentOrgNodeIdByTeamOrgNodeId.get(node.id) ?? null;
  }

  return null;
}

function getTeamOrgNodeIdForRecord(
  orgNodeId: string | null | undefined,
  orgNodeById: Map<string, OrgNodeSummary>,
) {
  const node = orgNodeId ? orgNodeById.get(orgNodeId) ?? null : null;
  return node?.nodeType === "TEAM" ? node.id : null;
}

function mapMemberOption(
  user: { id: string; name: string; title: string | null; orgNodeId: string | null | undefined },
  orgNodeById: Map<string, OrgNodeSummary>,
  departmentOrgNodeIdByTeamOrgNodeId: Map<string, string>,
) {
  return {
    id: user.id,
    name: user.name,
    title: user.title,
    departmentOrgNodeId: getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId),
    teamOrgNodeId: getTeamOrgNodeIdForRecord(user.orgNodeId, orgNodeById),
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
  plan: { ownerType: AnnualGoalOwnerType; ownerOrgNodeId?: string | null; deletedAt: Date | null },
  capabilities: {
    canEditDepartmentPlans: boolean;
    canEditTeamPlans: boolean;
    canUpdateProgress: boolean;
    canViewDepartmentPlans?: boolean;
    canViewTeamPlans?: boolean;
  },
  scopeContext?: OrgScopeContext | null,
): PlanPermissionFlags {
  return getAnnualGoalPlanPermissions(currentUser, {
    canViewDepartmentPlans: Boolean(capabilities.canViewDepartmentPlans),
    canEditDepartmentPlans: capabilities.canEditDepartmentPlans,
    canViewTeamPlans: Boolean(capabilities.canViewTeamPlans),
    canEditTeamPlans: capabilities.canEditTeamPlans,
    canUpdateProgress: capabilities.canUpdateProgress,
  }, { ...plan, ownerOrgNodeId: plan.ownerOrgNodeId ?? undefined }, scopeContext);
}

export async function getAnnualGoalsData(currentUser: DataScopeInput): Promise<AnnualGoalsResult> {
  const annualGoalPermissionMap = await getAnnualGoalPermissionMapForUser(currentUser);
  const annualGoalCapabilities = getAnnualGoalCapabilities(currentUser.roleType, annualGoalPermissionMap);
  const scopeContext = await buildOrgScopeContext(currentUser, annualGoalCapabilities);
  const activeWhere = await getAnnualGoalPlanWhere(currentUser, annualGoalCapabilities);

  const plans = await prisma.annualGoalPlan.findMany({
    where: activeWhere,
    orderBy: [{ ownerType: "asc" }, { year: "desc" }, { createdAt: "desc" }],
    include: {
      metrics: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);
  const orgNodes = await prisma.orgNode.findMany({
    where: scopedOrgNodeIds === null
      ? { nodeType: { in: ["DEPARTMENT", "TEAM"] } }
      : { id: { in: scopedOrgNodeIds }, nodeType: { in: ["DEPARTMENT", "TEAM"] } },
    orderBy: [{ nodeType: "asc" }, { name: "asc" }],
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
  const { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId, departmentNameByOrgNodeId, teamNameByOrgNodeId } = buildDepartmentAndTeamMaps(orgNodes);
  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM" && Boolean(node.parentId))
    .map((node) => ({
      orgNodeId: node.id,
      name: node.name,
      departmentOrgNodeId: node.parentId!,
    }));
  const scopedDepartmentOrgNodeIds = Array.from(new Set([
    ...teams.map((team) => team.departmentOrgNodeId),
    ...plans.map((plan) => getPlanScopeDepartmentOrgNodeId(plan)).filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId)),
  ]));
  const scopeDepartments: ScopeDepartment[] = scopedDepartmentOrgNodeIds.map((orgNodeId) => ({
    orgNodeId,
    name: departmentNameByOrgNodeId.get(orgNodeId) ?? "部门",
  }));
  const defaultDepartmentOrgNodeId = plans.map((plan) => getPlanScopeDepartmentOrgNodeId(plan)).find((orgNodeId): orgNodeId is string => Boolean(orgNodeId))
    ?? teams[0]?.departmentOrgNodeId
    ?? scopeDepartments[0]?.orgNodeId
    ?? null;
  const scopedTeamOrgNodeIds = Array.from(new Set([
    ...teams.map((team) => team.orgNodeId),
    ...plans.map((plan) => getTeamOrgNodeIdForRecord(plan.ownerOrgNodeId, orgNodeById)).filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId)),
  ]));
  const scopedUsersOrgNodeIds = Array.from(new Set([
    ...scopedDepartmentOrgNodeIds,
    ...scopedTeamOrgNodeIds,
  ]));

  // Get quarter targets and source metadata for all metrics.
  // Team plans inherit quarter targets from the selected department metric/source metric.
  const allPlans = plans;
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
    scopedUsersOrgNodeIds.length
      ? prisma.user.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            orgNodeId: { in: scopedUsersOrgNodeIds },
          },
          orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
          select: { id: true, name: true, title: true, orgNodeId: true },
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
    scopedDepartmentOrgNodeIds.map((departmentOrgNodeId) => [
      departmentOrgNodeId,
      scopedUsers
        .filter((user) => getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId) === departmentOrgNodeId)
        .map((user) => mapMemberOption(user, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId)),
    ])
  );
  const memberOptionsByTeam = Object.fromEntries(
    scopedTeamOrgNodeIds.map((teamOrgNodeId) => [
      teamOrgNodeId,
      scopedUsers
        .filter((user) => getTeamOrgNodeIdForRecord(user.orgNodeId, orgNodeById) === teamOrgNodeId)
        .map((user) => mapMemberOption(user, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId)),
    ])
  );
  function getPlanScopeDepartmentOrgNodeId(plan: { ownerOrgNodeId?: string | null }) {
    return getDepartmentOrgNodeIdForRecord(plan.ownerOrgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
  }

  const departmentMetricByPlan = new Map(selectedDepartmentMetrics.map((metric) => [`${getPlanScopeDepartmentOrgNodeId(metric.plan)}:${metric.plan.year}:${metric.metricCode}`, metric]));

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
    const parentMetricForInheritance = plan.ownerType === "TEAM" && !metric.sourceMetricId ? departmentMetricByPlan.get(`${getPlanScopeDepartmentOrgNodeId(plan)}:${plan.year}:${metric.metricCode}`) : null;
    return sourceMetricForInheritance
      ? targetsBySourceMetric.get(`${sourceMetricForInheritance.parentMetricId}:${sourceMetricForInheritance.id}`) ?? []
      : parentMetricForInheritance
        ? targetsByMetric.get(parentMetricForInheritance.id) ?? []
        : targetsByMetric.get(metric.id) ?? [];
  }

  function getMetricScopeDepartmentOrgNodeId(plan: { ownerOrgNodeId?: string | null }) {
    return getPlanScopeDepartmentOrgNodeId(plan);
  }

  function getSourceCurrentValue(parentMetricId: string, source: (typeof metricSources)[number]) {
    const sourceQuarterTargets = targetsBySourceMetric.get(`${parentMetricId}:${source.id}`) ?? [];
    return sourceQuarterTargets.length > 0
      ? sumValues(sourceQuarterTargets, (target) => target.currentValue)
      : roundValue(source.currentValue);
  }

  function getMetricTargetValue(_plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number]) {
    return roundValue(metric.targetValue);
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
          const targetValue = getMetricTargetValue(plan, m);
          const currentValue = getMetricCurrentValue(plan, m, sources, qTargets);
          const progress = targetValue > 0 ? (currentValue / targetValue) * m.weight : 0;
          return s + progress;
        }, 0) / totalWeight * 100
      : 0;

    const metricsData: MetricData[] = plan.metrics.map((m) => {
      const sources = sourcesByParentMetric.get(m.id) ?? [];
      const qTargets = getMetricQuarterTargets(plan, m);
      const targetValue = getMetricTargetValue(plan, m);
      const currentValue = getMetricCurrentValue(plan, m, sources, qTargets);
      const progress = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;
      return {
        id: m.id,
        sourceMetricId: m.sourceMetricId,
        metricCode: m.metricCode,
        name: m.name,
        description: m.description,
        departmentOrgNodeId: getMetricScopeDepartmentOrgNodeId(plan),
        scopeDepartmentOrgNodeId: getMetricScopeDepartmentOrgNodeId(plan),
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

    const scopeDepartmentOrgNodeId = getPlanScopeDepartmentOrgNodeId(plan);
    const departmentName = scopeDepartmentOrgNodeId ? departmentNameByOrgNodeId.get(scopeDepartmentOrgNodeId) : null;
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(plan.ownerOrgNodeId, orgNodeById);
    const teamName = teamOrgNodeId ? teamNameByOrgNodeId.get(teamOrgNodeId) : null;

    const permissions = getPlanPermissions(currentUser, plan, annualGoalCapabilities, scopeContext);

    return {
      id: plan.id,
      year: plan.year,
      name: plan.name,
      description: plan.description,
      ownerType: plan.ownerType,
      ownerName: plan.ownerType === "DEPARTMENT" ? departmentName ?? "部门" : teamName ?? "小组",
      departmentOrgNodeId: scopeDepartmentOrgNodeId,
      scopeDepartmentOrgNodeId,
      teamOrgNodeId,
      ownerOrgNodeId: plan.ownerOrgNodeId ?? null,
      version: `v${plan.version}`,
      isActive: plan.isActive,
      approvalStatus: plan.approvalStatus,
      revisionReason: plan.revisionReason,
      weightedProgress: roundPercent(weightedProgress),
      metrics: metricsData,
      totalWeight: roundPercent(totalWeight),
      permissions,
      linkedTeamOrgNodeIds: [] as string[],
      createdAt: plan.createdAt,
    };
  }

  // Compute linked team IDs for department plans (team plans with same department + year)
  const linkedTeamOrgNodeIdsByDeptPlan = new Map<string, string[]>();
  for (const plan of plans) {
    const scopeDepartmentOrgNodeId = getPlanScopeDepartmentOrgNodeId(plan);
    if (plan.ownerType === "DEPARTMENT" && scopeDepartmentOrgNodeId) {
      linkedTeamOrgNodeIdsByDeptPlan.set(
        plan.id,
        plans
          .filter((p) => p.ownerType === "TEAM" && getPlanScopeDepartmentOrgNodeId(p) === scopeDepartmentOrgNodeId && p.year === plan.year)
          .map((p) => getTeamOrgNodeIdForRecord(p.ownerOrgNodeId, orgNodeById))
          .filter((teamOrgNodeId): teamOrgNodeId is string => Boolean(teamOrgNodeId)),
      );
    }
  }

  const plansWithProgress = plans.map((p) => {
    const mapped = mapPlan(p);
    if (p.ownerType === "DEPARTMENT") {
      mapped.linkedTeamOrgNodeIds = linkedTeamOrgNodeIdsByDeptPlan.get(p.id) ?? [];
    }
    return mapped;
  }).sort(comparePlans);
  const historyPlansByYear = Array.from(
    plansWithProgress.reduce((groups, plan) => {
      const existingPlans = groups.get(plan.year) ?? [];
      existingPlans.push(plan);
      groups.set(plan.year, existingPlans);
      return groups;
    }, new Map<number, PlanData[]>())
  )
    .sort((a, b) => b[0] - a[0])
    .map(([year, groupedPlans]) => ({
      year,
      plans: groupedPlans.sort(comparePlans),
    }));
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
        const targetValue = getMetricTargetValue(plan, metric);
        const currentValue = getMetricCurrentValue(plan, metric, sources, qTargets);
        const progress = targetValue > 0 ? (currentValue / targetValue) * metric.weight : 0;
        return s + progress;
      }, 0) / overallTotalWeight * 100
    );
  }

  const canManage = annualGoalCapabilities.canEditDepartmentPlans || annualGoalCapabilities.canEditTeamPlans;
  const canManageDepartmentPlans = annualGoalCapabilities.canEditDepartmentPlans;

  // Build scope items: all visible departments + teams, with or without plans
  const deptPlanByDept = new Map(plansWithProgress.filter((p) => p.ownerType === "DEPARTMENT").map((p) => [p.scopeDepartmentOrgNodeId!, p]));
  const teamPlanByTeam = new Map(plansWithProgress.filter((p) => p.ownerType === "TEAM").map((p) => [p.teamOrgNodeId!, p]));
  const scopeItems: ScopeItem[] = [
    ...scopeDepartments.map((department) => ({
      type: "DEPARTMENT" as const,
      orgNodeId: department.orgNodeId,
      name: department.name,
      scopeDepartmentOrgNodeId: department.orgNodeId,
      teamOrgNodeId: null,
      ownerOrgNodeId: deptPlanByDept.get(department.orgNodeId)?.ownerOrgNodeId ?? null,
      plan: deptPlanByDept.get(department.orgNodeId) ?? null,
    })),
    ...teams.map((team) => ({
      type: "TEAM" as const,
      orgNodeId: team.orgNodeId,
      name: team.name,
      scopeDepartmentOrgNodeId: team.departmentOrgNodeId,
      teamOrgNodeId: team.orgNodeId,
      ownerOrgNodeId: teamPlanByTeam.get(team.orgNodeId)?.ownerOrgNodeId ?? null,
      plan: teamPlanByTeam.get(team.orgNodeId) ?? null,
    })),
  ];

  return {
    scopeDepartments,
    scopeItems,
    plans: plansWithProgress,
    historyPlansByYear,
    availableSourceMetrics,
    availableParentMetrics,
    teams,
    memberOptionsByDepartment,
    memberOptionsByTeam,
    canManage,
    permissions: {
      canCreatePlan: canManageDepartmentPlans,
      canViewDepartmentPlans: annualGoalCapabilities.canViewDepartmentPlans,
      canEditDepartmentPlans: annualGoalCapabilities.canEditDepartmentPlans,
      canViewTeamPlans: annualGoalCapabilities.canViewTeamPlans,
      canEditTeamPlans: annualGoalCapabilities.canEditTeamPlans,
      canUpdateProgress: annualGoalCapabilities.canUpdateProgress,
    },
    defaultDepartmentOrgNodeId,
    summary: {
      planCount: plans.length,
      metricCount: totalMetrics,
      riskCount,
      revisionCount,
      overallWeightedProgress,
    },
  };
}
