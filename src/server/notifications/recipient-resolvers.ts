import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { NotificationEventPayload, RecipientConfig, RecipientRule } from "@/server/notifications/types";

async function findTeamLeaderUserIds(orgNodeId: string | null | undefined) {
  if (!orgNodeId) return [] as string[];
  const leaders = await prisma.user.findMany({
    where: {
      orgNodeId,
      roleType: "TEAM_LEADER",
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return leaders.map((user) => user.id);
}

const leaderStageStatuses = new Set(["PENDING_LEADER_SCORE"]);
const managerStageStatuses = new Set(["PENDING_MANAGER_SCORE"]);

async function findSubjectOrgNodeId(payload: NotificationEventPayload) {
  const subjectId = payload.subjectUserId ?? payload.userId;
  if (!subjectId) return null;
  const subject = await prisma.user.findFirst({
    where: { id: subjectId, deletedAt: null },
    select: { orgNodeId: true },
  });
  return subject?.orgNodeId ?? null;
}

async function resolveCurrentApproverRecipients(payload: NotificationEventPayload) {
  const ids = new Set<string>();
  if (payload.currentApproverId) {
    ids.add(payload.currentApproverId);
  }
  const subjectOrgNodeId = await findSubjectOrgNodeId(payload);
  if (payload.status && leaderStageStatuses.has(String(payload.status))) {
    for (const leaderId of await findTeamLeaderUserIds(subjectOrgNodeId)) {
      ids.add(leaderId);
    }
  }
  if (payload.status && managerStageStatuses.has(String(payload.status))) {
    for (const managerId of await findDepartmentManagerUserIds(subjectOrgNodeId)) {
      ids.add(managerId);
    }
  }
  return [...ids];
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
      return resolveCurrentApproverRecipients(payload);
    case "EXPLICIT_USERS":
      return [...new Set(rule.userIds ?? [])];
    case "ROLE":
      return findUsersByRoles(rule.roleTypes ?? []);
    case "TEAM_LEADER_OF_SUBJECT":
      return findTeamLeaderUserIds(await findSubjectOrgNodeId(payload));
    case "DEPARTMENT_MANAGER": {
      const subjectId = payload.subjectUserId ?? payload.userId;
      if (!subjectId) return [];
      const subject = await prisma.user.findFirst({
        where: { id: subjectId, deletedAt: null },
        select: { orgNodeId: true },
      });
      return findDepartmentManagerUserIds(subject?.orgNodeId);
    }
    case "METRIC_RESPONSIBLE": {
      const responsibleId = payload.responsibleUserId ?? payload.userId;
      return typeof responsibleId === "string" && responsibleId ? [responsibleId] : [];
    }
    case "TEAM_LEADERS_OF_TEAM":
      return findTeamLeaderUserIds(typeof payload.teamOrgNodeId === "string" ? payload.teamOrgNodeId : undefined);
    case "PLAN_DEPARTMENT_MANAGERS":
      return findDepartmentManagerUserIds(typeof payload.departmentOrgNodeId === "string" ? payload.departmentOrgNodeId : undefined);
    case "METRIC_RESPONSIBLE_OR_DEPT_MANAGER": {
      const responsibleId = payload.responsibleUserId ?? payload.userId;
      if (typeof responsibleId === "string" && responsibleId) return [responsibleId];
      return findDepartmentManagerUserIds(typeof payload.departmentOrgNodeId === "string" ? payload.departmentOrgNodeId : undefined);
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
