import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import {
  getNotificationPageOrgData,
  listScopedAllNotifications,
} from "@/server/notifications/notification-query";
import {
  buildNotificationGroupBotManageFlags,
  buildNotificationScenarioManageFlags,
  canManageNotificationScenario,
  canViewAllNotifications,
} from "@/server/notifications/permission";
import {
  listNotificationEvents,
  listNotificationModules,
  RECIPIENT_RULE_LABELS,
  resolveEventModule,
  SCHEDULE_SCAN_REGISTRY,
} from "@/server/notifications/event-registry";
import { NotificationsContent } from "./content";

export default async function NotifsPage() {
  const currentUser = await requireCurrentUser();
  const canManage = await canManageNotificationScenario(currentUser);
  const canViewAll = canViewAllNotifications(currentUser);
  const { resolveDepartmentOrgNodeId, orgFilter } = await getNotificationPageOrgData(currentUser);

  const [notifications, allNotifications, scenarios, users, groupBots] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    canViewAll
      ? listScopedAllNotifications(currentUser)
      : Promise.resolve([]),
    canManage
      ? prisma.notificationScenario.findMany({
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          where: { isActive: true, deletedAt: null },
          select: { id: true, name: true, roleType: true },
          orderBy: { name: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    canManage
      ? prisma.notificationGroupBot.findMany({
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const allNotificationUserIds = [...new Set(allNotifications.map((item) => item.userId))];
  const auditUserIds = [
    ...new Set(
      [
        ...scenarios.flatMap((item) => [item.createdById, item.updatedById]),
        ...groupBots.flatMap((item) => [item.createdById, item.updatedById]),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const lookupUserIds = [...new Set([...allNotificationUserIds, ...auditUserIds])];
  const lookupUsers = lookupUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: lookupUserIds } },
        select: { id: true, name: true, orgNodeId: true },
      })
    : [];
  const userNameById = new Map(lookupUsers.map((user) => [user.id, user.name]));
  const userOrgNodeIdById = new Map(lookupUsers.map((user) => [user.id, user.orgNodeId]));
  const scenarioManageFlags = canManage
    ? await buildNotificationScenarioManageFlags(currentUser, scenarios)
    : new Map<string, boolean>();
  const groupBotManageFlags = canManage
    ? await buildNotificationGroupBotManageFlags(currentUser, groupBots)
    : new Map<string, boolean>();

  function resolveAuditUserName(userId: string | null | undefined) {
    if (!userId) return "-";
    return userNameById.get(userId) ?? "未知用户";
  }

  function resolveCreatorDepartmentOrgNodeId(createdById: string | null | undefined) {
    if (!createdById) return null;
    return resolveDepartmentOrgNodeId(userOrgNodeIdById.get(createdById));
  }

  return (
    <NotificationsContent
      notifications={notifications.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        targetType: item.targetType,
        targetId: item.targetId,
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
      }))}
      allNotifications={allNotifications.map((item) => {
        const recipientOrgNodeId = userOrgNodeIdById.get(item.userId) ?? null;
        return {
          id: item.id,
          type: item.type,
          title: item.title,
          content: item.content,
          targetType: item.targetType,
          targetId: item.targetId,
          isRead: item.isRead,
          createdAt: item.createdAt.toISOString(),
          userId: item.userId,
          userName: userNameById.get(item.userId) ?? "未知用户",
          recipientOrgNodeId,
          recipientDepartmentOrgNodeId: resolveDepartmentOrgNodeId(recipientOrgNodeId),
        };
      })}
      canViewAll={canViewAll}
      canManage={canManage}
      orgFilter={orgFilter}
      scenarios={scenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        module: scenario.module,
        triggerType: scenario.triggerType,
        triggerEvent: scenario.triggerEvent,
        scheduleConfig: scenario.scheduleConfig,
        nextRunAt: scenario.nextRunAt?.toISOString() ?? null,
        recipientConfig: scenario.recipientConfig,
        channelConfig: scenario.channelConfig,
        conditionConfig: scenario.conditionConfig,
        isActive: scenario.isActive,
        sortOrder: scenario.sortOrder,
        createdByName: resolveAuditUserName(scenario.createdById),
        createdAt: scenario.createdAt.toISOString(),
        updatedByName: resolveAuditUserName(scenario.updatedById),
        updatedAt: scenario.updatedAt.toISOString(),
        canManageRecord: scenarioManageFlags.get(scenario.id) ?? false,
        creatorDepartmentOrgNodeId: resolveCreatorDepartmentOrgNodeId(scenario.createdById),
      }))}
      users={users}
      groupBots={groupBots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        webhookUrl: bot.webhookUrl,
        securityType: bot.securityType,
        securityValue: bot.securityValue,
        createdByName: resolveAuditUserName(bot.createdById),
        createdAt: bot.createdAt.toISOString(),
        updatedByName: resolveAuditUserName(bot.updatedById),
        updatedAt: bot.updatedAt.toISOString(),
        canManageRecord: groupBotManageFlags.get(bot.id) ?? false,
        creatorDepartmentOrgNodeId: resolveCreatorDepartmentOrgNodeId(bot.createdById),
      }))}
      eventOptions={listNotificationEvents().map((event) => ({
        code: event.code,
        label: event.label,
        module: event.module,
        payloadFields: event.payloadFields,
        recipientResolvers: event.recipientResolvers,
      }))}
      moduleOptions={listNotificationModules()}
      recipientRuleLabels={RECIPIENT_RULE_LABELS}
      scanOptions={Object.entries(SCHEDULE_SCAN_REGISTRY).map(([value, meta]) => ({
        value,
        label: meta.label,
        emitEvent: meta.emitEvent,
        module: resolveEventModule(meta.emitEvent),
      }))}
    />
  );
}
