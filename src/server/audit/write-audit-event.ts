/**
 * 统一审计事件写入服务
 *
 * 根据《平台审计日志与业务日志建设方案》第八节实现：
 * - 成功业务操作：审计日志与业务数据在同一事务中写入
 * - 失败操作：业务事务回滚后另行记录失败事件
 * - 敏感信息脱敏：禁止写入密码、Token、Cookie 等
 */

import { type Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  type AuditEventInput,
  SENSITIVE_FIELD_BLACKLIST,
  ACTOR_TYPES,
} from "./audit-types";

/**
 * 在事务中写入审计事件（用于成功的业务操作）
 *
 * @param tx - Prisma 事务客户端
 * @param input - 审计事件输入
 * @returns 创建的审计事件
 *
 * @example
 * await prisma.$transaction(async (tx) => {
 *   // 业务写入
 *   const user = await tx.user.update({ ... });
 *
 *   // 审计日志（同一事务）
 *   await writeAuditEvent(tx, {
 *     module: AUDIT_MODULES.ACCOUNT,
 *     actionCode: AUDIT_ACTION_CODES.ROLE_CHANGE,
 *     actionName: "调整用户角色",
 *     actorId: currentUser.id,
 *     objectType: "User",
 *     objectId: user.id,
 *     beforeData: { role: oldRole },
 *     afterData: { role: newRole },
 *   });
 * });
 */
export async function writeAuditEvent(
  tx: Prisma.TransactionClient,
  input: AuditEventInput
) {
  // 脱敏处理
  const sanitizedBeforeData = input.beforeData
    ? sanitizeSensitiveData(input.beforeData)
    : null;
  const sanitizedAfterData = input.afterData
    ? sanitizeSensitiveData(input.afterData)
    : null;

  // 准备写入数据
  const auditData: Prisma.AuditEventCreateInput = {
    // 操作者信息
    actorId: input.actorId ?? null,
    actorName: input.actorName ?? null,
    actorType: input.actorType ?? ACTOR_TYPES.USER,
    loginMethod: input.loginMethod ?? null,
    ipAddress: input.ipAddress ? truncateIpAddress(input.ipAddress) : null,
    userAgent: input.userAgent ? truncateUserAgent(input.userAgent) : null,

    // 操作信息
    module: input.module,
    actionCode: input.actionCode,
    actionName: input.actionName,
    isSuccess: input.isSuccess ?? true,
    operatedAt: input.operatedAt ?? new Date(),
    operationNote: input.operationNote ?? null,
    failureReason: input.failureReason ?? null,

    // 业务对象信息
    objectType: input.objectType ?? null,
    objectId: input.objectId ?? null,
    objectName: input.objectName ?? null,
    objectDepartment: input.objectDepartment ?? null,

    // 数据变化（JSON 序列化）
    beforeData: sanitizedBeforeData ? JSON.stringify(sanitizedBeforeData) : null,
    afterData: sanitizedAfterData ? JSON.stringify(sanitizedAfterData) : null,
    changedFields: input.changedFields ? JSON.stringify(input.changedFields) : null,
    batchTotalCount: input.batchTotalCount ?? null,
    batchSuccessCount: input.batchSuccessCount ?? null,
    batchFailureCount: input.batchFailureCount ?? null,

    // 追溯信息
    requestId: input.requestId ?? null,
    correlationId: input.correlationId ?? null,
    eventKey: input.eventKey ?? null,
    gitCommit: input.gitCommit ?? null,
    buildId: input.buildId ?? null,
    releaseBatchId: input.releaseBatchId ?? null,
    serverIdentity: input.serverIdentity ?? null,
  };

  return await tx.auditEvent.create({ data: auditData });
}

/**
 * 独立写入失败事件（业务事务回滚后调用）
 *
 * @param input - 审计事件输入（isSuccess 会被强制设为 false）
 * @returns 创建的审计事件
 *
 * @example
 * try {
 *   await prisma.$transaction(async (tx) => {
 *     // 业务操作
 *   });
 * } catch (error) {
 *   // 事务已回滚，单独记录失败事件
 *   await writeAuditFailure({
 *     module: AUDIT_MODULES.DATA_MAINTENANCE,
 *     actionCode: AUDIT_ACTION_CODES.DATA_IMPORT,
 *     actionName: "导入用户数据",
 *     actorId: currentUser.id,
 *     isSuccess: false,
 *     failureReason: error.message,
 *   });
 * }
 */
export async function writeAuditFailure(input: AuditEventInput) {
  return await prisma.$transaction(async (tx) => {
    return await writeAuditEvent(tx, {
      ...input,
      isSuccess: false,
      // 失败事件不记录完整 before/after，只记录摘要
      beforeData: null,
      afterData: null,
    });
  });
}

/**
 * 脱敏敏感数据
 *
 * 禁止写入密码、Token、Cookie、Webhook 等敏感信息（方案第九节）
 */
function sanitizeSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // 检查是否为敏感字段
    const isSensitive = SENSITIVE_FIELD_BLACKLIST.some((blacklistKey) =>
      lowerKey.includes(blacklistKey.toLowerCase())
    );

    if (isSensitive) {
      // 敏感字段标记为已脱敏
      sanitized[key] = "***REDACTED***";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // 递归处理嵌套对象
      sanitized[key] = sanitizeSensitiveData(value as Record<string, unknown>);
    } else {
      // 非敏感字段保留原值
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * 截断 IP 地址（处理 X-Forwarded-For 代理链）
 *
 * 只保留客户端 IP，去掉代理链
 */
function truncateIpAddress(ip: string): string {
  // X-Forwarded-For: client, proxy1, proxy2
  // 只取第一个
  const firstIp = ip.split(",")[0]?.trim();
  return firstIp ? firstIp.substring(0, 100) : ip.substring(0, 100);
}

/**
 * 截断 User-Agent（防止超长）
 */
function truncateUserAgent(ua: string): string {
  return ua.substring(0, 500);
}

/**
 * 计算字段变化清单
 *
 * @param before - 修改前数据
 * @param after - 修改后数据
 * @returns 发生变化的字段名数组
 */
export function getChangedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): string[] {
  if (!before || !after) {
    return [];
  }

  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeValue = before[key];
    const afterValue = after[key];

    // 简单比较（深度比较可按需优化）
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * 生成批量操作的关联 ID（用于关联批次主日志和子日志）
 */
export function generateCorrelationId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
