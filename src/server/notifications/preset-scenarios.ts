import { prisma } from "@/server/db/prisma";
import { computeNextRunAt, parseScheduleConfig } from "@/server/notifications/schedule-utils";
import { resolveEventModule } from "@/server/notifications/event-registry";

const initializationReminderSchedule = {
  frequency: "weekly" as const,
  timeOfDay: "09:00",
  weekdays: [1],
  scanType: "kpi_initialization_pending" as const,
  daysBefore: 0,
  timezone: "Asia/Shanghai",
};

const selfReviewSchedule = {
  frequency: "daily" as const,
  timeOfDay: "09:00",
  weekdays: [1, 2, 3, 4, 5],
  scanType: "kpi_self_review_pending" as const,
  daysBefore: 0,
  timezone: "Asia/Shanghai",
};

const annualGoalWeeklySchedule = {
  frequency: "weekly" as const,
  timeOfDay: "09:00",
  weekdays: [1],
  scanType: "annual_goal_weekly_progress_pending" as const,
  daysBefore: 1,
  timezone: "Asia/Shanghai",
};

const annualGoalQuarterTargetSchedule = {
  frequency: "weekly" as const,
  timeOfDay: "09:00",
  weekdays: [1],
  scanType: "annual_goal_quarter_target_missing" as const,
  daysBefore: 0,
  timezone: "Asia/Shanghai",
};

const PRESET_SCENARIOS = [
  {
    name: "季度 KPI 初始化提醒",
    description: "每季度扫描各部门：若本季度已生成 KPI 份数少于部门人数（不含主管），则通知部门主管完成初始化",
    module: resolveEventModule("kpi.initialization.pending"),
    triggerType: "SCHEDULE" as const,
    triggerEvent: "kpi.initialization.pending",
    scheduleConfig: initializationReminderSchedule,
    nextRunAt: computeNextRunAt(initializationReminderSchedule),
    recipientConfig: { rules: [{ type: "DEPARTMENT_MANAGER" }], dedupeWindowHours: 24 },
    channelConfig: {
      channels: ["IN_APP", "DINGTALK"],
      notificationType: "KPI_TODO",
      dingtalkNotifyType: 5,
      titleTemplate: "{{year}}年Q{{quarter}} KPI 待初始化（{{pendingCount}}人）",
      contentTemplate: "{{departmentName}} 仍有 {{pendingCount}} 名成员未生成本季度 KPI，请尽快完成初始化。",
      messageUrlTemplate: "{{appUrl}}/kpi",
    },
    isActive: true,
    sortOrder: 5,
  },
  {
    name: "KPI 初始化提醒自评",
    description: "季度 KPI 初始化后，通知被考核人开始自评",
    module: resolveEventModule("kpi.initialized"),
    triggerType: "EVENT" as const,
    triggerEvent: "kpi.initialized",
    recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 0 },
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
    module: resolveEventModule("kpi.approval.pending"),
    triggerType: "EVENT" as const,
    triggerEvent: "kpi.approval.pending",
    recipientConfig: { rules: [{ type: "CURRENT_APPROVER" }], dedupeWindowHours: 0 },
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
    module: resolveEventModule("kpi.approval.rejected"),
    triggerType: "EVENT" as const,
    triggerEvent: "kpi.approval.rejected",
    recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 0 },
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
    module: resolveEventModule("kpi.completed"),
    triggerType: "EVENT" as const,
    triggerEvent: "kpi.completed",
    recipientConfig: { rules: [{ type: "SUBJECT_USER" }], dedupeWindowHours: 0 },
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
    module: resolveEventModule("kpi.self_review.pending"),
    triggerType: "SCHEDULE" as const,
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
  {
    name: "周进度未更新提醒",
    description: "每周扫描小组承接的季度指标：若当前季度进度距扫描时间已超过 1 天未更新，则通知指标责任人",
    module: resolveEventModule("annual_goal.progress.weekly_pending"),
    triggerType: "SCHEDULE" as const,
    triggerEvent: "annual_goal.progress.weekly_pending",
    scheduleConfig: annualGoalWeeklySchedule,
    nextRunAt: computeNextRunAt(annualGoalWeeklySchedule),
    recipientConfig: { rules: [{ type: "METRIC_RESPONSIBLE" }], dedupeWindowHours: 24 },
    channelConfig: {
      channels: ["IN_APP", "DINGTALK"],
      notificationType: "GOAL_UPDATE",
      dingtalkNotifyType: 5,
      titleTemplate: "{{year}}年Q{{quarter}} {{metricName}} 周进度未更新",
      contentTemplate: "已超过 {{daysSinceUpdate}} 天未更新进度，请及时维护。",
      messageUrlTemplate: "{{appUrl}}/annual-goals?year={{year}}",
    },
    isActive: true,
    sortOrder: 60,
  },
  {
    name: "季度目标未拆解提醒",
    description: "每周一扫描 ACTIVE 方案下小组承接指标缺少季度拆解的情况",
    module: resolveEventModule("annual_goal.quarter_target.missing"),
    triggerType: "SCHEDULE" as const,
    triggerEvent: "annual_goal.quarter_target.missing",
    scheduleConfig: annualGoalQuarterTargetSchedule,
    nextRunAt: computeNextRunAt(annualGoalQuarterTargetSchedule),
    recipientConfig: {
      rules: [{ type: "TEAM_LEADERS_OF_TEAM" }, { type: "METRIC_RESPONSIBLE" }],
      dedupeWindowHours: 24,
    },
    channelConfig: {
      channels: ["IN_APP", "DINGTALK"],
      notificationType: "GOAL_UPDATE",
      dingtalkNotifyType: 5,
      titleTemplate: "{{year}}年 {{metricName}} 季度目标未拆解",
      contentTemplate: "{{teamName}} 承接的指标仍缺少完整季度目标，请尽快拆解。",
      messageUrlTemplate: "{{appUrl}}/annual-goals?year={{year}}",
    },
    isActive: true,
    sortOrder: 70,
  },
  {
    name: "指标目标值变更通知",
    description: "部门指标、元指标或季度目标的目标值发生变更时通知相关责任人",
    module: resolveEventModule("annual_goal.target.changed"),
    triggerType: "EVENT" as const,
    triggerEvent: "annual_goal.target.changed",
    recipientConfig: { rules: [{ type: "METRIC_RESPONSIBLE_OR_DEPT_MANAGER" }], dedupeWindowHours: 0 },
    channelConfig: {
      channels: ["IN_APP", "DINGTALK"],
      notificationType: "GOAL_UPDATE",
      dingtalkNotifyType: 5,
      titleTemplate: "{{metricName}} 目标值已变更",
      contentTemplate: "目标值由 {{previousTargetValue}} 调整为 {{targetValue}}。",
      messageUrlTemplate: "{{appUrl}}/annual-goals?year={{year}}",
    },
    isActive: true,
    sortOrder: 80,
  },
  {
    name: "小组指标待配置责任人",
    description: "小组新建指标承接但未配置责任人时通知组长",
    module: resolveEventModule("annual_goal.team.responsible_pending"),
    triggerType: "EVENT" as const,
    triggerEvent: "annual_goal.team.responsible_pending",
    recipientConfig: { rules: [{ type: "TEAM_LEADERS_OF_TEAM" }], dedupeWindowHours: 0 },
    channelConfig: {
      channels: ["IN_APP", "DINGTALK"],
      notificationType: "GOAL_UPDATE",
      dingtalkNotifyType: 5,
      titleTemplate: "{{teamName}} 有指标待配置责任人",
      contentTemplate: "承接指标 {{metricNames}} 尚未配置责任人，请尽快维护。",
      messageUrlTemplate: "{{appUrl}}/annual-goals?year={{year}}",
    },
    isActive: true,
    sortOrder: 90,
  },
  {
    name: "指标风险状态变更",
    description: "指标或元指标风险状态升为滞后/风险时通知相关责任人",
    module: resolveEventModule("annual_goal.risk.changed"),
    triggerType: "EVENT" as const,
    triggerEvent: "annual_goal.risk.changed",
    recipientConfig: { rules: [{ type: "METRIC_RESPONSIBLE_OR_DEPT_MANAGER" }], dedupeWindowHours: 0 },
    channelConfig: {
      channels: ["IN_APP", "DINGTALK"],
      notificationType: "GOAL_UPDATE",
      dingtalkNotifyType: 5,
      titleTemplate: "{{metricName}} 风险状态已变更",
      contentTemplate: "风险状态由 {{previousRiskStatus}} 调整为 {{riskStatus}}。",
      messageUrlTemplate: "{{appUrl}}/annual-goals?year={{year}}",
    },
    isActive: true,
    sortOrder: 100,
  },
] as const;

export async function ensurePresetNotificationScenarios() {
  for (const preset of PRESET_SCENARIOS) {
    const existing = await prisma.notificationScenario.findFirst({
      where: { name: preset.name },
      select: { id: true, scheduleConfig: true },
    });

    if (!existing) {
      await prisma.notificationScenario.create({ data: { ...preset } });
      continue;
    }

    const updateData: {
      description: string;
      module: string;
      scheduleConfig?: typeof preset.scheduleConfig;
      nextRunAt?: Date | null;
    } = {
      description: preset.description,
      module: preset.module,
    };

    if ("scheduleConfig" in preset && preset.scheduleConfig) {
      const currentSchedule = parseScheduleConfig(existing.scheduleConfig) ?? preset.scheduleConfig;
      updateData.scheduleConfig = {
        ...currentSchedule,
        ...preset.scheduleConfig,
        daysBefore: preset.scheduleConfig.daysBefore,
      };
      updateData.nextRunAt = computeNextRunAt(updateData.scheduleConfig);
    }

    await prisma.notificationScenario.update({
      where: { id: existing.id },
      data: updateData,
    });
  }
}
