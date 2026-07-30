import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const KPI_RESET_TABLES = [
  "PersonalKpiItemStepScore",
  "PersonalKpiActionLog",
  "PersonalKpiApprovalStep",
  "PersonalKpiItem",
  "PersonalKpi",
  "KpiApprovalPolicyStep",
  "KpiApprovalPolicy",
  "KpiTemplateAssignment",
  "KpiTemplateItem",
  "KpiTemplate",
] as const;

export const KPI_MIGRATIONS = [
  "20260717160000_add_org_permission_grant",
  "20260717170000_org_permission_subject_type",
  "20260720000100_add_kpi_approval_policy",
  "20260720000200_add_kpi_approval_policy_step",
  "20260727000100_extend_personal_kpi_approval_snapshot",
  "20260727000200_add_personal_kpi_item_step_score",
] as const;

const REQUIRED_PERSONAL_KPI_COLUMNS = [
  "approvalPolicyId",
  "approvalPolicyName",
  "approvalPolicyScopeType",
  "approvalPolicyDepartmentOrgNodeId",
] as const;

const REQUIRED_APPROVAL_STEP_COLUMNS = [
  "id",
  "personalKpiId",
  "policyStepId",
  "stepOrder",
  "stageKey",
  "stepLabel",
  "ancestorDepth",
  "resolverType",
  "resolverUserId",
  "orgNodeId",
  "approverId",
  "status",
  "comment",
  "actedAt",
  "completedAt",
  "createdAt",
] as const;

const REQUIRED_APPROVAL_STEP_INDEXES = [
  "PersonalKpiApprovalStep_personalKpiId_stepOrder_idx",
  "PersonalKpiApprovalStep_policyStepId_idx",
  "PersonalKpiApprovalStep_approverId_status_idx",
] as const;

const REQUIRED_KPI_APPROVAL_POLICY_COLUMNS = [
  "id",
  "scopeType",
  "departmentOrgNodeId",
  "name",
  "description",
  "isActive",
  "activeScopeKey",
  "createdAt",
  "updatedAt",
] as const;

const REQUIRED_KPI_APPROVAL_POLICY_INDEXES = [
  "KpiApprovalPolicy_scopeType_departmentOrgNodeId_name_key",
  "KpiApprovalPolicy_activeScopeKey_key",
  "KpiApprovalPolicy_single_active_scope_key",
  "KpiApprovalPolicy_scopeType_departmentOrgNodeId_isActive_idx",
] as const;

const REQUIRED_KPI_APPROVAL_POLICY_STEP_COLUMNS = [
  "id",
  "policyId",
  "stepOrder",
  "label",
  "ancestorDepth",
  "resolverType",
  "resolverUserId",
  "skipIfSelf",
  "skipIfDuplicateApprover",
  "allowSkipWhenNoApprover",
  "createdAt",
  "updatedAt",
] as const;

const REQUIRED_KPI_APPROVAL_POLICY_STEP_INDEXES = [
  "KpiApprovalPolicyStep_policyId_stepOrder_key",
  "KpiApprovalPolicyStep_policyId_idx",
  "KpiApprovalPolicyStep_resolverType_idx",
  "KpiApprovalPolicyStep_resolverUserId_idx",
] as const;

const REQUIRED_PERSONAL_KPI_ITEM_STEP_SCORE_COLUMNS = [
  "id",
  "personalKpiItemId",
  "approvalStepId",
  "score",
  "comment",
  "createdAt",
  "updatedAt",
] as const;

const REQUIRED_PERSONAL_KPI_ITEM_STEP_SCORE_INDEXES = [
  "PersonalKpiItemStepScore_personalKpiItemId_approvalStepId_key",
  "PersonalKpiItemStepScore_approvalStepId_idx",
  "PersonalKpiItemStepScore_personalKpiItemId_idx",
] as const;

type SqliteRow = Record<string, unknown>;

export type TableFingerprint = {
  count: number;
  sha256: string;
};

export type PreservationBaseline = {
  formatVersion: 1;
  createdAt: string;
  tables: Record<string, TableFingerprint>;
  nonKpiOrgPermissionGrants: TableFingerprint;
};

export type ProductionDatabaseReport = {
  databasePath: string;
  databaseSizeBytes: number;
  sqliteVersion: string;
  journalMode: string;
  integrityCheck: string[];
  foreignKeyViolationCount: number;
  failedMigrations: string[];
  missingKpiMigrations: string[];
  state: "A_STANDARD_OLD" | "B_DB_PUSHED" | "C_MIXED" | "D_BLOCKED" | "READY";
  structure: {
    orgPermissionGrant: "MISSING" | "LEGACY" | "TARGET" | "PARTIAL";
    kpiApprovalPolicy: boolean;
    kpiApprovalPolicyStep: boolean;
    personalKpiSnapshotColumns: boolean;
    personalKpiApprovalStepColumns: boolean;
    personalKpiItemStepScore: boolean;
  };
  tableCounts: Record<string, number>;
  permissionCounts: Array<{
    moduleKey: string;
    subjectType: string;
    count: number;
  }>;
  preservationBaseline: PreservationBaseline;
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function rows(db: Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).all(...params) as SqliteRow[];
}

function row(db: Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).get(...params) as SqliteRow | undefined;
}

export function assertAbsoluteDatabasePath(databasePath: string) {
  if (!databasePath || !path.isAbsolute(databasePath)) {
    throw new Error("必须通过 --database 传入 SQLite 数据库绝对路径");
  }
  if (!fs.existsSync(databasePath)) {
    throw new Error(`数据库文件不存在：${databasePath}`);
  }
  if (!fs.statSync(databasePath).isFile()) {
    throw new Error(`数据库路径不是文件：${databasePath}`);
  }
  return path.resolve(databasePath);
}

export function openDatabase(databasePath: string, readonly = true) {
  return new Database(assertAbsoluteDatabasePath(databasePath), {
    readonly,
    fileMustExist: true,
    timeout: 10_000,
  });
}

export function tableExists(db: Database, tableName: string) {
  return Boolean(row(
    db,
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName,
  ));
}

export function getTableColumns(db: Database, tableName: string) {
  if (!tableExists(db, tableName)) return new Set<string>();
  return new Set(
    rows(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`)
      .map((item) => String(item.name)),
  );
}

function getUserTableNames(db: Database) {
  return rows(
    db,
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name <> '_prisma_migrations'
     ORDER BY name`,
  ).map((item) => String(item.name));
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return { type: "buffer", base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeValue(item)]),
    );
  }
  return value;
}

function fingerprintRows(inputRows: SqliteRow[]): TableFingerprint {
  const serializedRows = inputRows
    .map((item) => JSON.stringify(normalizeValue(item)))
    .sort();
  return {
    count: serializedRows.length,
    sha256: createHash("sha256").update(serializedRows.join("\n")).digest("hex"),
  };
}

function fingerprintTable(db: Database, tableName: string) {
  return fingerprintRows(rows(db, `SELECT * FROM ${quoteIdentifier(tableName)}`));
}

function getCanonicalNonKpiPermissionRows(db: Database) {
  if (!tableExists(db, "OrgPermissionGrant")) return [];
  const columns = getTableColumns(db, "OrgPermissionGrant");
  const select = (column: string, fallbackSql: string) =>
    columns.has(column) ? quoteIdentifier(column) : `${fallbackSql} AS ${quoteIdentifier(column)}`;
  return rows(
    db,
    `SELECT
       ${select("id", "NULL")},
       ${select("moduleKey", "NULL")},
       ${select("abilityKey", "NULL")},
       ${select("scopeType", "NULL")},
       ${select("subjectType", "'ROLE'")},
       ${select("roleType", "NULL")},
       ${select("userId", "NULL")},
       ${select("orgNodeId", "NULL")},
       ${select("isActive", "1")},
       ${select("createdAt", "NULL")},
       ${select("updatedAt", "NULL")}
     FROM "OrgPermissionGrant"
     WHERE "moduleKey" <> 'KPI'`,
  );
}

export function buildPreservationBaseline(db: Database): PreservationBaseline {
  const resetTableSet = new Set<string>(KPI_RESET_TABLES);
  const protectedTables = getUserTableNames(db)
    .filter((tableName) => tableName !== "OrgPermissionGrant" && !resetTableSet.has(tableName));
  return {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    tables: Object.fromEntries(
      protectedTables.map((tableName) => [tableName, fingerprintTable(db, tableName)]),
    ),
    nonKpiOrgPermissionGrants: fingerprintRows(getCanonicalNonKpiPermissionRows(db)),
  };
}

export function comparePreservationBaselines(
  expected: PreservationBaseline,
  actual: PreservationBaseline,
) {
  const issues: string[] = [];
  const expectedTableNames = Object.keys(expected.tables).sort();
  const actualTableNames = Object.keys(actual.tables).sort();
  if (JSON.stringify(expectedTableNames) !== JSON.stringify(actualTableNames)) {
    issues.push("必须保留的表集合发生变化");
  }
  for (const tableName of expectedTableNames) {
    const before = expected.tables[tableName];
    const after = actual.tables[tableName];
    if (!after) {
      issues.push(`必须保留的表缺失：${tableName}`);
      continue;
    }
    if (before.count !== after.count || before.sha256 !== after.sha256) {
      issues.push(`必须保留的数据发生变化：${tableName}`);
    }
  }
  if (
    expected.nonKpiOrgPermissionGrants.count !== actual.nonKpiOrgPermissionGrants.count
    || expected.nonKpiOrgPermissionGrants.sha256 !== actual.nonKpiOrgPermissionGrants.sha256
  ) {
    issues.push("非 KPI 的 OrgPermissionGrant 授权发生变化");
  }
  return issues;
}

function getMigrationState(db: Database) {
  if (!tableExists(db, "_prisma_migrations")) {
    return {
      applied: new Set<string>(),
      failed: [] as string[],
    };
  }
  const migrationRows = rows(
    db,
    `SELECT migration_name, finished_at, rolled_back_at
     FROM "_prisma_migrations"`,
  );
  return {
    applied: new Set(
      migrationRows
        .filter((item) => item.finished_at !== null && item.rolled_back_at === null)
        .map((item) => String(item.migration_name)),
    ),
    failed: migrationRows
      .filter((item) => item.finished_at === null && item.rolled_back_at === null)
      .map((item) => String(item.migration_name)),
  };
}

function getOrgPermissionGrantStructure(db: Database) {
  const columns = getTableColumns(db, "OrgPermissionGrant");
  if (columns.size === 0) return "MISSING" as const;
  const hasSubjectType = columns.has("subjectType");
  const hasUserId = columns.has("userId");
  if (hasSubjectType && hasUserId) return "TARGET" as const;
  if (!hasSubjectType && !hasUserId && columns.has("roleType")) return "LEGACY" as const;
  return "PARTIAL" as const;
}

function hasColumns(db: Database, tableName: string, requiredColumns: readonly string[]) {
  const columns = getTableColumns(db, tableName);
  return requiredColumns.every((column) => columns.has(column));
}

function hasIndexes(db: Database, tableName: string, requiredIndexes: readonly string[]) {
  const indexes = new Set(
    rows(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?",
      tableName,
    ).map((item) => String(item.name)),
  );
  return requiredIndexes.every((indexName) => indexes.has(indexName));
}

function hasTableContract(
  db: Database,
  tableName: string,
  requiredColumns: readonly string[],
  requiredIndexes: readonly string[],
) {
  return hasColumns(db, tableName, requiredColumns)
    && hasIndexes(db, tableName, requiredIndexes);
}

function getTableCount(db: Database, tableName: string) {
  if (!tableExists(db, tableName)) return 0;
  return Number(row(db, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`)?.count ?? 0);
}

export function inspectProductionDatabase(databasePath: string): ProductionDatabaseReport {
  const resolvedPath = assertAbsoluteDatabasePath(databasePath);
  const db = openDatabase(resolvedPath);
  try {
    const integrityCheck = rows(db, "PRAGMA integrity_check")
      .map((item) => String(item.integrity_check));
    const foreignKeyViolationCount = rows(db, "PRAGMA foreign_key_check").length;
    const migrationState = getMigrationState(db);
    const missingKpiMigrations = KPI_MIGRATIONS.filter((name) => !migrationState.applied.has(name));
    const structure = {
      orgPermissionGrant: getOrgPermissionGrantStructure(db),
      kpiApprovalPolicy: hasTableContract(
        db,
        "KpiApprovalPolicy",
        REQUIRED_KPI_APPROVAL_POLICY_COLUMNS,
        REQUIRED_KPI_APPROVAL_POLICY_INDEXES,
      ),
      kpiApprovalPolicyStep: hasTableContract(
        db,
        "KpiApprovalPolicyStep",
        REQUIRED_KPI_APPROVAL_POLICY_STEP_COLUMNS,
        REQUIRED_KPI_APPROVAL_POLICY_STEP_INDEXES,
      ),
      personalKpiSnapshotColumns: hasColumns(db, "PersonalKpi", REQUIRED_PERSONAL_KPI_COLUMNS),
      personalKpiApprovalStepColumns: hasColumns(
        db,
        "PersonalKpiApprovalStep",
        REQUIRED_APPROVAL_STEP_COLUMNS,
      ) && hasIndexes(
        db,
        "PersonalKpiApprovalStep",
        REQUIRED_APPROVAL_STEP_INDEXES,
      ),
      personalKpiItemStepScore: hasTableContract(
        db,
        "PersonalKpiItemStepScore",
        REQUIRED_PERSONAL_KPI_ITEM_STEP_SCORE_COLUMNS,
        REQUIRED_PERSONAL_KPI_ITEM_STEP_SCORE_INDEXES,
      ),
    };
    const targetFlags = [
      structure.orgPermissionGrant === "TARGET",
      structure.kpiApprovalPolicy,
      structure.kpiApprovalPolicyStep,
      structure.personalKpiSnapshotColumns,
      structure.personalKpiApprovalStepColumns,
      structure.personalKpiItemStepScore,
    ];
    const blocked = integrityCheck.some((value) => value !== "ok")
      || foreignKeyViolationCount > 0
      || migrationState.failed.length > 0
      || structure.orgPermissionGrant === "PARTIAL";
    const state = blocked
      ? "D_BLOCKED" as const
      : targetFlags.every(Boolean)
        ? (missingKpiMigrations.length > 0 ? "B_DB_PUSHED" as const : "READY" as const)
        : targetFlags.every((value) => !value)
          ? "A_STANDARD_OLD" as const
          : "C_MIXED" as const;
    const inspectedTables = [...new Set([
      ...getUserTableNames(db),
      ...KPI_RESET_TABLES,
      "OrgPermissionGrant",
    ])].sort();
    const permissionCounts = tableExists(db, "OrgPermissionGrant")
      ? rows(
          db,
          `SELECT
             "moduleKey",
             ${getTableColumns(db, "OrgPermissionGrant").has("subjectType") ? "\"subjectType\"" : "'ROLE'"} AS subjectType,
             COUNT(*) AS count
           FROM "OrgPermissionGrant"
           GROUP BY "moduleKey", subjectType
           ORDER BY "moduleKey", subjectType`,
        ).map((item) => ({
          moduleKey: String(item.moduleKey),
          subjectType: String(item.subjectType),
          count: Number(item.count),
        }))
      : [];
    return {
      databasePath: resolvedPath,
      databaseSizeBytes: fs.statSync(resolvedPath).size,
      sqliteVersion: String(row(db, "SELECT sqlite_version() AS version")?.version ?? "unknown"),
      journalMode: String((db.pragma("journal_mode", { simple: true }) ?? "unknown")),
      integrityCheck,
      foreignKeyViolationCount,
      failedMigrations: migrationState.failed,
      missingKpiMigrations: [...missingKpiMigrations],
      state,
      structure,
      tableCounts: Object.fromEntries(
        inspectedTables.map((tableName) => [tableName, getTableCount(db, tableName)]),
      ),
      permissionCounts,
      preservationBaseline: buildPreservationBaseline(db),
    };
  } finally {
    db.close();
  }
}

function createTargetOrgPermissionGrantTable(db: Database, tableName: string) {
  db.exec(`
    CREATE TABLE ${quoteIdentifier(tableName)} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "moduleKey" TEXT NOT NULL,
      "abilityKey" TEXT NOT NULL,
      "scopeType" TEXT NOT NULL,
      "subjectType" TEXT NOT NULL DEFAULT 'ROLE',
      "roleType" TEXT,
      "userId" TEXT,
      "orgNodeId" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function createOrgPermissionGrantIndexes(db: Database) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_subjectType_roleType_isActive_idx"
      ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "roleType", "isActive");
    CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_subjectType_userId_isActive_idx"
      ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "userId", "isActive");
    CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_subjectType_roleType_idx"
      ON "OrgPermissionGrant"("subjectType", "roleType");
    CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_subjectType_userId_idx"
      ON "OrgPermissionGrant"("subjectType", "userId");
    CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_orgNodeId_idx"
      ON "OrgPermissionGrant"("orgNodeId");
    CREATE UNIQUE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_scopeType_subjectType_roleType_userId_orgNodeId_key"
      ON "OrgPermissionGrant"("moduleKey", "abilityKey", "scopeType", "subjectType", "roleType", "userId", "orgNodeId");
  `);
}

function ensureTargetOrgPermissionGrant(db: Database) {
  if (!tableExists(db, "OrgPermissionGrant")) {
    createTargetOrgPermissionGrantTable(db, "OrgPermissionGrant");
    createOrgPermissionGrantIndexes(db);
    return;
  }

  const columns = getTableColumns(db, "OrgPermissionGrant");
  const requiredBaseColumns = [
    "id",
    "moduleKey",
    "abilityKey",
    "scopeType",
    "roleType",
    "orgNodeId",
    "isActive",
    "createdAt",
    "updatedAt",
  ];
  const missingBaseColumns = requiredBaseColumns.filter((column) => !columns.has(column));
  if (missingBaseColumns.length > 0) {
    throw new Error(`OrgPermissionGrant 缺少基础字段：${missingBaseColumns.join(", ")}`);
  }
  if (columns.has("subjectType") && columns.has("userId")) {
    createOrgPermissionGrantIndexes(db);
    return;
  }

  db.exec('DROP TABLE IF EXISTS "_migrate_OrgPermissionGrant_new"');
  createTargetOrgPermissionGrantTable(db, "_migrate_OrgPermissionGrant_new");
  const subjectTypeSql = columns.has("subjectType") ? '"subjectType"' : "'ROLE'";
  const userIdSql = columns.has("userId") ? '"userId"' : "NULL";
  db.exec(`
    INSERT INTO "_migrate_OrgPermissionGrant_new" (
      "id", "moduleKey", "abilityKey", "scopeType", "subjectType",
      "roleType", "userId", "orgNodeId", "isActive", "createdAt", "updatedAt"
    )
    SELECT
      "id", "moduleKey", "abilityKey", "scopeType", ${subjectTypeSql},
      "roleType", ${userIdSql}, "orgNodeId", "isActive", "createdAt", "updatedAt"
    FROM "OrgPermissionGrant";
  `);
  const oldCount = getTableCount(db, "OrgPermissionGrant");
  const newCount = getTableCount(db, "_migrate_OrgPermissionGrant_new");
  if (oldCount !== newCount) {
    throw new Error(`OrgPermissionGrant 复制数量不一致：${oldCount} -> ${newCount}`);
  }
  db.exec(`
    DROP TABLE "OrgPermissionGrant";
    ALTER TABLE "_migrate_OrgPermissionGrant_new" RENAME TO "OrgPermissionGrant";
  `);
  createOrgPermissionGrantIndexes(db);
}

function addColumnIfMissing(
  db: Database,
  tableName: string,
  columnName: string,
  definition: string,
) {
  if (!getTableColumns(db, tableName).has(columnName)) {
    db.exec(
      `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`,
    );
  }
}

function ensureKpiTargetStructure(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS "PersonalKpiItemStepScore";
    DROP TABLE IF EXISTS "PersonalKpiApprovalStep";
    DROP TABLE IF EXISTS "KpiApprovalPolicyStep";
    DROP TABLE IF EXISTS "KpiApprovalPolicy";

    CREATE TABLE "KpiApprovalPolicy" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
      "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
      "name" TEXT NOT NULL,
      "description" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "activeScopeKey" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "KpiApprovalPolicy_scopeType_departmentOrgNodeId_name_key"
      ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId", "name");
    CREATE UNIQUE INDEX "KpiApprovalPolicy_activeScopeKey_key"
      ON "KpiApprovalPolicy"("activeScopeKey");
    CREATE UNIQUE INDEX "KpiApprovalPolicy_single_active_scope_key"
      ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId")
      WHERE "isActive" = true;
    CREATE INDEX "KpiApprovalPolicy_scopeType_departmentOrgNodeId_isActive_idx"
      ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId", "isActive");

    CREATE TABLE "KpiApprovalPolicyStep" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "policyId" TEXT NOT NULL,
      "stepOrder" INTEGER NOT NULL,
      "label" TEXT NOT NULL,
      "ancestorDepth" INTEGER,
      "resolverType" TEXT NOT NULL,
      "resolverUserId" TEXT,
      "skipIfSelf" BOOLEAN NOT NULL DEFAULT true,
      "skipIfDuplicateApprover" BOOLEAN NOT NULL DEFAULT true,
      "allowSkipWhenNoApprover" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "KpiApprovalPolicyStep_policyId_stepOrder_key"
      ON "KpiApprovalPolicyStep"("policyId", "stepOrder");
    CREATE INDEX "KpiApprovalPolicyStep_policyId_idx"
      ON "KpiApprovalPolicyStep"("policyId");
    CREATE INDEX "KpiApprovalPolicyStep_resolverType_idx"
      ON "KpiApprovalPolicyStep"("resolverType");
    CREATE INDEX "KpiApprovalPolicyStep_resolverUserId_idx"
      ON "KpiApprovalPolicyStep"("resolverUserId");

    CREATE TABLE "PersonalKpiItemStepScore" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "personalKpiItemId" TEXT NOT NULL,
      "approvalStepId" TEXT NOT NULL,
      "score" REAL NOT NULL DEFAULT 0,
      "comment" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "PersonalKpiItemStepScore_personalKpiItemId_approvalStepId_key"
      ON "PersonalKpiItemStepScore"("personalKpiItemId", "approvalStepId");
    CREATE INDEX "PersonalKpiItemStepScore_approvalStepId_idx"
      ON "PersonalKpiItemStepScore"("approvalStepId");
    CREATE INDEX "PersonalKpiItemStepScore_personalKpiItemId_idx"
      ON "PersonalKpiItemStepScore"("personalKpiItemId");

    CREATE TABLE "PersonalKpiApprovalStep" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "personalKpiId" TEXT NOT NULL,
      "policyStepId" TEXT,
      "stepOrder" INTEGER NOT NULL,
      "stageKey" TEXT NOT NULL,
      "stepLabel" TEXT,
      "ancestorDepth" INTEGER,
      "resolverType" TEXT,
      "resolverUserId" TEXT,
      "orgNodeId" TEXT,
      "approverId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "comment" TEXT,
      "actedAt" DATETIME,
      "completedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "PersonalKpiApprovalStep_personalKpiId_stepOrder_idx"
      ON "PersonalKpiApprovalStep"("personalKpiId", "stepOrder");
    CREATE INDEX "PersonalKpiApprovalStep_policyStepId_idx"
      ON "PersonalKpiApprovalStep"("policyStepId");
    CREATE INDEX "PersonalKpiApprovalStep_approverId_status_idx"
      ON "PersonalKpiApprovalStep"("approverId", "status");
  `);

  if (!tableExists(db, "PersonalKpi")) {
    throw new Error("PersonalKpi 基础表不存在，应先完成历史 migration");
  }
  addColumnIfMissing(db, "PersonalKpi", "approvalPolicyId", "TEXT");
  addColumnIfMissing(db, "PersonalKpi", "approvalPolicyName", "TEXT");
  addColumnIfMissing(db, "PersonalKpi", "approvalPolicyScopeType", "TEXT");
  addColumnIfMissing(db, "PersonalKpi", "approvalPolicyDepartmentOrgNodeId", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS "PersonalKpi_approvalPolicyId_idx"
      ON "PersonalKpi"("approvalPolicyId");
  `);

}

export type KpiProductionMigrationResult = {
  beforeCounts: Record<string, number>;
  afterCounts: Record<string, number>;
  deletedKpiPermissionCount: number;
  preservedDataIssues: string[];
};

export function migrateKpiProductionDatabase(
  db: Database,
  baseline: PreservationBaseline,
): KpiProductionMigrationResult {
  const beforeCounts = Object.fromEntries(
    KPI_RESET_TABLES.map((tableName) => [tableName, getTableCount(db, tableName)]),
  );
  const transaction = db.transaction(() => {
    ensureTargetOrgPermissionGrant(db);
    const deletedKpiPermissionCount = db.prepare(
      `DELETE FROM "OrgPermissionGrant" WHERE "moduleKey" = 'KPI'`,
    ).run().changes;

    for (const tableName of KPI_RESET_TABLES) {
      if (tableExists(db, tableName)) {
        db.exec(`DELETE FROM ${quoteIdentifier(tableName)}`);
      }
    }
    ensureKpiTargetStructure(db);

    const preservedDataIssues = comparePreservationBaselines(
      baseline,
      buildPreservationBaseline(db),
    );
    if (preservedDataIssues.length > 0) {
      throw new Error(`必须保留的数据发生变化：${preservedDataIssues.join("；")}`);
    }
    return {
      deletedKpiPermissionCount,
      preservedDataIssues,
    };
  });
  const transactionResult = transaction() as {
    deletedKpiPermissionCount: number;
    preservedDataIssues: string[];
  };
  const afterCounts = Object.fromEntries(
    KPI_RESET_TABLES.map((tableName) => [tableName, getTableCount(db, tableName)]),
  );
  return {
    beforeCounts,
    afterCounts,
    ...transactionResult,
  };
}

export function getKpiResetVerificationIssues(db: Database) {
  const issues: string[] = [];
  if (tableExists(db, "OrgPermissionGrant")) {
    const kpiPermissionCount = Number(row(
      db,
      `SELECT COUNT(*) AS count FROM "OrgPermissionGrant" WHERE "moduleKey" = 'KPI'`,
    )?.count ?? 0);
    if (kpiPermissionCount !== 0) {
      issues.push(`KPI 权限未清空：${kpiPermissionCount}`);
    }
  }
  for (const tableName of KPI_RESET_TABLES) {
    const count = getTableCount(db, tableName);
    if (count !== 0) {
      issues.push(`${tableName} 未清空：${count}`);
    }
  }
  const reportStructure = {
    orgPermissionGrant: getOrgPermissionGrantStructure(db),
    kpiApprovalPolicy: hasTableContract(
      db,
      "KpiApprovalPolicy",
      REQUIRED_KPI_APPROVAL_POLICY_COLUMNS,
      REQUIRED_KPI_APPROVAL_POLICY_INDEXES,
    ),
    kpiApprovalPolicyStep: hasTableContract(
      db,
      "KpiApprovalPolicyStep",
      REQUIRED_KPI_APPROVAL_POLICY_STEP_COLUMNS,
      REQUIRED_KPI_APPROVAL_POLICY_STEP_INDEXES,
    ),
    personalKpiSnapshotColumns: hasColumns(db, "PersonalKpi", REQUIRED_PERSONAL_KPI_COLUMNS),
    personalKpiApprovalStepColumns: hasColumns(
      db,
      "PersonalKpiApprovalStep",
      REQUIRED_APPROVAL_STEP_COLUMNS,
    ) && hasIndexes(
      db,
      "PersonalKpiApprovalStep",
      REQUIRED_APPROVAL_STEP_INDEXES,
    ),
    personalKpiItemStepScore: hasTableContract(
      db,
      "PersonalKpiItemStepScore",
      REQUIRED_PERSONAL_KPI_ITEM_STEP_SCORE_COLUMNS,
      REQUIRED_PERSONAL_KPI_ITEM_STEP_SCORE_INDEXES,
    ),
  };
  if (reportStructure.orgPermissionGrant !== "TARGET") {
    issues.push("OrgPermissionGrant 尚未升级为目标结构");
  }
  if (!reportStructure.kpiApprovalPolicy) issues.push("KpiApprovalPolicy 结构不完整");
  if (!reportStructure.kpiApprovalPolicyStep) issues.push("KpiApprovalPolicyStep 结构不完整");
  if (!reportStructure.personalKpiSnapshotColumns) issues.push("PersonalKpi 缺少策略快照字段");
  if (!reportStructure.personalKpiApprovalStepColumns) {
    issues.push("PersonalKpiApprovalStep 缺少扩展字段");
  }
  if (!reportStructure.personalKpiItemStepScore) issues.push("PersonalKpiItemStepScore 结构不完整");
  return issues;
}

export function readBaselineFile(filePath: string) {
  if (!path.isAbsolute(filePath)) {
    throw new Error("基线文件必须使用绝对路径");
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as PreservationBaseline;
  if (parsed.formatVersion !== 1 || !parsed.tables || !parsed.nonKpiOrgPermissionGrants) {
    throw new Error("基线文件格式无效");
  }
  return parsed;
}

export function writeJsonFile(filePath: string, value: unknown) {
  if (!path.isAbsolute(filePath)) {
    throw new Error("输出文件必须使用绝对路径");
  }
  const parentDirectory = path.dirname(filePath);
  if (!fs.existsSync(parentDirectory)) {
    throw new Error(`输出目录不存在：${parentDirectory}`);
  }
  if (fs.existsSync(filePath)) {
    throw new Error(`拒绝覆盖已有文件：${filePath}`);
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

export function parseNamedArguments(argv: string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`无法识别的参数：${argument ?? ""}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      result.set(argument, "true");
      continue;
    }
    result.set(argument, value);
    index += 1;
  }
  return result;
}
