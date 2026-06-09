import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope, getTeamWhereByScope, getUserWhereByScope } from "@/server/permissions/data-scope";
import type { ProjectStatus, RoleType, WorkStatus } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
};

type BoardItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  ownerId: string;
  owner: string;
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
  teamId: string | null;
  teamName: string | null;
  status: ProjectStatus;
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

export async function getQuarterlyWorkData(currentUser: DataScopeInput) {
  const ownerWhere = getOwnerWhereByScope(currentUser);

  const [teams, users, projects, works] = await Promise.all([
    prisma.team.findMany({
      where: getTeamWhereByScope(currentUser),
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true },
    }),
    prisma.user.findMany({
      where: { ...getUserWhereByScope(currentUser), isActive: true },
      orderBy: [{ teamId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, departmentId: true, teamId: true },
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

  const toBoardItem = (work: (typeof activeWorks)[number]): BoardItem => {
    const plans = plansByWork.get(work.id) ?? [];
    const totalPlans = plans.length;
    const completedPlans = plans.filter((plan) => plan.status === "COMPLETED").length;
    const delayedPlans = plans.filter((plan) => plan.status === "DELAYED_COMPLETED").length;
    const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : undefined;

    return {
      id: work.id,
      projectId: work.projectId,
      projectTitle: projects.find((project) => project.id === work.projectId)?.title ?? work.title,
      title: work.title,
      ownerId: work.ownerId,
      owner: ownerMap.get(work.ownerId) ?? "—",
      teamId: work.teamId,
      teamName: work.teamId ? teamNameMap.get(work.teamId) ?? null : null,
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

    return {
      id: project.id,
      title: project.title,
      ownerId: project.ownerId,
      owner: ownerMap.get(project.ownerId) ?? "—",
      teamId: project.teamId,
      teamName: project.teamId ? teamNameMap.get(project.teamId) ?? null : null,
      status: project.status,
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
    teamOptions: [...teams].sort(compareNames).map((team) => ({
      id: team.id,
      name: team.name,
    })),
    memberOptions: users.map((user) => ({
      id: user.id,
      name: user.name,
      teamId: user.teamId,
      teamName: user.teamId ? teamNameMap.get(user.teamId) ?? null : null,
    })),
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
