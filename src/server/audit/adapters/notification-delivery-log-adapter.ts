/**
 * NotificationDeliveryLog 适配器
 *
 * 将通知投递结果日志适配为统一审计记录
 */

import { type Prisma } from "@prisma/client";
import { type UnifiedAuditRecord } from "../audit-query-types";
import { AUDIT_MODULES, ACTOR_TYPES } from "../audit-types";

/**
 * NotificationDeliveryLog 查询结果类型
 */
type NotificationDeliveryLogRecord = {
  id: string;
  scenarioId: string;
  eventKey: string;
  userId: string;
  channel: string;
  status: string;
  error: string | null;
  createdAt: Date;
  scenario?: {
    id: string;
    name: string;
  };
};

/**
 * 将 NotificationDeliveryLog 映射为统一审计记录
 */
export function mapNotificationDeliveryLogToAudit(
  log: NotificationDeliveryLogRecord
): UnifiedAuditRecord {
  const isSuccess = log.status === "SENT";

  // 构造友好的对象名称
  let objectName = `通知场景 (${log.scenarioId})`;
  if (log.scenario) {
    objectName = log.scenario.name;
  }

  return {
    id: log.id,
    source: "NotificationDeliveryLog",

    // 操作者（通知投递是系统操作）
    actorId: null,
    actorName: null,
    actorType: ACTOR_TYPES.SYSTEM,

    // 操作信息
    module: AUDIT_MODULES.NOTIFICATION,
    actionCode: "NOTIFICATION_SEND",
    actionName: formatNotificationActionName(log.channel, log.status),
    isSuccess,
    operatedAt: log.createdAt,
    operationNote: isSuccess ? null : log.error,

    // 业务对象（通知场景）
    objectType: "NotificationScenario",
    objectId: log.scenarioId,
    objectName,

    // 数据变化
    beforeData: null,
    afterData: {
      userId: log.userId,
      channel: log.channel,
      status: log.status,
    },
    changedFields: null,

    // 追溯信息
    requestId: null,
    correlationId: log.eventKey, // eventKey 作为关联 ID
  };
}

/**
 * 格式化通知操作名称（中文）
 */
function formatNotificationActionName(channel: string, status: string): string {
  const channelNames: Record<string, string> = {
    IN_APP: "站内信",
    DINGTALK: "钉钉通知",
    DINGTALK_PERSONAL: "钉钉个人消息",
    DINGTALK_GROUP: "钉钉群消息",
  };

  const statusNames: Record<string, string> = {
    SENT: "发送成功",
    FAILED: "发送失败",
    SKIPPED: "已跳过",
  };

  const channelName = channelNames[channel] || channel;
  const statusName = statusNames[status] || status;

  return `${channelName}${statusName}`;
}

/**
 * 构建 NotificationDeliveryLog 查询条件
 */
export function buildNotificationDeliveryLogWhere(options: {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  objectId?: string;
  isSuccess?: boolean;
  correlationId?: string;
}): Prisma.NotificationDeliveryLogWhereInput {
  const where: Prisma.NotificationDeliveryLogWhereInput = {};

  // 时间范围
  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      where.createdAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.createdAt.lte = options.endDate;
    }
  }

  // 接收人
  if (options.userId) {
    where.userId = options.userId;
  }

  // 业务对象（通知场景）
  if (options.objectId) {
    where.scenarioId = options.objectId;
  }

  // 成功或失败
  if (options.isSuccess !== undefined) {
    where.status = options.isSuccess ? "SENT" : { in: ["FAILED", "SKIPPED"] };
  }

  // 关联 ID（eventKey）
  if (options.correlationId) {
    where.eventKey = options.correlationId;
  }

  return where;
}
