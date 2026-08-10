import type { NotificationScenario, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { sendDingTalkMessage } from "@/server/dingtalk/message-client";
import { resolveRecipientUserIds } from "@/server/notifications/recipient-resolvers";
import { buildEventKey, renderTemplate } from "@/server/notifications/template-render";
import type {
  ChannelConfig,
  ConditionConfig,
  NotificationEventPayload,
  RecipientConfig,
} from "@/server/notifications/types";

function asRecipientConfig(value: Prisma.JsonValue): RecipientConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { rules: [] };
  }
  const rules = Array.isArray((value as RecipientConfig).rules)
    ? (value as RecipientConfig).rules
    : [];
  return {
    rules,
    dedupeWindowHours: (value as RecipientConfig).dedupeWindowHours,
  };
}

function asChannelConfig(value: Prisma.JsonValue): ChannelConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { channels: ["IN_APP"], titleTemplate: "" };
  }
  const config = value as ChannelConfig;
  return {
    channels: Array.isArray(config.channels) && config.channels.length
      ? config.channels
      : ["IN_APP"],
    notificationType: config.notificationType,
    dingtalkNotifyType: config.dingtalkNotifyType,
    titleTemplate: config.titleTemplate ?? "",
    contentTemplate: config.contentTemplate,
    messageUrlTemplate: config.messageUrlTemplate,
  };
}

function asConditionConfig(value: Prisma.JsonValue | null | undefined): ConditionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ConditionConfig;
}

function matchesConditions(conditionConfig: ConditionConfig, payload: NotificationEventPayload) {
  for (const condition of conditionConfig.conditions ?? []) {
    const actual = payload[condition.field];
    const expected = condition.value;
    if (condition.operator === "eq" && actual !== expected) return false;
    if (condition.operator === "neq" && actual === expected) return false;
  }
  return true;
}

async function alreadyDelivered(
  scenarioId: string,
  eventKey: string,
  channel: "IN_APP" | "DINGTALK",
  dedupeWindowHours: number | undefined,
) {
  const existing = await prisma.notificationDeliveryLog.findUnique({
    where: {
      scenarioId_eventKey_channel: {
        scenarioId,
        eventKey,
        channel,
      },
    },
  });
  if (!existing) return false;
  if (existing.status === "FAILED") return false;
  if (!dedupeWindowHours || dedupeWindowHours <= 0) return true;
  const ageMs = Date.now() - existing.createdAt.getTime();
  return ageMs < dedupeWindowHours * 60 * 60 * 1000;
}

async function writeDeliveryLog(input: {
  scenarioId: string;
  eventKey: string;
  userId: string;
  channel: "IN_APP" | "DINGTALK";
  status: "SENT" | "FAILED" | "SKIPPED";
  error?: string | null;
}) {
  await prisma.notificationDeliveryLog.upsert({
    where: {
      scenarioId_eventKey_channel: {
        scenarioId: input.scenarioId,
        eventKey: input.eventKey,
        channel: input.channel,
      },
    },
    create: {
      scenarioId: input.scenarioId,
      eventKey: input.eventKey,
      userId: input.userId,
      channel: input.channel,
      status: input.status,
      error: input.error ?? null,
    },
    update: {
      userId: input.userId,
      status: input.status,
      error: input.error ?? null,
      createdAt: new Date(),
    },
  });
}

async function deliverForUser(input: {
  scenario: NotificationScenario;
  userId: string;
  payload: NotificationEventPayload;
  channelConfig: ChannelConfig;
  recipientConfig: RecipientConfig;
  eventKey: string;
}) {
  const title = renderTemplate(input.channelConfig.titleTemplate, input.payload) || input.scenario.name;
  const content = renderTemplate(input.channelConfig.contentTemplate, input.payload) || null;
  const messageUrl = renderTemplate(input.channelConfig.messageUrlTemplate, input.payload) || undefined;
  const notificationType = (input.channelConfig.notificationType ?? "KPI_TODO") as NotificationType;

  for (const channel of input.channelConfig.channels) {
    const channelEventKey = `${input.eventKey}:${input.userId}`;
    if (await alreadyDelivered(
      input.scenario.id,
      channelEventKey,
      channel,
      input.recipientConfig.dedupeWindowHours,
    )) {
      continue;
    }

    if (channel === "IN_APP") {
      try {
        await prisma.notification.create({
          data: {
            userId: input.userId,
            type: notificationType,
            title,
            content,
            targetType: input.payload.targetType ? String(input.payload.targetType) : null,
            targetId: input.payload.targetId ? String(input.payload.targetId) : null,
          },
        });
        await writeDeliveryLog({
          scenarioId: input.scenario.id,
          eventKey: channelEventKey,
          userId: input.userId,
          channel: "IN_APP",
          status: "SENT",
        });
      } catch (error) {
        await writeDeliveryLog({
          scenarioId: input.scenario.id,
          eventKey: channelEventKey,
          userId: input.userId,
          channel: "IN_APP",
          status: "FAILED",
          error: error instanceof Error ? error.message : "in-app delivery failed",
        });
      }
      continue;
    }

    try {
      const user = await prisma.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        select: { dingtalkUserId: true, mobile: true },
      });
      if (!user?.dingtalkUserId && !user?.mobile) {
        await writeDeliveryLog({
          scenarioId: input.scenario.id,
          eventKey: channelEventKey,
          userId: input.userId,
          channel: "DINGTALK",
          status: "SKIPPED",
          error: "missing dingtalkUserId/mobile",
        });
        continue;
      }

      const result = await sendDingTalkMessage({
        dingUserIds: user.dingtalkUserId ? [user.dingtalkUserId] : undefined,
        mobiles: !user.dingtalkUserId && user.mobile ? [user.mobile] : undefined,
        title,
        content: content ?? title,
        messageUrl,
        notifyEventType: input.channelConfig.dingtalkNotifyType ?? 5,
      });

      await writeDeliveryLog({
        scenarioId: input.scenario.id,
        eventKey: channelEventKey,
        userId: input.userId,
        channel: "DINGTALK",
        status: result.skipped ? "SKIPPED" : "SENT",
        error: result.skipped ? result.reason : null,
      });
    } catch (error) {
      await writeDeliveryLog({
        scenarioId: input.scenario.id,
        eventKey: channelEventKey,
        userId: input.userId,
        channel: "DINGTALK",
        status: "FAILED",
        error: error instanceof Error ? error.message : "dingtalk delivery failed",
      });
    }
  }
}

export async function processNotificationEvent(
  eventCode: string,
  payload: NotificationEventPayload,
  options?: { scenarioIds?: string[] },
) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const enriched: NotificationEventPayload = {
    ...payload,
    appUrl: payload.appUrl ?? appUrl,
    subjectUserId: payload.subjectUserId ?? payload.userId,
    targetType: payload.targetType ?? (payload.kpiId ? "PersonalKpi" : payload.targetType),
    targetId: payload.targetId ?? payload.kpiId ?? payload.todoId,
  };

  const scenarios = await prisma.notificationScenario.findMany({
    where: options?.scenarioIds?.length
      ? {
          id: { in: options.scenarioIds },
          isActive: true,
        }
      : {
          isActive: true,
          triggerType: "EVENT",
          triggerEvent: eventCode,
        },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  for (const scenario of scenarios) {
    const recipientConfig = asRecipientConfig(scenario.recipientConfig);
    const channelConfig = asChannelConfig(scenario.channelConfig);
    const conditionConfig = asConditionConfig(scenario.conditionConfig);
    if (!matchesConditions(conditionConfig, enriched)) continue;

    const userIds = await resolveRecipientUserIds(recipientConfig, enriched);
    const eventKey = buildEventKey([
      eventCode,
      enriched.targetId,
      enriched.kpiId,
      enriched.todoId,
      enriched.status,
      enriched.dueDate,
    ]);

    for (const userId of userIds) {
      await deliverForUser({
        scenario,
        userId,
        payload: enriched,
        channelConfig,
        recipientConfig,
        eventKey,
      });
    }
  }
}

export async function deliverTestNotification(input: {
  scenario: NotificationScenario;
  userId: string;
}) {
  const channelConfig = asChannelConfig(input.scenario.channelConfig);
  const recipientConfig = asRecipientConfig(input.scenario.recipientConfig);
  const payload: NotificationEventPayload = {
    userId: input.userId,
    subjectUserId: input.userId,
    userName: "测试用户",
    kpiId: "test-kpi",
    targetType: "PersonalKpi",
    targetId: "test-kpi",
    year: new Date().getFullYear(),
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
    appUrl: process.env.APP_URL?.replace(/\/$/, "") ?? "",
    title: "测试通知",
    comment: "这是一条测试通知",
  };

  await deliverForUser({
    scenario: input.scenario,
    userId: input.userId,
    payload,
    channelConfig,
    recipientConfig,
    eventKey: buildEventKey(["test", input.scenario.id, Date.now()]),
  });
}
