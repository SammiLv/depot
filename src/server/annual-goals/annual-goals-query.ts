import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds, findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";
import {
  buildOrgScopeContext,
  getAnnualGoalCapabilities,
  getAnnualGoalPermissionMapForUser,
  getAnnualGoalAssignmentPermissions,
  getAnnualGoalPlanPermissions,
  getAnnualGoalPlanWhere,
  type OrgScopeContext,
} from "@/server/organization/annual-goal-permissions";
import type { AnnualMetricCalculationType, OrgNodeType, RiskStatus, RoleType } from "@prisma/client";

type AnnualGoalViewOwnerType = "DEPARTMENT" | "TEAM";

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

type ActorSummary = {
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
  createdBy: ActorSummary | null;
  updatedBy: ActorSummary | null;
  createdAt: Date;
  updatedAt: Date;
  adjustedAt: Date | null;
  progressUpdatedAt: Date | null;
  quarterTargets: { id: string; metricId: string | null; sourceMetricId: string | null; quarter: number; targetValue: number; currentValue: number; weeklyIncrement: number; createdBy: ActorSummary | null; updatedBy: ActorSummary | null; createdAt: Date; updatedAt: Date; adjustedAt: Date | null; progressUpdatedAt: Date | null }[];
};

type MetricData = {
  id: string;
  authorityMetricId: string;
  assignmentId: string | null;
  teamOrgNodeId: string | null;
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
  createdBy: ActorSummary | null;
  updatedBy: ActorSummary | null;
  createdAt: Date;
  updatedAt: Date;
  adjustedAt: Date | null;
  progressUpdatedAt: Date | null;
  quarterTargets: { id: string; metricId: string | null; sourceMetricId: string | null; quarter: number; targetValue: number; currentValue: number; weeklyIncrement: number; createdBy: ActorSummary | null; updatedBy: ActorSummary | null; createdAt: Date; updatedAt: Date; adjustedAt: Date | null; progressUpdatedAt: Date | null }[];
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
  authorityPlanId: string;
  year: number;
  name: string;
  description: string | null;
  ownerType: AnnualGoalViewOwnerType;
  ownerName: string;
  departmentOrgNodeId: string | null;
  scopeDepartmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  ownerOrgNodeId: string | null;
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

type AnnualGoalsResult = {
  selectedYear: number;
  availableYears: number[];
  scopeDepartments: ScopeDepartment[];
  scopeItems: ScopeItem[];
  plans: PlanData[];
  availableSourceMetrics: MetricSourceData[];
  availableParentMetrics: MetricData[];
  teams: { orgNodeId: string; name: string; departmentOrgNodeId: string }[];
  memberOptionsByDepartment: Record<string, MemberOption[]>;
  memberOptionsByTeam: Record<string, MemberOption[]>;
  canManage: boolean;
  showDepartmentNavigation: boolean;
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

function mapActor(user: { id: string; name: string; title: string | null } | null | undefined) {
  if (!user) return null;
  return { id: user.id, name: user.name, title: user.title };
}

function buildDepartmentAndTeamMaps(orgNodes: OrgNodeSummary[]) {
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const departmentOrgNodeIdByTeamOrgNodeId = new Map<string, string>();
  const departmentNameByOrgNodeId = new Map<string, string>();

  function findNearestDepartmentOrgNodeIdForNode(nodeId: string) {
    let currentNode = orgNodeById.get(nodeId) ?? null;
    while (currentNode) {
      if (currentNode.nodeType === "DEPARTMENT") {
        return currentNode.id;
      }
      currentNode = currentNode.parentId ? orgNodeById.get(currentNode.parentId) ?? null : null;
    }
    return null;
  }

  for (const node of orgNodes) {
    if (node.nodeType === "DEPARTMENT") {
      departmentNameByOrgNodeId.set(node.id, node.name);
      continue;
    }

    if (node.nodeType !== "TEAM") {
      continue;
    }

    const departmentOrgNodeId = findNearestDepartmentOrgNodeIdForNode(node.id);
    if (departmentOrgNodeId) {
      departmentOrgNodeIdByTeamOrgNodeId.set(node.id, departmentOrgNodeId);
    }
  }

  return { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId, departmentNameByOrgNodeId };
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

function comparePlans(a: { ownerType: AnnualGoalViewOwnerType; ownerName: string; year: number; createdAt: Date }, b: { ownerType: AnnualGoalViewOwnerType; ownerName: string; year: number; createdAt: Date }) {
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
  plan: { ownerType: AnnualGoalViewOwnerType; ownerOrgNodeId?: string | null; deletedAt: Date | null },
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

type GetAnnualGoalsDataOptions = {
  selectedYear?: number;
};

export async function getAnnualGoalsData(currentUser: DataScopeInput, options?: GetAnnualGoalsDataOptions): Promise<AnnualGoalsResult> {
  const selectedYear = options?.selectedYear;
  const annualGoalPermissionMap = await getAnnualGoalPermissionMapForUser(currentUser);
  const annualGoalCapabilities = getAnnualGoalCapabilities(currentUser.roleType, annualGoalPermissionMap);
  const scopeContext = await buildOrgScopeContext(currentUser, annualGoalCapabilities);
  const activeWhere = await getAnnualGoalPlanWhere(currentUser, annualGoalCapabilities);

  const plans = (await prisma.annualGoalPlan.findMany({
    where: activeWhere,
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: {
      metrics: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  })).filter((plan) => Boolean(plan.departmentOrgNodeId));
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from(new Set([...plans.map((plan) => plan.year), currentYear])).sort((a, b) => b - a);
  const resolvedSelectedYear = availableYears.includes(selectedYear ?? Number.NaN)
    ? selectedYear!
    : availableYears.includes(currentYear)
      ? currentYear
      : availableYears[0] ?? currentYear;
  const selectedYearPlans = plans.filter((plan) => plan.year === resolvedSelectedYear);
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);
  const departmentAncestorOrgNodeId = currentUser.roleType === "ADMIN"
    ? null
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId ?? null);
  const scopedOrgNodeIdSet = new Set(scopedOrgNodeIds ?? []);
  if (departmentAncestorOrgNodeId) {
    scopedOrgNodeIdSet.add(departmentAncestorOrgNodeId);
  }
  const scopedOrgNodeIdsForQuery = Array.from(scopedOrgNodeIdSet).filter(Boolean);
  const orgNodes = await prisma.orgNode.findMany({
    where: currentUser.roleType === "ADMIN"
      ? { nodeType: { in: ["DEPARTMENT", "TEAM"] } }
      : scopedOrgNodeIdsForQuery.length
        ? { id: { in: scopedOrgNodeIdsForQuery }, nodeType: { in: ["DEPARTMENT", "TEAM"] } }
        : { id: "__no_org_node__" },
    orderBy: [{ nodeType: "asc" }, { name: "asc" }],
    select: { id: true, name: true, nodeType: true, parentId: true },
  });
  const { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId, departmentNameByOrgNodeId } = buildDepartmentAndTeamMaps(orgNodes);
  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM")
    .map((node) => ({
      orgNodeId: node.id,
      name: node.name,
      departmentOrgNodeId: departmentOrgNodeIdByTeamOrgNodeId.get(node.id) ?? null,
    }))
    .filter((team): team is { orgNodeId: string; name: string; departmentOrgNodeId: string } => Boolean(team.departmentOrgNodeId))
    .sort((a, b) => compareTeamNames(a.name, b.name));
  const visibleDepartmentOrgNodeIds = orgNodes
    .filter((node) => node.nodeType === "DEPARTMENT")
    .map((node) => node.id);
  const scopedDepartmentOrgNodeIds = Array.from(new Set([
    ...visibleDepartmentOrgNodeIds,
    ...teams.map((team) => team.departmentOrgNodeId),
    ...plans.map((plan) => plan.departmentOrgNodeId),
  ].filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId))));
  const scopeDepartments: ScopeDepartment[] = scopedDepartmentOrgNodeIds.map((orgNodeId) => ({
    orgNodeId,
    name: departmentNameByOrgNodeId.get(orgNodeId) ?? "部门",
  }));
  const defaultDepartmentOrgNodeId = selectedYearPlans[0]?.departmentOrgNodeId
    ?? plans[0]?.departmentOrgNodeId
    ?? teams[0]?.departmentOrgNodeId
    ?? scopeDepartments[0]?.orgNodeId
    ?? null;
  const scopedTeamOrgNodeIds = teams.map((team) => team.orgNodeId);
  const scopedUsersOrgNodeIds = Array.from(new Set([
    ...scopedDepartmentOrgNodeIds,
    ...scopedTeamOrgNodeIds,
  ].filter((orgNodeId): orgNodeId is string => Boolean(orgNodeId))));

  const allPlans = plans;
  const metricIds = allPlans.flatMap((p) => p.metrics.map((m) => m.id));

  const [baseQuarterTargets, metricSources] = await Promise.all([
    metricIds.length
      ? prisma.annualGoalQuarterTarget.findMany({
          where: { metricId: { in: metricIds }, deletedAt: null },
          orderBy: { quarter: "asc" },
        })
      : [],
    metricIds.length
      ? prisma.annualGoalMetricSource.findMany({
          where: {
            deletedAt: null,
            parentMetricId: { in: metricIds },
          },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);

  const sourceMetricIds = metricSources.map((source) => source.id);
  const sourceQuarterTargets = sourceMetricIds.length
    ? await prisma.annualGoalQuarterTarget.findMany({
        where: {
          deletedAt: null,
          metricId: null,
          sourceMetricId: { in: sourceMetricIds },
        },
        orderBy: { quarter: "asc" },
      })
    : [];
  const quarterTargets = [...baseQuarterTargets, ...sourceQuarterTargets];
  const assignments = teams.length
    ? await prisma.annualGoalMetricAssignment.findMany({
        where: { teamOrgNodeId: { in: teams.map((team) => team.orgNodeId) }, deletedAt: null },
        include: {
          metric: { include: { plan: true } },
          sourceMetric: { include: { parentMetric: { include: { plan: true } } } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const creatorUpdaterUserIds = Array.from(new Set([
    ...plans.map((plan) => plan.createdById),
    ...allPlans.flatMap((plan) => plan.metrics.flatMap((metric) => [metric.createdById, metric.updatedById].filter((userId): userId is string => Boolean(userId)))),
    ...metricSources.flatMap((source) => [source.createdById, source.updatedById].filter((userId): userId is string => Boolean(userId))),
    ...quarterTargets.flatMap((target) => [target.createdById, target.updatedById].filter((userId): userId is string => Boolean(userId))),
    ...assignments.flatMap((assignment) => [assignment.createdById, assignment.updatedById, assignment.responsibleUserId].filter((userId): userId is string => Boolean(userId))),
  ]));
  const scopedUsers = scopedUsersOrgNodeIds.length || creatorUpdaterUserIds.length
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          OR: [
            ...(scopedUsersOrgNodeIds.length ? [{ orgNodeId: { in: scopedUsersOrgNodeIds } }] : []),
            ...(creatorUpdaterUserIds.length ? [{ id: { in: creatorUpdaterUserIds } }] : []),
          ],
        },
        orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
        select: { id: true, name: true, title: true, orgNodeId: true },
      })
    : [];
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
  function getPlanScopeDepartmentOrgNodeId(plan: { departmentOrgNodeId: string }) {
    return plan.departmentOrgNodeId;
  }

  const targetsByMetric = new Map<string, typeof quarterTargets>();
  const targetsBySourceMetric = new Map<string, typeof quarterTargets>();
  for (const qt of quarterTargets) {
    if (qt.sourceMetricId) {
      const key = qt.sourceMetricId;
      const list = targetsBySourceMetric.get(key) ?? [];
      list.push(qt);
      targetsBySourceMetric.set(key, list);
    } else if (qt.metricId) {
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

  function getMetricScopeDepartmentOrgNodeId(plan: { departmentOrgNodeId: string }) {
    return getPlanScopeDepartmentOrgNodeId(plan);
  }

  function getMetricQuarterTargets(_plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number]) {
    return targetsByMetric.get(metric.id) ?? [];
  }

  function getSourceCurrentValue(_parentMetricId: string, source: (typeof metricSources)[number]) {
    const sourceQuarterTargets = targetsBySourceMetric.get(source.id) ?? [];
    return sourceQuarterTargets.length > 0
      ? sumValues(sourceQuarterTargets, (target) => target.currentValue)
      : roundValue(source.currentValue);
  }

  function getMetricTargetValue(_plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number]) {
    return roundValue(metric.targetValue);
  }

  function getMetricCurrentValue(_plan: (typeof allPlans)[number], metric: (typeof allPlans)[number]["metrics"][number], sources: typeof metricSources, qTargets: typeof quarterTargets) {
    if (qTargets.length > 0) return sumValues(qTargets, (target) => target.currentValue);
    if (sources.length > 0) {
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
        authorityMetricId: m.id,
        assignmentId: null,
        teamOrgNodeId: null,
        sourceMetricId: null,
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
        createdBy: mapActor(m.createdById ? userById.get(m.createdById) : null),
        updatedBy: mapActor(m.updatedById ? userById.get(m.updatedById) : null),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
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
          createdBy: mapActor(qt.createdById ? userById.get(qt.createdById) : null),
          updatedBy: mapActor(qt.updatedById ? userById.get(qt.updatedById) : null),
          createdAt: qt.createdAt,
          updatedAt: qt.updatedAt,
          adjustedAt: qt.adjustedAt,
          progressUpdatedAt: qt.progressUpdatedAt,
        })),
        sources: (sourcesByParentMetric.get(m.id) ?? []).map((source) => {
          const sourceQuarterTargets = targetsBySourceMetric.get(source.id) ?? [];
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
            createdBy: mapActor(source.createdById ? userById.get(source.createdById) : null),
            updatedBy: mapActor(source.updatedById ? userById.get(source.updatedById) : null),
            createdAt: source.createdAt,
            updatedAt: source.updatedAt,
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
              createdBy: mapActor(qt.createdById ? userById.get(qt.createdById) : null),
              updatedBy: mapActor(qt.updatedById ? userById.get(qt.updatedById) : null),
              createdAt: qt.createdAt,
              updatedAt: qt.updatedAt,
              adjustedAt: qt.adjustedAt,
              progressUpdatedAt: qt.progressUpdatedAt,
            })),
          };
        }),
      };
    });

    const scopeDepartmentOrgNodeId = getPlanScopeDepartmentOrgNodeId(plan);
    const departmentName = departmentNameByOrgNodeId.get(scopeDepartmentOrgNodeId);

    const basePermissions = getPlanPermissions(currentUser, {
      ownerType: "DEPARTMENT",
      ownerOrgNodeId: plan.departmentOrgNodeId,
      deletedAt: plan.deletedAt,
    }, annualGoalCapabilities, scopeContext);
    const permissions = plan.status === "CLOSED"
      ? {
          ...basePermissions,
          canEditPlan: false,
          canEditMetrics: false,
          canManageSources: false,
          canManageQuarterTargets: false,
          canUpdateQuarterProgress: false,
          canUpdateWeeklyProgress: false,
        }
      : basePermissions;

    return {
      id: plan.id,
      authorityPlanId: plan.id,
      year: plan.year,
      name: plan.name,
      description: plan.description,
      ownerType: "DEPARTMENT",
      ownerName: departmentName ?? "部门",
      departmentOrgNodeId: scopeDepartmentOrgNodeId,
      scopeDepartmentOrgNodeId,
      teamOrgNodeId: null,
      ownerOrgNodeId: plan.departmentOrgNodeId,
      weightedProgress: roundPercent(weightedProgress),
      metrics: metricsData,
      totalWeight: roundPercent(totalWeight),
      permissions,
      linkedTeamOrgNodeIds: [] as string[],
      createdAt: plan.createdAt,
    };
  }

  const linkedTeamOrgNodeIdsByDeptPlan = new Map<string, string[]>();
  for (const assignment of assignments) {
    const authorityPlan = assignment.sourceMetric?.parentMetric.plan ?? assignment.metric?.plan;
    if (!authorityPlan || authorityPlan.deletedAt || authorityPlan.year !== resolvedSelectedYear) continue;
    const teamIds = linkedTeamOrgNodeIdsByDeptPlan.get(authorityPlan.id) ?? [];
    if (!teamIds.includes(assignment.teamOrgNodeId)) teamIds.push(assignment.teamOrgNodeId);
    linkedTeamOrgNodeIdsByDeptPlan.set(authorityPlan.id, teamIds);
  }

  const departmentPlansWithProgress = selectedYearPlans.map((p) => {
    const mapped = mapPlan(p);
    mapped.linkedTeamOrgNodeIds = linkedTeamOrgNodeIdsByDeptPlan.get(p.id) ?? [];
    return mapped;
  });
  const departmentPlanDataById = new Map(departmentPlansWithProgress.map((plan) => [plan.id, plan]));
  const virtualTeamPlans: PlanData[] = teams.flatMap((team) => {
    const teamAssignments = assignments.filter((assignment) => {
      if (assignment.teamOrgNodeId !== team.orgNodeId) return false;
      const authorityPlan = assignment.sourceMetric?.parentMetric.plan ?? assignment.metric?.plan;
      return authorityPlan?.year === resolvedSelectedYear && !authorityPlan.deletedAt;
    });
    if (teamAssignments.length === 0) return [];
    const authorityPlanRecord = teamAssignments[0].sourceMetric?.parentMetric.plan ?? teamAssignments[0].metric?.plan;
    if (!authorityPlanRecord) return [];
    const authorityPlan = departmentPlanDataById.get(authorityPlanRecord.id);
    if (!authorityPlan) return [];
    const permissions = getAnnualGoalAssignmentPermissions(
      currentUser,
      annualGoalCapabilities,
      team.orgNodeId,
      authorityPlanRecord.status,
      scopeContext,
    );
    if (!permissions.canViewPlan) return [];
    const metrics = teamAssignments.flatMap((assignment): MetricData[] => {
      const authorityMetric = assignment.sourceMetric?.parentMetric ?? assignment.metric;
      const mappedAuthorityMetric = authorityPlan.metrics.find((metric) => metric.id === authorityMetric?.id);
      if (!mappedAuthorityMetric || !authorityMetric) return [];
      const source = assignment.sourceMetricId
        ? mappedAuthorityMetric.sources.find((item) => item.id === assignment.sourceMetricId)
        : null;
      const subject = source ?? mappedAuthorityMetric;
      return [{
        ...mappedAuthorityMetric,
        id: `assignment:${assignment.id}`,
        authorityMetricId: authorityMetric.id,
        assignmentId: assignment.id,
        teamOrgNodeId: team.orgNodeId,
        sourceMetricId: source?.id ?? null,
        metricCode: subject.metricCode,
        name: subject.name,
        description: subject.description,
        responsibleUserId: assignment.responsibleUserId,
        responsibleUser: mapResponsibleUser(assignment.responsibleUserId ? userById.get(assignment.responsibleUserId) : null),
        rawTargetValue: subject.targetValue,
        targetValue: subject.targetValue,
        currentValue: subject.currentValue,
        unit: subject.unit,
        weight: assignment.weight,
        calculationType: subject.calculationType,
        riskStatus: subject.riskStatus,
        sortOrder: assignment.sortOrder,
        progress: subject.progress,
        tone: subject.tone,
        createdBy: mapActor(userById.get(assignment.createdById)),
        updatedBy: mapActor(assignment.updatedById ? userById.get(assignment.updatedById) : null),
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        adjustedAt: null,
        progressUpdatedAt: subject.progressUpdatedAt,
        quarterTargets: subject.quarterTargets,
        sources: [],
      }];
    });
    const totalWeight = sumValues(metrics, (metric) => metric.weight);
    const weightedProgress = totalWeight > 0
      ? roundPercent(metrics.reduce((sum, metric) => sum + metric.progress * metric.weight, 0) / totalWeight)
      : 0;
    return [{
      ...authorityPlan,
      id: `team:${team.orgNodeId}:${authorityPlan.id}`,
      authorityPlanId: authorityPlan.id,
      name: `${team.name} ${authorityPlan.year} 年度指标承接`,
      ownerType: "TEAM",
      ownerName: team.name,
      teamOrgNodeId: team.orgNodeId,
      ownerOrgNodeId: team.orgNodeId,
      metrics,
      totalWeight,
      weightedProgress,
      permissions,
      linkedTeamOrgNodeIds: [team.orgNodeId],
    }];
  });
  const plansWithProgress = [
    ...(annualGoalCapabilities.canViewDepartmentPlans ? departmentPlansWithProgress : []),
    ...virtualTeamPlans,
  ].sort(comparePlans);
  const availableParentMetrics = departmentPlansWithProgress.flatMap((p) => p.metrics);
  const availableSourceMetrics = availableParentMetrics.flatMap((m) => m.sources);

  // Summary stats
  const summaryPlans = annualGoalCapabilities.canViewDepartmentPlans
    ? departmentPlansWithProgress
    : virtualTeamPlans;
  const totalMetrics = summaryPlans.reduce((sum, plan) => sum + plan.metrics.length, 0);
  const riskCount = summaryPlans.reduce(
    (sum, plan) => sum + plan.metrics.filter((metric) => metric.riskStatus === "RISK").length,
    0
  );
  const summaryMetrics = summaryPlans.flatMap((plan) => plan.metrics);
  const overallTotalWeight = summaryMetrics.reduce((sum, metric) => sum + metric.weight, 0);
  const overallWeightedProgress = overallTotalWeight > 0
    ? roundPercent(summaryMetrics.reduce((sum, metric) => sum + metric.progress * metric.weight, 0) / overallTotalWeight)
    : 0;

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
    selectedYear: resolvedSelectedYear,
    availableYears,
    scopeDepartments,
    scopeItems,
    plans: plansWithProgress,
    availableSourceMetrics,
    availableParentMetrics,
    teams,
    memberOptionsByDepartment,
    memberOptionsByTeam,
    canManage,
    showDepartmentNavigation: currentUser.roleType === "ADMIN",
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
      planCount: summaryPlans.length,
      metricCount: totalMetrics,
      riskCount,
      overallWeightedProgress,
    },
  };
}
