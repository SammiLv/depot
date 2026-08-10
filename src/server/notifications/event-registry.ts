import type { RecipientRuleType, ScheduleScanType } from "@/server/notifications/types";

export type NotificationEventDefinition = {
  code: string;
  label: string;
  category: string;
  payloadFields: string[];
  recipientResolvers: RecipientRuleType[];
};

export const NOTIFICATION_EVENT_REGISTRY: Record<string, NotificationEventDefinition> = {
  "kpi.initialized": {
    code: "kpi.initialized",
    label: "KPI 季度初始化",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.self_review.pending": {
    code: "kpi.self_review.pending",
    label: "KPI 待自评",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.scoring.submitted": {
    code: "kpi.scoring.submitted",
    label: "KPI 已提交评分",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "submitterId", "targetId", "status"],
    recipientResolvers: ["SUBJECT_USER", "SUBMITTER", "CURRENT_APPROVER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.approval.pending": {
    code: "kpi.approval.pending",
    label: "KPI 待审批/待评分",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "currentApproverId", "targetId", "status"],
    recipientResolvers: ["CURRENT_APPROVER", "SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.approval.approved": {
    code: "kpi.approval.approved",
    label: "KPI 审批通过",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId", "status"],
    recipientResolvers: ["SUBJECT_USER", "SUBMITTER", "CURRENT_APPROVER", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.approval.rejected": {
    code: "kpi.approval.rejected",
    label: "KPI 审批驳回",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "comment", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "SUBMITTER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
  "kpi.completed": {
    code: "kpi.completed",
    label: "KPI 终评完成",
    category: "KPI",
    payloadFields: ["userId", "userName", "kpiId", "year", "quarter", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "DEPARTMENT_MANAGER", "EXPLICIT_USERS", "ROLE"],
  },
  "todo.due_soon": {
    code: "todo.due_soon",
    label: "待办即将到期",
    category: "待办",
    payloadFields: ["userId", "todoId", "title", "dueDate", "targetType", "targetId"],
    recipientResolvers: ["SUBJECT_USER", "TEAM_LEADER_OF_SUBJECT", "EXPLICIT_USERS", "ROLE"],
  },
};

export const SCHEDULE_SCAN_REGISTRY: Record<ScheduleScanType, { label: string; emitEvent: string }> = {
  kpi_self_review_pending: {
    label: "KPI 自评未完成提醒",
    emitEvent: "kpi.self_review.pending",
  },
  todo_due: {
    label: "待办到期提醒",
    emitEvent: "todo.due_soon",
  },
};

export const RECIPIENT_RULE_LABELS: Record<RecipientRuleType, string> = {
  SUBJECT_USER: "事件主体用户",
  SUBMITTER: "提交人",
  CURRENT_APPROVER: "当前审批人",
  TEAM_LEADER_OF_SUBJECT: "主体所在组组长",
  DEPARTMENT_MANAGER: "部门主管",
  EXPLICIT_USERS: "指定人员",
  ROLE: "按角色",
};

export function listNotificationEvents() {
  return Object.values(NOTIFICATION_EVENT_REGISTRY);
}

export function getNotificationEvent(code: string) {
  return NOTIFICATION_EVENT_REGISTRY[code] ?? null;
}
