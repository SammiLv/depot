import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { getOwnerWhereByScope, getUserWhereByScope } from "@/server/permissions/data-scope";
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
  departmentId: string | null;
  teamId: string | null;
  teamName: string | null;
  status: WorkStatus;
  description: string | null;
  expectedOutcome: string | null;
  weeks: number;
  progress?: number;
  delay?: number;
};

type ProjectBoardItem = {
  id: string;
  title: string;
  ownerId: string;
  owner: string;
  departmentId: string | null;
  teamId: string | null;
  teamName: string | null;
  status: ProjectStatus;
  startQuarter: string | null;
  endQuarter: string | null;
  description: string | null;
  expectedOutcome: string | null;
  workCount: number;
  activeQuarterCount: number;
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

function getDepartmentIdFromOrgNodeId(orgNodeId: string | null | undefined) {
  return orgNodeId?.startsWith("org_dept_") ? orgNodeId.slice("org_dept_".length) : null;
}

function getTeamIdFromOrgNodeId(orgNodeId: string | null | undefined) {
  return orgNodeId?.startsWith("org_team_") ? orgNodeId.slice("org_team_".length) : null;
}

function buildDepartmentAndTeamMaps(orgNodes: OrgNodeSummary[]) {
  const orgNodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const departmentByTeamId = new Map<string, string>();
  const teamNameById = new Map<string, string>();

  for (const node of orgNodes) {
    if (node.nodeType !== "TEAM") {
      continue;
    }

    const teamId = getTeamIdFromOrgNodeId(node.id);
    if (!teamId) {
      continue;
    }

    teamNameById.set(teamId, node.name);

    const parentNode = node.parentId ? orgNodeById.get(node.parentId) ?? null : null;
    const departmentId = parentNode?.nodeType === "DEPARTMENT"
      ? getDepartmentIdFromOrgNodeId(parentNode.id)
      : null;

    if (departmentId) {
      departmentByTeamId.set(teamId, departmentId);
    }
  }

  return { departmentByTeamId, teamNameById };
}

function getDepartmentIdForRecord(orgNodeId: string | null | undefined, departmentByTeamId: Map<string, string>) {
  const directDepartmentId = getDepartmentIdFromOrgNodeId(orgNodeId);
  if (directDepartmentId) {
    return directDepartmentId;
  }

  const directTeamId = getTeamIdFromOrgNodeId(orgNodeId);
  if (directTeamId) {
    return departmentByTeamId.get(directTeamId) ?? null;
  }

  return null;
}

function getTeamIdForRecord(orgNodeId: string | null | undefined) {
  return getTeamIdFromOrgNodeId(orgNodeId) ?? null;
}

export async function getQuarterlyWorkData(currentUser: DataScopeInput) {
  const ownerWhere = await getOwnerWhereByScope(currentUser);
  const scopedOrgNodeIds = currentUser.roleType === "ADMIN"
    ? null
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);

  const [orgNodes, users, projects, works] = await Promise.all([
    prisma.orgNode.findMany({
      where: scopedOrgNodeIds === null
        ? { nodeType: { in: ["DEPARTMENT", "TEAM"] } }
        : { id: { in: scopedOrgNodeIds }, nodeType: { in: ["DEPARTMENT", "TEAM"] } },
      orderBy: [{ nodeType: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nodeType: true, parentId: true },
    }),
    prisma.user.findMany({
      where: { ...(await getUserWhereByScope(currentUser)), isActive: true },
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
  ]);

  const { departmentByTeamId, teamNameById } = buildDepartmentAndTeamMaps(orgNodes);
  const departments = orgNodes
    .filter((node) => node.nodeType === "DEPARTMENT")
    .map((node) => ({
      id: getDepartmentIdFromOrgNodeId(node.id) ?? node.id,
      name: node.name,
    }));
  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM")
    .map((node) => ({
      id: getTeamIdFromOrgNodeId(node.id) ?? node.id,
      name: node.name,
      departmentId: node.parentId ? getDepartmentIdFromOrgNodeId(node.parentId) : null,
    }));

  const now = new Date();
  const activeYear = works[0]?.year ?? now.getFullYear();
  const activeQuarter = works[0]?.quarter ?? Math.floor(now.getMonth() / 3) + 1;
  const activeWorks = works.filter((work) => work.year === activeYear && work.quarter === activeQuarter);

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
  const teamNameMap = new Map(teams.map((team) => [team.id, team.name]));
  const scopedDepartments = departments.filter((department) =>
    teams.some((team) => team.departmentId === department.id)
    || users.some((user) => getDepartmentIdForRecord(user.orgNodeId, departmentByTeamId) === department.id)
  );
  const defaultDepartmentId = activeWorks.map((work) => getDepartmentIdForRecord(work.orgNodeId, departmentByTeamId))
    .find((departmentId): departmentId is string => Boolean(departmentId))
    ?? projects.map((project) => getDepartmentIdForRecord(project.orgNodeId, departmentByTeamId))
      .find((departmentId): departmentId is string => Boolean(departmentId))
    ?? teams[0]?.departmentId
    ?? departments[0]?.id
    ?? null;

  const toBoardItem = (work: (typeof activeWorks)[number]): BoardItem => {
    const plans = plansByWork.get(work.id) ?? [];
    const totalPlans = plans.length;
    const completedPlans = plans.filter((plan) => plan.status === "COMPLETED").length;
    const delayedPlans = plans.filter((plan) => plan.status === "DELAYED_COMPLETED").length;
    const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : undefined;
    const teamId = getTeamIdForRecord(work.orgNodeId);
    const departmentId = getDepartmentIdForRecord(work.orgNodeId, departmentByTeamId);

    return {
      id: work.id,
      projectId: work.projectId,
      projectTitle: projects.find((project) => project.id === work.projectId)?.title ?? work.title,
      title: work.title,
      ownerId: work.ownerId,
      owner: ownerMap.get(work.ownerId) ?? "—",
      departmentId,
      teamId,
      teamName: teamId ? teamNameMap.get(teamId) ?? null : null,
      status: work.status,
      description: work.description,
      expectedOutcome: work.expectedOutcome,
      weeks: totalPlans,
      progress,
      delay: delayedPlans > 0 ? delayedPlans : undefined,
    };
  };

  const toProjectBoardItem = (project: (typeof projects)[number]): ProjectBoardItem => {
    const projectWorks = worksByProject.get(project.id) ?? [];
    const activeProjectWorks = projectWorks.filter((work) => work.status !== "COMPLETED" && work.status !== "CLOSED");
    const teamId = getTeamIdForRecord(project.orgNodeId);
    const departmentId = getDepartmentIdForRecord(project.orgNodeId, departmentByTeamId);

    return {
      id: project.id,
      title: project.title,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      departmentId,
      teamId,
      teamName: teamId ? teamNameMap.get(teamId) ?? null : null,
      status: project.status,
      startQuarter: project.startQuarter,
      endQuarter: project.endQuarter,
      description: project.description,
      expectedOutcome: project.expectedOutcome,
      workCount: projectWorks.length,
      activeQuarterCount: activeProjectWorks.length,
      completedAt: project.completedAt,
      updatedAt: project.updatedAt,
    };
  };

  const notStarted = activeWorks.filter((work) => work.status === "NOT_STARTED");
  const inProgress = activeWorks.filter((work) => work.status === "IN_PROGRESS");
  const delayed = activeWorks.filter((work) => work.status === "DELAYED_COMPLETED");
  const completed = activeWorks.filter((work) => work.status === "COMPLETED");

  const columns: ColumnData[] = [
    { key: "not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: notStarted.map(toBoardItem) },
    { key: "in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: inProgress.map(toBoardItem) },
    { key: "delayed", title: "延期", tone: "warning", status: "DELAYED_COMPLETED", items: delayed.map(toBoardItem) },
    { key: "completed", title: "已完成", tone: "success", status: "COMPLETED", items: completed.map(toBoardItem) },
  ];

  const projectColumns: ProjectColumnData[] = [
    { key: "project_not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: projects.filter((project) => project.status === "NOT_STARTED").map(toProjectBoardItem) },
    { key: "project_in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: projects.filter((project) => project.status === "IN_PROGRESS").map(toProjectBoardItem) },
    { key: "project_completed", title: "已完成", tone: "success", status: "COMPLETED", items: projects.filter((project) => project.status === "COMPLETED").map(toProjectBoardItem) },
    { key: "project_closed", title: "关闭", tone: "warning", status: "CLOSED", items: projects.filter((project) => project.status === "CLOSED").map(toProjectBoardItem) },
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
    projectColumns,
    columns,
    totalCount: activeWorks.length,
    projectTotalCount: projects.length,
    updateReminders,
    canCreate: users.length > 0,
    departments: scopedDepartments.sort(compareNames).map((department) => ({
      id: department.id,
      name: department.name,
    })),
    defaultDepartmentId,
    teamOptions: [...teams].sort(compareNames).map((team) => ({
      id: team.id,
      name: team.name,
      departmentId: team.departmentId,
    })),
    memberOptions: users.map((user) => {
      const teamId = getTeamIdForRecord(user.orgNodeId);
      return {
        id: user.id,
        name: user.name,
        teamId,
        teamName: teamId ? teamNameMap.get(teamId) ?? null : null,
      };
    }),
    projectOptions: projects
      .filter((project) => project.status !== "COMPLETED" && project.status !== "CLOSED")
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((project) => ({
        id: project.id,
        title: project.title,
        ownerId: project.ownerId,
        status: project.status,
      })),
  };
}
