/**
 * 审计统一查询服务
 *
 * 聚合 AuditEvent 和现有 5 类日志，提供统一查询接口
 */

import { prisma } from "@/server/db/prisma";
import { ANNUAL_GOAL_LOG_TARGET_TYPES } from "@/server/annual-goals/operation-log";
import {
  type AuditQueryOptions,
  type AuditQueryResult,
  type UnifiedAuditRecord,
} from "./audit-query-types";

// 导入所有适配器
import {
  mapAuditEventToAudit,
  buildAuditEventWhere,
} from "./adapters/audit-event-adapter";
import {
  mapOperationLogToAudit,
  buildOperationLogWhere,
} from "./adapters/operation-log-adapter";
import {
  mapPersonalKpiActionLogToAudit,
  buildPersonalKpiActionLogWhere,
} from "./adapters/personal-kpi-action-log-adapter";
import {
  mapKpiRatingAdjustmentLogToAudit,
  buildKpiRatingAdjustmentLogWhere,
} from "./adapters/kpi-rating-adjustment-log-adapter";
import {
  mapTalentActionLogToAudit,
  buildTalentActionLogWhere,
} from "./adapters/talent-action-log-adapter";
import {
  mapNotificationDeliveryLogToAudit,
  buildNotificationDeliveryLogWhere,
} from "./adapters/notification-delivery-log-adapter";

/**
 * 统一查询审计日志
 *
 * @param options - 查询选项
 * @returns 分页查询结果
 */
export async function queryAuditLogs(
  options: AuditQueryOptions = {}
): Promise<AuditQueryResult> {
  const page = options.page || 1;
  const pageSize = options.pageSize || 50;

  // 根据模块筛选决定查询哪些数据源
  const sources = determineDataSources(options);

  // 并行查询所有数据源（不做分页，先获取所有符合条件的数据）
  const results = await Promise.all([
    sources.includes("AuditEvent")
      ? queryAuditEvents(options, 0, 10000) // 取足够多的数据
      : Promise.resolve([]),
    sources.includes("OperationLog")
      ? queryOperationLogs(options, 0, 10000)
      : Promise.resolve([]),
    sources.includes("PersonalKpiActionLog")
      ? queryPersonalKpiActionLogs(options, 0, 10000)
      : Promise.resolve([]),
    sources.includes("KpiRatingAdjustmentLog")
      ? queryKpiRatingAdjustmentLogs(options, 0, 10000)
      : Promise.resolve([]),
    sources.includes("TalentActionLog")
      ? queryTalentActionLogs(options, 0, 10000)
      : Promise.resolve([]),
    sources.includes("NotificationDeliveryLog")
      ? queryNotificationDeliveryLogs(options, 0, 10000)
      : Promise.resolve([]),
  ]);

  // 合并所有结果
  let allRecords = results.flat();

  // 多源合并后按模块过滤：OperationLog 一个源承载多个模块（产品管理/年度指标），
  // 仅靠数据源选择无法精确筛选，必须以后过滤为准（AuditEvent 已带 module 字段，重复过滤无副作用）
  const filterModules = options.modules || (options.module ? [options.module] : []);
  if (filterModules.length > 0) {
    const filterModuleSet = new Set(filterModules);
    allRecords = allRecords.filter((record) => filterModuleSet.has(record.module));
  }

  // 按时间倒序排序
  allRecords.sort((a, b) => b.operatedAt.getTime() - a.operatedAt.getTime());

  // 计算总数
  const total = allRecords.length;

  // 分页截取
  const skip = (page - 1) * pageSize;
  const records = allRecords.slice(skip, skip + pageSize);

  return {
    records,
    total,
    page,
    pageSize,
  };
}

/**
 * 根据查询选项决定需要查询哪些数据源
 */
function determineDataSources(options: AuditQueryOptions): string[] {
  const sources: string[] = ["AuditEvent"]; // 始终包含 AuditEvent

  // 获取模块列表（支持单个或多个模块）
  const modules = options.modules || (options.module ? [options.module] : []);

  // 如果没有指定模块，查询所有数据源
  if (modules.length === 0) {
    sources.push(
      "OperationLog",
      "PersonalKpiActionLog",
      "KpiRatingAdjustmentLog",
      "TalentActionLog",
      "NotificationDeliveryLog"
    );
    return sources;
  }

  // 根据模块决定查询哪些数据源
  const moduleSet = new Set(modules);

  // 产品管理模块 -> OperationLog
  if (moduleSet.has("PRODUCT_MANAGEMENT")) {
    sources.push("OperationLog");
  }

  // KPI 模块 -> PersonalKpiActionLog + KpiRatingAdjustmentLog
  if (moduleSet.has("KPI")) {
    sources.push("PersonalKpiActionLog", "KpiRatingAdjustmentLog");
  }

  // 人才模块 -> TalentActionLog
  if (moduleSet.has("TALENT")) {
    sources.push("TalentActionLog");
  }

  // 通知模块 -> NotificationDeliveryLog
  if (moduleSet.has("NOTIFICATION")) {
    sources.push("NotificationDeliveryLog");
  }

  // 年度指标模块 -> OperationLog（年度指标也记录在 OperationLog 中）
  if (moduleSet.has("ANNUAL_GOAL")) {
    if (!sources.includes("OperationLog")) {
      sources.push("OperationLog");
    }
  }

  return sources;
}

/**
 * 查询 AuditEvent
 */
async function queryAuditEvents(
  options: AuditQueryOptions,
  skip: number,
  take: number
): Promise<UnifiedAuditRecord[]> {
  const where = buildAuditEventWhere({
    startDate: options.startDate,
    endDate: options.endDate,
    actorId: options.actorId,
    actorIds: options.actorIds,
    module: options.module,
    modules: options.modules,
    actionCode: options.actionCode,
    objectType: options.objectType,
    objectId: options.objectId,
    isSuccess: options.isSuccess,
    correlationId: options.correlationId,
    releaseBatchId: options.releaseBatchId,
    gitCommit: options.gitCommit,
  });

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { operatedAt: "desc" },
    skip,
    take,
  });

  return events.map(mapAuditEventToAudit);
}

/**
 * 查询 OperationLog
 */
async function queryOperationLogs(
  options: AuditQueryOptions,
  skip: number,
  take: number
): Promise<UnifiedAuditRecord[]> {
  // 仅选「年度指标」未选「产品管理」时，OperationLog 只查指标类 targetType，
  // 避免拉出全部产品日志再由后过滤丢弃
  const modules = options.modules || (options.module ? [options.module] : []);
  const targetTypes = modules.includes("ANNUAL_GOAL") && !modules.includes("PRODUCT_MANAGEMENT")
    ? [...ANNUAL_GOAL_LOG_TARGET_TYPES]
    : undefined;

  const where = buildOperationLogWhere({
    startDate: options.startDate,
    endDate: options.endDate,
    actorId: options.actorId,
    actorIds: options.actorIds,
    objectType: options.objectType,
    objectId: options.objectId,
    targetTypes,
  });

  const logs = await prisma.operationLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });

  return logs.map(mapOperationLogToAudit);
}

/**
 * 查询 PersonalKpiActionLog
 */
async function queryPersonalKpiActionLogs(
  options: AuditQueryOptions,
  skip: number,
  take: number
): Promise<UnifiedAuditRecord[]> {
  const where = buildPersonalKpiActionLogWhere({
    startDate: options.startDate,
    endDate: options.endDate,
    actorId: options.actorId,
    actorIds: options.actorIds,
    objectId: options.objectId,
    actionCode: options.actionCode,
  });

  const logs = await prisma.personalKpiActionLog.findMany({
    where,
    orderBy: { actedAt: "desc" },
    skip,
    take,
    include: {
      personalKpi: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return logs.map((log) => mapPersonalKpiActionLogToAudit(log as any));
}

/**
 * 查询 KpiRatingAdjustmentLog
 */
async function queryKpiRatingAdjustmentLogs(
  options: AuditQueryOptions,
  skip: number,
  take: number
): Promise<UnifiedAuditRecord[]> {
  const where = buildKpiRatingAdjustmentLogWhere({
    startDate: options.startDate,
    endDate: options.endDate,
    actorId: options.actorId,
    actorIds: options.actorIds,
    objectId: options.objectId,
  });

  const logs = await prisma.kpiRatingAdjustmentLog.findMany({
    where,
    orderBy: { adjustedAt: "desc" },
    skip,
    take,
    include: {
      personalKpi: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return logs.map((log) => mapKpiRatingAdjustmentLogToAudit(log as any));
}

/**
 * 查询 TalentActionLog
 */
async function queryTalentActionLogs(
  options: AuditQueryOptions,
  skip: number,
  take: number
): Promise<UnifiedAuditRecord[]> {
  const where = buildTalentActionLogWhere({
    startDate: options.startDate,
    endDate: options.endDate,
    actorId: options.actorId,
    actorIds: options.actorIds,
    objectType: options.objectType,
    objectId: options.objectId,
    actionCode: options.actionCode,
  });

  const logs = await prisma.talentActionLog.findMany({
    where,
    orderBy: { actedAt: "desc" },
    skip,
    take,
  });

  return logs.map(mapTalentActionLogToAudit);
}

/**
 * 查询 NotificationDeliveryLog
 */
async function queryNotificationDeliveryLogs(
  options: AuditQueryOptions,
  skip: number,
  take: number
): Promise<UnifiedAuditRecord[]> {
  const where = buildNotificationDeliveryLogWhere({
    startDate: options.startDate,
    endDate: options.endDate,
    userId: options.actorId, // 通知日志用 userId
    objectId: options.objectId,
    isSuccess: options.isSuccess,
    correlationId: options.correlationId,
  });

  const logs = await prisma.notificationDeliveryLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    include: {
      scenario: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return logs.map((log) => mapNotificationDeliveryLogToAudit(log as any));
}

/**
 * 查询单个对象的操作历史
 *
 * @param objectType - 业务对象类型
 * @param objectId - 业务对象 ID
 * @returns 该对象的所有操作记录
 */
export async function queryObjectAuditHistory(
  objectType: string,
  objectId: string
): Promise<UnifiedAuditRecord[]> {
  return (
    await queryAuditLogs({
      objectType,
      objectId,
      pageSize: 1000, // 对象历史通常不会太多
    })
  ).records;
}
