import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import {
  canManageProductGoal,
  canManageProductTask,
  canManageProjectAndValueTracking,
} from "@/server/quarterly-work/permission";
import {
  isLaunchedProjectVisibleInPeriod,
  isValueTrackVisibleInPeriod,
  type ActivePeriod,
} from "@/server/quarterly-work/quarterly-work-period-filters";
import { normalizeValueTrackStatus } from "@/server/quarterly-work/value-track-constants";
import type { OrgNodeType, ProjectStatus, RoleType, WorkStatus } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type WorkspaceStatusFilter = ProjectStatus | "DELAYED" | "all";
type WorkspaceViewMode = "card" | "list";
type ProjectPanelMode = "task" | "value";

type QuarterlyWorkQueryOptions = {
  selectedYear?: number;
  selectedQuarter?: number | "all";
  goalId?: string | "all";
  view?: WorkspaceViewMode;
  projectPanel?: ProjectPanelMode;
  status?: WorkspaceStatusFilter;
  orgNodeId?: string | null;
  teamId?: string | "all" | null;
  ownerId?: string | null;
  projectId?: string | null;
  query?: string | null;
};

type OrgNodeSummary = {
  id: string;
  name: string;
  nodeType: OrgNodeType;
  parentId: string | null;
};

type BoardItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  startMonth: number | null;
  endMonth: number | null;
  endDate: Date | null;
  status: WorkStatus;
  description: string | null;
  taskDescription: string | null;
  expectedOutcome: string | null;
  taskResult: string | null;
  executionSummary: string | null;
  workloadPersonDay: number | null;
  needsDevelopment: boolean | null;
  remainingWeeksLabel: string | null;
  createdAt: Date;
  completedAt: Date | null;
  progress?: number;
  delay?: number;
};

type ProductGoalBoardItem = {
  id: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus;
  year: number;
  description: string | null;
  expectedOutcome: string | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

type ProjectBoardItem = {
  id: string;
  title: string;
  productGoalIds: string[];
  productGoalTitle: string | null;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus;
  startQuarter: string | null;
  endQuarter: string | null;
  remainingWeeksLabel: string | null;
  description: string | null;
  expectedOutcome: string | null;
  workloadPersonDay: number | null;
  otherCost: string | null;
  actualValue: string | null;
  valueJudgement: string | null;
  valueTrackStatus: string;
  workCount: number;
  activeQuarterCount: number;
  createdAt: Date;
  launchedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};

type ColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: WorkStatus;
  items: BoardItem[];
};

type ProductGoalColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: ProjectStatus;
  items: ProductGoalBoardItem[];
};

type ProjectColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: ProjectStatus;
  items: ProjectBoardItem[];
};

type ValueOverviewItem = {
  id: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  workloadPersonDay: number | null;
  otherCost: string | null;
  expectedOutcome: string | null;
  actualValue: string | null;
  valueJudgement: string | null;
  valueTrackStatus: string;
  status: ProjectStatus;
  launchedAt: Date | null;
};

type ValueTrackItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  trackedAt: Date;
  trackingResult: string;
  followUpOptimization: string | null;
  actualValue: string | null;
  valueJudgement: string | null;
  valueTrackStatus: string;
};

type GoalNavigationItem = {
  id: string;
  title: string;
  year: number | null;
  ownerId: string | null;
  owner: string | null;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus | "all";
  description: string | null;
  expectedOutcome: string | null;
  projectCount: number;
  taskCount: number;
  isAll: boolean;
};

type ProjectWorkspaceTaskItem = BoardItem & {
  year: number;
  quarter: number;
  periodLabel: string;
  isOverdue: boolean;
};

type ProjectWorkspaceValueTrackItem = ValueTrackItem & {
  periodLabel: string;
};

type ProjectWorkspaceItem = ProjectBoardItem & {
  productGoals: Array<{
    id: string;
    title: string;
    year: number;
  }>;
  statusFilterKey: WorkspaceStatusFilter;
  isOverdue: boolean;
  tasks: ProjectWorkspaceTaskItem[];
  valueTracks: ProjectWorkspaceValueTrackItem[];
  valueTrackSummary: {
    status: string;
    judgement: string | null;
    actualValue: string | null;
    latestTrackedAt: Date | null;
    trackCount: number;
  };
};

const asciiLetterPattern = /^[A-Za-z]$/;
const pinyinInitialBoundaries = [
  { initial: "A", boundary: "阿" },
  { initial: "B", boundary: "八" },
  { initial: "C", boundary: "嚓" },
  { initial: "D", boundary: "哒" },
  { initial: "E", boundary: "妸" },
  { initial: "F", boundary: "发" },
  { initial: "G", boundary: "旮" },
  { initial: "H", boundary: "哈" },
  { initial: "J", boundary: "击" },
  { initial: "K", boundary: "喀" },
  { initial: "L", boundary: "垃" },
  { initial: "M", boundary: "妈" },
  { initial: "N", boundary: "拿" },
  { initial: "O", boundary: "哦" },
  { initial: "P", boundary: "啪" },
  { initial: "Q", boundary: "期" },
  { initial: "R", boundary: "然" },
  { initial: "S", boundary: "撒" },
  { initial: "T", boundary: "塌" },
  { initial: "W", boundary: "挖" },
  { initial: "X", boundary: "昔" },
  { initial: "Y", boundary: "压" },
  { initial: "Z", boundary: "匝" },
] as const;
const pinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin");
const englishCollator = new Intl.Collator("en", { sensitivity: "base" });

function getSortToken(name: string) {
  const firstChar = name.trim()[0] ?? "";
  if (!firstChar) return { initial: "", typeOrder: 1 as const };
  if (asciiLetterPattern.test(firstChar)) {
    return { initial: firstChar.toUpperCase(), typeOrder: 0 as const };
  }

  for (let index = pinyinInitialBoundaries.length - 1; index >= 0; index -= 1) {
    const { initial, boundary } = pinyinInitialBoundaries[index];
    if (pinyinCollator.compare(firstChar, boundary) >= 0) {
      return { initial, typeOrder: 1 as const };
    }
  }

  return { initial: firstChar.toUpperCase(), typeOrder: 1 as const };
}

function parseQuarterCode(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-Q([1-4])$/);
  if (!match) {
    return null;
  }

  return {
    year: Number.parseInt(match[1], 10),
    quarter: Number.parseInt(match[2], 10),
  };
}

function compareQuarterCode(left: { year: number; quarter: number }, right: { year: number; quarter: number }) {
  return left.year === right.year ? left.quarter - right.quarter : left.year - right.year;
}

function getQuarterEndDate(value: string | null | undefined) {
  const parsed = parseQuarterCode(value);
  if (!parsed) {
    return null;
  }
  // 季度末取当季最后一天的 23:59:59（月末结束），而非当天零点
  return new Date(parsed.year, parsed.quarter * 3, 0, 23, 59, 59, 999);
}

function projectRangeHasQuarter(project: { startQuarter: string | null; endQuarter: string | null }, year: number, quarter: number) {
  const start = parseQuarterCode(project.startQuarter);
  const end = parseQuarterCode(project.endQuarter ?? project.startQuarter);
  if (!start || !end) {
    return true;
  }
  const target = { year, quarter };
  return compareQuarterCode(start, target) <= 0 && compareQuarterCode(target, end) <= 0;
}

function projectRangeOverlapsYear(project: { startQuarter: string | null; endQuarter: string | null }, year: number) {
  const start = parseQuarterCode(project.startQuarter);
  const end = parseQuarterCode(project.endQuarter ?? project.startQuarter);
  if (!start || !end) {
    return true;
  }
  return start.year <= year && year <= end.year;
}

function getQuarterByMonth(month: number | null | undefined) {
  if (!month) {
    return null;
  }
  return Math.floor((month - 1) / 3) + 1;
}

function getQuarterByDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }
  return Math.floor(date.getMonth() / 3) + 1;
}

function formatTaskRemainLabel(work: { year: number; endMonth: number | null; endDate?: Date | null; completedAt: Date | null; status: WorkStatus }) {
  // 关闭的任务已中止，不再统计剩余/逾期
  if (work.status === "CLOSED") {
    return null;
  }
  // 按月推算时，截止点取当月最后一天的 23:59:59（月末结束），而非当天零点
  const planEndDate = work.endDate ?? (work.endMonth ? new Date(work.year, work.endMonth, 0, 23, 59, 59, 999) : null);
  if (!planEndDate) {
    return null;
  }
  // 已完成任务以完成时间衡量是否逾期，未完成任务以当前时间衡量剩余/逾期
  const referenceDate = work.completedAt ?? new Date();
  const diffDays = (planEndDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  const roundedWeeks = Math.round((Math.abs(diffDays) / 7) * 10) / 10;
  if (diffDays < 0) {
    return `逾期${roundedWeeks}周`;
  }
  // 已完成且未逾期（在周期内完成）：不打任何标签
  if (work.completedAt) {
    return null;
  }
  // 未完成：仅剩余 2 周内才提示，超过 2 周不打标签
  if (diffDays / 7 <= 2) {
    return `剩余${roundedWeeks}周`;
  }
  return null;
}

function formatProjectRemainLabel(project: {
  startQuarter: string | null;
  endQuarter: string | null;
  status: ProjectStatus;
  completedAt: Date | null;
}) {
  // 关闭的项目已中止，不再统计剩余/逾期
  if (project.status === "CLOSED") {
    return null;
  }
  const planEndDate = getQuarterEndDate(project.endQuarter ?? project.startQuarter);
  if (!planEndDate) {
    return null;
  }
  // 仅「已完成」算项目完成状态，以完成时间衡量是否逾期；其余（含已上线）均以当前时间衡量
  const referenceDate = project.status === "COMPLETED" ? (project.completedAt ?? new Date()) : new Date();
  const diffDays = (planEndDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  const roundedWeeks = Math.round((Math.abs(diffDays) / 7) * 10) / 10;
  if (diffDays < 0) {
    return `逾期${roundedWeeks}周`;
  }
  // 已完成且未逾期（在周期内完成）：不打任何标签
  if (project.status === "COMPLETED") {
    return null;
  }
  // 未完成项目：距季度截止 ≤1 个月才提示剩余，超过 1 个月不打标签
  const oneMonthAhead = new Date(referenceDate);
  oneMonthAhead.setMonth(oneMonthAhead.getMonth() + 1);
  if (planEndDate.getTime() <= oneMonthAhead.getTime()) {
    return `剩余${roundedWeeks}周`;
  }
  return null;
}

function formatTaskPeriodLabel(startMonth: number | null | undefined, endMonth: number | null | undefined) {
  if (startMonth && endMonth) {
    return startMonth === endMonth ? `${startMonth}月` : `${startMonth}月 - ${endMonth}月`;
  }
  if (startMonth) {
    return `${startMonth}月起`;
  }
  if (endMonth) {
    return `${endMonth}月前`;
  }
  return "—";
}

function normalizeSearchQuery(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function textMatchesSearchQuery(query: string, ...values: Array<string | number | null | undefined>) {
  if (!query) {
    return true;
  }
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function normalizeWorkspaceStatusFilter(value: WorkspaceStatusFilter | null | undefined): WorkspaceStatusFilter {
  if (
    value === "all"
    || value === "DELAYED"
    || value === "NOT_STARTED"
    || value === "IN_PROGRESS"
    || value === "LAUNCHED"
    || value === "COMPLETED"
    || value === "CLOSED"
  ) {
    return value;
  }
  return "all";
}

function normalizeWorkspaceViewMode(value: WorkspaceViewMode | null | undefined): WorkspaceViewMode {
  return value === "list" ? "list" : "card";
}

function normalizeProjectPanelMode(value: ProjectPanelMode | null | undefined): ProjectPanelMode {
  return value === "value" ? "value" : "task";
}

function compareNames(left: { name: string }, right: { name: string }) {
  const leftToken = getSortToken(left.name);
  const rightToken = getSortToken(right.name);

  if (leftToken.initial !== rightToken.initial) {
    return englishCollator.compare(leftToken.initial, rightToken.initial);
  }

  if (leftToken.typeOrder !== rightToken.typeOrder) {
    return leftToken.typeOrder - rightToken.typeOrder;
  }

  if (leftToken.typeOrder === 0) {
    return englishCollator.compare(left.name, right.name);
  }

  return pinyinCollator.compare(left.name, right.name);
}

function buildDepartmentAndTeamMaps(orgNodes: OrgNodeSummary[]) {
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const departmentOrgNodeIdByTeamOrgNodeId = new Map<string, string>();
  const teamNameByOrgNodeId = new Map<string, string>();

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
    if (node.nodeType !== "TEAM") {
      continue;
    }

    teamNameByOrgNodeId.set(node.id, node.name);

    const departmentOrgNodeId = findNearestDepartmentOrgNodeIdForNode(node.id);
    if (departmentOrgNodeId) {
      departmentOrgNodeIdByTeamOrgNodeId.set(node.id, departmentOrgNodeId);
    }
  }

  return { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId, teamNameByOrgNodeId };
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

function getTeamOrgNodeIdForRecord(orgNodeId: string | null | undefined, orgNodeById: Map<string, OrgNodeSummary>) {
  if (!orgNodeId) {
    return null;
  }
  const node = orgNodeById.get(orgNodeId) ?? null;
  return node?.nodeType === "TEAM" ? node.id : null;
}

function getProjectManagementScopeWhere(currentUser: DataScopeInput, departmentOrgNodeId: string | null, scopedOrgNodeIds: string[] | null) {
  if (currentUser.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (departmentOrgNodeId) {
    return { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] }, deletedAt: null };
  }

  return { ownerId: currentUser.id, deletedAt: null };
}

function getProjectManagementUserWhere(currentUser: DataScopeInput, departmentOrgNodeId: string | null, scopedOrgNodeIds: string[] | null) {
  if (currentUser.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (departmentOrgNodeId) {
    return { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] }, isActive: true, deletedAt: null };
  }

  return { id: currentUser.id, isActive: true, deletedAt: null };
}

export async function getQuarterlyWorkData(currentUser: DataScopeInput, options?: QuarterlyWorkQueryOptions) {
  const departmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? null
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId ?? null);
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : departmentOrgNodeId
      ? await getDescendantOrgNodeIds(departmentOrgNodeId)
      : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);
  const ownerWhere = getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds);

  const [orgNodes, users, projects, works, productGoals, valueTracks] = await Promise.all([
    prisma.orgNode.findMany({
      where: scopedOrgNodeIds === null
        ? { nodeType: { in: ["DEPARTMENT", "TEAM"] } }
        : { id: { in: scopedOrgNodeIds }, nodeType: { in: ["DEPARTMENT", "TEAM"] } },
      orderBy: [{ nodeType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
    prisma.user.findMany({
      where: getProjectManagementUserWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
      orderBy: [{ orgNodeId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, orgNodeId: true },
    }),
    prisma.project.findMany({
      where: ownerWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        productGoalLinks: {
          orderBy: { sortOrder: "asc" },
          select: { productGoalId: true },
        },
      },
    }),
    prisma.quarterlyWork.findMany({
      where: ownerWhere,
      orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
    }),
    prisma.productGoal.findMany({
      where: ownerWhere,
      orderBy: [{ year: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        year: true,
        ownerId: true,
        orgNodeId: true,
        status: true,
        description: true,
        expectedOutcome: true,
        createdAt: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
    prisma.requirementValueTrack.findMany({
      where: {
        deletedAt: null,
        projectId: {
          in: (await prisma.project.findMany({
            where: { ...ownerWhere, status: "LAUNCHED" },
            select: { id: true },
          })).map((project) => project.id),
        },
      },
      orderBy: { trackedAt: "desc" },
    }),
  ]);

  const { orgNodeById, departmentOrgNodeIdByTeamOrgNodeId } = buildDepartmentAndTeamMaps(orgNodes);
  const departments = orgNodes
    .filter((node) => node.nodeType === "DEPARTMENT")
    .map((node) => ({
      orgNodeId: node.id,
      name: node.name,
    }));
  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM")
    .map((node) => ({
      orgNodeId: node.id,
      name: node.name,
      departmentOrgNodeId: departmentOrgNodeIdByTeamOrgNodeId.get(node.id) ?? null,
    }))
    .filter((team): team is { orgNodeId: string; name: string; departmentOrgNodeId: string } => Boolean(team.departmentOrgNodeId));

  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackQuarter = Math.floor(now.getMonth() / 3) + 1;
  const availableYears = Array.from(new Set(works.map((work) => work.year))).sort((a, b) => b - a);
  if (!availableYears.includes(fallbackYear)) availableYears.unshift(fallbackYear);
  const activeYear = availableYears.includes(options?.selectedYear ?? Number.NaN) ? options!.selectedYear! : fallbackYear;
  const availableQuarters = [1, 2, 3, 4];
  const allQuarterSelected = options?.selectedQuarter === "all";
  const selectedQuarter = typeof options?.selectedQuarter === "number" ? options.selectedQuarter : undefined;
  const activeQuarter = allQuarterSelected
    ? "all"
    : availableQuarters.includes(selectedQuarter ?? Number.NaN)
      ? selectedQuarter!
      : (availableQuarters.includes(fallbackQuarter) ? fallbackQuarter : availableQuarters[0]);
  const isWorkOverdue = (work: (typeof works)[number]) => formatTaskRemainLabel(work)?.startsWith("逾期") ?? false;
  const getWorkQuarterForFilter = (work: (typeof works)[number]) => getQuarterByMonth(work.startMonth ?? work.endMonth) ?? work.quarter;
  const getCompletedOverdueQuarter = (work: (typeof works)[number]) => getQuarterByDate(work.completedAt) ?? getWorkQuarterForFilter(work);

  const activeWorks = allQuarterSelected
    ? works.filter((work) => work.year === activeYear)
    : works.filter((work) => {
        if (work.year !== activeYear) return false;
        if (work.status === "COMPLETED" && isWorkOverdue(work)) {
          return getCompletedOverdueQuarter(work) === activeQuarter;
        }
        if (work.status !== "COMPLETED" && isWorkOverdue(work)) {
          return true;
        }
        return getWorkQuarterForFilter(work) === activeQuarter;
      });

  const workIds = activeWorks.map((work) => work.id);
  const allMonthlyPlans = workIds.length
    ? await prisma.monthlyWorkPlan.findMany({
        where: { quarterlyWorkId: { in: workIds } },
      })
    : [];

  const plansByWork = new Map<string, typeof allMonthlyPlans>();
  for (const plan of allMonthlyPlans) {
    const list = plansByWork.get(plan.quarterlyWorkId) ?? [];
    list.push(plan);
    plansByWork.set(plan.quarterlyWorkId, list);
  }

  const worksByProject = new Map<string, typeof works>();
  for (const work of works) {
    const list = worksByProject.get(work.projectId) ?? [];
    list.push(work);
    worksByProject.set(work.projectId, list);
  }

  const ownerMap = new Map(users.map((user) => [user.id, user.name]));
  const teamNameMap = new Map(teams.map((team) => [team.orgNodeId, team.name]));
  const scopedDepartments = currentUser.roleType === "ADMIN"
    ? departments
    : departments.filter((department) =>
        teams.some((team) => team.departmentOrgNodeId === department.orgNodeId)
        || users.some((user) => getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId) === department.orgNodeId)
      );
  const defaultDepartmentOrgNodeId = activeWorks.map((work) => getDepartmentOrgNodeIdForRecord(work.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId))
    .find((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId))
    ?? projects.map((project) => getDepartmentOrgNodeIdForRecord(project.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId))
      .find((departmentOrgNodeId): departmentOrgNodeId is string => Boolean(departmentOrgNodeId))
    ?? teams[0]?.departmentOrgNodeId
    ?? departments[0]?.orgNodeId
    ?? null;

  const toBoardItem = (work: (typeof activeWorks)[number]): BoardItem => {
    const plans = plansByWork.get(work.id) ?? [];
    const totalPlans = plans.length;
    const completedPlans = plans.filter((plan) => plan.status === "COMPLETED").length;
    const delayedPlans = plans.filter((plan) => plan.status === "DELAYED_COMPLETED").length;
    const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : undefined;
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(work.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(work.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);

    return {
      id: work.id,
      projectId: work.projectId,
      projectTitle: projects.find((project) => project.id === work.projectId)?.title ?? work.title,
      title: work.title,
      ownerId: work.ownerId,
      owner: ownerMap.get(work.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      startMonth: work.startMonth,
      endMonth: work.endMonth,
      endDate: work.endDate,
      status: work.status,
      description: work.description,
      taskDescription: work.taskDescription,
      expectedOutcome: work.expectedOutcome,
      taskResult: work.taskResult,
      executionSummary: work.executionSummary,
      workloadPersonDay: work.workloadPersonDay,
      needsDevelopment: work.needsDevelopment,
      remainingWeeksLabel: formatTaskRemainLabel(work),
      createdAt: work.createdAt,
      completedAt: work.completedAt,
      progress,
      delay: delayedPlans > 0 ? delayedPlans : undefined,
    };
  };

  const toProjectBoardItem = (project: (typeof projects)[number]): ProjectBoardItem => {
    const projectWorks = worksByProject.get(project.id) ?? [];
    const activeProjectWorks = projectWorks.filter((work) => work.status !== "COMPLETED" && work.status !== "CLOSED");
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(project.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(project.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
    const productGoalIds = project.productGoalLinks.map((link) => link.productGoalId);
    const productGoalTitles = productGoalIds
      .map((goalId) => productGoals.find((goal) => goal.id === goalId)?.title ?? null)
      .filter((title): title is string => Boolean(title));

    return {
      id: project.id,
      title: project.title,
      productGoalIds,
      productGoalTitle: productGoalTitles.length ? productGoalTitles.join("、") : null,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: project.status,
      startQuarter: project.startQuarter,
      endQuarter: project.endQuarter,
      remainingWeeksLabel: formatProjectRemainLabel(project),
      description: project.description,
      expectedOutcome: project.expectedOutcome,
      workloadPersonDay: project.workloadPersonDay,
      otherCost: project.otherCost,
      actualValue: project.actualValue,
      valueJudgement: project.valueJudgement,
      valueTrackStatus: normalizeValueTrackStatus(project.valueTrackStatus),
      workCount: projectWorks.length,
      activeQuarterCount: activeProjectWorks.length,
      createdAt: project.createdAt,
      launchedAt: project.launchedAt,
      completedAt: project.completedAt,
      updatedAt: project.updatedAt,
    };
  };

  const toProductGoalBoardItem = (goal: (typeof productGoals)[number]): ProductGoalBoardItem => {
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(goal.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(goal.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);

    return {
      id: goal.id,
      title: goal.title,
      ownerId: goal.ownerId,
      owner: ownerMap.get(goal.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: goal.status,
      year: goal.year,
      description: goal.description,
      expectedOutcome: goal.expectedOutcome,
      createdAt: goal.createdAt,
      completedAt: goal.completedAt,
      updatedAt: goal.updatedAt,
    };
  };

  const getProjectOrgAffiliation = (project: (typeof projects)[number]) => {
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(project.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(project.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
    return { teamOrgNodeId, departmentOrgNodeId };
  };

  const toValueOverviewItem = (project: (typeof projects)[number]): ValueOverviewItem => {
    const { teamOrgNodeId, departmentOrgNodeId } = getProjectOrgAffiliation(project);

    return {
      id: project.id,
      title: project.title,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      workloadPersonDay: project.workloadPersonDay,
      otherCost: project.otherCost,
      expectedOutcome: project.expectedOutcome,
      actualValue: project.actualValue,
      valueJudgement: project.valueJudgement,
      valueTrackStatus: normalizeValueTrackStatus(project.valueTrackStatus),
      status: project.status,
      launchedAt: project.launchedAt,
    };
  };

  const notStarted = activeWorks.filter((work) => work.status === "NOT_STARTED");
  const inProgress = activeWorks.filter((work) => work.status === "IN_PROGRESS" && !isWorkOverdue(work));
  const delayed = activeWorks.filter((work) => {
    if (!isWorkOverdue(work)) {
      return false;
    }
    if (work.status === "COMPLETED") {
      return true;
    }
    return work.status === "NOT_STARTED" || work.status === "IN_PROGRESS" || work.status === "CLOSED" || work.status === "DELAYED_COMPLETED";
  });
  const completed = activeWorks.filter((work) => work.status === "COMPLETED" && !isWorkOverdue(work));

  const columns: ColumnData[] = [
    { key: "not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: notStarted.map(toBoardItem) },
    { key: "in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: inProgress.map(toBoardItem) },
    { key: "delayed", title: "延期", tone: "warning", status: "DELAYED_COMPLETED", items: delayed.map(toBoardItem) },
    { key: "completed", title: "已完成", tone: "success", status: "COMPLETED", items: completed.map(toBoardItem) },
  ];

  // 以「已完成」为状态分割点判断是否延期，与项目逾期标签口径一致（已上线不算完成，按当前时间衡量）
  const isProjectOverdue = (project: (typeof projects)[number]) => formatProjectRemainLabel(project)?.startsWith("逾期") ?? false;
  const getProjectDoneOverdueQuarter = (project: (typeof projects)[number]) => getQuarterByDate(project.launchedAt ?? project.completedAt) ?? parseQuarterCode(project.endQuarter ?? project.startQuarter)?.quarter ?? null;
  const activePeriod: ActivePeriod = { year: activeYear, quarter: activeQuarter };
  const isLaunchedProjectInActivePeriod = (project: (typeof projects)[number]) =>
    isLaunchedProjectVisibleInPeriod(project, activePeriod, isProjectOverdue(project));
  const delayedProjects = projects.filter((project) => isProjectOverdue(project));

  const projectColumns: ProjectColumnData[] = [
    {
      key: "project_not_started",
      title: "未启动",
      tone: "default",
      status: "NOT_STARTED",
      items: projects.filter((project) => project.status === "NOT_STARTED" && !isProjectOverdue(project) && (allQuarterSelected ? projectRangeOverlapsYear(project, activeYear) : projectRangeHasQuarter(project, activeYear, activeQuarter as number))).map(toProjectBoardItem),
    },
    {
      key: "project_in_progress",
      title: "进行中",
      tone: "primary",
      status: "IN_PROGRESS",
      items: projects.filter((project) => project.status === "IN_PROGRESS" && !isProjectOverdue(project) && (allQuarterSelected ? projectRangeOverlapsYear(project, activeYear) : projectRangeHasQuarter(project, activeYear, activeQuarter as number))).map(toProjectBoardItem),
    },
    {
      key: "project_delayed",
      title: "延期",
      tone: "warning",
      status: "IN_PROGRESS",
      items: delayedProjects.filter((project) => {
        if (allQuarterSelected) {
          if (project.status === "LAUNCHED") {
            return (project.launchedAt?.getFullYear() ?? activeYear) === activeYear;
          }
          return project.status === "COMPLETED" ? (project.completedAt?.getFullYear() ?? activeYear) === activeYear : projectRangeOverlapsYear(project, activeYear);
        }
        if (project.status === "LAUNCHED" || project.status === "COMPLETED") {
          return getProjectDoneOverdueQuarter(project) === activeQuarter && ((project.launchedAt ?? project.completedAt)?.getFullYear() ?? activeYear) === activeYear;
        }
        return activeQuarter === Math.floor(now.getMonth() / 3) + 1;
      }).map(toProjectBoardItem),
    },
    {
      key: "project_launched",
      title: "已上线",
      tone: "success",
      status: "LAUNCHED",
      items: projects.filter(isLaunchedProjectInActivePeriod).map(toProjectBoardItem),
    },
  ];

  const productGoalColumns: ProductGoalColumnData[] = [
    { key: "goal_not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: productGoals.filter((goal) => goal.status === "NOT_STARTED").map(toProductGoalBoardItem) },
    { key: "goal_in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: productGoals.filter((goal) => goal.status === "IN_PROGRESS").map(toProductGoalBoardItem) },
    { key: "goal_completed", title: "已完成", tone: "success", status: "COMPLETED", items: productGoals.filter((goal) => goal.status === "COMPLETED").map(toProductGoalBoardItem) },
    { key: "goal_closed", title: "关闭", tone: "warning", status: "CLOSED", items: productGoals.filter((goal) => goal.status === "CLOSED").map(toProductGoalBoardItem) },
  ];

  const logScopeWhere = { ...ownerWhere, deletedAt: undefined };
  const [logScopeProjects, logScopeGoals, logScopeWorks] = await Promise.all([
    prisma.project.findMany({ where: logScopeWhere, select: { id: true, orgNodeId: true } }),
    prisma.productGoal.findMany({ where: logScopeWhere, select: { id: true, orgNodeId: true } }),
    prisma.quarterlyWork.findMany({ where: logScopeWhere, select: { id: true, orgNodeId: true } }),
  ]);
  const logAffiliationByTargetId = new Map<string, { teamOrgNodeId: string | null; departmentOrgNodeId: string | null }>();
  for (const row of [...logScopeProjects, ...logScopeGoals, ...logScopeWorks]) {
    logAffiliationByTargetId.set(row.id, {
      teamOrgNodeId: getTeamOrgNodeIdForRecord(row.orgNodeId, orgNodeById),
      departmentOrgNodeId: getDepartmentOrgNodeIdForRecord(row.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId),
    });
  }
  const operationLogRows = logAffiliationByTargetId.size
    ? await prisma.operationLog.findMany({
        where: { targetId: { in: [...logAffiliationByTargetId.keys()] } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      })
    : [];
  const operationLogs = operationLogRows.map((log) => ({
    id: log.id,
    targetType: log.targetType,
    targetId: log.targetId,
    targetTitle: log.targetTitle,
    action: log.action,
    operator: ownerMap.get(log.operatorId) ?? "—",
    remark: log.remark,
    createdAt: log.createdAt,
    teamOrgNodeId: logAffiliationByTargetId.get(log.targetId)?.teamOrgNodeId ?? null,
    departmentOrgNodeId: logAffiliationByTargetId.get(log.targetId)?.departmentOrgNodeId ?? null,
  }));

  const productGoalById = new Map(productGoals.map((goal) => [goal.id, goal]));
  const activeWorksByProject = new Map<string, typeof activeWorks>();
  for (const work of activeWorks) {
    const list = activeWorksByProject.get(work.projectId) ?? [];
    list.push(work);
    activeWorksByProject.set(work.projectId, list);
  }

  const valueTrackItems = valueTracks
    .filter((track) => isValueTrackVisibleInPeriod(track, activePeriod))
    .map((track): ValueTrackItem => {
      const project = projects.find((item) => item.id === track.projectId) ?? null;
      const { teamOrgNodeId, departmentOrgNodeId } = project
        ? getProjectOrgAffiliation(project)
        : { teamOrgNodeId: null, departmentOrgNodeId: null };

      return {
        id: track.id,
        projectId: track.projectId,
        projectTitle: project?.title ?? "—",
        ownerId: project?.ownerId ?? "",
        owner: project ? ownerMap.get(project.ownerId) ?? "—" : "—",
        departmentOrgNodeId,
        teamOrgNodeId,
        trackedAt: track.trackedAt,
        trackingResult: track.trackingResult,
        followUpOptimization: track.followUpOptimization,
        actualValue: project?.actualValue ?? null,
        valueJudgement: project?.valueJudgement ?? null,
        valueTrackStatus: normalizeValueTrackStatus(project?.valueTrackStatus),
      };
    });
  const valueTracksByProject = new Map<string, ValueTrackItem[]>();
  for (const track of valueTrackItems) {
    const list = valueTracksByProject.get(track.projectId) ?? [];
    list.push(track);
    valueTracksByProject.set(track.projectId, list);
  }

  const workspaceStatus = normalizeWorkspaceStatusFilter(options?.status);
  const workspaceView = normalizeWorkspaceViewMode(options?.view);
  const workspaceProjectPanel = normalizeProjectPanelMode(options?.projectPanel);
  const workspaceSearchQuery = normalizeSearchQuery(options?.query);
  const selectedGoalId = options?.goalId && options.goalId !== "all" ? options.goalId : null;
  const currentUserTeamOrgNodeId = getTeamOrgNodeIdForRecord(currentUser.orgNodeId, orgNodeById);
  const roleDefaultTeamId = (currentUser.roleType === "TEAM_LEADER" || currentUser.roleType === "MEMBER")
    ? currentUserTeamOrgNodeId
    : null;
  const roleDefaultOwnerId = currentUser.roleType === "MEMBER" ? currentUser.id : null;
  const rawTeamId = options?.teamId;
  const selectedTeamId = rawTeamId == null
    ? roleDefaultTeamId
    : rawTeamId === "all"
      ? null
      : rawTeamId;
  const selectedOrgNodeId = options?.orgNodeId?.trim() || null;
  const rawOwnerId = options?.ownerId;
  const selectedOwnerId = rawOwnerId == null
    ? roleDefaultOwnerId
    : rawOwnerId === "all"
      ? null
      : rawOwnerId.trim() || null;
  const selectedProjectId = options?.projectId?.trim() || null;

  const toProjectWorkspaceTaskItem = (work: (typeof activeWorks)[number]): ProjectWorkspaceTaskItem => ({
    ...toBoardItem(work),
    year: work.year,
    quarter: work.quarter,
    periodLabel: formatTaskPeriodLabel(work.startMonth, work.endMonth),
    isOverdue: isWorkOverdue(work),
  });

  const buildProjectWorkspaceItem = (project: (typeof projects)[number]): ProjectWorkspaceItem => {
    const base = toProjectBoardItem(project);
    const projectGoals = base.productGoalIds
      .map((goalId) => productGoalById.get(goalId) ?? null)
      .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal))
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        year: goal.year,
      }));
    const tasks = (activeWorksByProject.get(project.id) ?? [])
      .map(toProjectWorkspaceTaskItem)
      .sort((left, right) => {
        const leftEnd = left.endMonth ?? left.startMonth ?? 13;
        const rightEnd = right.endMonth ?? right.startMonth ?? 13;
        return leftEnd - rightEnd || right.createdAt.getTime() - left.createdAt.getTime();
      });
    const projectValueTracks = valueTracksByProject.get(project.id) ?? [];
    const latestValueTrack = projectValueTracks[0] ?? null;
    const isOverdue = isProjectOverdue(project);

    return {
      ...base,
      productGoals: projectGoals,
      statusFilterKey: isOverdue ? "DELAYED" : project.status,
      isOverdue,
      tasks,
      valueTracks: projectValueTracks.map((track) => ({
        ...track,
        periodLabel: `${track.trackedAt.getFullYear()}年Q${getQuarterByDate(track.trackedAt) ?? ""}`,
      })),
      valueTrackSummary: {
        status: normalizeValueTrackStatus(project.valueTrackStatus),
        judgement: project.valueJudgement,
        actualValue: project.actualValue,
        latestTrackedAt: latestValueTrack?.trackedAt ?? null,
        trackCount: projectValueTracks.length,
      },
    };
  };

  const projectMatchesActivePeriod = (project: (typeof projects)[number]) => {
    const hasActiveTasks = Boolean(activeWorksByProject.get(project.id)?.length);
    const hasActiveValueTracks = Boolean(valueTracksByProject.get(project.id)?.length);
    const projectPeriodMatched = allQuarterSelected
      ? projectRangeOverlapsYear(project, activeYear)
      : projectRangeHasQuarter(project, activeYear, activeQuarter as number);
    return projectPeriodMatched || hasActiveTasks || hasActiveValueTracks;
  };

  const projectWorkspaceSourceItems = projects
    .filter(projectMatchesActivePeriod)
    .map(buildProjectWorkspaceItem);

  const matchesProjectWorkspaceFilters = (
    item: ReturnType<typeof buildProjectWorkspaceItem>,
    options?: { ignoreStatus?: boolean; ignoreOwner?: boolean },
  ) => {
    const ignoreStatus = options?.ignoreStatus ?? false;
    const ignoreOwner = options?.ignoreOwner ?? false;
    if (selectedProjectId && item.id !== selectedProjectId) {
      return false;
    }
    if (selectedGoalId && !item.productGoalIds.includes(selectedGoalId)) {
      return false;
    }
    if (!ignoreStatus && workspaceStatus !== "all" && item.statusFilterKey !== workspaceStatus) {
      return false;
    }
    if (selectedTeamId && item.teamOrgNodeId !== selectedTeamId) {
      return false;
    }
    if (selectedOrgNodeId) {
      const belongsToSelectedOrg = item.departmentOrgNodeId === selectedOrgNodeId || item.teamOrgNodeId === selectedOrgNodeId;
      if (!belongsToSelectedOrg) {
        return false;
      }
    }
    if (!ignoreOwner && selectedOwnerId && item.ownerId !== selectedOwnerId) {
      return false;
    }
    if (!workspaceSearchQuery) {
      return true;
    }

    return textMatchesSearchQuery(
      workspaceSearchQuery,
      item.title,
      item.description,
      item.expectedOutcome,
      item.actualValue,
      item.valueJudgement,
      ...item.productGoals.flatMap((goal) => [goal.title, goal.year]),
      ...item.tasks.flatMap((task) => [task.title, task.description, task.taskDescription, task.expectedOutcome, task.taskResult, task.executionSummary]),
      ...item.valueTracks.flatMap((track) => [track.trackingResult, track.followUpOptimization, track.actualValue, track.valueJudgement]),
    );
  };

  const projectWorkspaceItems = projectWorkspaceSourceItems.filter((item) => matchesProjectWorkspaceFilters(item));
  const projectStatusScopeItems = projectWorkspaceSourceItems.filter((item) => matchesProjectWorkspaceFilters(item, { ignoreStatus: true }));
  const taskWorkspaceItems = projectWorkspaceSourceItems
    .filter((item) => matchesProjectWorkspaceFilters(item, { ignoreStatus: true, ignoreOwner: true }))
    .flatMap((project) => project.tasks.filter((task) => !selectedOwnerId || task.ownerId === selectedOwnerId));
  const countByStatusFilterKey = (key: Exclude<WorkspaceStatusFilter, "all">) =>
    projectStatusScopeItems.filter((item) => item.statusFilterKey === key).length;
  const projectStatusCounts = {
    all: projectStatusScopeItems.length,
    IN_PROGRESS: countByStatusFilterKey("IN_PROGRESS"),
    DELAYED: countByStatusFilterKey("DELAYED"),
    LAUNCHED: countByStatusFilterKey("LAUNCHED"),
    NOT_STARTED: countByStatusFilterKey("NOT_STARTED"),
    COMPLETED: countByStatusFilterKey("COMPLETED"),
    CLOSED: countByStatusFilterKey("CLOSED"),
  };

  const goalNavigationScopeItems = projectWorkspaceSourceItems.filter((item) => {
    if (workspaceStatus !== "all" && item.statusFilterKey !== workspaceStatus) {
      return false;
    }
    if (selectedTeamId && item.teamOrgNodeId !== selectedTeamId) {
      return false;
    }
    if (selectedOrgNodeId) {
      const belongsToSelectedOrg = item.departmentOrgNodeId === selectedOrgNodeId || item.teamOrgNodeId === selectedOrgNodeId;
      if (!belongsToSelectedOrg) {
        return false;
      }
    }
    if (selectedOwnerId && item.ownerId !== selectedOwnerId) {
      return false;
    }
    if (!workspaceSearchQuery) {
      return true;
    }
    return projectWorkspaceItems.some((itemInSearchResult) => itemInSearchResult.id === item.id);
  });

  const countGoalProjects = (goalId: string) => goalNavigationScopeItems.filter((item) => item.productGoalIds.includes(goalId));
  const sumTaskCount = (items: ProjectWorkspaceItem[]) => items.reduce((sum, item) => sum + item.tasks.length, 0);
  const toGoalNavigationItem = (goal: (typeof productGoals)[number]): GoalNavigationItem => {
    const goalProjects = countGoalProjects(goal.id);
    const teamOrgNodeId = getTeamOrgNodeIdForRecord(goal.orgNodeId, orgNodeById);
    const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(goal.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);

    return {
      id: goal.id,
      title: goal.title,
      year: goal.year,
      ownerId: goal.ownerId,
      owner: ownerMap.get(goal.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: goal.status,
      description: goal.description,
      expectedOutcome: goal.expectedOutcome,
      projectCount: goalProjects.length,
      taskCount: sumTaskCount(goalProjects),
      isAll: false,
    };
  };
  const visibleGoalIds = new Set(goalNavigationScopeItems.flatMap((item) => item.productGoalIds));
  const goalNavigationItems: GoalNavigationItem[] = [
    {
      id: "all",
      title: "全部",
      year: null,
      ownerId: null,
      owner: null,
      departmentOrgNodeId: null,
      teamOrgNodeId: null,
      teamName: null,
      status: "all",
      description: null,
      expectedOutcome: null,
      projectCount: goalNavigationScopeItems.length,
      taskCount: sumTaskCount(goalNavigationScopeItems),
      isAll: true,
    },
    ...productGoals
      .filter((goal) => goal.year === activeYear || visibleGoalIds.has(goal.id))
      .map(toGoalNavigationItem),
  ];

  const workspaceSummary = {
    totalProjectCount: projectWorkspaceSourceItems.length,
    filteredProjectCount: projectWorkspaceItems.length,
    totalTaskCount: sumTaskCount(projectWorkspaceSourceItems),
    filteredTaskCount: sumTaskCount(projectWorkspaceItems),
    totalValueTrackCount: projectWorkspaceSourceItems.reduce((sum, item) => sum + item.valueTracks.length, 0),
    filteredValueTrackCount: projectWorkspaceItems.reduce((sum, item) => sum + item.valueTracks.length, 0),
    overdueProjectCount: projectWorkspaceSourceItems.filter((item) => item.isOverdue).length,
    overdueTaskCount: projectWorkspaceSourceItems.reduce((sum, item) => sum + item.tasks.filter((task) => task.isOverdue).length, 0),
    projectStatusCounts,
  };

  const [
    canManageProductGoalPermission,
    canManageProjectAndValueTrackingPermission,
    canManageProductTaskPermission,
  ] = await Promise.all([
    canManageProductGoal(currentUser),
    canManageProjectAndValueTracking(currentUser),
    canManageProductTask(currentUser),
  ]);

  return {
    year: activeYear,
    quarter: activeQuarter,
    availableYears,
    availableQuarters,
    productGoalColumns,
    projectColumns,
    columns,
    totalCount: activeWorks.length,
    projectTotalCount: projects.length,
    operationLogs,
    canCreate: users.length > 0,
    permissions: {
      canManageProductGoal: canManageProductGoalPermission,
      canManageProjectAndValueTracking: canManageProjectAndValueTrackingPermission,
      canManageProductTask: canManageProductTaskPermission,
    },
    currentUserId: currentUser.id,
    isSystemAdmin: currentUser.roleType === "ADMIN",
    departments: scopedDepartments.sort(compareNames).map((department) => ({
      id: department.orgNodeId,
      name: department.name,
    })),
    defaultDepartmentOrgNodeId,
    teamOptions: [...teams].sort(compareNames).map((team) => ({
      id: team.orgNodeId,
      name: team.name,
      departmentOrgNodeId: team.departmentOrgNodeId,
    })),
    memberOptions: users.map((user) => {
      const teamOrgNodeId = getTeamOrgNodeIdForRecord(user.orgNodeId, orgNodeById);
      const departmentOrgNodeId = getDepartmentOrgNodeIdForRecord(user.orgNodeId, orgNodeById, departmentOrgNodeIdByTeamOrgNodeId);
      return {
        id: user.id,
        name: user.name,
        teamOrgNodeId,
        teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
        departmentOrgNodeId,
      };
    }),
    valueOverviewItems: projects
      .filter(isLaunchedProjectInActivePeriod)
      .sort((left, right) => (right.launchedAt?.getTime() ?? 0) - (left.launchedAt?.getTime() ?? 0))
      .map(toValueOverviewItem),
    valueTrackItems,
    goalNavigationItems,
    projectWorkspaceItems,
    taskWorkspaceItems,
    workspaceSummary,
    workspaceFilters: {
      goalId: selectedGoalId ?? "all",
      view: workspaceView,
      projectPanel: workspaceProjectPanel,
      status: workspaceStatus,
      orgNodeId: selectedOrgNodeId,
      teamId: selectedTeamId ?? "all",
      ownerId: selectedOwnerId,
      projectId: selectedProjectId,
      query: workspaceSearchQuery,
    },
    productGoalOptions: productGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      year: goal.year,
    })),
    launchedProjectOptions: projects
      .filter((project) => project.status === "LAUNCHED")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((project) => ({
        id: project.id,
        title: project.title,
        launchedAt: project.launchedAt,
        expectedOutcome: project.expectedOutcome,
        workloadPersonDay: project.workloadPersonDay,
        otherCost: project.otherCost,
        actualValue: project.actualValue,
        valueJudgement: project.valueJudgement,
        valueTrackStatus: normalizeValueTrackStatus(project.valueTrackStatus),
      })),
    projectOptions: projects
      .filter((project) => project.status !== "COMPLETED" && project.status !== "CLOSED")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((project) => ({
        id: project.id,
        title: project.title,
        ownerId: project.ownerId,
        expectedOutcome: project.expectedOutcome,
        status: project.status,
      })),
  };
}
