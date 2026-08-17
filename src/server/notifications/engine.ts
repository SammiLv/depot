import type { NotificationScenario, NotificationType, NotificationDeliveryChannel, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { sendDingTalkMessage } from "@/server/dingtalk/message-client";
import { sendGroupRobotMessage } from "@/server/dingtalk/group-robot-client";
import { buildAnnualGoalTestEventPayload } from "@/server/notifications/annual-goal-test-payload";
import { buildKpiTestEventPayload } from "@/server/notifications/kpi-test-payload";
import { buildQuarterlyWorkTestEventPayload } from "@/server/notifications/quarterly-work-test-payload";
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
    groupBotId: config.groupBotId,
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
  channel: NotificationDeliveryChannel,
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
  if (existing.status === "FAILED" || existing.status === "SKIPPED") return false;
  // dedupeWindowHours <= 0：同一 eventKey 只投递一次（防重复 emit / 双击）
  // dedupeWindowHours > 0：在窗口期内同一 eventKey 不重复投递（适合定时扫描）
  if (!dedupeWindowHours || dedupeWindowHours <= 0) return true;
  const ageMs = Date.now() - existing.createdAt.getTime();
  return ageMs < dedupeWindowHours * 60 * 60 * 1000;
}

async function writeDeliveryLog(input: {
  scenarioId: string;
  eventKey: string;
  userId: string;
  channel: NotificationDeliveryChannel;
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

async function deliverDingTalkDirectMessage(input: {
  scenarioId: string;
  channelEventKey: string;
  userId: string;
  channel: "DINGTALK" | "DINGTALK_PERSONAL";
  notifyEventType: number;
  title: string;
  content: string | null;
  messageUrl?: string;
}) {
  try {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { dingtalkUserId: true, mobile: true },
    });
    if (!user?.dingtalkUserId && !user?.mobile) {
      await writeDeliveryLog({
        scenarioId: input.scenarioId,
        eventKey: input.channelEventKey,
        userId: input.userId,
        channel: input.channel,
        status: "SKIPPED",
        error: "missing dingtalkUserId/mobile",
      });
      return;
    }

    const result = await sendDingTalkMessage({
      dingUserIds: user.dingtalkUserId ? [user.dingtalkUserId] : undefined,
      mobiles: !user.dingtalkUserId && user.mobile ? [user.mobile] : undefined,
      title: input.title,
      content: input.content ?? input.title,
      messageUrl: input.messageUrl,
      notifyEventType: input.notifyEventType,
    });

    await writeDeliveryLog({
      scenarioId: input.scenarioId,
      eventKey: input.channelEventKey,
      userId: input.userId,
      channel: input.channel,
      status: result.skipped ? "SKIPPED" : "SENT",
      error: result.skipped ? result.reason : null,
    });
  } catch (error) {
    await writeDeliveryLog({
      scenarioId: input.scenarioId,
      eventKey: input.channelEventKey,
      userId: input.userId,
      channel: input.channel,
      status: "FAILED",
      error: error instanceof Error ? error.message : "dingtalk delivery failed",
    });
  }
}

async function deliverForUser(input: {
  scenario: NotificationScenario;
  userId: string;
  payload: NotificationEventPayload;
  channelConfig: ChannelConfig;
  recipientConfig: RecipientConfig;
  eventKey: string;
}) {
  const renderedTitle = renderTemplate(input.channelConfig.titleTemplate, input.payload) || input.scenario.name;
  const title = input.payload.testRunId != null
    ? `${renderedTitle}（测试 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})`
    : renderedTitle;
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

    if (channel === "DINGTALK") {
      await deliverDingTalkDirectMessage({
        scenarioId: input.scenario.id,
        channelEventKey,
        userId: input.userId,
        channel: "DINGTALK",
        notifyEventType: 5,
        title,
        content,
        messageUrl,
      });
      continue;
    }

    if (channel === "DINGTALK_PERSONAL") {
      await deliverDingTalkDirectMessage({
        scenarioId: input.scenario.id,
        channelEventKey,
        userId: input.userId,
        channel: "DINGTALK_PERSONAL",
        notifyEventType: 6,
        title,
        content,
        messageUrl,
      });
      continue;
    }

    if (channel === "DINGTALK_GROUP") {
      try {
        if (!input.channelConfig.groupBotId) {
          await writeDeliveryLog({
            scenarioId: input.scenario.id,
            eventKey: channelEventKey,
            userId: input.userId,
            channel: "DINGTALK_GROUP",
            status: "SKIPPED",
            error: "missing groupBotId",
          });
          continue;
        }

        const groupBot = await prisma.notificationGroupBot.findUnique({
          where: { id: input.channelConfig.groupBotId },
        });
        if (!groupBot) {
          await writeDeliveryLog({
            scenarioId: input.scenario.id,
            eventKey: channelEventKey,
            userId: input.userId,
            channel: "DINGTALK_GROUP",
            status: "SKIPPED",
            error: "group bot not found",
          });
          continue;
        }

        const user = await prisma.user.findFirst({
          where: { id: input.userId, deletedAt: null },
          select: { dingtalkUserId: true, mobile: true, name: true },
        });
        if (!user?.dingtalkUserId && !user?.mobile) {
          await writeDeliveryLog({
            scenarioId: input.scenario.id,
            eventKey: channelEventKey,
            userId: input.userId,
            channel: "DINGTALK_GROUP",
            status: "SKIPPED",
            error: "missing dingtalkUserId/mobile for @mention",
          });
          continue;
        }

        const mentionPrefix = user.mobile
          ? `@${user.mobile} `
          : user.dingtalkUserId
            ? `@${user.dingtalkUserId} `
            : user.name
              ? `@${user.name} `
              : "";
        const bodyText = `${mentionPrefix}${content ?? title}`;

        await sendGroupRobotMessage({
          webhookUrl: groupBot.webhookUrl,
          securityType: groupBot.securityType,
          securityValue: groupBot.securityValue,
          title,
          text: bodyText,
          messageUrl,
          atUserIds: user.dingtalkUserId ? [user.dingtalkUserId] : undefined,
          atMobiles: user.mobile ? [user.mobile] : undefined,
        });

        await writeDeliveryLog({
          scenarioId: input.scenario.id,
          eventKey: channelEventKey,
          userId: input.userId,
          channel: "DINGTALK_GROUP",
          status: "SENT",
        });
      } catch (error) {
        await writeDeliveryLog({
          scenarioId: input.scenario.id,
          eventKey: channelEventKey,
          userId: input.userId,
          channel: "DINGTALK_GROUP",
          status: "FAILED",
          error: error instanceof Error ? error.message : "group robot delivery failed",
        });
      }
    }
  }
}

export async function processNotificationEvent(
  eventCode: string,
  payload: NotificationEventPayload,
  options?: { scenarioIds?: string[]; testRunId?: number | string; scheduleSlot?: string },
) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const enriched: NotificationEventPayload = {
    ...payload,
    appUrl: payload.appUrl ?? appUrl,
    subjectUserId: payload.subjectUserId ?? payload.userId,
    targetType: payload.targetType ?? (payload.kpiId ? "PersonalKpi" : payload.targetType),
    targetId: payload.targetId ?? payload.kpiId ?? payload.todoId,
    ...(options?.testRunId != null ? { testRunId: options.testRunId } : {}),
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
      enriched.submittedAt,
      enriched.eventAt,
      enriched.comment,
      enriched.dueDate,
      enriched.year,
      enriched.quarter,
      options?.scheduleSlot,
      options?.testRunId,
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

async function buildTestEventPayload(
  scenario: NotificationScenario,
  testRunId: number,
): Promise<NotificationEventPayload> {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const base = {
    appUrl,
    testRunId,
    year: new Date().getFullYear(),
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
  };

  if (scenario.triggerEvent.startsWith("annual_goal.")) {
    const annualGoalPayload = await buildAnnualGoalTestEventPayload(scenario.triggerEvent, base);
    if (annualGoalPayload) return annualGoalPayload;
  }

  if (scenario.triggerEvent.startsWith("quarterly_work.") || scenario.triggerEvent.startsWith("project.")) {
    const productPayload = await buildQuarterlyWorkTestEventPayload(scenario.triggerEvent, base);
    if (productPayload) return productPayload;
  }

  if (scenario.triggerEvent === "kpi.initialization.pending" || scenario.triggerEvent === "kpi.self_review.pending") {
    const kpiPayload = await buildKpiTestEventPayload(scenario.triggerEvent, base);
    if (kpiPayload) return kpiPayload;
  }

  if (scenario.triggerEvent === "kpi.approval.pending") {
    const sampleKpi = await prisma.personalKpi.findFirst({
      where: {
        deletedAt: null,
        status: {
          in: [
            "PENDING_LEADER_SCORE",
            "PENDING_MANAGER_SCORE",
            "PENDING_FINAL_REVIEW",
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        year: true,
        quarter: true,
        status: true,
      },
    });

    if (sampleKpi) {
      const [subjectUser, pendingStep] = await Promise.all([
        prisma.user.findFirst({
          where: { id: sampleKpi.userId, deletedAt: null },
          select: { name: true },
        }),
        prisma.personalKpiApprovalStep.findFirst({
          where: { personalKpiId: sampleKpi.id, status: "PENDING" },
          orderBy: { stepOrder: "asc" },
          select: { approverId: true },
        }),
      ]);

      return {
        ...base,
        userId: sampleKpi.userId,
        subjectUserId: sampleKpi.userId,
        submitterId: sampleKpi.userId,
        userName: subjectUser?.name ?? "测试用户",
        kpiId: sampleKpi.id,
        targetType: "PersonalKpi",
        targetId: sampleKpi.id,
        year: sampleKpi.year,
        quarter: sampleKpi.quarter,
        status: sampleKpi.status,
        currentApproverId: pendingStep?.approverId ?? undefined,
      };
    }
  }

  const sampleMember = await prisma.user.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      roleType: "MEMBER",
      orgNodeId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, orgNodeId: true },
  });

  return {
    ...base,
    userId: sampleMember?.id ?? "test-user",
    subjectUserId: sampleMember?.id ?? "test-user",
    submitterId: sampleMember?.id ?? "test-user",
    userName: sampleMember?.name ?? "测试用户",
    kpiId: "test-kpi",
    targetType: "PersonalKpi",
    targetId: "test-kpi",
    title: "测试通知",
    comment: "这是一条测试通知",
  };
}

export async function deliverTestNotification(input: {
  scenario: NotificationScenario;
  testRunId?: number | string;
}) {
  const channelConfig = asChannelConfig(input.scenario.channelConfig);
  const recipientConfig = asRecipientConfig(input.scenario.recipientConfig);
  const conditionConfig = asConditionConfig(input.scenario.conditionConfig);
  const testRunId = input.testRunId ?? Date.now();
  const normalizedTestRunId = typeof testRunId === "string" ? Number(testRunId) || Date.now() : testRunId;
  const payload = await buildTestEventPayload(input.scenario, normalizedTestRunId);

  if (!matchesConditions(conditionConfig, payload)) {
    throw new Error("测试数据不满足场景条件，请调整条件配置或准备测试数据");
  }

  const recipientUserIds = await resolveRecipientUserIds(recipientConfig, payload);
  if (!recipientUserIds.length) {
    throw new Error("测试未找到符合条件的接收人，请检查接收人规则与测试数据");
  }

  const eventKey = buildEventKey([
    "test",
    input.scenario.triggerEvent,
    input.scenario.id,
    testRunId,
  ]);

  for (const userId of recipientUserIds) {
    await deliverForUser({
      scenario: input.scenario,
      userId,
      payload,
      channelConfig,
      recipientConfig,
      eventKey,
    });
  }

  return prisma.notificationDeliveryLog.findMany({
    where: {
      scenarioId: input.scenario.id,
      eventKey: { contains: String(testRunId) },
    },
    select: { channel: true, status: true, error: true },
  });
}
