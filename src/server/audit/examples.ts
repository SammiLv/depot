/**
 * 审计服务使用示例
 *
 * 演示如何在业务 actions 中集成审计日志
 */

import { prisma } from "@/server/db/prisma";
import {
  writeAuditEvent,
  writeAuditFailure,
  getChangedFields,
  AUDIT_MODULES,
  AUDIT_ACTION_CODES,
  ACTOR_TYPES,
  type AuditEventInput,
} from "@/server/audit";

// ============ 示例 1：成功的业务操作（与业务写入在同一事务） ============
export async function updateUserRoleExample(
  userId: string,
  newRole: string,
  currentUserId: string
) {
  // 先查询旧数据
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, roleType: true, orgNodeId: true },
  });

  if (!user) {
    throw new Error("用户不存在");
  }

  const oldRole = user.roleType;

  // 业务写入 + 审计日志在同一事务中
  await prisma.$transaction(async (tx) => {
    // 1. 业务写入
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { roleType: newRole as any }, // 示例简化，实际应使用正确的枚举类型
    });

    // 2. 审计日志（同一事务）
    await writeAuditEvent(tx, {
      // 操作者
      actorId: currentUserId,
      actorType: ACTOR_TYPES.USER,

      // 操作信息
      module: AUDIT_MODULES.ACCOUNT,
      actionCode: AUDIT_ACTION_CODES.ROLE_CHANGE,
      actionName: "调整用户角色",
      isSuccess: true,

      // 业务对象
      objectType: "User",
      objectId: user.id,
      objectName: user.name,

      // 数据变化
      beforeData: { roleType: oldRole },
      afterData: { roleType: newRole },
      changedFields: ["roleType"],
    });
  });
}

// ============ 示例 2：失败操作（事务回滚后单独记录） ============
export async function importUsersExample(
  fileData: unknown,
  currentUserId: string
) {
  try {
    await prisma.$transaction(async (tx) => {
      // 业务逻辑（可能失败）
      // ...
      throw new Error("数据格式错误");
    });
  } catch (error) {
    // 事务已回滚，单独记录失败事件
    await writeAuditFailure({
      actorId: currentUserId,
      module: AUDIT_MODULES.ACCOUNT,
      actionCode: AUDIT_ACTION_CODES.DATA_IMPORT,
      actionName: "导入用户数据",
      isSuccess: false,
      failureReason: error instanceof Error ? error.message : "未知错误",
      batchTotalCount: 0,
      batchFailureCount: 0,
    });

    throw error;
  }
}

// ============ 示例 3：使用 getChangedFields 自动检测变化 ============
export async function updateProjectExample(
  projectId: string,
  updates: { title?: string; description?: string },
  currentUserId: string
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, description: true, status: true },
  });

  if (!project) {
    throw new Error("项目不存在");
  }

  // 计算变化的字段
  const changedFields = getChangedFields(
    project,
    { ...project, ...updates }
  );

  if (changedFields.length === 0) {
    // 没有实际变化，不写审计日志
    return project;
  }

  await prisma.$transaction(async (tx) => {
    const updatedProject = await tx.project.update({
      where: { id: projectId },
      data: updates,
    });

    await writeAuditEvent(tx, {
      actorId: currentUserId,
      module: AUDIT_MODULES.PRODUCT_MANAGEMENT,
      actionCode: AUDIT_ACTION_CODES.UPDATE,
      actionName: "修改项目信息",
      objectType: "Project",
      objectId: project.id,
      objectName: project.title,
      beforeData: project as any,
      afterData: { ...project, ...updates } as any,
      changedFields,
    });
  });
}

// ============ 示例 4：批量操作（使用 correlationId 关联） ============
export async function batchUpdateUsersExample(
  userIds: string[],
  updates: { isActive: boolean },
  currentUserId: string
) {
  const correlationId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let successCount = 0;
  let failureCount = 0;

  for (const userId of userIds) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: updates,
        });

        // 子日志（可选，如需逐条追溯）
        await writeAuditEvent(tx, {
          actorId: currentUserId,
          module: AUDIT_MODULES.ACCOUNT,
          actionCode: AUDIT_ACTION_CODES.UPDATE,
          actionName: "批量更新用户状态（子操作）",
          objectType: "User",
          objectId: userId,
          correlationId, // 关联到批次主日志
        });

        successCount++;
      });
    } catch (error) {
      failureCount++;
    }
  }

  // 批次主日志
  await prisma.$transaction(async (tx) => {
    await writeAuditEvent(tx, {
      actorId: currentUserId,
      module: AUDIT_MODULES.ACCOUNT,
      actionCode: AUDIT_ACTION_CODES.BATCH_UPDATE,
      actionName: "批量更新用户状态",
      batchTotalCount: userIds.length,
      batchSuccessCount: successCount,
      batchFailureCount: failureCount,
      correlationId, // 批次主日志
    });
  });
}

// ============ 示例 5：系统任务或脚本操作 ============
export async function systemTaskExample() {
  await prisma.$transaction(async (tx) => {
    // 系统任务业务逻辑
    // ...

    await writeAuditEvent(tx, {
      actorType: ACTOR_TYPES.SYSTEM, // 系统操作
      module: AUDIT_MODULES.SYSTEM,
      actionCode: AUDIT_ACTION_CODES.DATA_BACKFILL,
      actionName: "定时任务：回填历史数据",
      operationNote: "每日凌晨 2 点执行",
    });
  });
}

// ============ 示例 6：部署脚本操作 ============
export async function deploymentScriptExample(
  gitCommit: string,
  buildId: string
) {
  await prisma.$transaction(async (tx) => {
    await writeAuditEvent(tx, {
      actorType: ACTOR_TYPES.DEPLOYMENT_SCRIPT,
      module: AUDIT_MODULES.DEPLOYMENT,
      actionCode: AUDIT_ACTION_CODES.SERVICE_RESTART,
      actionName: "重启应用服务",
      gitCommit,
      buildId,
      serverIdentity: process.env.SERVER_ID || "unknown",
    });
  });
}
