/**
 * 审计事件类型定义和常量
 *
 * 根据《平台审计日志与业务日志建设方案》第四节定义
 */

// ============ 操作者类型 ============
export const ACTOR_TYPES = {
  USER: "USER",
  SYSTEM: "SYSTEM",
  DEPLOYMENT_SCRIPT: "DEPLOYMENT_SCRIPT",
  DATA_MAINTENANCE: "DATA_MAINTENANCE",
} as const;

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

// ============ 模块定义 ============
export const AUDIT_MODULES = {
  // 账号与权限
  ACCOUNT: "ACCOUNT",
  AUTH: "AUTH",
  PERMISSION: "PERMISSION",
  ORGANIZATION: "ORGANIZATION",

  // 业务模块
  ANNUAL_GOAL: "ANNUAL_GOAL",
  KPI: "KPI",
  PRODUCT_MANAGEMENT: "PRODUCT_MANAGEMENT",
  TALENT: "TALENT",
  NOTIFICATION: "NOTIFICATION",

  // 平台运维
  DEPLOYMENT: "DEPLOYMENT",
  DATA_MAINTENANCE: "DATA_MAINTENANCE",
  SYSTEM: "SYSTEM",
} as const;

export type AuditModule = (typeof AUDIT_MODULES)[keyof typeof AUDIT_MODULES];

// ============ 操作代码定义 ============
export const AUDIT_ACTION_CODES = {
  // 登录与账号
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  ACCOUNT_ENABLE: "ACCOUNT_ENABLE",
  ACCOUNT_DISABLE: "ACCOUNT_DISABLE",
  PASSWORD_RESET: "PASSWORD_RESET",
  ROLE_CHANGE: "ROLE_CHANGE",

  // 权限
  PERMISSION_GRANT: "PERMISSION_GRANT",
  PERMISSION_REVOKE: "PERMISSION_REVOKE",
  PERMISSION_SCOPE_CHANGE: "PERMISSION_SCOPE_CHANGE",

  // 组织
  ORG_LEADER_CHANGE: "ORG_LEADER_CHANGE",
  ORG_MEMBER_MOVE: "ORG_MEMBER_MOVE",
  ORG_NODE_CREATE: "ORG_NODE_CREATE",
  ORG_NODE_UPDATE: "ORG_NODE_UPDATE",
  ORG_NODE_DELETE: "ORG_NODE_DELETE",

  // 通知配置
  NOTIFICATION_SCENARIO_CREATE: "NOTIFICATION_SCENARIO_CREATE",
  NOTIFICATION_SCENARIO_UPDATE: "NOTIFICATION_SCENARIO_UPDATE",
  NOTIFICATION_SCENARIO_DELETE: "NOTIFICATION_SCENARIO_DELETE",
  NOTIFICATION_BOT_CREATE: "NOTIFICATION_BOT_CREATE",
  NOTIFICATION_BOT_UPDATE: "NOTIFICATION_BOT_UPDATE",
  NOTIFICATION_BOT_DELETE: "NOTIFICATION_BOT_DELETE",

  // 导入导出
  DATA_IMPORT: "DATA_IMPORT",
  DATA_EXPORT: "DATA_EXPORT",

  // 发布部署
  GIT_PULL: "GIT_PULL",
  DATABASE_BACKUP: "DATABASE_BACKUP",
  DATABASE_MIGRATE: "DATABASE_MIGRATE",
  DEPENDENCIES_INSTALL: "DEPENDENCIES_INSTALL",
  BUILD: "BUILD",
  SERVICE_START: "SERVICE_START",
  SERVICE_STOP: "SERVICE_STOP",
  SERVICE_RESTART: "SERVICE_RESTART",
  HEALTH_CHECK: "HEALTH_CHECK",
  ROLLBACK: "ROLLBACK",

  // 数据维护
  DATA_REPAIR: "DATA_REPAIR",
  DATA_BACKFILL: "DATA_BACKFILL",
  BATCH_UPDATE: "BATCH_UPDATE",

  // 通用操作
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  SUBMIT: "SUBMIT",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  CANCEL: "CANCEL",
  CONFIRM: "CONFIRM",
  PUBLISH: "PUBLISH",
  ARCHIVE: "ARCHIVE",
} as const;

export type AuditActionCode = (typeof AUDIT_ACTION_CODES)[keyof typeof AUDIT_ACTION_CODES];

// ============ 审计事件输入类型 ============
export interface AuditEventInput {
  // 操作者信息
  actorId?: string | null;
  actorName?: string | null;
  actorType?: ActorType;
  loginMethod?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;

  // 操作信息（必填）
  module: AuditModule | string;
  actionCode: AuditActionCode | string;
  actionName: string;
  isSuccess?: boolean;
  operatedAt?: Date;
  operationNote?: string | null;
  failureReason?: string | null;

  // 业务对象信息
  objectType?: string | null;
  objectId?: string | null;
  objectName?: string | null;
  objectDepartment?: string | null;

  // 数据变化
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  changedFields?: string[] | null;
  batchTotalCount?: number | null;
  batchSuccessCount?: number | null;
  batchFailureCount?: number | null;

  // 追溯信息
  requestId?: string | null;
  correlationId?: string | null;
  eventKey?: string | null;
  gitCommit?: string | null;
  buildId?: string | null;
  releaseBatchId?: string | null;
  serverIdentity?: string | null;
}

// ============ 敏感字段黑名单 ============
export const SENSITIVE_FIELD_BLACKLIST = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "apiSecret",
  "webhookUrl",
  "securityValue",
  "cookie",
  "session",
  "authorization",
  "dingTalkSecret",
  "dingTalkToken",
] as const;

// ============ 审计查询筛选类型 ============
export interface AuditEventFilter {
  // 时间范围
  startDate?: Date;
  endDate?: Date;

  // 操作人员
  actorId?: string;
  actorType?: ActorType;

  // 模块和操作
  module?: AuditModule | string;
  actionCode?: AuditActionCode | string;

  // 业务对象
  objectType?: string;
  objectId?: string;

  // 成功或失败
  isSuccess?: boolean;

  // 追溯信息
  correlationId?: string;
  releaseBatchId?: string;
  gitCommit?: string;
  buildId?: string;

  // 分页
  page?: number;
  pageSize?: number;
}
