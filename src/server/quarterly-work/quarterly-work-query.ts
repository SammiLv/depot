import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import type { OrgNodeType, ProjectStatus, RoleType, WorkStatus } from "@prisma/client";

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
  status: WorkStatus;
  description: string | null;
  expectedOutcome: string | null;
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
  productGoalId: string | null;
  productGoalTitle: string | null;
  ownerId: string;
  owner: string;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  teamName: string | null;
  status: ProjectStatus;
  startQuarter: string | null;
  endQuarter: string | null;
  description: string | null;
  expectedOutcome: string | null;
  workloadPersonDay: number | null;
  otherCost: string | null;
  actualValue: string | null;
  valueJudgement: string | null;
  workCount: number;
  activeQuarterCount: number;
  createdAt: Date;
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
  return new Date(parsed.year, parsed.quarter * 3, 0);
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

function formatRemainingWeeksLabel(year: number, endMonth: number | null | undefined) {
  if (!endMonth) {
    return null;
  }

  const now = new Date();
  const planEndDate = new Date(year, endMonth, 0);
  const diffDays = (planEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const diffWeeks = Math.abs(diffDays) / 7;
  const roundedWeeks = Math.round(diffWeeks * 10) / 10;

  if (diffDays >= 0) {
    return `还剩${roundedWeeks}周`;
  }

  return `超期${roundedWeeks}周`;
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

export async function getQuarterlyWorkData(currentUser: DataScopeInput, options?: { selectedYear?: number; selectedQuarter?: number | "all" }) {
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
            where: { ...ownerWhere, status: "COMPLETED" },
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
  const fallbackYear = works[0]?.year ?? now.getFullYear();
  const fallbackQuarter = works[0]?.quarter ?? Math.floor(now.getMonth() / 3) + 1;
  const availableYears = Array.from(new Set(works.map((work) => work.year))).sort((a, b) => b - a);
  if (!availableYears.includes(fallbackYear)) availableYears.unshift(fallbackYear);
  const activeYear = availableYears.includes(options?.selectedYear ?? Number.NaN) ? options!.selectedYear! : fallbackYear;
  const quarterSource = works.filter((work) => work.year === activeYear).map((work) => work.quarter);
  const availableQuarters = [1, 2, 3, 4];
  const allQuarterSelected = options?.selectedQuarter === "all";
  const selectedQuarter = typeof options?.selectedQuarter === "number" ? options.selectedQuarter : undefined;
  const activeQuarter = allQuarterSelected
    ? "all"
    : availableQuarters.includes(selectedQuarter ?? Number.NaN)
      ? selectedQuarter!
      : (availableQuarters.includes(fallbackQuarter) ? fallbackQuarter : availableQuarters[0]);
  const isWorkOverdue = (work: (typeof works)[number]) => formatRemainingWeeksLabel(work.year, work.endMonth)?.startsWith("超期") ?? false;
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
      status: work.status,
      description: work.description,
      expectedOutcome: work.expectedOutcome,
      remainingWeeksLabel: formatRemainingWeeksLabel(work.year, work.endMonth),
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

    return {
      id: project.id,
      title: project.title,
      productGoalId: project.productGoalId,
      productGoalTitle: project.productGoalId ? productGoals.find((goal) => goal.id === project.productGoalId)?.title ?? null : null,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      departmentOrgNodeId,
      teamOrgNodeId,
      teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      status: project.status,
      startQuarter: project.startQuarter,
      endQuarter: project.endQuarter,
      description: project.description,
      expectedOutcome: project.expectedOutcome,
      workloadPersonDay: project.workloadPersonDay,
      otherCost: project.otherCost,
      actualValue: project.actualValue,
      valueJudgement: project.valueJudgement,
      workCount: projectWorks.length,
      activeQuarterCount: activeProjectWorks.length,
      createdAt: project.createdAt,
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

  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  const isProjectOverdue = (project: (typeof projects)[number]) => {
    const endDate = getQuarterEndDate(project.endQuarter ?? project.startQuarter);
    if (!endDate) {
      return false;
    }
    if (project.status === "COMPLETED") {
      return project.completedAt ? project.completedAt.getTime() > endDate.getTime() : false;
    }
    return now.getTime() > endDate.getTime();
  };
  const getProjectCompletedOverdueQuarter = (project: (typeof projects)[number]) => getQuarterByDate(project.completedAt) ?? parseQuarterCode(project.endQuarter ?? project.startQuarter)?.quarter ?? null;
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
          return project.status === "COMPLETED" ? (project.completedAt?.getFullYear() ?? activeYear) === activeYear : projectRangeOverlapsYear(project, activeYear);
        }
        if (project.status === "COMPLETED") {
          return getProjectCompletedOverdueQuarter(project) === activeQuarter && (project.completedAt?.getFullYear() ?? activeYear) === activeYear;
        }
        return activeQuarter === Math.floor(now.getMonth() / 3) + 1;
      }).map(toProjectBoardItem),
    },
    {
      key: "project_completed",
      title: "已完成",
      tone: "success",
      status: "COMPLETED",
      items: projects.filter((project) => project.status === "COMPLETED" && !isProjectOverdue(project) && (allQuarterSelected ? (project.completedAt?.getFullYear() ?? activeYear) === activeYear : getQuarterByDate(project.completedAt) === activeQuarter && (project.completedAt?.getFullYear() ?? activeYear) === activeYear)).map(toProjectBoardItem),
    },
  ];

  const productGoalColumns: ProductGoalColumnData[] = [
    { key: "goal_not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: productGoals.filter((goal) => goal.status === "NOT_STARTED").map(toProductGoalBoardItem) },
    { key: "goal_in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: productGoals.filter((goal) => goal.status === "IN_PROGRESS").map(toProductGoalBoardItem) },
    { key: "goal_completed", title: "已完成", tone: "success", status: "COMPLETED", items: productGoals.filter((goal) => goal.status === "COMPLETED").map(toProductGoalBoardItem) },
    { key: "goal_closed", title: "关闭", tone: "warning", status: "CLOSED", items: productGoals.filter((goal) => goal.status === "CLOSED").map(toProductGoalBoardItem) },
  ];

  const needsUpdate = [...inProgress, ...delayed];
  const updateReminders = needsUpdate.map((work) => {
    const plans = plansByWork.get(work.id) ?? [];
    const allUpdated = plans.every((plan) => plan.status !== "NOT_STARTED");
    return {
      id: work.id,
      task: work.title,
      who: ownerMap.get(work.ownerId) ?? "—",
      status: allUpdated ? "已更新" as const : "待更新" as const,
      tone: allUpdated ? "success" as const : "warning" as const,
    };
  });

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
    updateReminders,
    canCreate: users.length > 0,
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
      return {
        id: user.id,
        name: user.name,
        teamOrgNodeId,
        teamName: teamOrgNodeId ? teamNameMap.get(teamOrgNodeId) ?? null : null,
      };
    }),
    valueTrackItems: valueTracks.map((track) => {
      const project = projects.find((item) => item.id === track.projectId) ?? null;
      return {
        id: track.id,
        projectId: track.projectId,
        projectTitle: project?.title ?? "—",
        owner: project ? ownerMap.get(project.ownerId) ?? "—" : "—",
        trackedAt: track.trackedAt,
        trackingResult: track.trackingResult,
        followUpOptimization: track.followUpOptimization,
        actualValue: project?.actualValue ?? null,
        valueJudgement: project?.valueJudgement ?? "观测中",
      };
    }),
    productGoalOptions: productGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      year: goal.year,
    })),
    completedProjectOptions: projects
      .filter((project) => project.status === "COMPLETED")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((project) => ({
        id: project.id,
        title: project.title,
        completedAt: project.completedAt,
        expectedOutcome: project.expectedOutcome,
        workloadPersonDay: project.workloadPersonDay,
        otherCost: project.otherCost,
        actualValue: project.actualValue,
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
