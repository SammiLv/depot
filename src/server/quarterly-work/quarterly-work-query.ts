import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope, getTeamWhereByScope, getUserWhereByScope } from "@/server/permissions/data-scope";
import type { RoleType, WorkStatus } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
};

type BoardItem = {
  id: string;
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

type ColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  status: WorkStatus;
  items: BoardItem[];
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

function compareTeamNames(left: { name: string }, right: { name: string }) {
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
  const where = getOwnerWhereByScope(currentUser);

  const works = await prisma.quarterlyWork.findMany({
    where,
    orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
  });

  const now = new Date();
  const activeYear = works[0]?.year ?? now.getFullYear();
  const activeQuarter = works[0]?.quarter ?? Math.floor(now.getMonth() / 3) + 1;
  const activeWorks = works.filter((work) => work.year === activeYear && work.quarter === activeQuarter);

  const [teams, users] = await Promise.all([
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
  ]);

  const workIds = activeWorks.map((w) => w.id);
  const allMonthlyPlans = workIds.length
    ? await prisma.monthlyWorkPlan.findMany({
        where: { quarterlyWorkId: { in: workIds } },
      })
    : [];

  const plansByWork = new Map<string, typeof allMonthlyPlans>();
  for (const mp of allMonthlyPlans) {
    const list = plansByWork.get(mp.quarterlyWorkId) ?? [];
    list.push(mp);
    plansByWork.set(mp.quarterlyWorkId, list);
  }

  const ownerMap = new Map(users.map((o) => [o.id, o.name]));

  const toBoardItem = (w: (typeof activeWorks)[number]): BoardItem => {
    const plans = plansByWork.get(w.id) ?? [];
    const totalPlans = plans.length;
    const completedPlans = plans.filter((p) => p.status === "COMPLETED").length;
    const delayedPlans = plans.filter((p) => p.status === "DELAYED_COMPLETED").length;
    const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : undefined;

    return {
      id: w.id,
      title: w.title,
      ownerId: w.ownerId,
      owner: ownerMap.get(w.ownerId) ?? "—",
      teamId: w.teamId,
      teamName: teams.find((team) => team.id === w.teamId)?.name ?? null,
      status: w.status,
      description: w.description,
      expectedOutcome: w.expectedOutcome,
      weeks: totalPlans,
      progress,
      delay: delayedPlans > 0 ? delayedPlans : undefined,
    };
  };

  const notStarted = activeWorks.filter((w) => w.status === "NOT_STARTED");
  const inProgress = activeWorks.filter((w) => w.status === "IN_PROGRESS");
  const delayed = activeWorks.filter((w) => w.status === "DELAYED_COMPLETED");
  const completed = activeWorks.filter((w) => w.status === "COMPLETED");

  const columns: ColumnData[] = [
    { key: "not_started", title: "未启动", tone: "default", status: "NOT_STARTED", items: notStarted.map(toBoardItem) },
    { key: "in_progress", title: "进行中", tone: "primary", status: "IN_PROGRESS", items: inProgress.map(toBoardItem) },
    { key: "delayed", title: "延期", tone: "warning", status: "DELAYED_COMPLETED", items: delayed.map(toBoardItem) },
    { key: "completed", title: "已完成", tone: "success", status: "COMPLETED", items: completed.map(toBoardItem) },
  ];

  const needsUpdate = [...inProgress, ...delayed];
  const updateReminders = needsUpdate.map((w) => {
    const plans = plansByWork.get(w.id) ?? [];
    const allUpdated = plans.every((p) => p.status !== "NOT_STARTED");
    return {
      id: w.id,
      task: w.title,
      who: ownerMap.get(w.ownerId) ?? "—",
      status: allUpdated ? "已更新" as const : "待更新" as const,
      tone: allUpdated ? "success" as const : "warning" as const,
    };
  });

  return {
    year: activeYear,
    quarter: activeQuarter,
    columns,
    totalCount: activeWorks.length,
    updateReminders,
    canCreate: users.length > 0,
    teamOptions: [...teams].sort(compareTeamNames).map((team) => ({
      id: team.id,
      name: team.name,
    })),
    memberOptions: users.map((user) => ({
      id: user.id,
      name: user.name,
      teamId: user.teamId,
      teamName: teams.find((team) => team.id === user.teamId)?.name ?? null,
    })),
  };
}
