-- 本迁移包含两部分：
-- 1. 为 KpiRatingRuleVersion 增加业务考核计分规则字段（businessAssessmentTotalScore / baInitialPassPercent / baRetestPassPercent / baFinalFailPercent）。
-- 2. 对齐 main 侧曾通过 db push 应用、但未留下迁移文件的索引调整（PersonalKpi / KpiApprovalPolicy 等表重建为相同结构）。
--    首尾两个顶层索引语句使用 IF EXISTS / IF NOT EXISTS，保证在已具备目标结构的库上可重复应用。

-- DropIndex
DROP INDEX IF EXISTS "PersonalKpi_approvalPolicyScopeOrgNodeId_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KpiApprovalPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeScopeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_KpiApprovalPolicy" ("activeScopeKey", "createdAt", "departmentOrgNodeId", "description", "id", "isActive", "name", "scopeType", "updatedAt") SELECT "activeScopeKey", "createdAt", "departmentOrgNodeId", "description", "id", "isActive", "name", "scopeType", "updatedAt" FROM "KpiApprovalPolicy";
DROP TABLE "KpiApprovalPolicy";
ALTER TABLE "new_KpiApprovalPolicy" RENAME TO "KpiApprovalPolicy";
CREATE UNIQUE INDEX "KpiApprovalPolicy_activeScopeKey_key" ON "KpiApprovalPolicy"("activeScopeKey");
CREATE INDEX "KpiApprovalPolicy_scopeType_departmentOrgNodeId_isActive_idx" ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId", "isActive");
CREATE UNIQUE INDEX "KpiApprovalPolicy_scopeType_departmentOrgNodeId_name_key" ON "KpiApprovalPolicy"("scopeType", "departmentOrgNodeId", "name");
CREATE TABLE "new_KpiApprovalPolicyStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "nodeMode" TEXT,
    "approvalOrgNodeId" TEXT,
    "ancestorDepth" INTEGER,
    "resolverType" TEXT NOT NULL,
    "resolverUserId" TEXT,
    "skipIfSelf" BOOLEAN NOT NULL DEFAULT true,
    "skipIfDuplicateApprover" BOOLEAN NOT NULL DEFAULT true,
    "allowSkipWhenNoApprover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_KpiApprovalPolicyStep" ("allowSkipWhenNoApprover", "ancestorDepth", "approvalOrgNodeId", "createdAt", "id", "label", "nodeMode", "policyId", "resolverType", "resolverUserId", "skipIfDuplicateApprover", "skipIfSelf", "stepOrder", "updatedAt") SELECT "allowSkipWhenNoApprover", "ancestorDepth", "approvalOrgNodeId", "createdAt", "id", "label", "nodeMode", "policyId", "resolverType", "resolverUserId", "skipIfDuplicateApprover", "skipIfSelf", "stepOrder", "updatedAt" FROM "KpiApprovalPolicyStep";
DROP TABLE "KpiApprovalPolicyStep";
ALTER TABLE "new_KpiApprovalPolicyStep" RENAME TO "KpiApprovalPolicyStep";
CREATE INDEX "KpiApprovalPolicyStep_policyId_idx" ON "KpiApprovalPolicyStep"("policyId");
CREATE INDEX "KpiApprovalPolicyStep_approvalOrgNodeId_idx" ON "KpiApprovalPolicyStep"("approvalOrgNodeId");
CREATE INDEX "KpiApprovalPolicyStep_resolverType_idx" ON "KpiApprovalPolicyStep"("resolverType");
CREATE INDEX "KpiApprovalPolicyStep_resolverUserId_idx" ON "KpiApprovalPolicyStep"("resolverUserId");
CREATE UNIQUE INDEX "KpiApprovalPolicyStep_policyId_stepOrder_key" ON "KpiApprovalPolicyStep"("policyId", "stepOrder");
CREATE TABLE "new_KpiRatingRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentOrgNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "quarterlyKpiTotalScore" REAL,
    "businessAssessmentTotalScore" REAL NOT NULL DEFAULT 6,
    "baInitialPassPercent" REAL NOT NULL DEFAULT 100,
    "baRetestPassPercent" REAL NOT NULL DEFAULT 50,
    "baFinalFailPercent" REAL NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_KpiRatingRuleVersion" ("createdAt", "createdById", "deletedAt", "departmentOrgNodeId", "effectiveFrom", "effectiveTo", "id", "name", "publishedAt", "publishedById", "quarterlyKpiTotalScore", "status", "updatedAt", "version") SELECT "createdAt", "createdById", "deletedAt", "departmentOrgNodeId", "effectiveFrom", "effectiveTo", "id", "name", "publishedAt", "publishedById", "quarterlyKpiTotalScore", "status", "updatedAt", "version" FROM "KpiRatingRuleVersion";
DROP TABLE "KpiRatingRuleVersion";
ALTER TABLE "new_KpiRatingRuleVersion" RENAME TO "KpiRatingRuleVersion";
CREATE INDEX "KpiRatingRuleVersion_departmentOrgNodeId_status_idx" ON "KpiRatingRuleVersion"("departmentOrgNodeId", "status");
CREATE INDEX "KpiRatingRuleVersion_effectiveFrom_effectiveTo_idx" ON "KpiRatingRuleVersion"("effectiveFrom", "effectiveTo");
CREATE INDEX "KpiRatingRuleVersion_deletedAt_idx" ON "KpiRatingRuleVersion"("deletedAt");
CREATE UNIQUE INDEX "KpiRatingRuleVersion_departmentOrgNodeId_name_version_key" ON "KpiRatingRuleVersion"("departmentOrgNodeId", "name", "version");
CREATE TABLE "new_NotificationScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL DEFAULT 'KPI管理',
    "triggerType" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "scheduleConfig" JSONB,
    "nextRunAt" DATETIME,
    "recipientConfig" JSONB NOT NULL,
    "channelConfig" JSONB NOT NULL,
    "conditionConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NotificationScenario" ("channelConfig", "conditionConfig", "createdAt", "createdById", "description", "id", "isActive", "module", "name", "nextRunAt", "recipientConfig", "scheduleConfig", "sortOrder", "triggerEvent", "triggerType", "updatedAt", "updatedById") SELECT "channelConfig", "conditionConfig", "createdAt", "createdById", "description", "id", "isActive", "module", "name", "nextRunAt", "recipientConfig", "scheduleConfig", "sortOrder", "triggerEvent", "triggerType", "updatedAt", "updatedById" FROM "NotificationScenario";
DROP TABLE "NotificationScenario";
ALTER TABLE "new_NotificationScenario" RENAME TO "NotificationScenario";
CREATE INDEX "NotificationScenario_triggerType_isActive_idx" ON "NotificationScenario"("triggerType", "isActive");
CREATE INDEX "NotificationScenario_triggerEvent_isActive_idx" ON "NotificationScenario"("triggerEvent", "isActive");
CREATE INDEX "NotificationScenario_module_isActive_idx" ON "NotificationScenario"("module", "isActive");
CREATE INDEX "NotificationScenario_nextRunAt_idx" ON "NotificationScenario"("nextRunAt");
CREATE TABLE "new_OrgPermissionGrant" (
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OrgPermissionGrant" ("abilityKey", "createdAt", "id", "isActive", "moduleKey", "orgNodeId", "roleType", "scopeType", "subjectType", "updatedAt", "userId") SELECT "abilityKey", "createdAt", "id", "isActive", "moduleKey", "orgNodeId", "roleType", "scopeType", "subjectType", "updatedAt", "userId" FROM "OrgPermissionGrant";
DROP TABLE "OrgPermissionGrant";
ALTER TABLE "new_OrgPermissionGrant" RENAME TO "OrgPermissionGrant";
CREATE INDEX "OrgPermissionGrant_moduleKey_abilityKey_subjectType_roleType_isActive_idx" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "roleType", "isActive");
CREATE INDEX "OrgPermissionGrant_moduleKey_abilityKey_subjectType_userId_isActive_idx" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "userId", "isActive");
CREATE INDEX "OrgPermissionGrant_subjectType_roleType_idx" ON "OrgPermissionGrant"("subjectType", "roleType");
CREATE INDEX "OrgPermissionGrant_subjectType_userId_idx" ON "OrgPermissionGrant"("subjectType", "userId");
CREATE INDEX "OrgPermissionGrant_orgNodeId_idx" ON "OrgPermissionGrant"("orgNodeId");
CREATE UNIQUE INDEX "OrgPermissionGrant_moduleKey_abilityKey_scopeType_subjectType_roleType_userId_orgNodeId_key" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "scopeType", "subjectType", "roleType", "userId", "orgNodeId");
CREATE TABLE "new_PersonalKpiItemStepScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalKpiItemId" TEXT NOT NULL,
    "approvalStepId" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PersonalKpiItemStepScore" ("approvalStepId", "comment", "createdAt", "id", "personalKpiItemId", "score", "updatedAt") SELECT "approvalStepId", "comment", "createdAt", "id", "personalKpiItemId", "score", "updatedAt" FROM "PersonalKpiItemStepScore";
DROP TABLE "PersonalKpiItemStepScore";
ALTER TABLE "new_PersonalKpiItemStepScore" RENAME TO "PersonalKpiItemStepScore";
CREATE INDEX "PersonalKpiItemStepScore_approvalStepId_idx" ON "PersonalKpiItemStepScore"("approvalStepId");
CREATE INDEX "PersonalKpiItemStepScore_personalKpiItemId_idx" ON "PersonalKpiItemStepScore"("personalKpiItemId");
CREATE UNIQUE INDEX "PersonalKpiItemStepScore_personalKpiItemId_approvalStepId_key" ON "PersonalKpiItemStepScore"("personalKpiItemId", "approvalStepId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalKpi_year_quarter_userId_key" ON "PersonalKpi"("year", "quarter", "userId");
