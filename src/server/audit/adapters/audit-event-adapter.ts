/**
 * AuditEvent 适配器
 *
 * 将新增的统一审计事件适配为查询结果格式
 */

import { type Prisma } from "@prisma/client";
import { type UnifiedAuditRecord } from "../audit-query-types";

/**
 * AuditEvent 查询结果类型
 */
type AuditEventRecord = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorType: string;
  loginMethod: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  module: string;
  actionCode: string;
  actionName: string;
  isSuccess: boolean;
  operatedAt: Date;
  operationNote: string | null;
  failureReason: string | null;
  objectType: string | null;
  objectId: string | null;
  objectName: string | null;
  objectDepartment: string | null;
  beforeData: string | null;
  afterData: string | null;
  changedFields: string | null;
  batchTotalCount: number | null;
  batchSuccessCount: number | null;
  batchFailureCount: number | null;
  requestId: string | null;
  correlationId: string | null;
  eventKey: string | null;
  gitCommit: string | null;
  buildId: string | null;
  releaseBatchId: string | null;
  serverIdentity: string | null;
  createdAt: Date;
};

/**
 * 将 AuditEvent 映射为统一审计记录
 */
export function mapAuditEventToAudit(event: AuditEventRecord): UnifiedAuditRecord {
  // 解析 JSON 字段
  let beforeData: Record<string, unknown> | null = null;
  let afterData: Record<string, unknown> | null = null;
  let changedFields: string[] | null = null;

  try {
    if (event.beforeData) {
      beforeData = JSON.parse(event.beforeData);
    }
    if (event.afterData) {
      afterData = JSON.parse(event.afterData);
    }
    if (event.changedFields) {
      changedFields = JSON.parse(event.changedFields);
    }
  } catch (error) {
    // JSON 解析失败时保持为 null
  }

  return {
    id: event.id,
    source: "AuditEvent",

    // 操作者
    actorId: event.actorId,
    actorName: event.actorName,
    actorType: event.actorType,

    // 操作信息
    module: event.module,
    actionCode: event.actionCode,
    actionName: event.actionName,
    isSuccess: event.isSuccess,
    operatedAt: event.operatedAt,
    operationNote: event.operationNote || event.failureReason,

    // 业务对象
    objectType: event.objectType,
    objectId: event.objectId,
    objectName: event.objectName,

    // 数据变化
    beforeData,
    afterData,
    changedFields,

    // 追溯信息
    requestId: event.requestId,
    correlationId: event.correlationId,
  };
}

/**
 * 构建 AuditEvent 查询条件
 */
export function buildAuditEventWhere(options: {
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
  actorIds?: string[];
  module?: string;
  modules?: string[];
  actionCode?: string;
  objectType?: string;
  objectId?: string;
  isSuccess?: boolean;
  correlationId?: string;
  releaseBatchId?: string;
  gitCommit?: string;
}): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};

  // 时间范围
  if (options.startDate || options.endDate) {
    where.operatedAt = {};
    if (options.startDate) {
      where.operatedAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.operatedAt.lte = options.endDate;
    }
  }

  // 操作人员
  if (options.actorId) {
    where.actorId = options.actorId;
  } else if (options.actorIds && options.actorIds.length > 0) {
    where.actorId = { in: options.actorIds };
  }

  // 模块
  if (options.module) {
    where.module = options.module;
  } else if (options.modules && options.modules.length > 0) {
    where.module = { in: options.modules };
  }

  // 操作类型
  if (options.actionCode) {
    where.actionCode = options.actionCode;
  }

  // 业务对象
  if (options.objectType) {
    where.objectType = options.objectType;
  }
  if (options.objectId) {
    where.objectId = options.objectId;
  }

  // 成功或失败
  if (options.isSuccess !== undefined) {
    where.isSuccess = options.isSuccess;
  }

  // 追溯信息
  if (options.correlationId) {
    where.correlationId = options.correlationId;
  }
  if (options.releaseBatchId) {
    where.releaseBatchId = options.releaseBatchId;
  }
  if (options.gitCommit) {
    where.gitCommit = options.gitCommit;
  }

  return where;
}
