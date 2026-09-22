/**
 * TalentActionLog 适配器
 *
 * 将人才发展操作日志适配为统一审计记录
 */

import { type Prisma } from "@prisma/client";
import { type UnifiedAuditRecord } from "../audit-query-types";
import { AUDIT_MODULES } from "../audit-types";

/**
 * TalentActionLog 查询结果类型
 */
type TalentActionLogRecord = {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  actorId: string;
  beforeJson: string | null;
  afterJson: string | null;
  remark: string | null;
  actedAt: Date;
  createdAt: Date;
};

/**
 * 将 TalentActionLog 映射为统一审计记录
 */
export function mapTalentActionLogToAudit(
  log: TalentActionLogRecord
): UnifiedAuditRecord {
  // 解析 JSON 数据
  let beforeData: Record<string, unknown> | null = null;
  let afterData: Record<string, unknown> | null = null;
  let changedFields: string[] | null = null;

  try {
    if (log.beforeJson) {
      beforeData = JSON.parse(log.beforeJson);
    }
    if (log.afterJson) {
      afterData = JSON.parse(log.afterJson);
    }

    // 计算变化字段
    if (beforeData && afterData) {
      changedFields = getChangedFields(beforeData, afterData);
    }
  } catch (error) {
    // JSON 解析失败时保持为 null
  }

  return {
    id: log.id,
    source: "TalentActionLog",

    // 操作者
    actorId: log.actorId,
    actorName: null,
    actorType: "USER",

    // 操作信息
    module: AUDIT_MODULES.TALENT,
    actionCode: log.action,
    actionName: formatTalentActionName(log.action, log.targetType),
    isSuccess: true,
    operatedAt: log.actedAt,
    operationNote: log.remark,

    // 业务对象
    objectType: log.targetType,
    objectId: log.targetId,
    objectName: null,

    // 数据变化（TalentActionLog 已有 before/after）
    beforeData,
    afterData,
    changedFields,

    // 追溯信息
    requestId: null,
    correlationId: null,
  };
}

/**
 * 格式化人才操作名称（中文）
 */
function formatTalentActionName(action: string, targetType: string): string {
  const targetTypeNames: Record<string, string> = {
    TalentReviewTemplateVersion: "人才盘点模板",
    TalentRestrictionRule: "人才限制规则",
    EmployeeTalentProfile: "人才档案",
    PromotionRecord: "晋升记录",
    SalaryAdjustmentRecord: "调薪记录",
    RewardRecord: "奖励记录",
    EmploymentContractTerm: "合同期限",
    TalentImportBatch: "批量导入",
  };

  const actionNames: Record<string, string> = {
    CREATE: "创建",
    UPDATE: "修改",
    DELETE: "删除",
    PUBLISH: "发布",
    CONFIRM: "确认",
    VOID: "作废",
    IMPORT: "导入",
    APPROVE: "审批",
  };

  const targetName = targetTypeNames[targetType] || targetType;
  const actionName = actionNames[action] || action;

  return `${actionName}${targetName}`;
}

/**
 * 计算变化字段
 */
function getChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }

  return changed;
}

/**
 * 构建 TalentActionLog 查询条件
 */
export function buildTalentActionLogWhere(options: {
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
  actorIds?: string[];
  objectType?: string;
  objectId?: string;
  actionCode?: string;
}): Prisma.TalentActionLogWhereInput {
  const where: Prisma.TalentActionLogWhereInput = {};

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
  if (options.objectType) {
    where.targetType = options.objectType;
  }
  if (options.objectId) {
    where.targetId = options.objectId;
  }

  // 操作类型
  if (options.actionCode) {
    where.action = options.actionCode;
  }

  return where;
}
