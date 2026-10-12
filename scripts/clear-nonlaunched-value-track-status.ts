// 一次性修正：价值跟踪仅覆盖「已上线」项目。
// 将非「已上线」项目的 valueTrackStatus / valueJudgement 置空，使其不再出现在价值跟踪列表。
// 保护：已有价值跟踪记录(RequirementValueTrack)的项目跳过并打印，避免误清真实跟踪历史。
// 可重复执行：仅处理 valueTrackStatus 非空的项目。
// 用法：node --import tsx scripts/clear-nonlaunched-value-track-status.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL === "file:./dev.db" ? "file:./db/dev.db" : process.env.DATABASE_URL;
const adapter = new PrismaBetterSqlite3({ url: databaseUrl ?? "file:./db/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const candidates = await prisma.project.findMany({
    where: { status: { not: "LAUNCHED" }, valueTrackStatus: { not: null } },
    select: { id: true, title: true, status: true, valueTrackStatus: true },
  });
  console.log(`待修正 ${candidates.length} 个项目`);

  const withTracks = await prisma.requirementValueTrack.findMany({
    where: { deletedAt: null, projectId: { in: candidates.map((p) => p.id) } },
    select: { projectId: true },
  });
  const skipIds = new Set(withTracks.map((t) => t.projectId));

  const targets = candidates.filter((p) => !skipIds.has(p.id));
  const skipped = candidates.filter((p) => skipIds.has(p.id));

  if (targets.length > 0) {
    const result = await prisma.project.updateMany({
      where: { id: { in: targets.map((p) => p.id) } },
      data: { valueTrackStatus: null, valueJudgement: null },
    });
    console.log(`已清空 ${result.count} 个项目的跟踪状态/价值判断`);
  }

  if (skipped.length > 0) {
    console.log(`跳过 ${skipped.length} 个存在跟踪记录的项目，请人工确认：`);
    for (const p of skipped) {
      console.log(`- [${p.status}] ${p.title} (${p.id}) 当前跟踪状态=${p.valueTrackStatus}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
