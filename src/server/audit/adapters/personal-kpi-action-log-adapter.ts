/**
 * PersonalKpiActionLog 适配器
 *
 * 将 KPI 提交、评分、审批、退回日志适配为统一审计记录
 */

import { type Prisma } from "@prisma/client";
import { type UnifiedAuditRecord } from "../audit-query-types";
import { AUDIT_MODULES } from "../audit-types";

/**
 * PersonalKpiActionLog 查询结果类型
 */
type PersonalKpiActionLogRecord = {
  id: string;
  personalKpiId: string;
  actorId: string;
  action: string;
  remark: string | null;
  actedAt: Date;
  createdAt: Date;
};

/**
 * 将 PersonalKpiActionLog 映射为统一审计记录
 */
export function mapPersonalKpiActionLogToAudit(
  log: PersonalKpiActionLogRecord
): UnifiedAuditRecord {
  return {
    id: log.id,
    source: "PersonalKpiActionLog",

    // 操作者
    actorId: log.actorId,
    actorName: null, // PersonalKpiActionLog 不存储姓名快照
    actorType: "USER",

    // 操作信息
    module: AUDIT_MODULES.KPI,
    actionCode: log.action,
    actionName: formatKpiActionName(log.action),
    isSuccess: true, // PersonalKpiActionLog 只记录成功操作
    operatedAt: log.actedAt,
    operationNote: log.remark,

    // 业务对象
    objectType: "PersonalKpi",
    objectId: log.personalKpiId,
    objectName: null, // PersonalKpiActionLog 不存储对象名称

    // 数据变化（PersonalKpiActionLog 不存储详细变化）
    beforeData: null,
    afterData: null,
    changedFields: null,

    // 追溯信息
    requestId: null,
    correlationId: null,
  };
}

/**
 * 格式化 KPI 操作名称（中文）
 */
function formatKpiActionName(action: string): string {
  const actionNames: Record<string, string> = {
    SAVE_DRAFT: "保存草稿",
    SUBMIT: "提交 KPI",
    SCORE_SELF: "自评打分",
    SCORE_LEADER: "直属主管评分",
    SCORE_MANAGER: "部门负责人评分",
    SCORE_FINAL: "终审评分",
    APPROVE: "审批通过",
    REJECT: "退回修改",
    WITHDRAW: "撤回",
    INITIALIZE: "初始化 KPI",
    BATCH_INITIALIZE: "批量初始化 KPI",
  };

  return actionNames[action] || action;
}

/**
 * 构建 PersonalKpiActionLog 查询条件
 */
export function buildPersonalKpiActionLogWhere(options: {
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
  actorIds?: string[];
  objectId?: string;
  actionCode?: string;
}): Prisma.PersonalKpiActionLogWhereInput {
  const where: Prisma.PersonalKpiActionLogWhereInput = {};

  // 时间范围
  if (options.startDate || options.endDate) {
    where.actedAt = {};
    if (options.startDate) {
      where.actedAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.actedAt.lte = options.endDate;
    }
  }

  // 操作人员
  if (options.actorId) {
    where.actorId = options.actorId;
  } else if (options.actorIds && options.actorIds.length > 0) {
    where.actorId = { in: options.actorIds };
  }

  // 业务对象
  if (options.objectId) {
    where.personalKpiId = options.objectId;
  }

  // 操作类型
  if (options.actionCode) {
    where.action = options.actionCode;
  }

  return where;
}
