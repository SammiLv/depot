// 一次性回填：审批链不含终审阶段（主管评即链尾）的历史 KPI，
// 完成时未写 finalScore，导致列表「最终绩效总分」为空、绩效分布统计有效评分为 0。
// 回填口径：finalScore = managerScore（无终审阶段时考勤分为 0，finalScore 即主管评分）。
// 用法：node --import tsx scripts/backfill-kpi-final-score.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const targets = await prisma.personalKpi.findMany({
    where: { status: "COMPLETED", finalScore: null, managerScore: { not: null }, deletedAt: null },
    select: { id: true, year: true, quarter: true, managerScore: true },
  });

  if (targets.length === 0) {
    console.log("无需回填：不存在 COMPLETED 且 finalScore 为 null 的 KPI");
    return;
  }

  console.log(`待回填 ${targets.length} 条：`);
  for (const kpi of targets) {
    console.log(`- ${kpi.id} ${kpi.year}Q${kpi.quarter} finalScore <- ${kpi.managerScore}`);
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
