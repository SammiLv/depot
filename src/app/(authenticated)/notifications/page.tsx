import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { canManageNotificationScenario } from "@/server/notifications/permission";
import {
  listNotificationEvents,
  RECIPIENT_RULE_LABELS,
  SCHEDULE_SCAN_REGISTRY,
} from "@/server/notifications/event-registry";
import { NotificationsContent } from "./content";

export default async function NotifsPage() {
  const currentUser = await requireCurrentUser();
  const canManage = await canManageNotificationScenario(currentUser);

  const [notifications, scenarios, users] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
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
  ]);

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
      canManage={canManage}
      scenarios={scenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        triggerType: scenario.triggerType,
        triggerEvent: scenario.triggerEvent,
        scheduleConfig: scenario.scheduleConfig,
        nextRunAt: scenario.nextRunAt?.toISOString() ?? null,
        recipientConfig: scenario.recipientConfig,
        channelConfig: scenario.channelConfig,
        conditionConfig: scenario.conditionConfig,
        isActive: scenario.isActive,
        sortOrder: scenario.sortOrder,
      }))}
      users={users}
      eventOptions={listNotificationEvents().map((event) => ({
        code: event.code,
        label: event.label,
        category: event.category,
        payloadFields: event.payloadFields,
        recipientResolvers: event.recipientResolvers,
      }))}
      recipientRuleLabels={RECIPIENT_RULE_LABELS}
      scanOptions={Object.entries(SCHEDULE_SCAN_REGISTRY).map(([value, meta]) => ({
        value,
        label: meta.label,
        emitEvent: meta.emitEvent,
      }))}
    />
  );
}
