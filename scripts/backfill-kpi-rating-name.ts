import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { resolveKpiRating } from "@/server/talent/decision-rule-config";

// KPI 等级回填：终审已完成（COMPLETED 且有 finalScore）但 finalRatingName 为空的记录，
// 按「归属节点 → 最近部门祖先」匹配已发布的等级规则，补写 finalRatingName + 快照。
// 幂等可重复执行。现网执行前请先备份数据库。
const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

async function resolveNearestDepartmentOrgNodeId(orgNodeId: string) {
  const node = await prisma.orgNode.findFirst({ where: { id: orgNodeId }, select: { nodeType: true } });
  if (!node) return null;
  if (node.nodeType === "DEPARTMENT") return orgNodeId;
  const closure = await prisma.orgClosure.findMany({
    where: { descendantId: orgNodeId, depth: { gt: 0 } },
    orderBy: { depth: "asc" },
    select: { ancestorId: true },
  });
  for (const link of closure) {
    const ancestor = await prisma.orgNode.findFirst({
      where: { id: link.ancestorId, nodeType: "DEPARTMENT" },
      select: { id: true },
    });
    if (ancestor) return ancestor.id;
  }
  return null;
}

async function main() {
  const kpis = await prisma.personalKpi.findMany({
    where: { deletedAt: null, status: "COMPLETED", finalScore: { not: null }, finalRatingName: null },
    select: { id: true, orgNodeId: true, finalScore: true, userId: true },
  });
  console.log(`待回填 ${kpis.length} 条`);

  let updated = 0;
  for (const kpi of kpis) {
    if (!kpi.orgNodeId || kpi.finalScore === null) continue;
    const departmentOrgNodeId = await resolveNearestDepartmentOrgNodeId(kpi.orgNodeId);
    const candidateIds = [...new Set([kpi.orgNodeId, departmentOrgNodeId].filter((id): id is string => Boolean(id)))];
    const rule = await prisma.kpiRatingRuleVersion.findFirst({
      where: { departmentOrgNodeId: { in: candidateIds }, status: "ACTIVE", deletedAt: null },
      orderBy: { publishedAt: "desc" },
    });
    if (!rule) {
      console.log(`  - ${kpi.id}: 归属链路无已发布规则，跳过`);
      continue;
    }
    const bands = await prisma.kpiRatingBand.findMany({ where: { ruleVersionId: rule.id } });
    const rating = resolveKpiRating(kpi.finalScore!, bands);
    if (!rating) {
      console.log(`  - ${kpi.id}: 分数 ${kpi.finalScore} 未命中任何等级区间，跳过`);
      continue;
    }
    await prisma.personalKpi.update({
      where: { id: kpi.id },
      data: {
        finalRatingName: rating.name,
        ratingRuleVersionId: rule.id,
        ratingSnapshotJson: JSON.stringify({
          ruleVersionId: rule.id,
          ruleName: rule.name,
          ruleVersion: rule.version,
          quarterlyKpiTotalScore: rule.quarterlyKpiTotalScore,
          bands,
          score: kpi.finalScore,
          ratingName: rating.name,
        }),
      },
    });
    updated += 1;
    console.log(`  ✓ ${kpi.id}: ${kpi.finalScore} 分 → ${rating.name}（规则 ${rule.name} V${rule.version}）`);
  }
  console.log(`回填完成，更新 ${updated} 条`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
