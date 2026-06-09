import { prisma } from "@/server/db/prisma";
import { getKpiWhereByScope } from "@/server/permissions/data-scope";
import type { RoleType } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
};

const stageLabels: Record<string, string> = {
  DRAFT: "待制定",
  PENDING_LEADER: "待主管审批",
  PENDING_MANAGER: "待经理审批",
  PENDING_SELF_REVIEW: "自评中",
  PENDING_LEADER_SCORE: "主管已评分",
  PENDING_MANAGER_SCORE: "经理已评分",
  COMPLETED: "已完成",
  REJECTED: "已退回",
};

const stageOrder = [
  "DRAFT",
  "PENDING_LEADER",
  "PENDING_MANAGER",
  "PENDING_SELF_REVIEW",
  "PENDING_LEADER_SCORE",
  "PENDING_MANAGER_SCORE",
  "COMPLETED",
];

export async function getKpiData(currentUser: DataScopeInput) {
  const where = getKpiWhereByScope(currentUser);

  const kpis = await prisma.personalKpi.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Query items separately
  const kpiIds = kpis.map((k) => k.id);
  const allItems = kpiIds.length
    ? await prisma.personalKpiItem.findMany({ where: { personalKpiId: { in: kpiIds } } })
    : [];
  const itemsByKpi = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const list = itemsByKpi.get(item.personalKpiId) ?? [];
    list.push(item);
    itemsByKpi.set(item.personalKpiId, list);
  }

  // Resolve user and team names
  const userIds = [...new Set(kpis.map((k) => k.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, teamId: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const teamIds = [...new Set(kpis.map((k) => k.teamId).filter(Boolean))];
  const teams = teamIds.length
    ? await prisma.team.findMany({ where: { id: { in: teamIds as string[] } }, select: { id: true, name: true } })
    : [];
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  // Stage counts
  const stageCounts: Record<string, number> = {};
  for (const s of stageOrder) {
    stageCounts[s] = kpis.filter((k) => k.status === s).length;
  }

  // Rows
  const rows = kpis.map((k) => {
    const user = userMap.get(k.userId);
    const items = itemsByKpi.get(k.id) ?? [];
    const progress = k.status === "COMPLETED" ? 100
      : items.length > 0 ? Math.round((items.filter((i) => i.selfScore !== null).length / items.length) * 100)
      : 0;
    const tone: "default" | "primary" | "info" | "success" | "warning" =
      k.status === "COMPLETED" ? "success"
      : k.status.includes("SCORE") ? "info"
      : k.status.includes("REVIEW") ? "info"
      : k.status.includes("PENDING") ? "warning"
      : "default";

    return {
      id: k.id,
      userName: user?.name ?? "—",
      teamName: user?.teamId ? teamMap.get(user.teamId) : "—",
      status: stageLabels[k.status] ?? k.status,
      tone,
      score: k.finalScore?.toString() ?? "—",
      progress,
      itemCount: items.length,
    };
  });

  const stages = [
    { label: "待制定", count: stageCounts.DRAFT ?? 0 },
    { label: "待审批", count: (stageCounts.PENDING_LEADER ?? 0) + (stageCounts.PENDING_MANAGER ?? 0) },
    { label: "自评中", count: stageCounts.PENDING_SELF_REVIEW ?? 0 },
    { label: "已评分", count: (stageCounts.PENDING_LEADER_SCORE ?? 0) + (stageCounts.PENDING_MANAGER_SCORE ?? 0) },
    { label: "已完成", count: stageCounts.COMPLETED ?? 0 },
  ];

  return { rows, stages, totalCount: kpis.length };
}
