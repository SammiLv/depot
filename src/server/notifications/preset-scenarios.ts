import { prisma } from "@/server/db/prisma";
import { computeNextRunAt } from "@/server/notifications/schedule-utils";

const PRESET_NAMES = [
  "KPI 初始化提醒自评",
  "KPI 提交后通知审批人",
  "KPI 审批驳回通知",
  "KPI 终评完成通知",
  "每日提醒未完成自评",
] as const;

export async function ensurePresetNotificationScenarios() {
  const existingCount = await prisma.notificationScenario.count({
    where: { name: { in: [...PRESET_NAMES] } },
  });
  if (existingCount > 0) return;

  const selfReviewSchedule = {
    frequency: "daily" as const,
    timeOfDay: "09:00",
    weekdays: [1, 2, 3, 4, 5],
    scanType: "kpi_self_review_pending" as const,
    daysBefore: 0,
    timezone: "Asia/Shanghai",
  };

  await prisma.notificationScenario.createMany({
    data: [
      {
        name: "KPI 初始化提醒自评",
        description: "季度 KPI 初始化后，通知被考核人开始自评",
        triggerType: "EVENT",
        triggerEvent: "kpi.initialized",
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 已开启，请开始自评",
          contentTemplate: "{{userName}}，您的季度 KPI 已初始化，请及时完成自评。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 10,
      },
      {
        name: "KPI 提交后通知审批人",
        description: "自评提交后通知当前审批人处理",
        triggerType: "EVENT",
        triggerEvent: "kpi.approval.pending",
        recipientConfig: { rules: [{ type: "CURRENT_APPROVER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "APPROVAL_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{userName}} 的 {{year}}年Q{{quarter}} KPI 待您处理",
          contentTemplate: "请及时完成评分或审批。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 20,
      },
      {
        name: "KPI 审批驳回通知",
        description: "审批驳回后通知被考核人修改",
        triggerType: "EVENT",
        triggerEvent: "kpi.approval.rejected",
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 已驳回，请修改后重提",
          contentTemplate: "{{userName}}，驳回原因：{{comment}}",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 30,
      },
      {
        name: "KPI 终评完成通知",
        description: "KPI 完成后通知被考核人",
        triggerType: "EVENT",
        triggerEvent: "kpi.completed",
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 24 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "{{year}}年Q{{quarter}} KPI 已完成终评",
          contentTemplate: "{{userName}}，您的季度 KPI 已完成，可前往查看结果。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 40,
      },
      {
        name: "每日提醒未完成自评",
        description: "每天 09:00 扫描仍处于自评阶段的 KPI",
        triggerType: "SCHEDULE",
        triggerEvent: "kpi.self_review.pending",
        scheduleConfig: selfReviewSchedule,
        nextRunAt: computeNextRunAt(selfReviewSchedule),
        recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 20 },
        channelConfig: {
          channels: ["IN_APP", "DINGTALK"],
          notificationType: "KPI_TODO",
          dingtalkNotifyType: 5,
          titleTemplate: "提醒：{{year}}年Q{{quarter}} KPI 自评尚未完成",
          contentTemplate: "{{userName}}，请尽快完成自评提交。",
          messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
        },
        isActive: true,
        sortOrder: 50,
      },
    ],
  });
}
