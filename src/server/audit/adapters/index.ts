/**
 * 审计日志适配器统一导出
 */

export {
  mapAuditEventToAudit,
  buildAuditEventWhere,
} from "./audit-event-adapter";

export {
  mapOperationLogToAudit,
  buildOperationLogWhere,
} from "./operation-log-adapter";

export {
  mapPersonalKpiActionLogToAudit,
  buildPersonalKpiActionLogWhere,
} from "./personal-kpi-action-log-adapter";

export {
  mapKpiRatingAdjustmentLogToAudit,
  buildKpiRatingAdjustmentLogWhere,
} from "./kpi-rating-adjustment-log-adapter";

export {
  mapTalentActionLogToAudit,
  buildTalentActionLogWhere,
} from "./talent-action-log-adapter";

export {
  mapNotificationDeliveryLogToAudit,
  buildNotificationDeliveryLogWhere,
} from "./notification-delivery-log-adapter";
