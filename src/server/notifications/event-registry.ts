import type { RecipientRuleType, ScheduleScanType } from "@/server/notifications/types";

/** 通知场景 / 业务事件所属模块（与侧边栏业务域对齐） */
export const NOTIFICATION_MODULE_OPTIONS = [
  "指标管理",
  "产品管理",
  "KPI管理",
  "人才发展",
] as const;

export type NotificationModule = (typeof NOTIFICATION_MODULE_OPTIONS)[number];

export type NotificationEventDefinition = {
  code: string;
  label: string;
  /** 所属模块，用于事件归类与场景筛选 */
  module: string;
  payloadFields: string[];
  recipientResolvers: RecipientRuleType[];
};

export const NOTIFICATION_EVENT_REGISTRY: Record<string, NotificationEventDefinition> = {
  "kpi.initialized": {
    code: "kpi.initialized",
    label: "KPI 季度初始化",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.initialization.pending": {
    code: "kpi.initialization.pending",
    label: "KPI 待初始化",
    module: "KPI管理",
    payloadFields: ["year", "quarter", "pendingCount", "departmentOrgNodeId", "departmentName", "targetId"],
    recipientResolvers: ["DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.self_review.pending": {
    code: "kpi.self_review.pending",
    label: "KPI 待自评",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.scoring.submitted": {
    code: "kpi.scoring.submitted",
    label: "KPI 已提交评分",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "submitterId", "targetId", "status"],
    recipientResolvers: ["SUBJECT_USER", "SUBMITTER", "CURRENT_APPROVER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.approval.pending": {
    code: "kpi.approval.pending",
    label: "KPI 待审批/待评分",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "currentApproverId", "targetId", "status"],
    recipientResolvers: ["CURRENT_APPROVER", "SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.approval.approved": {
    code: "kpi.approval.approved",
    label: "KPI 审批通过",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId", "status"],
    recipientResolvers: ["SUBJECT_USER", "SUBMITTER", "CURRENT_APPROVER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.approval.rejected": {
    code: "kpi.approval.rejected",
    label: "KPI 审批驳回",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "comment", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "SUBMITTER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.completed": {
    code: "kpi.completed",
    label: "KPI 终评完成",
    module: "KPI管理",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "todo.due_soon": {
    code: "todo.due_soon",
    label: "待办即将到期",
    module: "产品管理",
    payloadFields: ["userId", "todoId", "title", "dueDate", "targetType", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "quarterly_work.assigned": {
    code: "quarterly_work.assigned",
    label: "季度任务负责人变更",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "year", "quarter", "projectTitle", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "quarterly_work.status.changed": {
    code: "quarterly_work.status.changed",
    label: "季度任务状态变更",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "status", "previousStatus", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "quarterly_work.overdue": {
    code: "quarterly_work.overdue",
    label: "季度任务延期",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "endMonth", "overdueDays", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "quarterly_work.due_soon": {
    code: "quarterly_work.due_soon",
    label: "季度任务即将延期",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "endMonth", "daysUntilDue", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "project.assigned": {
    code: "project.assigned",
    label: "项目负责人变更",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "endQuarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "project.completed": {
    code: "project.completed",
    label: "项目已完成",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "valueTrackStatus", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "project.overdue": {
    code: "project.overdue",
    label: "项目延期",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "endQuarter", "overdueDays", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "project.due_soon": {
    code: "project.due_soon",
    label: "项目即将延期",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "endQuarter", "daysUntilDue", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "project.value_judgement.changed": {
    code: "project.value_judgement.changed",
    label: "价值判断变更",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "valueJudgement", "previousValueJudgement", "valueTrackStatus", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "project.value_track.pending": {
    code: "project.value_track.pending",
    label: "价值跟踪待完成",
    module: "产品管理",
    payloadFields: ["title", "ownerId", "ownerName", "valueTrackStatus", "valueJudgement", "daysUntilQuarterEnd", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "annual_goal.progress.weekly_pending": {
    code: "annual_goal.progress.weekly_pending",
    label: "周进度未更新",
    module: "指标管理",
    payloadFields: ["planId", "planName", "year", "quarter", "metricName", "responsibleUserId", "daysSinceUpdate", "targetId"],
    recipientResolvers: ["METRIC_RESPONSIBLE", "EXPLICIT_USERS", "ROLE"],
  },
  "annual_goal.quarter_target.missing": {
    code: "annual_goal.quarter_target.missing",
    label: "季度目标未拆解",
    module: "指标管理",
    payloadFields: ["planId", "planName", "year", "metricName", "teamOrgNodeId", "missingQuarters", "responsibleUserId", "targetId"],
    recipientResolvers: ["TEAM_LEADERS_OF_TEAM", "METRIC_RESPONSIBLE", "EXPLICIT_USERS", "ROLE"],
  },
  "annual_goal.target.changed": {
    code: "annual_goal.target.changed",
    label: "指标目标值变更",
    module: "指标管理",
    payloadFields: ["planId", "planName", "year", "metricName", "previousTargetValue", "targetValue", "unit", "fieldScope", "targetId"],
    recipientResolvers: ["METRIC_RESPONSIBLE_OR_DEPT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "annual_goal.team.responsible_pending": {
    code: "annual_goal.team.responsible_pending",
    label: "小组指标待配置责任人",
    module: "指标管理",
    payloadFields: ["planId", "planName", "year", "teamOrgNodeId", "teamName", "metricNames", "assignmentCount", "targetId"],
    recipientResolvers: ["TEAM_LEADERS_OF_TEAM", "EXPLICIT_USERS", "ROLE"],
  },
  "annual_goal.risk.changed": {
    code: "annual_goal.risk.changed",
    label: "指标风险状态变更",
    module: "指标管理",
    payloadFields: ["planId", "planName", "year", "metricName", "previousRiskStatus", "riskStatus", "updaterId", "updaterName", "targetId"],
    recipientResolvers: ["METRIC_RESPONSIBLE_OR_DEPT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
};

export const SCHEDULE_SCAN_REGISTRY: Record<ScheduleScanType, { label: string; emitEvent: string }> = {
  kpi_initialization_pending: {
    label: "KPI 待初始化提醒",
    emitEvent: "kpi.initialization.pending",
  },
  kpi_self_review_pending: {
    label: "KPI 自评未完成提醒",
    emitEvent: "kpi.self_review.pending",
  },
  todo_due: {
    label: "待办到期提醒",
    emitEvent: "todo.due_soon",
  },
  annual_goal_weekly_progress_pending: {
    label: "小组季度进度未更新提醒",
    emitEvent: "annual_goal.progress.weekly_pending",
  },
  annual_goal_quarter_target_missing: {
    label: "指标季度目标未拆解提醒",
    emitEvent: "annual_goal.quarter_target.missing",
  },
  quarterly_work_overdue: {
    label: "季度任务延期提醒",
    emitEvent: "quarterly_work.overdue",
  },
  quarterly_work_due_soon: {
    label: "季度任务即将延期提醒",
    emitEvent: "quarterly_work.due_soon",
  },
  project_overdue: {
    label: "项目延期提醒",
    emitEvent: "project.overdue",
  },
  project_due_soon: {
    label: "项目即将延期提醒",
    emitEvent: "project.due_soon",
  },
  project_value_track_pending: {
    label: "价值跟踪待完成提醒",
    emitEvent: "project.value_track.pending",
  },
};

export const RECIPIENT_RULE_LABELS: Record<RecipientRuleType, string> = {
  SUBJECT_USER: "事件主体用户",
  SUBMITTER: "提交人",
  CURRENT_APPROVER: "当前审批人",
  TEAM_LEADER_OF_SUBJECT: "主体所在组全部组长",
  DEPARTMENT_MANAGER: "部门主管",
  METRIC_RESPONSIBLE: "指标责任人",
  TEAM_LEADERS_OF_TEAM: "承接小组组长",
  PLAN_DEPARTMENT_MANAGERS: "方案所属部门主管",
  METRIC_RESPONSIBLE_OR_DEPT_MANAGER: "责任人（无则部门主管）",
  EXPLICIT_USERS: "指定人员",
  ROLE: "按角色",
};

export function listNotificationEvents() {
  return Object.values(NOTIFICATION_EVENT_REGISTRY);
}

export function listNotificationModules(): NotificationModule[] {
  return [...NOTIFICATION_MODULE_OPTIONS];
}

export function isNotificationModule(value: string): value is NotificationModule {
  return (NOTIFICATION_MODULE_OPTIONS as readonly string[]).includes(value);
}

export function getNotificationEvent(code: string) {
  return NOTIFICATION_EVENT_REGISTRY[code] ?? null;
}

export function resolveEventModule(code: string): NotificationModule {
  const module = getNotificationEvent(code)?.module;
  if (module && isNotificationModule(module)) return module;
  if (code.startsWith("annual_goal.")) return "指标管理";
  if (code.startsWith("quarterly_work.") || code.startsWith("project.") || code.startsWith("todo.")) return "产品管理";
  return "KPI管理";
}
