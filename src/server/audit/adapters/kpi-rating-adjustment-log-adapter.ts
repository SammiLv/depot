/**
 * KpiRatingAdjustmentLog 适配器
 *
 * 将 KPI 等级调整日志适配为统一审计记录
 */

import { type Prisma } from "@prisma/client";
import { type UnifiedAuditRecord } from "../audit-query-types";
import { AUDIT_MODULES, AUDIT_ACTION_CODES } from "../audit-types";

/**
 * KpiRatingAdjustmentLog 查询结果类型
 */
type KpiRatingAdjustmentLogRecord = {
  id: string;
  personalKpiId: string;
  fromRuleVersionId: string | null;
  toRuleVersionId: string;
  originalRatingName: string | null;
  adjustedRatingName: string;
  originalSnapshotJson: string | null;
  adjustedSnapshotJson: string;
  reason: string;
  adjustedById: string;
  adjustedAt: Date;
};

/**
 * 将 KpiRatingAdjustmentLog 映射为统一审计记录
 */
export function mapKpiRatingAdjustmentLogToAudit(
  log: KpiRatingAdjustmentLogRecord
): UnifiedAuditRecord {
  // 解析 JSON 快照
  let originalSnapshot: Record<string, unknown> | null = null;
  let adjustedSnapshot: Record<string, unknown> | null = null;

  try {
    if (log.originalSnapshotJson) {
      originalSnapshot = JSON.parse(log.originalSnapshotJson);
    }
    adjustedSnapshot = JSON.parse(log.adjustedSnapshotJson);
  } catch (error) {
    // JSON 解析失败时保持为 null
  }

  return {
    id: log.id,
    source: "KpiRatingAdjustmentLog",

    // 操作者
    actorId: log.adjustedById,
    actorName: null,
    actorType: "USER",

    // 操作信息
    module: AUDIT_MODULES.KPI,
    actionCode: AUDIT_ACTION_CODES.UPDATE, // 等级调整归类为更新操作
    actionName: "调整 KPI 等级",
    isSuccess: true,
    operatedAt: log.adjustedAt,
    operationNote: log.reason,

    // 业务对象
    objectType: "PersonalKpi",
    objectId: log.personalKpiId,
    objectName: null,

    // 数据变化（已有 before/after 快照）
    beforeData: originalSnapshot
      ? {
          ruleVersionId: log.fromRuleVersionId,
          ratingName: log.originalRatingName,
          ...originalSnapshot,
        }
      : null,
    afterData: {
      ruleVersionId: log.toRuleVersionId,
      ratingName: log.adjustedRatingName,
      ...adjustedSnapshot,
    },
    changedFields: ["ruleVersionId", "ratingName"],

    // 追溯信息
    requestId: null,
    correlationId: null,
  };
}

/**
 * 构建 KpiRatingAdjustmentLog 查询条件
 */
export function buildKpiRatingAdjustmentLogWhere(options: {
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
  actorIds?: string[];
  objectId?: string;
}): Prisma.KpiRatingAdjustmentLogWhereInput {
  const where: Prisma.KpiRatingAdjustmentLogWhereInput = {};

  // 时间范围
  if (options.startDate || options.endDate) {
    where.adjustedAt = {};
    if (options.startDate) {
      where.adjustedAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.adjustedAt.lte = options.endDate;
    }
  }

  // 操作人员
  if (options.actorId) {
    where.adjustedById = options.actorId;
  } else if (options.actorIds && options.actorIds.length > 0) {
    where.adjustedById = { in: options.actorIds };
  }

  // 业务对象
  if (options.objectId) {
    where.personalKpiId = options.objectId;
  }

  return where;
}
