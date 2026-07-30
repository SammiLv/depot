import fs from "node:fs";
import path from "node:path";
import {
  assertAbsoluteDatabasePath,
  inspectProductionDatabase,
  migrateKpiProductionDatabase,
  openDatabase,
  parseNamedArguments,
  writeJsonFile,
} from "./kpi-production-migration-lib";

const CONFIRMATION_TEXT = "RESET_KPI_DATA";

function printUsage() {
  console.log(`
Dry run:
  npx tsx scripts/migrate-kpi-production.ts --database /absolute/path/prod.db

Execute:
  npx tsx scripts/migrate-kpi-production.ts \\
    --database /absolute/path/prod.db \\
    --backup /absolute/path/backups/prod-before-kpi.db \\
    --baseline-out /absolute/path/backups/prod-before-kpi.baseline.json \\
    --result-out /absolute/path/backups/prod-kpi-migration-result.json \\
    --execute \\
    --confirm ${CONFIRMATION_TEXT}
  `.trim());
}

async function verifyBackup(backupPath: string) {
  const backupDb = openDatabase(backupPath);
  try {
    const result = backupDb.pragma("integrity_check") as Array<Record<string, unknown>>;
    const values = result.map((item) => String(item.integrity_check));
    if (values.some((value) => value !== "ok")) {
      throw new Error(`备份完整性检查失败：${values.join(", ")}`);
    }
  } finally {
    backupDb.close();
  }
}

async function main() {
  const args = parseNamedArguments(process.argv.slice(2));
  const databasePathArgument = args.get("--database");
  if (!databasePathArgument || args.has("--help")) {
    printUsage();
    process.exit(databasePathArgument ? 0 : 1);
  }
  const databasePath = assertAbsoluteDatabasePath(databasePathArgument);
  const preflight = inspectProductionDatabase(databasePath);
  console.log(`预检状态：${preflight.state}`);
  console.log(`KPI 权限将清理：${
    preflight.permissionCounts
      .filter((item) => item.moduleKey === "KPI")
      .reduce((sum, item) => sum + item.count, 0)
  }`);
  for (const tableName of Object.keys(preflight.tableCounts).sort()) {
    if (
      tableName.startsWith("Kpi")
      || tableName.startsWith("PersonalKpi")
    ) {
      console.log(`${tableName} 将清理：${preflight.tableCounts[tableName]}`);
    }
  }

  if (!args.has("--execute")) {
    console.log("当前为 dry-run，未修改数据库。");
    console.log(`确认后使用 --execute --confirm ${CONFIRMATION_TEXT}`);
    return;
  }
  if (preflight.state === "D_BLOCKED") {
    throw new Error("预检结果为 D_BLOCKED，禁止执行迁移");
  }
  if (args.get("--confirm") !== CONFIRMATION_TEXT) {
    throw new Error(`执行迁移必须传入 --confirm ${CONFIRMATION_TEXT}`);
  }

  const backupPath = args.get("--backup");
  const baselinePath = args.get("--baseline-out");
  const resultPath = args.get("--result-out");
  if (!backupPath || !baselinePath || !resultPath) {
    throw new Error("执行迁移必须指定 --backup、--baseline-out 和 --result-out");
  }
  for (const outputPath of [backupPath, baselinePath, resultPath]) {
    if (!path.isAbsolute(outputPath)) {
      throw new Error(`输出路径必须是绝对路径：${outputPath}`);
    }
    if (!fs.existsSync(path.dirname(outputPath))) {
      throw new Error(`输出目录不存在：${path.dirname(outputPath)}`);
    }
    if (fs.existsSync(outputPath)) {
      throw new Error(`拒绝覆盖已有文件：${outputPath}`);
    }
  }
  if (path.resolve(backupPath) === databasePath) {
    throw new Error("备份路径不能与生产数据库路径相同");
  }

  writeJsonFile(baselinePath, preflight.preservationBaseline);
  const db = openDatabase(databasePath, false);
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    await db.backup(backupPath);
    await verifyBackup(backupPath);
    const result = migrateKpiProductionDatabase(db, preflight.preservationBaseline);
    const finalIntegrity = db.pragma("integrity_check") as Array<Record<string, unknown>>;
    if (finalIntegrity.some((item) => String(item.integrity_check) !== "ok")) {
      throw new Error("迁移后数据库完整性检查失败");
    }
    writeJsonFile(resultPath, {
      databasePath,
      backupPath,
      baselinePath,
      completedAt: new Date().toISOString(),
      ...result,
    });
    console.log(`备份：${backupPath}`);
    console.log(`基线：${baselinePath}`);
    console.log(`结果：${resultPath}`);
    console.log(`清理 KPI 权限：${result.deletedKpiPermissionCount}`);
    console.log("KPI 数据已定向清理，必须保留的数据校验通过。");
    console.log("下一步：逐条核对并对齐 KPI migration history，然后执行 migrate deploy。");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
