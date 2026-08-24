/**
 * 一次性清理脚本：人才发展模块权限重构（2026-08-21）
 *
 * 1) 软删 OrgPermissionGrant 中 6 个 talent 死 key 的历史授权行（仅 moduleKey=TALENT）：
 *    - VIEW_CAREER_MODEL / MANAGE_CAREER_MODEL：职级/胜任力写操作早已走 MANAGE_TALENT_CONFIG，无任何引用
 *    - VIEW_BUSINESS_ASSESSMENT / VIEW_WORK_INCIDENT：业务考核/工作事故数据已迁 KPI 模块按部门公开
 *    - MANAGE_BUSINESS_ASSESSMENT / MANAGE_WORK_INCIDENT：同名能力点在 KPI 模块（moduleKey=KPI）下仍生效，
 *      本脚本只清理 TALENT 模块下的残留行，绝不动 KPI 模块授权
 * 2) 幂等补发 VIEW_TALENT_CONFIG 默认授权：管理员 ALL + 各部门主管 SUBTREE
 *    （与服务启动时 instrumentation 的自动补发逻辑一致，二者可叠加重复执行）
 *
 * 用法：npx tsx scripts/talent-permission-cleanup.ts
 * 可重复执行；生产库在合并上线后执行一次即可。
 */
import { prisma } from "../src/server/db/prisma";

const DEAD_TALENT_ABILITY_KEYS = [
  "VIEW_CAREER_MODEL",
  "MANAGE_CAREER_MODEL",
  "VIEW_BUSINESS_ASSESSMENT",
  "MANAGE_BUSINESS_ASSESSMENT",
  "VIEW_WORK_INCIDENT",
  "MANAGE_WORK_INCIDENT",
] as const;

async function ensureGrant(
  roleType: "ADMIN" | "DEPARTMENT_MANAGER",
  scopeType: "ALL" | "SUBTREE",
  orgNodeId: string | null,
) {
  const where = {
    moduleKey: "TALENT" as const,
    abilityKey: "VIEW_TALENT_CONFIG" as const,
    scopeType,
    subjectType: "ROLE" as const,
    roleType,
    userId: null,
    orgNodeId,
  };
  const result = await prisma.orgPermissionGrant.updateMany({ where, data: { isActive: true } });
  if (result.count === 0) {
    await prisma.orgPermissionGrant.create({ data: { ...where, isActive: true } });
    return 1;
  }
  return 0;
}

async function main() {
  const stale = await prisma.orgPermissionGrant.updateMany({
    where: {
      moduleKey: "TALENT",
      abilityKey: { in: [...DEAD_TALENT_ABILITY_KEYS] },
      isActive: true,
    },
    data: { isActive: false },
  });
  console.log(`[清理] TALENT 模块死 key 授权行软删（isActive=false）：${stale.count} 行`);

  // 校验：KPI 模块下的 MANAGE_BUSINESS_ASSESSMENT / MANAGE_WORK_INCIDENT 不受影响
  const kpiRows = await prisma.orgPermissionGrant.count({
    where: {
      moduleKey: "KPI",
      abilityKey: { in: ["MANAGE_BUSINESS_ASSESSMENT", "MANAGE_WORK_INCIDENT"] },
      isActive: true,
    },
  });
  console.log(`[校验] KPI 模块业务考核/工作事故授权仍在：${kpiRows} 行（应为非 0）`);

  let created = 0;
  created += await ensureGrant("ADMIN", "ALL", null);
  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true, name: true },
  });
  for (const department of departments) {
    created += await ensureGrant("DEPARTMENT_MANAGER", "SUBTREE", department.id);
  }
  console.log(`[补发] VIEW_TALENT_CONFIG 新增授权 ${created} 行（管理员 ALL + ${departments.length} 个部门主管 SUBTREE；已存在则不重复）`);
}

main()
  .catch((error) => {
    console.error("清理脚本执行失败", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
