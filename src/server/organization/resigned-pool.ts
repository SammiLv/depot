import type { Prisma } from "@prisma/client";

export const RESIGNED_POOL_NODE_NAME = "离职人员";

/**
 * 确保部门下存在系统小组「离职人员」。
 * - 只按 isResignedPool 标志匹配，不按名字——避免把钉钉同步来的同名业务组误认成池。
 * - 首次离职时按需创建，幂等；必须在事务内调用。
 */
export async function ensureResignedPoolNode(
  tx: Prisma.TransactionClient,
  departmentOrgNodeId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await tx.orgNode.findFirst({
    where: { parentId: departmentOrgNodeId, isResignedPool: true, nodeType: "TEAM" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const node = await tx.orgNode.create({
    data: {
      name: RESIGNED_POOL_NODE_NAME,
      nodeType: "TEAM",
      parentId: departmentOrgNodeId,
      isResignedPool: true,
      dingtalkDeptId: null,
    },
    select: { id: true },
  });

  // 新节点只补自己的闭包行：自身行 + 继承父节点的全部祖先（新节点尚无后代，无需全量重建）
  const ancestorRows = await tx.orgClosure.findMany({
    where: { descendantId: departmentOrgNodeId },
    select: { ancestorId: true, depth: true },
  });
  await tx.orgClosure.createMany({
    data: [
      { ancestorId: node.id, descendantId: node.id, depth: 0 },
      ...ancestorRows.map((row) => ({
        ancestorId: row.ancestorId,
        descendantId: node.id,
        depth: row.depth + 1,
      })),
    ],
  });

  return { id: node.id, created: true };
}
