import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { NotificationEventPayload, RecipientConfig, RecipientRule } from "@/server/notifications/types";

async function findTeamLeaderUserId(orgNodeId: string | null | undefined) {
  if (!orgNodeId) return null;
  const leader = await prisma.user.findFirst({
    where: {
      orgNodeId,
      roleType: "TEAM_LEADER",
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return leader?.id ?? null;
}

async function findDepartmentManagerUserIds(orgNodeId: string | null | undefined) {
  if (!orgNodeId) return [] as string[];
  const closures = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId },
    select: { ancestorId: true, depth: true },
  });
  const ancestorIds = closures.map((row) => row.ancestorId);
  const department = await prisma.orgNode.findFirst({
    where: {
      id: { in: ancestorIds.length ? ancestorIds : [orgNodeId] },
      nodeType: "DEPARTMENT",
    },
    select: { id: true },
  });
  if (!department) return [];
  const managers = await prisma.user.findMany({
    where: {
      orgNodeId: department.id,
      roleType: "DEPARTMENT_MANAGER",
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  return managers.map((user) => user.id);
}

async function findUsersByRoles(roleTypes: RoleType[]) {
  if (!roleTypes.length) return [] as string[];
  const users = await prisma.user.findMany({
    where: {
      roleType: { in: roleTypes },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function resolveOneRule(rule: RecipientRule, payload: NotificationEventPayload) {
  switch (rule.type) {
    case "SUBJECT_USER":
      return [payload.subjectUserId ?? payload.userId].filter((id): id is string => Boolean(id));
    case "SUBMITTER":
      return [payload.submitterId].filter((id): id is string => Boolean(id));
    case "CURRENT_APPROVER":
      return [payload.currentApproverId].filter((id): id is string => Boolean(id));
    case "EXPLICIT_USERS":
      return [...new Set(rule.userIds ?? [])];
    case "ROLE":
      return findUsersByRoles(rule.roleTypes ?? []);
    case "TEAM_LEADER_OF_SUBJECT": {
      const subjectId = payload.subjectUserId ?? payload.userId;
      if (!subjectId) return [];
      const subject = await prisma.user.findFirst({
        where: { id: subjectId, deletedAt: null },
        select: { orgNodeId: true },
      });
      const leaderId = await findTeamLeaderUserId(subject?.orgNodeId);
      return leaderId ? [leaderId] : [];
    }
    case "DEPARTMENT_MANAGER": {
      const subjectId = payload.subjectUserId ?? payload.userId;
      if (!subjectId) return [];
      const subject = await prisma.user.findFirst({
        where: { id: subjectId, deletedAt: null },
        select: { orgNodeId: true },
      });
      return findDepartmentManagerUserIds(subject?.orgNodeId);
    }
    default:
      return [];
  }
}

export async function resolveRecipientUserIds(
  recipientConfig: RecipientConfig,
  payload: NotificationEventPayload,
) {
  const ids = new Set<string>();
  for (const rule of recipientConfig.rules ?? []) {
    const resolved = await resolveOneRule(rule, payload);
    for (const id of resolved) ids.add(id);
  }
  return [...ids];
}
