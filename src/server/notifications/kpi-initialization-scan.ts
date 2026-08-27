import { prisma } from "@/server/db/prisma";
import { emitNotificationEvent } from "@/server/notifications/emit";

type ScopeUser = {
  id: string;
  name: string;
  orgNodeId: string;
};

export function getCurrentYearQuarter(date = new Date()) {
  return {
    year: date.getFullYear(),
    quarter: Math.floor(date.getMonth() / 3) + 1,
  };
}

function buildNearestDepartmentByOrgNodeId(
  departmentIds: Set<string>,
  closureRows: Array<{ descendantId: string; ancestorId: string; depth: number }>,
) {
  const nearest = new Map<string, { departmentOrgNodeId: string; depth: number }>();
  for (const row of closureRows) {
    if (!departmentIds.has(row.ancestorId)) continue;
    const current = nearest.get(row.descendantId);
    if (!current || row.depth < current.depth) {
      nearest.set(row.descendantId, { departmentOrgNodeId: row.ancestorId, depth: row.depth });
    }
  }
  return new Map(
    [...nearest.entries()].map(([orgNodeId, value]) => [orgNodeId, value.departmentOrgNodeId]),
  );
}

export async function runKpiInitializationPendingScan(
  scenarioId: string,
  options?: { testRunId?: number | string; scheduleSlot?: string },
) {
  const { year, quarter } = getCurrentYearQuarter();

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true, name: true },
  });
  if (!departments.length) return;

  const departmentIds = new Set(departments.map((department) => department.id));
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));

  const [users, existingKpis] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        roleType: { notIn: ["ADMIN", "DEPARTMENT_MANAGER"] },
        orgNodeId: { not: null },
      },
      select: {
        id: true,
        name: true,
        orgNodeId: true,
      },
    }),
    prisma.personalKpi.findMany({
      where: {
        year,
        quarter,
        deletedAt: null,
      },
      select: { userId: true },
    }),
  ]);

  if (!users.length) return;

  const orgNodeIds = [...new Set(users.map((user) => user.orgNodeId).filter((id): id is string => Boolean(id)))];
  const closureRows = orgNodeIds.length
    ? await prisma.orgClosure.findMany({
        where: { descendantId: { in: orgNodeIds } },
        select: { descendantId: true, ancestorId: true, depth: true },
      })
    : [];
  const departmentByOrgNodeId = buildNearestDepartmentByOrgNodeId(departmentIds, closureRows);
  const initializedUserIds = new Set(existingKpis.map((kpi) => kpi.userId));

  const usersByDepartment = new Map<string, ScopeUser[]>();
  for (const user of users) {
    if (!user.orgNodeId) continue;
    const departmentOrgNodeId = departmentByOrgNodeId.get(user.orgNodeId);
    if (!departmentOrgNodeId) continue;
    const scopedUser: ScopeUser = {
      id: user.id,
      name: user.name,
      orgNodeId: user.orgNodeId,
    };
    const list = usersByDepartment.get(departmentOrgNodeId) ?? [];
    list.push(scopedUser);
    usersByDepartment.set(departmentOrgNodeId, list);
  }

  for (const [departmentOrgNodeId, departmentUsers] of usersByDepartment) {
    const initializedCount = departmentUsers.filter((user) => initializedUserIds.has(user.id)).length;
    const pendingCount = departmentUsers.length - initializedCount;
    if (pendingCount <= 0) continue;

    const subjectUser = departmentUsers.find((user) => !initializedUserIds.has(user.id)) ?? departmentUsers[0];
    await emitNotificationEvent("kpi.initialization.pending", {
      userId: subjectUser.id,
      subjectUserId: subjectUser.id,
      userName: subjectUser.name,
      year,
      quarter,
      pendingCount,
      departmentOrgNodeId,
      departmentName: departmentNameById.get(departmentOrgNodeId) ?? "",
      targetType: "OrgNode",
      targetId: departmentOrgNodeId,
    }, { scenarioIds: [scenarioId], testRunId: options?.testRunId, scheduleSlot: options?.scheduleSlot });
  }
}

export async function findKpiInitializationPendingSample() {
  const { year, quarter } = getCurrentYearQuarter();

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true, name: true },
  });
  if (!departments.length) return null;

  const departmentIds = new Set(departments.map((department) => department.id));
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));

  const [users, existingKpis] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        roleType: { notIn: ["ADMIN", "DEPARTMENT_MANAGER"] },
        orgNodeId: { not: null },
      },
      select: { id: true, name: true, orgNodeId: true },
    }),
    prisma.personalKpi.findMany({
      where: { year, quarter, deletedAt: null },
      select: { userId: true },
    }),
  ]);

  if (!users.length) return null;

  const orgNodeIds = [...new Set(users.map((user) => user.orgNodeId!).filter(Boolean))];
  const closureRows = orgNodeIds.length
    ? await prisma.orgClosure.findMany({
        where: { descendantId: { in: orgNodeIds } },
        select: { descendantId: true, ancestorId: true, depth: true },
      })
    : [];
  const departmentByOrgNodeId = buildNearestDepartmentByOrgNodeId(departmentIds, closureRows);
  const initializedUserIds = new Set(existingKpis.map((kpi) => kpi.userId));

  const usersByDepartment = new Map<string, ScopeUser[]>();
  for (const user of users) {
    if (!user.orgNodeId) continue;
    const departmentOrgNodeId = departmentByOrgNodeId.get(user.orgNodeId);
    if (!departmentOrgNodeId) continue;
    const list = usersByDepartment.get(departmentOrgNodeId) ?? [];
    list.push({ id: user.id, name: user.name, orgNodeId: user.orgNodeId });
    usersByDepartment.set(departmentOrgNodeId, list);
  }

  for (const [departmentOrgNodeId, departmentUsers] of usersByDepartment) {
    const pendingCount = departmentUsers.filter((user) => !initializedUserIds.has(user.id)).length;
    if (pendingCount <= 0) continue;
    const subjectUser = departmentUsers.find((user) => !initializedUserIds.has(user.id)) ?? departmentUsers[0];
    return {
      year,
      quarter,
      pendingCount,
      departmentOrgNodeId,
      departmentName: departmentNameById.get(departmentOrgNodeId) ?? "",
      subjectUser,
    };
  }

  const fallbackDepartment = departments[0];
  const fallbackUser = users[0];
  if (!fallbackDepartment || !fallbackUser?.orgNodeId) return null;

  return {
    year,
    quarter,
    pendingCount: 1,
    departmentOrgNodeId: fallbackDepartment.id,
    departmentName: fallbackDepartment.name,
    subjectUser: {
      id: fallbackUser.id,
      name: fallbackUser.name,
      orgNodeId: fallbackUser.orgNodeId,
    },
  };
}
