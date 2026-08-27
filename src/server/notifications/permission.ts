import type { RoleType } from "@prisma/client";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, isOrgNodeInSubtree } from "@/server/organization/org-tree-utils";
import {
  notificationAbilityKeys,
  orgPermissionModuleKeys,
} from "@/server/permissions/permission-constants";
import { resolvePermissionScope } from "@/server/permissions/permission-resolver";

type ScopeUser = {
  id: string;
  roleType: RoleType;
  orgNodeId?: string | null;
};

type CreatedRecord = {
  id: string;
  createdById: string | null;
};

type CreatorInfo = {
  id: string;
  orgNodeId: string | null;
};

export async function canManageNotificationScenario(user?: ScopeUser) {
  const currentUser = user ?? await requireCurrentUser();
  if (currentUser.roleType === "ADMIN") return true;
  const scope = await resolvePermissionScope(
    currentUser,
    orgPermissionModuleKeys.notification,
    notificationAbilityKeys.manageNotificationScenario,
  );
  return Boolean(scope);
}

export function canViewAllNotifications(user: {
  roleType: "ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER";
}) {
  return user.roleType === "ADMIN"
    || user.roleType === "DEPARTMENT_MANAGER"
    || user.roleType === "TEAM_LEADER";
}

export async function requireManageNotificationScenario() {
  const currentUser = await requireCurrentUser();
  const allowed = await canManageNotificationScenario(currentUser);
  if (!allowed) {
    throw new Error("无权管理通知场景");
  }
  return currentUser;
}

async function canManageNotificationConfigRecord(
  user: ScopeUser,
  record: CreatedRecord,
  creator?: CreatorInfo | null,
) {
  if (!(await canManageNotificationScenario(user))) return false;
  if (user.roleType === "ADMIN") return true;

  if (!record.createdById) return false;

  if (user.roleType === "MEMBER") {
    return record.createdById === user.id;
  }

  const creatorUser = creator ?? await prisma.user.findFirst({
    where: { id: record.createdById, deletedAt: null },
    select: { id: true, orgNodeId: true },
  });
  if (!creatorUser?.orgNodeId) return false;

  if (user.roleType === "TEAM_LEADER") {
    return Boolean(user.orgNodeId && creatorUser.orgNodeId === user.orgNodeId);
  }

  if (user.roleType === "DEPARTMENT_MANAGER") {
    const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(user.orgNodeId);
    if (!departmentOrgNodeId) return false;
    return isOrgNodeInSubtree(creatorUser.orgNodeId, departmentOrgNodeId);
  }

  return false;
}

async function buildNotificationConfigManageFlags(
  user: ScopeUser,
  records: CreatedRecord[],
): Promise<Map<string, boolean>> {
  const flags = new Map<string, boolean>();
  if (!records.length) return flags;

  const hasManage = await canManageNotificationScenario(user);
  if (!hasManage) {
    for (const record of records) flags.set(record.id, false);
    return flags;
  }

  if (user.roleType === "ADMIN") {
    for (const record of records) flags.set(record.id, true);
    return flags;
  }

  const creatorIds = [...new Set(records.map((record) => record.createdById).filter(Boolean))] as string[];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds }, deletedAt: null },
        select: { id: true, orgNodeId: true },
      })
    : [];
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

  const departmentOrgNodeId = user.roleType === "DEPARTMENT_MANAGER"
    ? await findNearestDepartmentOrgNodeId(user.orgNodeId)
    : null;
  const subtreeCache = new Map<string, boolean>();

  for (const record of records) {
    if (!record.createdById) {
      flags.set(record.id, false);
      continue;
    }

    if (user.roleType === "MEMBER") {
      flags.set(record.id, record.createdById === user.id);
      continue;
    }

    const creatorUser = creatorById.get(record.createdById);
    if (!creatorUser?.orgNodeId) {
      flags.set(record.id, false);
      continue;
    }

    if (user.roleType === "TEAM_LEADER") {
      flags.set(
        record.id,
        Boolean(user.orgNodeId && creatorUser.orgNodeId === user.orgNodeId),
      );
      continue;
    }

    if (user.roleType === "DEPARTMENT_MANAGER" && departmentOrgNodeId) {
      const cacheKey = `${creatorUser.orgNodeId}:${departmentOrgNodeId}`;
      let inSubtree = subtreeCache.get(cacheKey);
      if (inSubtree === undefined) {
        inSubtree = await isOrgNodeInSubtree(creatorUser.orgNodeId, departmentOrgNodeId);
        subtreeCache.set(cacheKey, inSubtree);
      }
      flags.set(record.id, inSubtree);
      continue;
    }

    flags.set(record.id, false);
  }

  return flags;
}

export async function canManageNotificationScenarioRecord(
  user: ScopeUser,
  scenario: CreatedRecord,
  creator?: CreatorInfo | null,
) {
  return canManageNotificationConfigRecord(user, scenario, creator);
}

export async function canManageNotificationGroupBotRecord(
  user: ScopeUser,
  bot: CreatedRecord,
  creator?: CreatorInfo | null,
) {
  return canManageNotificationConfigRecord(user, bot, creator);
}

export async function assertCanManageNotificationScenarioRecord(scenarioId: string) {
  const currentUser = await requireManageNotificationScenario();
  const scenario = await prisma.notificationScenario.findUnique({
    where: { id: scenarioId },
    select: { id: true, createdById: true },
  });
  if (!scenario) throw new Error("场景不存在");
  const allowed = await canManageNotificationScenarioRecord(currentUser, scenario);
  if (!allowed) throw new Error("无权修改该通知场景");
  return currentUser;
}

export async function assertCanManageNotificationGroupBotRecord(botId: string) {
  const currentUser = await requireManageNotificationScenario();
  const bot = await prisma.notificationGroupBot.findUnique({
    where: { id: botId },
    select: { id: true, createdById: true },
  });
  if (!bot) throw new Error("群机器人不存在");
  const allowed = await canManageNotificationGroupBotRecord(currentUser, bot);
  if (!allowed) throw new Error("无权修改该群机器人");
  return currentUser;
}

export async function buildNotificationScenarioManageFlags(
  user: ScopeUser,
  scenarios: CreatedRecord[],
) {
  return buildNotificationConfigManageFlags(user, scenarios);
}

export async function buildNotificationGroupBotManageFlags(
  user: ScopeUser,
  bots: CreatedRecord[],
) {
  return buildNotificationConfigManageFlags(user, bots);
}
