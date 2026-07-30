import {
  inspectProductionDatabase,
  parseNamedArguments,
  writeJsonFile,
} from "./kpi-production-migration-lib";

function printUsage() {
  console.log(
    "Usage: npx tsx scripts/preflight-kpi-production.ts --database /absolute/path/prod.db [--output /absolute/path/preflight.json]",
  );
}

function main() {
  const args = parseNamedArguments(process.argv.slice(2));
  const databasePath = args.get("--database");
  if (!databasePath || args.has("--help")) {
    printUsage();
    process.exit(databasePath ? 0 : 1);
  }

  const report = inspectProductionDatabase(databasePath);
  const outputPath = args.get("--output");
  if (outputPath) {
    writeJsonFile(outputPath, report);
  }

  console.log(`数据库：${report.databasePath}`);
  console.log(`状态：${report.state}`);
  console.log(`完整性：${report.integrityCheck.join(", ")}`);
  console.log(`外键异常：${report.foreignKeyViolationCount}`);
  console.log(`失败 migration：${report.failedMigrations.length}`);
  console.log(`缺失 KPI migration：${report.missingKpiMigrations.length}`);
  console.log(`OrgPermissionGrant：${report.structure.orgPermissionGrant}`);
  console.log(`KPI 权限：${
    report.permissionCounts
      .filter((item) => item.moduleKey === "KPI")
      .reduce((sum, item) => sum + item.count, 0)
  }`);
  console.log(`非 KPI 权限：${report.preservationBaseline.nonKpiOrgPermissionGrants.count}`);
  if (outputPath) console.log(`报告：${outputPath}`);

  if (report.state === "D_BLOCKED") {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
