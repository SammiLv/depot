/**
 * OperationLog 适配器
 *
 * 将产品目标、项目、任务、需求、价值跟踪的操作日志适配为统一审计记录
 */

import { type Prisma } from "@prisma/client";
import { type UnifiedAuditRecord } from "../audit-query-types";
import { AUDIT_MODULES } from "../audit-types";

/**
 * OperationLog 查询结果类型
 */
type OperationLogRecord = {
  id: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  action: string;
  operatorId: string;
  remark: string | null;
  createdAt: Date;
};

/**
 * 将 OperationLog 映射为统一审计记录
 */
export function mapOperationLogToAudit(log: OperationLogRecord): UnifiedAuditRecord {
  return {
    id: log.id,
    source: "OperationLog",

    // 操作者
    actorId: log.operatorId,
    actorName: null, // OperationLog 不存储姓名快照
    actorType: "USER",

    // 操作信息
    module: mapTargetTypeToModule(log.targetType),
    actionCode: log.action,
    actionName: formatActionName(log.action, log.targetType),
    isSuccess: true, // OperationLog 只记录成功操作
    operatedAt: log.createdAt,
    operationNote: log.remark,

    // 业务对象
    objectType: log.targetType,
    objectId: log.targetId,
    objectName: log.targetTitle,

    // 数据变化（OperationLog 不存储详细变化）
    beforeData: null,
    afterData: null,
    changedFields: null,

    // 追溯信息
    requestId: null,
    correlationId: null,
  };
}

/**
 * 将 targetType 映射到审计模块
 */
function mapTargetTypeToModule(targetType: string): string {
  const moduleMap: Record<string, string> = {
    ProductGoal: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    Project: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    MonthlyWorkPlan: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    QuarterlyWork: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    RequirementValueTrack: AUDIT_MODULES.PRODUCT_MANAGEMENT,
  };

  return moduleMap[targetType] || AUDIT_MODULES.PRODUCT_MANAGEMENT;
}

/**
 * 格式化操作名称（中文）
 */
function formatActionName(action: string, targetType: string): string {
  const objectTypeNames: Record<string, string> = {
    ProductGoal: "产品目标",
    Project: "项目",
    MonthlyWorkPlan: "月度工作计划",
    QuarterlyWork: "需求",
    RequirementValueTrack: "价值跟踪",
  };

  const actionNames: Record<string, string> = {
    CREATE: "创建",
    UPDATE: "修改",
    DELETE: "删除",
    SUBMIT: "提交",
    APPROVE: "审批",
    REJECT: "退回",
    CANCEL: "取消",
    CONFIRM: "确认",
    RESTORE: "恢复",
    ARCHIVE: "归档",
  };

  const objectName = objectTypeNames[targetType] || targetType;
  const actionName = actionNames[action] || action;

  return `${actionName}${objectName}`;
}

/**
 * 构建 OperationLog 查询条件
 */
export function buildOperationLogWhere(options: {
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
  actorIds?: string[];
  objectType?: string;
  objectId?: string;
}): Prisma.OperationLogWhereInput {
  const where: Prisma.OperationLogWhereInput = {};

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

  // 操作人员
  if (options.actorId) {
    where.operatorId = options.actorId;
  } else if (options.actorIds && options.actorIds.length > 0) {
    where.operatorId = { in: options.actorIds };
  }

  // 业务对象
  if (options.objectType) {
    where.targetType = options.objectType;
  }
  if (options.objectId) {
    where.targetId = options.objectId;
  }

  return where;
}
