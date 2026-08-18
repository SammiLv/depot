-- Add controlled reward classification while preserving the legacy rewardType.
ALTER TABLE "RewardRecord" ADD COLUMN "rewardCategory" TEXT;
ALTER TABLE "RewardRecord" ADD COLUMN "rewardPeriodQuarter" INTEGER;
ALTER TABLE "RewardRecord" ADD COLUMN "rewardPeriodYear" INTEGER;
ALTER TABLE "RewardRecord" ADD COLUMN "rewardSubtype" TEXT;

-- Rebuild IncidentRestriction to add controlled type, lifecycle, source and rule snapshot fields.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IncidentRestriction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restrictionType" TEXT NOT NULL,
    "controlledType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT NOT NULL DEFAULT 'WORK_INCIDENT',
    "sourceRecordId" TEXT,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ruleVersionId" TEXT,
    "ruleSnapshotJson" TEXT,
    "releaseReason" TEXT,
    "releasedById" TEXT,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_IncidentRestriction" (
    "id", "incidentId", "userId", "restrictionType", "controlledType", "status",
    "sourceType", "sourceRecordId", "effectiveFrom", "effectiveTo", "isActive",
    "releaseReason", "releasedById", "releasedAt", "createdAt", "updatedAt"
)
SELECT
    "id", "incidentId", "userId",
    CASE "restrictionType" WHEN 'NO_PROMOTION_RAISE' THEN 'NO_PROMOTION' ELSE "restrictionType" END,
    CASE "restrictionType"
      WHEN 'NO_PROMOTION_RAISE' THEN 'PROMOTION'
      WHEN 'NO_PROMOTION' THEN 'PROMOTION'
      WHEN 'NO_SALARY_ADJUSTMENT' THEN 'SALARY_ADJUSTMENT'
      WHEN 'NO_QUARTER_REWARD' THEN 'QUARTERLY_REWARD'
      WHEN 'NO_ANNUAL_REWARD' THEN 'ANNUAL_REWARD'
      WHEN 'TERMINATION' THEN 'TERMINATION'
      ELSE NULL
    END,
    CASE
      WHEN "isActive" = false THEN 'RELEASED'
      WHEN "effectiveTo" IS NOT NULL AND "effectiveTo" < CURRENT_TIMESTAMP THEN 'EXPIRED'
      ELSE 'ACTIVE'
    END,
    'WORK_INCIDENT', "incidentId", "effectiveFrom", "effectiveTo", "isActive",
    "releaseReason", "releasedById", "releasedAt", "createdAt", "updatedAt"
FROM "IncidentRestriction";

-- A legacy combined promotion/raise restriction becomes two independently queryable rows.
INSERT INTO "new_IncidentRestriction" (
    "id", "incidentId", "userId", "restrictionType", "controlledType", "status",
    "sourceType", "sourceRecordId", "effectiveFrom", "effectiveTo", "isActive",
    "releaseReason", "releasedById", "releasedAt", "createdAt", "updatedAt"
)
SELECT
    'compat_' || lower(hex(randomblob(16))), "incidentId", "userId",
    'NO_SALARY_ADJUSTMENT', 'SALARY_ADJUSTMENT',
    CASE
      WHEN "isActive" = false THEN 'RELEASED'
      WHEN "effectiveTo" IS NOT NULL AND "effectiveTo" < CURRENT_TIMESTAMP THEN 'EXPIRED'
      ELSE 'ACTIVE'
    END,
    'WORK_INCIDENT', "incidentId", "effectiveFrom", "effectiveTo", "isActive",
    "releaseReason", "releasedById", "releasedAt", "createdAt", "updatedAt"
FROM "IncidentRestriction"
WHERE "restrictionType" = 'NO_PROMOTION_RAISE';

DROP TABLE "IncidentRestriction";
ALTER TABLE "new_IncidentRestriction" RENAME TO "IncidentRestriction";
CREATE INDEX "IncidentRestriction_userId_isActive_idx" ON "IncidentRestriction"("userId", "isActive");
CREATE INDEX "IncidentRestriction_userId_controlledType_status_idx" ON "IncidentRestriction"("userId", "controlledType", "status");
CREATE INDEX "IncidentRestriction_sourceType_sourceRecordId_idx" ON "IncidentRestriction"("sourceType", "sourceRecordId");
CREATE INDEX "IncidentRestriction_effectiveFrom_effectiveTo_idx" ON "IncidentRestriction"("effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "IncidentRestriction_incidentId_userId_restrictionType_key" ON "IncidentRestriction"("incidentId", "userId", "restrictionType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill known reward names/types. Unknown legacy strings remain readable and are reported by dry-run.
UPDATE "RewardRecord"
SET "rewardCategory" = CASE
      WHEN "rewardType" IN ('公司季度竞币单项奖', '季度竞币单项奖', '公司季度竞币项目奖', '季度竞币项目奖', '部门个人竞币奖', '部门个人现金奖') THEN 'QUARTERLY'
      WHEN "rewardType" IN ('公司年度竞币单项奖', '年度竞币单项奖', '年终竞币奖', '年终现金奖') THEN 'ANNUAL'
      WHEN "rewardType" LIKE '%季度%' THEN 'QUARTERLY'
      WHEN "rewardType" LIKE '%年度%' OR "rewardType" LIKE '%年终%' THEN 'ANNUAL'
      ELSE NULL
    END,
    "rewardSubtype" = CASE
      WHEN "rewardType" IN ('公司季度竞币单项奖', '季度竞币单项奖') THEN 'COMPANY_QUARTERLY_INDIVIDUAL_COIN'
      WHEN "rewardType" IN ('公司季度竞币项目奖', '季度竞币项目奖') THEN 'COMPANY_QUARTERLY_PROJECT_COIN'
      WHEN "rewardType" = '部门个人竞币奖' THEN 'DEPARTMENT_INDIVIDUAL_COIN'
      WHEN "rewardType" = '部门个人现金奖' THEN 'DEPARTMENT_INDIVIDUAL_CASH'
      WHEN "rewardType" IN ('公司年度竞币单项奖', '年度竞币单项奖') THEN 'COMPANY_ANNUAL_INDIVIDUAL_COIN'
      WHEN "rewardType" = '年终竞币奖' THEN 'ANNUAL_COIN'
      WHEN "rewardType" = '年终现金奖' THEN 'ANNUAL_CASH'
      ELSE NULL
    END,
    "rewardPeriodYear" = CAST(strftime('%Y', "effectiveDate") AS INTEGER),
    "rewardPeriodQuarter" = CASE
      WHEN "rewardType" LIKE '%季度%' THEN CAST((CAST(strftime('%m', "effectiveDate") AS INTEGER) + 2) / 3 AS INTEGER)
      ELSE NULL
    END;

CREATE INDEX "RewardRecord_rewardCategory_rewardPeriodYear_rewardPeriodQuarter_idx" ON "RewardRecord"("rewardCategory", "rewardPeriodYear", "rewardPeriodQuarter");
