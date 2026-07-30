import {
  buildPreservationBaseline,
  comparePreservationBaselines,
  getKpiResetVerificationIssues,
  inspectProductionDatabase,
  openDatabase,
  parseNamedArguments,
  readBaselineFile,
  writeJsonFile,
} from "./kpi-production-migration-lib";

function printUsage() {
  console.log(
    "Usage: npx tsx scripts/verify-kpi-production.ts --database /absolute/path/prod.db --baseline /absolute/path/baseline.json [--output /absolute/path/verify.json]",
  );
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
  let preservationIssues: string[];
  let resetIssues: string[];
  try {
    preservationIssues = comparePreservationBaselines(
      expectedBaseline,
      buildPreservationBaseline(db),
    );
    resetIssues = getKpiResetVerificationIssues(db);
  } finally {
    db.close();
  }
  const historyIssues = report.missingKpiMigrations.length > 0
    ? [`KPI migration history 尚未对齐：${report.missingKpiMigrations.join(", ")}`]
    : [];
  const databaseIssues = [
    ...report.integrityCheck.filter((value) => value !== "ok")
      .map((value) => `integrity_check：${value}`),
    ...(report.foreignKeyViolationCount > 0
      ? [`foreign_key_check 异常：${report.foreignKeyViolationCount}`]
      : []),
    ...report.failedMigrations.map((name) => `存在失败 migration：${name}`),
  ];
  const issues = [
    ...preservationIssues,
    ...resetIssues,
    ...historyIssues,
    ...databaseIssues,
  ];
  const result = {
    databasePath: report.databasePath,
    verifiedAt: new Date().toISOString(),
    passed: issues.length === 0,
    issues,
  };
  const outputPath = args.get("--output");
  if (outputPath) writeJsonFile(outputPath, result);

  console.log(result.passed ? "验证结果：PASS" : "验证结果：FAIL");
  for (const issue of issues) console.log(`- ${issue}`);
  if (outputPath) console.log(`报告：${outputPath}`);
  if (!result.passed) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
