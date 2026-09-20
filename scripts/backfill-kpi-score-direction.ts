import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

// KPI 计分方向回填（scoreDirection 字段新增后的存量初始化）：
// 1. 模板项：名称含「奖励」→ BONUS，其余 → DEDUCTION（与历史按名称判断的行为对齐）
// 2. KPI 单据项：优先按 sourceTemplateItemId 回链模板项方向；断链按名称含「奖励」兜底
// 幂等可重复执行。现网执行前请先备份数据库。
const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

const BONUS_KEYWORD = "奖励";

function directionByName(name: string): "BONUS" | "DEDUCTION" {
  return name.includes(BONUS_KEYWORD) ? "BONUS" : "DEDUCTION";
}

async function main() {
  // 1. 模板项
  const templateItems = await prisma.kpiTemplateItem.findMany({
    select: { id: true, name: true, scoreDirection: true },
  });
  let templateUpdated = 0;
  for (const item of templateItems) {
    const direction = directionByName(item.name);
    if (item.scoreDirection !== direction) {
      await prisma.kpiTemplateItem.update({ where: { id: item.id }, data: { scoreDirection: direction } });
      templateUpdated += 1;
      console.log(`  模板项 ${item.name} → ${direction}`);
    }
  }
  console.log(`模板项：共 ${templateItems.length} 条，更新 ${templateUpdated} 条`);

  // 模板项方向映射（含未更新的，回链时都要用）
  const directionByTemplateItemId = new Map(
    templateItems.map((item) => [item.id, directionByName(item.name)] as const),
  );

  // 2. KPI 单据项
  const kpiItems = await prisma.personalKpiItem.findMany({
    select: { id: true, name: true, sourceTemplateItemId: true, scoreDirection: true },
  });
  let byLink = 0;
  let byName = 0;
  for (const item of kpiItems) {
    const linked = item.sourceTemplateItemId ? directionByTemplateItemId.get(item.sourceTemplateItemId) : undefined;
    const direction = linked ?? directionByName(item.name);
    if (linked) byLink += 1;
    else byName += 1;
    if (item.scoreDirection !== direction) {
      await prisma.personalKpiItem.update({ where: { id: item.id }, data: { scoreDirection: direction } });
      console.log(`  单据项 ${item.name} → ${direction}（${linked ? "回链模板" : "名称兜底"}）`);
    }
  }
  console.log(`单据项：共 ${kpiItems.length} 条（回链 ${byLink} / 名称兜底 ${byName}），回填完成`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
