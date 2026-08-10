import type { NotificationType, RoleType } from "@prisma/client";

export type RecipientRuleType =
  | "SUBJECT_USER"
  | "SUBMITTER"
  | "CURRENT_APPROVER"
  | "TEAM_LEADER_OF_SUBJECT"
  | "DEPARTMENT_MANAGER"
  | "EXPLICIT_USERS"
  | "ROLE";

export type RecipientRule = {
  type: RecipientRuleType;
  userIds?: string[];
  roleTypes?: RoleType[];
};

export type RecipientConfig = {
  rules: RecipientRule[];
  dedupeWindowHours?: number;
};

export type ChannelConfig = {
  channels: Array<"IN_APP" | "DINGTALK">;
  notificationType?: NotificationType;
  dingtalkNotifyType?: number;
  titleTemplate: string;
  contentTemplate?: string;
  messageUrlTemplate?: string;
};

export type ScheduleFrequency = "daily" | "weekly";

export type ScheduleScanType = "kpi_self_review_pending" | "todo_due";

export type ScheduleConfig = {
  frequency: ScheduleFrequency;
  timeOfDay: string;
  weekdays?: number[];
  scanType: ScheduleScanType;
  daysBefore?: number;
  timezone?: string;
};

export type ConditionConfig = {
  conditions?: Array<{
    field: string;
    operator: "eq" | "neq";
    value: string | number | boolean;
  }>;
};

export type NotificationEventPayload = {
  userId?: string;
  subjectUserId?: string;
  submitterId?: string;
  currentApproverId?: string;
  userName?: string;
  kpiId?: string;
  targetType?: string;
  targetId?: string;
  year?: number;
  quarter?: number;
  comment?: string;
  title?: string;
  dueDate?: string;
  todoId?: string;
  status?: string;
  appUrl?: string;
  [key: string]: string | number | boolean | undefined | null;
};
