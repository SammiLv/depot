/**
 * 一次性搬迁脚本：指标管理权限旧模型（AnnualGoalPermission + RoleAnnualGoalPermission）
 * → OrgPermissionGrant（moduleKey=ANNUAL_GOAL）。
 *
 * 翻译规则：
 * - SYSTEM 行 allowed=true   → 系统授权行（orgNodeId=null，scopeType 按 annualGoalPermissionScopeByAbilityRole）
 * - DEPARTMENT 行 allowed=true → 部门授权行（orgNodeId=departmentOrgNodeId）
 * - SYSTEM/DEPARTMENT 行 allowed=false → 不翻译（新模型无 deny，缺席即拒绝）
 * - 例外检测：DEPARTMENT allowed=false 且对应 SYSTEM 行 allowed=true（旧模型的部门级显式关闭）
 *   无法无损表达，列出清单并跳过，由人工决策。
 *
 * 幂等：已存在的有效授权跳过；被软删的同键行重新激活。可重复执行。
 *
 * 用法：npx tsx scripts/annual-goal-permission-migration.ts
 */
import type { OrgPermissionAbilityKey, RoleType } from "@prisma/client";
import { prisma } from "../src/server/db/prisma";
import {
  annualGoalAbilityKeys,
  annualGoalPermissionScopeByAbilityRole,
  orgPermissionModuleKeys,
  type AnnualGoalAbilityKey,
} from "../src/server/permissions/permission-constants";

const LEGACY_CODE_TO_ABILITY_KEY: Record<string, AnnualGoalAbilityKey> = {
  "annualGoal.viewDepartmentPlans": annualGoalAbilityKeys.viewDepartmentPlans,
  "annualGoal.editDepartmentPlans": annualGoalAbilityKeys.editDepartmentPlans,
  "annualGoal.viewTeamPlans": annualGoalAbilityKeys.viewTeamPlans,
  "annualGoal.editTeamPlans": annualGoalAbilityKeys.editTeamPlans,
  "annualGoal.updateProgress": annualGoalAbilityKeys.updateProgress,
};

async function ensureGrant(abilityKey: OrgPermissionAbilityKey, roleType: RoleType, orgNodeId: string | null) {
  const scopeType = annualGoalPermissionScopeByAbilityRole[abilityKey as AnnualGoalAbilityKey][roleType];
  const where = {
    moduleKey: orgPermissionModuleKeys.annualGoal,
    abilityKey,
    scopeType,
    subjectType: "ROLE" as const,
    roleType,
    userId: null,
    orgNodeId,
  };
  const reactivated = await prisma.orgPermissionGrant.updateMany({
    where: { ...where, isActive: false },
    data: { isActive: true },
  });
  if (reactivated.count > 0) return "reactivated" as const;
  const existing = await prisma.orgPermissionGrant.findFirst({ where, select: { id: true } });
  if (existing) return "skipped" as const;
  await prisma.orgPermissionGrant.create({ data: { ...where, isActive: true } });
  return "created" as const;
}

async function main() {
  const legacyRows = await prisma.roleAnnualGoalPermission.findMany({
    include: { annualGoalPermission: { select: { code: true } } },
  });
  console.log(`读取旧模型授权行 ${legacyRows.length} 条`);

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });
  const departmentIds = new Set(departments.map((department) => department.id));

  const systemAllowed = new Set(
    legacyRows
      .filter((row) => row.scopeType === "SYSTEM" && row.allowed)
      .map((row) => `${row.roleType}:${row.annualGoalPermission.code}`),
  );

  const counters = { created: 0, reactivated: 0, skipped: 0, denied: 0, orphanDepartment: 0, unknownCode: 0 };
  const denyOverrides: string[] = [];

  for (const row of legacyRows) {
    const code = row.annualGoalPermission.code;
    const abilityKey = LEGACY_CODE_TO_ABILITY_KEY[code];
    if (!abilityKey) {
      counters.unknownCode += 1;
      console.warn(`未识别的旧能力 code，跳过：${code}`);
      continue;
    }

    if (!row.allowed) {
      if (row.scopeType === "DEPARTMENT" && systemAllowed.has(`${row.roleType}:${code}`)) {
        counters.denied += 1;
        denyOverrides.push(`${code} | ${row.roleType} | 部门 ${row.departmentOrgNodeId}`);
      }
      continue;
    }

    if (row.scopeType === "SYSTEM") {
      counters[await ensureGrant(abilityKey, row.roleType, null)] += 1;
      continue;
    }

    if (!departmentIds.has(row.departmentOrgNodeId)) {
      counters.orphanDepartment += 1;
      console.warn(`部门节点不存在，跳过：${code} | ${row.roleType} | ${row.departmentOrgNodeId}`);
      continue;
    }
    counters[await ensureGrant(abilityKey, row.roleType, row.departmentOrgNodeId)] += 1;
  }

  console.log("搬迁结果：", counters);
  if (denyOverrides.length > 0) {
    console.warn(`\n检测到 ${denyOverrides.length} 条部门级显式关闭（新模型无法表达，未翻译，该部门将回到系统模板值）：`);
    for (const item of denyOverrides) console.warn(`  - ${item}`);
  } else {
    console.log("无部门级显式关闭行（deny-override 清单为空）。");
  }

  const grantCount = await prisma.orgPermissionGrant.count({
    where: { moduleKey: orgPermissionModuleKeys.annualGoal, isActive: true },
  });
  console.log(`当前 ANNUAL_GOAL 模块有效授权行总数：${grantCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
