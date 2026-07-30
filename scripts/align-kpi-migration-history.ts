import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  buildPreservationBaseline,
  comparePreservationBaselines,
  getKpiResetVerificationIssues,
  inspectProductionDatabase,
  openDatabase,
  parseNamedArguments,
  readBaselineFile,
} from "./kpi-production-migration-lib";

const CONFIRMATION_TEXT = "ALIGN_KPI_MIGRATION_HISTORY";

function printUsage() {
  console.log(`
Dry run:
  node --import tsx scripts/align-kpi-migration-history.ts \\
    --database /absolute/path/prod.db \\
    --baseline /absolute/path/prod-before-kpi.baseline.json

Execute:
  node --import tsx scripts/align-kpi-migration-history.ts \\
    --database /absolute/path/prod.db \\
    --baseline /absolute/path/prod-before-kpi.baseline.json \\
    --execute \\
    --confirm ${CONFIRMATION_TEXT}
  `.trim());
}

function runPrisma(databasePath: string, prismaArgs: string[]) {
  // Invoke Prisma through Node instead of node_modules/.bin/prisma. On Windows
  // the .bin entry is a prisma.cmd batch file, which spawnSync cannot execute
  // reliably without enabling a shell.
  const prismaExecutable = path.resolve(
    process.cwd(),
    "node_modules/prisma/build/index.js",
  );
  const result = spawnSync(
    process.execPath,
    [prismaExecutable, ...prismaArgs, "--config", "db/prisma.config.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: `file:${databasePath}`,
      },
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Prisma 命令执行失败：prisma ${prismaArgs.join(" ")}`);
  }
}

function main() {
  const args = parseNamedArguments(process.argv.slice(2));
  const databasePath = args.get("--database");
  const baselinePath = args.get("--baseline");
  if (!databasePath || !baselinePath || args.has("--help")) {
    printUsage();
    process.exit(databasePath && baselinePath ? 0 : 1);
  }

  const expectedBaseline = readBaselineFile(baselinePath);
  const report = inspectProductionDatabase(databasePath);
  const db = openDatabase(databasePath);
  try {
    const issues = [
      ...comparePreservationBaselines(expectedBaseline, buildPreservationBaseline(db)),
      ...getKpiResetVerificationIssues(db),
    ];
    if (issues.length > 0) {
      throw new Error(`迁移结构或数据校验未通过：${issues.join("；")}`);
    }
  } finally {
    db.close();
  }
  if (report.failedMigrations.length > 0) {
    throw new Error(`存在失败 migration：${report.failedMigrations.join(", ")}`);
  }
  if (report.missingKpiMigrations.length === 0) {
    console.log("KPI migration history 已对齐，无需处理。");
    runPrisma(report.databasePath, ["migrate", "status"]);
    return;
  }

  console.log("将标记为已应用：");
  for (const migrationName of report.missingKpiMigrations) {
    console.log(`- ${migrationName}`);
  }
  if (!args.has("--execute")) {
    console.log("当前为 dry-run，未修改 migration history。");
    console.log(`确认后使用 --execute --confirm ${CONFIRMATION_TEXT}`);
    return;
  }
  if (args.get("--confirm") !== CONFIRMATION_TEXT) {
    throw new Error(`执行对齐必须传入 --confirm ${CONFIRMATION_TEXT}`);
  }

  for (const migrationName of report.missingKpiMigrations) {
    runPrisma(report.databasePath, ["migrate", "resolve", "--applied", migrationName]);
  }
  runPrisma(report.databasePath, ["migrate", "status"]);

  const finalReport = inspectProductionDatabase(report.databasePath);
  if (finalReport.missingKpiMigrations.length > 0 || finalReport.failedMigrations.length > 0) {
    throw new Error("KPI migration history 对齐后复检失败");
  }
  console.log("KPI migration history 对齐完成，Prisma 状态检查通过。");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
