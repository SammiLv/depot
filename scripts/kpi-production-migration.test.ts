import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildPreservationBaseline,
  comparePreservationBaselines,
  getKpiResetVerificationIssues,
  inspectProductionDatabase,
  migrateKpiProductionDatabase,
} from "./kpi-production-migration-lib";

const testDirectory = process.env.KPI_MIGRATION_TEST_DIR;
if (!testDirectory || !path.isAbsolute(testDirectory)) {
  throw new Error("KPI_MIGRATION_TEST_DIR 必须是测试数据库绝对目录");
}

function seedProtectedAndKpiData(db: Database) {
  db.exec(`
    INSERT INTO "OrgNode" (
      "id", "name", "nodeType", "parentId", "createdAt", "updatedAt"
    ) VALUES (
      'org-preserved', '必须保留的组织', 'DEPARTMENT', NULL,
      '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO "User" (
      "id", "name", "orgNodeId", "roleType", "isActive", "createdAt", "updatedAt"
    ) VALUES (
      'user-preserved', '必须保留的用户', 'org-preserved', 'MEMBER', 1,
      '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO "OrgPermissionGrant" (
      "id", "moduleKey", "abilityKey", "scopeType", "subjectType",
      "roleType", "userId", "orgNodeId", "isActive", "createdAt", "updatedAt"
    ) VALUES
      (
        'grant-preserved', 'ANNUAL_GOAL', 'VIEW_KPI', 'SELF', 'USER',
        NULL, 'user-preserved', 'org-preserved', 1,
        '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
      ),
      (
        'grant-kpi-reset', 'KPI', 'VIEW_KPI', 'SELF', 'ROLE',
        'MEMBER', NULL, 'org-preserved', 1,
        '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
      );
    INSERT INTO "KpiTemplate" (
      "id", "templateKey", "departmentOrgNodeId", "name", "status",
      "version", "isLatest", "isActive", "createdById", "createdAt", "updatedAt"
    ) VALUES (
      'template-reset', 'template-reset', 'org-preserved', '待清理模板', 'APPROVED',
      1, 1, 1, 'user-preserved',
      '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO "KpiTemplateItem" (
      "id", "templateId", "name", "score", "weight", "createdAt", "updatedAt"
    ) VALUES (
      'template-item-reset', 'template-reset', '待清理模板项', 100, 100,
      '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
    INSERT INTO "PersonalKpi" (
      "id", "year", "quarter", "userId", "orgNodeId", "templateId",
      "status", "createdAt", "updatedAt"
    ) VALUES (
      'personal-kpi-reset', 2026, 3, 'user-preserved', 'org-preserved',
      'template-reset', 'DRAFT',
      '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
    );
  `);
}

test("target-schema database resets only KPI data", () => {
  const databasePath = path.join(testDirectory, "target.db");
  const db = new Database(databasePath);
  try {
    seedProtectedAndKpiData(db);
    const baseline = buildPreservationBaseline(db);
    const result = migrateKpiProductionDatabase(db, baseline);

    assert.equal(result.deletedKpiPermissionCount, 1);
    assert.deepEqual(comparePreservationBaselines(baseline, buildPreservationBaseline(db)), []);
    assert.deepEqual(getKpiResetVerificationIssues(db), []);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM "User"').get() as { count: number }).count,
      1,
    );
    assert.equal(
      (db.prepare(
        `SELECT COUNT(*) AS count
         FROM "OrgPermissionGrant"
         WHERE "moduleKey" = 'ANNUAL_GOAL' AND "subjectType" = 'USER'`,
      ).get() as { count: number }).count,
      1,
    );
  } finally {
    db.close();
  }
});

test("legacy permission schema is upgraded without changing non-KPI grants", () => {
  const databasePath = path.join(testDirectory, "legacy.db");
  const db = new Database(databasePath);
  try {
    db.exec(`
      DROP TABLE "OrgPermissionGrant";
      CREATE TABLE "OrgPermissionGrant" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "moduleKey" TEXT NOT NULL,
        "abilityKey" TEXT NOT NULL,
        "scopeType" TEXT NOT NULL,
        "roleType" TEXT NOT NULL,
        "orgNodeId" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "OrgPermissionGrant" (
        "id", "moduleKey", "abilityKey", "scopeType", "roleType",
        "orgNodeId", "isActive", "createdAt", "updatedAt"
      ) VALUES
        (
          'legacy-preserved', 'ANNUAL_GOAL', 'VIEW_KPI', 'SUBTREE',
          'DEPARTMENT_MANAGER', 'org-legacy', 1,
          '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
        ),
        (
          'legacy-kpi-reset', 'KPI', 'VIEW_KPI', 'SELF',
          'MEMBER', 'org-legacy', 1,
          '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
        );
    `);
    const baseline = buildPreservationBaseline(db);
    const result = migrateKpiProductionDatabase(db, baseline);

    assert.equal(result.deletedKpiPermissionCount, 1);
    assert.deepEqual(comparePreservationBaselines(baseline, buildPreservationBaseline(db)), []);
    assert.deepEqual(getKpiResetVerificationIssues(db), []);
    const preservedGrant = db.prepare(
      `SELECT "subjectType", "roleType", "userId"
       FROM "OrgPermissionGrant"
       WHERE "id" = 'legacy-preserved'`,
    ).get() as {
      subjectType: string;
      roleType: string;
      userId: string | null;
    };
    assert.deepEqual(preservedGrant, {
      subjectType: "ROLE",
      roleType: "DEPARTMENT_MANAGER",
      userId: null,
    });
  } finally {
    db.close();
  }
});

test("mixed partial KPI tables are rebuilt to the complete target contract", () => {
  const databasePath = path.join(testDirectory, "mixed.db");
  const db = new Database(databasePath);
  try {
    db.exec(`
      DROP TABLE "PersonalKpiItemStepScore";
      DROP TABLE "PersonalKpiApprovalStep";
      DROP TABLE "KpiApprovalPolicyStep";
      DROP TABLE "KpiApprovalPolicy";

      CREATE TABLE "KpiApprovalPolicy" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "scopeType" TEXT NOT NULL,
        "departmentOrgNodeId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE "KpiApprovalPolicyStep" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "policyId" TEXT NOT NULL,
        "stepOrder" INTEGER NOT NULL,
        "resolverType" TEXT NOT NULL
      );
      CREATE TABLE "PersonalKpiApprovalStep" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personalKpiId" TEXT NOT NULL
      );
      CREATE TABLE "PersonalKpiItemStepScore" (
        "id" TEXT NOT NULL PRIMARY KEY
      );
    `);

    assert.equal(inspectProductionDatabase(databasePath).state, "C_MIXED");
    assert.notDeepEqual(getKpiResetVerificationIssues(db), []);

    const baseline = buildPreservationBaseline(db);
    migrateKpiProductionDatabase(db, baseline);

    assert.deepEqual(getKpiResetVerificationIssues(db), []);
    const policyColumns = new Set(
      (db.prepare('PRAGMA table_info("KpiApprovalPolicy")').all() as Array<{ name: string }>)
        .map((column) => column.name),
    );
    assert.equal(policyColumns.has("activeScopeKey"), true);

    db.prepare(`
      INSERT INTO "KpiApprovalPolicy" (
        "id", "scopeType", "departmentOrgNodeId", "name", "isActive"
      ) VALUES (?, 'SYSTEM', '', ?, true)
    `).run("active-policy-1", "启用策略一");
    assert.throws(
      () => db.prepare(`
        INSERT INTO "KpiApprovalPolicy" (
          "id", "scopeType", "departmentOrgNodeId", "name", "isActive"
        ) VALUES (?, 'SYSTEM', '', ?, true)
      `).run("active-policy-2", "启用策略二"),
      /UNIQUE constraint failed: KpiApprovalPolicy.scopeType, KpiApprovalPolicy.departmentOrgNodeId/,
    );
  } finally {
    db.close();
  }
});
