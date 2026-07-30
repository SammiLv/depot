import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptDir = path.join(projectDir, "scripts", "kpi-production");
const requiredScripts = [
  "00-check-environment.ps1",
  "01-preflight.ps1",
  "02-stop-service.ps1",
  "03-build-release.ps1",
  "04-migrate-data.ps1",
  "05-align-and-deploy.ps1",
  "06-verify.ps1",
  "07-start-and-smoke.ps1",
  "08-rollback.ps1",
  "09-run-all.ps1",
  "lib.ps1",
];

for (const fileName of requiredScripts) {
  assert.equal(
    fs.existsSync(path.join(scriptDir, fileName)),
    true,
    `missing PowerShell production script: ${fileName}`,
  );
}

const lib = fs.readFileSync(path.join(scriptDir, "lib.ps1"), "utf8");
assert.match(lib, /Join-Path \$script:KpiProjectDir "db\\dev\.db"/);
assert.match(lib, /Join-Path \$projectParent "depot-kpi-backups"/);
assert.match(lib, /pm2 jlist/);
assert.match(lib, /pm_cwd/);
assert.match(lib, /System\.IO\.FileShare\]::None/);
assert.match(lib, /depot\.rj-info\.com:80/);

const migration = fs.readFileSync(
  path.join(scriptDir, "04-migrate-data.ps1"),
  "utf8",
);
assert.match(migration, /RESET_KPI_DATA/);
assert.match(migration, /Test-KpiDatabaseReleased/);
assert.match(migration, /KpiMigrationBackup/);

const build = fs.readFileSync(
  path.join(scriptDir, "03-build-release.ps1"),
  "utf8",
);
assert.match(build, /KpiPreviousNext/);
assert.match(build, /KpiPreviousPrismaClient/);
assert.match(build, /KpiPreviousPrismaGenerated/);
assert.match(build, /node_modules\\@prisma\\client/);
assert.match(build, /node_modules\\\.prisma\\client/);
assert.match(build, /Copy-Item/);

const rollback = fs.readFileSync(
  path.join(scriptDir, "08-rollback.ps1"),
  "utf8",
);
assert.match(rollback, /ROLLBACK_KPI_PRODUCTION/);
assert.match(rollback, /KPI_ROLLBACK_CODE_COMMAND/);
assert.match(rollback, /"-wal", "-shm"/);
assert.match(rollback, /KpiPreviousNext/);
assert.match(rollback, /KpiPreviousPrismaClient/);
assert.match(rollback, /KpiPreviousPrismaGenerated/);
assert.match(rollback, /KpiFailedPrismaClient/);
assert.match(rollback, /KpiFailedPrismaGenerated/);

const orchestrator = fs.readFileSync(
  path.join(scriptDir, "09-run-all.ps1"),
  "utf8",
);
for (let step = 1; step <= 7; step += 1) {
  const prefix = String(step).padStart(2, "0");
  assert.match(orchestrator, new RegExp(`${prefix}-[a-z-]+\\.ps1`));
}
assert.match(orchestrator, /PRODUCTION_KPI_MIGRATION/);

console.log("PowerShell production script contract checks passed.");
