/**
 * 审计服务统一导出
 */

// 写入服务
export {
  writeAuditEvent,
  writeAuditFailure,
  getChangedFields,
  generateCorrelationId,
} from "./write-audit-event";

// 查询服务
export {
  queryAuditLogs,
  queryObjectAuditHistory,
} from "./audit-query-service";

// 类型和常量
export {
  ACTOR_TYPES,
  AUDIT_MODULES,
  AUDIT_ACTION_CODES,
  SENSITIVE_FIELD_BLACKLIST,
  type ActorType,
  type AuditModule,
  type AuditActionCode,
  type AuditEventInput,
  type AuditEventFilter,
} from "./audit-types";

export {
  type UnifiedAuditRecord,
  type AuditQueryResult,
  type AuditQueryOptions,
} from "./audit-query-types";
