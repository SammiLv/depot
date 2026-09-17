import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

// 需求周期改造的历史数据回填：
//   startDate = year-startMonth-01 00:00:00
//   endDate   = year-endMonth-月末 23:59:59.999（endMonth 缺失时取 startMonth 月末）
// 只处理 startDate 为空的存量记录，幂等可重复执行。
const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const works = await prisma.quarterlyWork.findMany({
    where: { startDate: null, startMonth: { not: null } },
    select: { id: true, title: true, year: true, startMonth: true, endMonth: true },
  });

  console.log(`待回填 ${works.length} 条`);
  for (const work of works) {
    const startMonth = work.startMonth!;
    const endMonth = work.endMonth ?? startMonth;
    const startDate = new Date(work.year, startMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(work.year, endMonth, 0, 23, 59, 59, 999);
    await prisma.quarterlyWork.update({
      where: { id: work.id },
      data: { startDate, endDate },
    });
    console.log(`  ✓ ${work.title}: ${startDate.toLocaleDateString()} ~ ${endDate.toLocaleDateString()}`);
  }
  console.log("回填完成");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
