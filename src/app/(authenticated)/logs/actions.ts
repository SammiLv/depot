"use server";

import { queryAuditLogs, AUDIT_MODULES } from "@/server/audit";
import type { AuditQueryResult } from "@/server/audit";
import { prisma } from "@/server/db/prisma";

interface QueryAuditLogsInput {
  view: string;
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  actorId?: string;
  module?: string;
  isSuccess?: boolean;
}

export async function queryAuditLogsAction(
  input: QueryAuditLogsInput
): Promise<AuditQueryResult> {
  const { view, page = 1, pageSize = 50 } = input;

  // 如果用户手动选择了模块，使用用户选择的模块；否则根据视图决定模块
  let modules: string[] | undefined;
  if (input.module && input.module !== "all") {
    modules = [input.module];
  } else {
    const viewModules = getModulesByView(view);
    modules = viewModules.length > 0 ? viewModules : undefined;
  }

  // 解析日期
  const startDate = input.startDate ? new Date(input.startDate) : undefined;
  const endDate = input.endDate ? new Date(input.endDate) : undefined;

  // 查询日志
  const result = await queryAuditLogs({
    modules,
    page,
    pageSize,
    startDate,
    endDate,
    actorId: input.actorId,
    isSuccess: input.isSuccess,
  });

  // 查询用户名称映射
  const actorIds = [...new Set(result.records.map((r) => r.actorId).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { id: { in: actorIds as string[] } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  // 填充用户名称
  const recordsWithNames = result.records.map((record) => ({
    ...record,
    actorName: record.actorId ? userMap.get(record.actorId) || null : null,
  }));

  return {
    ...result,
    records: recordsWithNames,
  };
}

/**
 * 根据视图决定查询哪些模块
 */
function getModulesByView(view: string): string[] {
  switch (view) {
    case "business":
      // 业务操作：产品管理、KPI、人才、年度目标
      return [
        AUDIT_MODULES.PRODUCT_MANAGEMENT,
        AUDIT_MODULES.KPI,
        AUDIT_MODULES.TALENT,
        AUDIT_MODULES.ANNUAL_GOAL,
      ];

    case "account":
      // 账号、登录与权限
      return [
        AUDIT_MODULES.ACCOUNT,
        AUDIT_MODULES.AUTH,
        AUDIT_MODULES.PERMISSION,
        AUDIT_MODULES.ORGANIZATION,
      ];

    case "deployment":
      // 发布部署
      return [AUDIT_MODULES.DEPLOYMENT];

    case "maintenance":
      // 数据维护
      return [AUDIT_MODULES.DATA_MAINTENANCE];

    case "notification":
      // 通知投递
      return [AUDIT_MODULES.NOTIFICATION];

    case "all":
    default:
      // 全部操作：不限制模块
      return [];
  }
}
