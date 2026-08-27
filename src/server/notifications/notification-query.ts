import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { canViewAllNotifications } from "@/server/notifications/permission";

type ScopeUser = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

export const SYSTEM_CONFIG_DEPARTMENT_FILTER = "system";

export type NotificationOrgFilterContext = {
  showAllNotificationsDepartmentFilter: boolean;
  showAllNotificationsTeamFilter: boolean;
  showConfigDepartmentFilter: boolean;
  departments: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; departmentOrgNodeId: string }>;
};

export async function getNotificationPageOrgData(user: ScopeUser) {
  const orgNodes = await prisma.orgNode.findMany({
    select: { id: true, name: true, nodeType: true, parentId: true },
    orderBy: { name: "asc" },
  });

  const nodeById = new Map(orgNodes.map((node) => [node.id, node]));
  const resolveDepartmentOrgNodeId = (orgNodeId: string | null | undefined): string | null => {
    if (!orgNodeId) return null;
    let current = nodeById.get(orgNodeId);
    while (current) {
      if (current.nodeType === "DEPARTMENT") return current.id;
      current = current.parentId ? nodeById.get(current.parentId) : undefined;
    }
    return null;
  };

  const departments = orgNodes
    .filter((node) => node.nodeType === "DEPARTMENT")
    .map((node) => ({ id: node.id, name: node.name }));

  const teams = orgNodes
    .filter((node) => node.nodeType === "TEAM")
    .map((node) => {
      const departmentOrgNodeId = resolveDepartmentOrgNodeId(node.id);
      return departmentOrgNodeId ? { id: node.id, name: node.name, departmentOrgNodeId } : null;
    })
    .filter((team): team is { id: string; name: string; departmentOrgNodeId: string } => Boolean(team));

  const managerDepartmentOrgNodeId = user.roleType === "DEPARTMENT_MANAGER"
    ? resolveDepartmentOrgNodeId(user.orgNodeId)
    : null;

  const orgFilter: NotificationOrgFilterContext = {
    showAllNotificationsDepartmentFilter: user.roleType === "ADMIN",
    showAllNotificationsTeamFilter: user.roleType === "DEPARTMENT_MANAGER",
    showConfigDepartmentFilter: user.roleType === "ADMIN",
    departments,
    teams: managerDepartmentOrgNodeId
      ? teams.filter((team) => team.departmentOrgNodeId === managerDepartmentOrgNodeId)
      : teams,
  };

  return { resolveDepartmentOrgNodeId, orgFilter };
}

async function getScopedRecipientUserIds(user: ScopeUser): Promise<string[] | "ALL"> {
  if (user.roleType === "ADMIN") {
    return "ALL";
  }

  if (user.roleType === "DEPARTMENT_MANAGER") {
    if (!user.orgNodeId) return [];
    const orgNodeIds = await getDescendantOrgNodeIds(user.orgNodeId);
    if (!orgNodeIds.length) return [];
    const users = await prisma.user.findMany({
      where: { orgNodeId: { in: orgNodeIds }, deletedAt: null },
      select: { id: true },
    });
    return users.map((item) => item.id);
  }

  if (user.roleType === "TEAM_LEADER") {
    if (!user.orgNodeId) return [];
    const users = await prisma.user.findMany({
      where: { orgNodeId: user.orgNodeId, deletedAt: null },
      select: { id: true },
    });
    return users.map((item) => item.id);
  }

  return [];
}

export async function listScopedAllNotifications(user: ScopeUser) {
  if (!canViewAllNotifications(user)) {
    return [];
  }

  const scopedUserIds = await getScopedRecipientUserIds(user);
  if (Array.isArray(scopedUserIds) && scopedUserIds.length === 0) {
    return [];
  }

  return prisma.notification.findMany({
    where: scopedUserIds === "ALL" ? {} : { userId: { in: scopedUserIds } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}
