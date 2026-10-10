// 一次性回填：审批链不含终审阶段（主管评即链尾）的 KPI，
// 完成时未写 finalScore，导致列表「最终绩效总分」为空、人才决策取数缺失。
// 回填口径：finalScore = managerScore（无终审阶段时考勤分为 0，finalScore 即主管评分）。
//
// 范围保护：默认只处理 2026 Q3 及以后的单据（新审批链上线后产生的数据）；
// Q2 及以前为历史冻结数据，绝不回填。可用参数覆盖起始期间：[year] [quarter]
// 执行保护：默认仅列出受影响单据（dry-run），确认后加 --apply 才写入。
// 用法：
//   预览：node --env-file=.env --import tsx scripts/backfill-kpi-final-score.ts
//   执行：node --env-file=.env --import tsx scripts/backfill-kpi-final-score.ts --apply
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--apply");
const applyChanges = process.argv.includes("--apply");
const fromYear = Number(positionalArgs[0] ?? 2026);
const fromQuarter = Number(positionalArgs[1] ?? 3);
if (!Number.isInteger(fromYear) || fromYear < 2020 || ![1, 2, 3, 4].includes(fromQuarter)) {
  console.error("用法：node --env-file=.env --import tsx scripts/backfill-kpi-final-score.ts [year=2026] [quarter=3] [--apply]");
  process.exit(1);
}

async function main() {
  const targets = await prisma.personalKpi.findMany({
    where: {
      status: "COMPLETED",
      finalScore: null,
      managerScore: { not: null },
      deletedAt: null,
      OR: [
        { year: { gt: fromYear } },
        { year: fromYear, quarter: { gte: fromQuarter } },
      ],
    },
    select: { id: true, year: true, quarter: true, managerScore: true },
  });

  if (targets.length === 0) {
    console.log(`无需回填：${fromYear} Q${fromQuarter} 起不存在 COMPLETED 且 finalScore 为 null 的 KPI`);
    return;
  }

  console.log(`待回填 ${targets.length} 条（范围：${fromYear} Q${fromQuarter} 及以后）：`);
  for (const kpi of targets) {
    console.log(`- ${kpi.id} ${kpi.year}Q${kpi.quarter} finalScore <- ${kpi.managerScore}`);
  }

  if (!applyChanges) {
    console.log("\n以上为 dry-run 预览，未写入任何数据。确认无误后加 --apply 执行回填。");
    return;
  }

  for (const kpi of targets) {
    await prisma.personalKpi.update({
      where: { id: kpi.id },
      data: { finalScore: kpi.managerScore },
    });
  }
  console.log(`已回填 ${targets.length} 条 finalScore`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
