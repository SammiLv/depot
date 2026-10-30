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
  // 构造带类型前缀的对象名称
  const typePrefix = getTypePrefix(log.targetType);
  const objectName = typePrefix ? `[${typePrefix}] ${log.targetTitle}` : log.targetTitle;

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
    objectName,

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
 * 获取对象类型的中文前缀
 */
function getTypePrefix(targetType: string): string {
  const typePrefixMap: Record<string, string> = {
    // 现网存量数据使用全大写下划线（与 operation-log-constants 一致）
    PRODUCT_GOAL: "产品目标",
    PROJECT: "项目",
    MONTHLY_WORK_PLAN: "月度计划",
    QUARTERLY_WORK: "需求",
    REQUIREMENT_VALUE_TRACK: "价值跟踪",
    // 兼容早期 PascalCase 写法
    ProductGoal: "产品目标",
    Project: "项目",
    MonthlyWorkPlan: "月度计划",
    QuarterlyWork: "需求",
    RequirementValueTrack: "价值跟踪",
    // 指标管理（年度/季度指标）
    ANNUAL_GOAL_PLAN: "年度方案",
    ANNUAL_GOAL_METRIC: "部门指标",
    ANNUAL_GOAL_METRIC_SOURCE: "元指标",
    ANNUAL_GOAL_METRIC_ASSIGNMENT: "小组承接",
    ANNUAL_GOAL_QUARTER: "季度指标",
  };
  return typePrefixMap[targetType] || "";
}

/**
 * 将 targetType 映射到审计模块
 */
function mapTargetTypeToModule(targetType: string): string {
  const annualGoalTypes = new Set([
    "ANNUAL_GOAL_PLAN",
    "ANNUAL_GOAL_METRIC",
    "ANNUAL_GOAL_METRIC_SOURCE",
    "ANNUAL_GOAL_METRIC_ASSIGNMENT",
    "ANNUAL_GOAL_QUARTER",
  ]);
  if (annualGoalTypes.has(targetType)) {
    return AUDIT_MODULES.ANNUAL_GOAL;
  }

  const moduleMap: Record<string, string> = {
    // 现网存量数据使用全大写下划线
    PRODUCT_GOAL: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    PROJECT: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    MONTHLY_WORK_PLAN: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    QUARTERLY_WORK: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    REQUIREMENT_VALUE_TRACK: AUDIT_MODULES.PRODUCT_MANAGEMENT,
    // 兼容早期 PascalCase 写法
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
    // 现网存量数据使用全大写下划线
    PRODUCT_GOAL: "产品目标",
    PROJECT: "项目",
    MONTHLY_WORK_PLAN: "月度工作计划",
    QUARTERLY_WORK: "需求",
    REQUIREMENT_VALUE_TRACK: "价值跟踪",
    // 兼容早期 PascalCase 写法
    ProductGoal: "产品目标",
    Project: "项目",
    MonthlyWorkPlan: "月度工作计划",
    QuarterlyWork: "需求",
    RequirementValueTrack: "价值跟踪",
    // 指标管理（年度/季度指标）
    ANNUAL_GOAL_PLAN: "年度方案",
    ANNUAL_GOAL_METRIC: "部门指标",
    ANNUAL_GOAL_METRIC_SOURCE: "元指标",
    ANNUAL_GOAL_METRIC_ASSIGNMENT: "小组承接",
    ANNUAL_GOAL_QUARTER: "季度指标",
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
  targetTypes?: string[];
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
  if (options.targetTypes && options.targetTypes.length > 0) {
    where.targetType = { in: options.targetTypes };
  } else if (options.objectType) {
    where.targetType = options.objectType;
  }
  if (options.objectId) {
    where.targetId = options.objectId;
  }

  return where;
}
