/**
 * 审计查询统一结果类型
 *
 * 适配层将不同来源的日志映射成这个统一格式
 */

export interface UnifiedAuditRecord {
  // 唯一标识
  id: string;
  source: "AuditEvent" | "OperationLog" | "PersonalKpiActionLog" | "KpiRatingAdjustmentLog" | "TalentActionLog" | "NotificationDeliveryLog";

  // 操作者
  actorId: string | null;
  actorName: string | null;
  actorType: string;

  // 操作信息
  module: string;
  actionCode: string;
  actionName: string;
  isSuccess: boolean;
  operatedAt: Date;
  operationNote: string | null;

  // 业务对象
  objectType: string | null;
  objectId: string | null;
  objectName: string | null;

  // 数据变化（已解析的对象）
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  changedFields: string[] | null;

  // 追溯信息
  requestId: string | null;
  correlationId: string | null;
}

/**
 * 分页查询结果
 */
export interface AuditQueryResult {
  records: UnifiedAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 查询选项
 */
export interface AuditQueryOptions {
  // 时间范围
  startDate?: Date;
  endDate?: Date;

  // 操作人员
  actorId?: string;
  actorIds?: string[];

  // 部门和小组
  departmentId?: string;
  teamId?: string;

  // 模块和操作
  module?: string;
  modules?: string[];
  actionCode?: string;

  // 业务对象
  objectType?: string;
  objectId?: string;

  // 成功或失败
  isSuccess?: boolean;

  // 追溯信息
  correlationId?: string;
  releaseBatchId?: string;
  gitCommit?: string;

  // 分页
  page?: number;
  pageSize?: number;

  // 排序
  orderBy?: "operatedAt" | "actorId" | "module";
  orderDirection?: "asc" | "desc";
}
