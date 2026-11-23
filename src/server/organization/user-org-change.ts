import type { Prisma } from "@prisma/client";

export type ApplyUserOrgChangeResult = {
  projectCount: number;
  quarterlyWorkCount: number;
  productGoalCount: number;
};

/**
 * 调组跟随：成员所在组变化时，名下未软删的项目/需求/产品目标（含已完成）一起改挂新组。
 * - 必须在调用方的事务内使用（传入 tx）；本函数不开事务、不写审计（审计由调用方按场景写）。
 * - 不改 roleType、isActive；年度指标承接、个人 KPI、审批步骤、人才快照不动。
 * - 所在组未变时不做任何写操作（返回全 0）。
 */
export async function applyUserOrgChange(
  tx: Prisma.TransactionClient,
  params: { userId: string; newOrgNodeId: string },
): Promise<ApplyUserOrgChangeResult> {
  const user = await tx.user.findUnique({
    where: { id: params.userId },
    select: { id: true, orgNodeId: true },
  });
  if (!user) throw new Error("用户不存在");
  if (user.orgNodeId === params.newOrgNodeId) {
    return { projectCount: 0, quarterlyWorkCount: 0, productGoalCount: 0 };
  }

  await tx.user.update({
    where: { id: user.id },
    data: { orgNodeId: params.newOrgNodeId },
  });

  const documentWhere = { ownerId: user.id, deletedAt: null };
  const [project, quarterlyWork, productGoal] = await Promise.all([
    tx.project.updateMany({ where: documentWhere, data: { orgNodeId: params.newOrgNodeId } }),
    tx.quarterlyWork.updateMany({ where: documentWhere, data: { orgNodeId: params.newOrgNodeId } }),
    tx.productGoal.updateMany({ where: documentWhere, data: { orgNodeId: params.newOrgNodeId } }),
  ]);

  return {
    projectCount: project.count,
    quarterlyWorkCount: quarterlyWork.count,
    productGoalCount: productGoal.count,
  };
}
