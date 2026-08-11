"use server";

import { revalidatePath } from "next/cache";
import type { NotificationTriggerType, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { deliverTestNotification } from "@/server/notifications/engine";
import { getNotificationEvent, isNotificationModule, SCHEDULE_SCAN_REGISTRY } from "@/server/notifications/event-registry";
import {
  assertCanManageNotificationGroupBotRecord,
  assertCanManageNotificationScenarioRecord,
  requireManageNotificationScenario,
} from "@/server/notifications/permission";
import { runScheduleScenarioScan } from "@/server/notifications/scheduler";
import { summarizeDeliveryLogs } from "@/server/notifications/test-result";
import { computeNextRunAt, formatScheduleNextRunHint, parseScheduleConfig, previewScheduleNextRun } from "@/server/notifications/schedule-utils";
import type {
  ChannelConfig,
  ConditionConfig,
  RecipientConfig,
  RecipientRule,
  ScheduleConfig,
} from "@/server/notifications/types";

function requiredString(value: FormDataEntryValue | null, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function parseJsonField<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label}格式不正确`);
  }
}

function normalizeRecipientConfig(raw: RecipientConfig): RecipientConfig {
  if (!raw || !Array.isArray(raw.rules)) {
    throw new Error("接收人规则不能为空");
  }
  const rules: RecipientRule[] = raw.rules.map((rule, index) => {
    if (!rule?.type) throw new Error(`第 ${index + 1} 条接收人规则缺少类型`);
    return {
      type: rule.type,
      userIds: Array.isArray(rule.userIds) ? rule.userIds.filter(Boolean) : undefined,
      roleTypes: Array.isArray(rule.roleTypes) ? rule.roleTypes : undefined,
    };
  });
  if (!rules.length) throw new Error("至少配置一条接收人规则");
  return {
    rules,
    dedupeWindowHours: typeof raw.dedupeWindowHours === "number" ? raw.dedupeWindowHours : 0,
  };
}

function normalizeChannelConfig(raw: ChannelConfig): ChannelConfig {
  if (!raw?.titleTemplate?.trim()) throw new Error("标题模板不能为空");
  const channels = Array.isArray(raw.channels)
    ? raw.channels.filter((c) => c === "IN_APP" || c === "DINGTALK" || c === "DINGTALK_PERSONAL" || c === "DINGTALK_GROUP")
    : [];
  if (!channels.length) throw new Error("至少选择一个通知渠道");
  if (channels.includes("DINGTALK_GROUP") && !raw.groupBotId?.trim()) {
    throw new Error("已勾选群消息通知，请选择群机器人");
  }
  return {
    channels,
    groupBotId: raw.groupBotId?.trim() || undefined,
    notificationType: raw.notificationType ?? "KPI_TODO",
    dingtalkNotifyType: raw.dingtalkNotifyType ?? 5,
    titleTemplate: raw.titleTemplate.trim(),
    contentTemplate: raw.contentTemplate?.trim() || undefined,
    messageUrlTemplate: raw.messageUrlTemplate?.trim() || undefined,
  };
}

function parseScenarioForm(formData: FormData) {
  const name = requiredString(formData.get("name"), "场景名称");
  const description = optionalString(formData.get("description"));
  const triggerType = requiredString(formData.get("triggerType"), "触发类型") as NotificationTriggerType;
  if (triggerType !== "EVENT" && triggerType !== "SCHEDULE") {
    throw new Error("触发类型不正确");
  }

  const recipientConfig = normalizeRecipientConfig(
    parseJsonField<RecipientConfig>(requiredString(formData.get("recipientConfig"), "接收人配置"), "接收人配置"),
  );
  const channelConfig = normalizeChannelConfig(
    parseJsonField<ChannelConfig>(requiredString(formData.get("channelConfig"), "渠道配置"), "渠道配置"),
  );
  const conditionRaw = optionalString(formData.get("conditionConfig"));
  const conditionConfig = conditionRaw
    ? parseJsonField<ConditionConfig>(conditionRaw, "条件配置")
    : null;
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";
  const sortOrder = Number(formData.get("sortOrder") ?? 0) || 0;
  const module = requiredString(formData.get("module"), "所属模块");
  if (!isNotificationModule(module)) {
    throw new Error("所属模块不在可选范围内");
  }

  let triggerEvent = "";
  let scheduleConfig: ScheduleConfig | null = null;
  let nextRunAt: Date | null = null;

  if (triggerType === "EVENT") {
    triggerEvent = requiredString(formData.get("triggerEvent"), "触发事件");
    if (!getNotificationEvent(triggerEvent)) {
      throw new Error("不支持的触发事件");
    }
  } else {
    scheduleConfig = parseScheduleConfig(
      parseJsonField<ScheduleConfig>(requiredString(formData.get("scheduleConfig"), "定时配置"), "定时配置"),
    );
    if (!scheduleConfig) throw new Error("定时配置不完整");
    if (!SCHEDULE_SCAN_REGISTRY[scheduleConfig.scanType]) {
      throw new Error("不支持的扫描类型");
    }
    triggerEvent = SCHEDULE_SCAN_REGISTRY[scheduleConfig.scanType].emitEvent;
    nextRunAt = computeNextRunAt(scheduleConfig);
  }

  return {
    name,
    description,
    module,
    triggerType,
    triggerEvent,
    scheduleConfig: scheduleConfig as Prisma.InputJsonValue | undefined,
    nextRunAt,
    recipientConfig: recipientConfig as Prisma.InputJsonValue,
    channelConfig: channelConfig as Prisma.InputJsonValue,
    conditionConfig: (conditionConfig ?? undefined) as Prisma.InputJsonValue | undefined,
    isActive,
    sortOrder,
  };
}

export async function saveNotificationScenario(formData: FormData): Promise<string> {
  const currentUser = await requireManageNotificationScenario();
  const id = optionalString(formData.get("id"));
  const data = parseScenarioForm(formData);

  if (id) {
    await assertCanManageNotificationScenarioRecord(id);
    await prisma.notificationScenario.update({
      where: { id },
      data: {
        ...data,
        updatedById: currentUser.id,
      },
    });
  } else {
    await prisma.notificationScenario.create({
      data: {
        ...data,
        createdById: currentUser.id,
        updatedById: currentUser.id,
      },
    });
  }

  revalidatePath("/notifications");

  if (data.triggerType === "SCHEDULE" && data.scheduleConfig) {
    const schedule = parseScheduleConfig(data.scheduleConfig);
    if (schedule) {
      return formatScheduleNextRunHint(previewScheduleNextRun(schedule), schedule.timeOfDay || "09:00");
    }
  }
  return "场景已保存。";
}

export async function toggleNotificationScenario(formData: FormData) {
  const id = requiredString(formData.get("id"), "场景");
  const currentUser = await assertCanManageNotificationScenarioRecord(id);
  const scenario = await prisma.notificationScenario.findUnique({ where: { id } });
  if (!scenario) throw new Error("场景不存在");

  const isActive = !scenario.isActive;
  let nextRunAt = scenario.nextRunAt;
  if (isActive && scenario.triggerType === "SCHEDULE") {
    const schedule = parseScheduleConfig(scenario.scheduleConfig);
    if (schedule) nextRunAt = computeNextRunAt(schedule);
  }

  await prisma.notificationScenario.update({
    where: { id },
    data: { isActive, nextRunAt, updatedById: currentUser.id },
  });
  revalidatePath("/notifications");
}

export async function deleteNotificationScenario(formData: FormData) {
  const id = requiredString(formData.get("id"), "场景");
  await assertCanManageNotificationScenarioRecord(id);
  await prisma.notificationScenario.delete({ where: { id } });
  revalidatePath("/notifications");
}

export async function testNotificationScenario(formData: FormData): Promise<string> {
  const id = requiredString(formData.get("id"), "场景");
  await assertCanManageNotificationScenarioRecord(id);
  const scenario = await prisma.notificationScenario.findUnique({ where: { id } });
  if (!scenario) throw new Error("场景不存在");

  if (scenario.triggerType === "SCHEDULE") {
    const testRunId = Date.now();
    await runScheduleScenarioScan(scenario.id, { testRunId });
    let logs = await prisma.notificationDeliveryLog.findMany({
      where: {
        scenarioId: scenario.id,
        eventKey: { contains: String(testRunId) },
      },
      select: { channel: true, status: true, error: true },
    });

    if (!logs.length) {
      try {
        logs = await deliverTestNotification({ scenario, testRunId });
        revalidatePath("/notifications");
        const summary = summarizeDeliveryLogs(logs);
        return `当前扫描未命中符合条件的数据（常见原因：部门 KPI 已全部初始化等），已改用示例数据发送测试通知。${summary}`;
      } catch (error) {
        revalidatePath("/notifications");
        if (error instanceof Error) return error.message;
        return "测试失败，请稍后重试";
      }
    }

    revalidatePath("/notifications");
    return summarizeDeliveryLogs(logs);
  }

  try {
    const logs = await deliverTestNotification({ scenario });
    revalidatePath("/notifications");
    return summarizeDeliveryLogs(logs);
  } catch (error) {
    revalidatePath("/notifications");
    if (error instanceof Error) return error.message;
    return "测试失败，请稍后重试";
  }
}

export async function markNotificationRead(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const id = requiredString(formData.get("id"), "通知");
  await prisma.notification.updateMany({
    where: { id, userId: currentUser.id },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead() {
  const currentUser = await requireCurrentUser();
  await prisma.notification.updateMany({
    where: { userId: currentUser.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

function normalizeGroupBotSecurityType(value: string) {
  if (value === "KEYWORD" || value === "SIGN" || value === "IP") return value;
  throw new Error("安全设置类型不正确");
}

export async function saveNotificationGroupBot(formData: FormData) {
  const currentUser = await requireManageNotificationScenario();
  const id = optionalString(formData.get("id"));
  const name = requiredString(formData.get("name"), "群名称");
  const webhookUrl = requiredString(formData.get("webhookUrl"), "Webhook 地址");
  const securityType = normalizeGroupBotSecurityType(requiredString(formData.get("securityType"), "安全设置"));
  const securityValue = requiredString(formData.get("securityValue"), "安全设置值");

  if (!webhookUrl.startsWith("https://oapi.dingtalk.com/robot/send")) {
    throw new Error("Webhook 地址格式不正确");
  }

  if (id) {
    await assertCanManageNotificationGroupBotRecord(id);
    await prisma.notificationGroupBot.update({
      where: { id },
      data: {
        name,
        webhookUrl,
        securityType,
        securityValue,
        updatedById: currentUser.id,
      },
    });
  } else {
    await prisma.notificationGroupBot.create({
      data: {
        name,
        webhookUrl,
        securityType,
        securityValue,
        createdById: currentUser.id,
        updatedById: currentUser.id,
      },
    });
  }

  revalidatePath("/notifications");
}

export async function deleteNotificationGroupBot(formData: FormData) {
  const id = requiredString(formData.get("id"), "群机器人");
  await assertCanManageNotificationGroupBotRecord(id);
  await prisma.notificationGroupBot.delete({ where: { id } });
  revalidatePath("/notifications");
}
