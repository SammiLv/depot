/**
 * 审计查询服务使用示例
 */

import { queryAuditLogs, queryObjectAuditHistory, AUDIT_MODULES } from "@/server/audit";

// ============ 示例 1：查询最近的所有审计日志 ============
export async function getRecentAuditLogsExample() {
  const result = await queryAuditLogs({
    page: 1,
    pageSize: 50,
  });

  console.log(`共 ${result.total} 条记录，当前第 ${result.page} 页`);
  result.records.forEach((record) => {
    console.log(
      `[${record.source}] ${record.operatedAt.toISOString()} - ${record.actorName || record.actorId} ${record.actionName}`
    );
  });

  return result;
}

// ============ 示例 2：查询指定时间范围的审计日志 ============
export async function getAuditLogsByDateRangeExample(
  startDate: Date,
  endDate: Date
) {
  const result = await queryAuditLogs({
    startDate,
    endDate,
    pageSize: 100,
  });

  return result;
}

// ============ 示例 3：查询指定用户的操作记录 ============
export async function getUserAuditLogsExample(userId: string) {
  const result = await queryAuditLogs({
    actorId: userId,
    pageSize: 50,
  });

  return result;
}

// ============ 示例 4：查询指定模块的操作记录 ============
export async function getModuleAuditLogsExample(module: string) {
  const result = await queryAuditLogs({
    module,
    pageSize: 50,
  });

  return result;
}

// ============ 示例 5：查询 KPI 模块的所有操作 ============
export async function getKpiAuditLogsExample() {
  const result = await queryAuditLogs({
    module: AUDIT_MODULES.KPI,
    pageSize: 100,
  });

  return result;
}

// ============ 示例 6：查询失败的操作 ============
export async function getFailedOperationsExample() {
  const result = await queryAuditLogs({
    isSuccess: false,
    pageSize: 50,
  });

  return result;
}

// ============ 示例 7：查询某个项目的完整操作历史 ============
export async function getProjectHistoryExample(projectId: string) {
  const history = await queryObjectAuditHistory("Project", projectId);

  console.log(`项目 ${projectId} 的操作历史：`);
  history.forEach((record) => {
    console.log(
      `${record.operatedAt.toISOString()} - ${record.actionName} by ${record.actorName || record.actorId}`
    );
    if (record.changedFields && record.changedFields.length > 0) {
      console.log(`  变更字段: ${record.changedFields.join(", ")}`);
    }
  });

  return history;
}

// ============ 示例 8：查询某次批量操作的所有子操作 ============
export async function getBatchOperationDetailsExample(correlationId: string) {
  const result = await queryAuditLogs({
    correlationId,
    pageSize: 1000,
  });

  // 找出主日志
  const mainLog = result.records.find((r) => r.actionCode === "BATCH_UPDATE");
  // 找出子日志
  const subLogs = result.records.filter((r) => r.actionCode !== "BATCH_UPDATE");

  console.log(`批量操作主记录：`, mainLog);
  console.log(`子操作数量：${subLogs.length}`);

  return { mainLog, subLogs };
}

// ============ 示例 9：查询某次发布的所有操作 ============
export async function getReleaseAuditLogsExample(releaseBatchId: string) {
  const result = await queryAuditLogs({
    releaseBatchId,
    pageSize: 100,
  });

  return result;
}

// ============ 示例 10：多条件组合查询 ============
export async function getComplexQueryExample() {
  const result = await queryAuditLogs({
    startDate: new Date("2026-09-01"),
    endDate: new Date("2026-09-30"),
    module: AUDIT_MODULES.KPI,
    isSuccess: true,
    pageSize: 100,
  });

  return result;
}
