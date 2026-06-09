import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope } from "@/server/permissions/data-scope";
import type { RoleType } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
};

type BoardItem = {
  id: string;
  title: string;
  owner: string;
  weeks: number;
  progress?: number;
  delay?: number;
};

type ColumnData = {
  key: string;
  title: string;
  tone: "default" | "primary" | "warning" | "success";
  items: BoardItem[];
};

export async function getQuarterlyWorkData(currentUser: DataScopeInput) {
  const where = getOwnerWhereByScope(currentUser);

  const works = await prisma.quarterlyWork.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Fetch monthly plans for progress calculation
  const workIds = works.map((w) => w.id);
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

  // Resolve owner names
  const ownerIds = [...new Set(works.map((w) => w.ownerId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true },
  });
  const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

  // Map to board items with progress
  const toBoardItem = (w: (typeof works)[number]): BoardItem => {
    const plans = plansByWork.get(w.id) ?? [];
    const totalPlans = plans.length;
    const completedPlans = plans.filter((p) => p.status === "COMPLETED").length;
    const delayedPlans = plans.filter((p) => p.status === "DELAYED_COMPLETED").length;
    const progress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : undefined;

    return {
      id: w.id,
      title: w.title,
      owner: ownerMap.get(w.ownerId) ?? "—",
      weeks: totalPlans,
      progress,
      delay: delayedPlans > 0 ? delayedPlans : undefined,
    };
  };

  // Group by status for kanban
  const notStarted = works.filter((w) => w.status === "NOT_STARTED");
  const inProgress = works.filter((w) => w.status === "IN_PROGRESS");
  const delayed = works.filter((w) => w.status === "DELAYED_COMPLETED");
  const completed = works.filter((w) => w.status === "COMPLETED");

  const columns: ColumnData[] = [
    { key: "not_started", title: "未启动", tone: "default", items: notStarted.map(toBoardItem) },
    { key: "in_progress", title: "进行中", tone: "primary", items: inProgress.map(toBoardItem) },
    { key: "delayed", title: "延期", tone: "warning", items: delayed.map(toBoardItem) },
    { key: "completed", title: "已完成", tone: "success", items: completed.map(toBoardItem) },
  ];

  // Weekly update reminder: works that are in progress or delayed
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
    columns,
    totalCount: works.length,
    updateReminders,
  };
}
