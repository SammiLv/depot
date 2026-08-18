import { prisma } from "../src/server/db/prisma";
import { resolveKpiRating } from "../src/server/talent/decision-rule-config";

async function main() {
  const completedKpis = await prisma.personalKpi.findMany({
    where: {
      status: "COMPLETED",
      deletedAt: null,
      OR: [
        { finalRatingName: null },
        { ratingRuleVersionId: null },
        { ratingSnapshotJson: null },
      ],
    },
    select: {
      id: true,
      finalScore: true,
      orgNodeId: true,
      year: true,
      quarter: true,
    },
  });

  console.log(`找到 ${completedKpis.length} 条需要补录 KPI 等级快照的已完成 KPI`);

  let updated = 0;
  let skipped = 0;

  for (const kpi of completedKpis) {
    if (kpi.finalScore === null || kpi.orgNodeId === null) {
      skipped += 1;
      console.log(`跳过 ${kpi.id}: 缺少 finalScore 或 orgNodeId`);
      continue;
    }

    const rule = await prisma.kpiRatingRuleVersion.findFirst({
      where: { departmentOrgNodeId: kpi.orgNodeId, status: "ACTIVE", deletedAt: null },
      orderBy: { publishedAt: "desc" },
    });

    if (!rule) {
      skipped += 1;
      console.log(`跳过 ${kpi.id}: 未找到 orgNodeId=${kpi.orgNodeId} 的生效绩效等级规则`);
      continue;
    }

    const bands = await prisma.kpiRatingBand.findMany({ where: { ruleVersionId: rule.id } });
    const rating = resolveKpiRating(kpi.finalScore, bands);

    if (!rating) {
      skipped += 1;
      console.log(`跳过 ${kpi.id}: 分数 ${kpi.finalScore} 无法匹配任何等级区间`);
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
    console.log(`已更新 ${kpi.id}: 分数=${kpi.finalScore}, 等级=${rating.name}, 规则=${rule.name}`);
  }

  console.log(`\n完成：更新 ${updated} 条，跳过 ${skipped} 条`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
