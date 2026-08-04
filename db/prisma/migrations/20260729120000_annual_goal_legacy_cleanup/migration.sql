PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Retire legacy TEAM copies after Assignment and shared-quarter verification.
UPDATE "AnnualGoalMetric"
SET "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP)
WHERE "planId" IN (
  SELECT "id"
  FROM "AnnualGoalPlan"
  WHERE "ownerType" = 'TEAM'
);

UPDATE "AnnualGoalPlan"
SET
  "departmentOrgNodeId" = COALESCE(
    "departmentOrgNodeId",
    (
      SELECT parent."departmentOrgNodeId"
      FROM "AnnualGoalPlan" AS parent
      WHERE parent."id" = "AnnualGoalPlan"."parentPlanId"
    )
  ),
  "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP)
WHERE "ownerType" = 'TEAM';

-- Old source-quarter rows carried both references. Keep only the authority source.
UPDATE "AnnualGoalQuarterTarget"
SET "metricId" = NULL
WHERE "sourceMetricId" IS NOT NULL;

CREATE TABLE "new_AnnualGoalPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "year" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "departmentOrgNodeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);

INSERT INTO "new_AnnualGoalPlan" (
  "id",
  "year",
  "name",
  "description",
  "departmentOrgNodeId",
  "status",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  "id",
  "year",
  "name",
  "description",
  "departmentOrgNodeId",
  "status",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "AnnualGoalPlan";

DROP TABLE "AnnualGoalPlan";
ALTER TABLE "new_AnnualGoalPlan" RENAME TO "AnnualGoalPlan";

CREATE TABLE "new_AnnualGoalMetric" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "metricCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "targetValue" REAL NOT NULL,
  "currentValue" REAL NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "weight" REAL NOT NULL,
  "calculationType" TEXT NOT NULL DEFAULT 'RATIO',
  "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
  "responsibleUserId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "adjustedAt" DATETIME,
  "progressUpdatedAt" DATETIME,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  CONSTRAINT "AnnualGoalMetric_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "AnnualGoalPlan" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_AnnualGoalMetric" (
  "id",
  "planId",
  "metricCode",
  "name",
  "description",
  "targetValue",
  "currentValue",
  "unit",
  "weight",
  "calculationType",
  "riskStatus",
  "responsibleUserId",
  "sortOrder",
  "adjustedAt",
  "progressUpdatedAt",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  "id",
  "planId",
  "metricCode",
  "name",
  "description",
  "targetValue",
  "currentValue",
  "unit",
  "weight",
  "calculationType",
  "riskStatus",
  "responsibleUserId",
  "sortOrder",
  "adjustedAt",
  "progressUpdatedAt",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "AnnualGoalMetric";

DROP TABLE "AnnualGoalMetric";
ALTER TABLE "new_AnnualGoalMetric" RENAME TO "AnnualGoalMetric";

CREATE TABLE "new_AnnualGoalMetricAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamOrgNodeId" TEXT NOT NULL,
  "metricId" TEXT,
  "sourceMetricId" TEXT,
  "weight" REAL NOT NULL,
  "responsibleUserId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  CONSTRAINT "AnnualGoalMetricAssignment_target_check" CHECK (
    ("metricId" IS NOT NULL AND "sourceMetricId" IS NULL)
    OR
    ("metricId" IS NULL AND "sourceMetricId" IS NOT NULL)
  ),
  CONSTRAINT "AnnualGoalMetricAssignment_metricId_fkey"
    FOREIGN KEY ("metricId") REFERENCES "AnnualGoalMetric" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AnnualGoalMetricAssignment_sourceMetricId_fkey"
    FOREIGN KEY ("sourceMetricId") REFERENCES "AnnualGoalMetricSource" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_AnnualGoalMetricAssignment" (
  "id",
  "teamOrgNodeId",
  "metricId",
  "sourceMetricId",
  "weight",
  "responsibleUserId",
  "sortOrder",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  "id",
  "teamOrgNodeId",
  "metricId",
  "sourceMetricId",
  "weight",
  "responsibleUserId",
  "sortOrder",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "AnnualGoalMetricAssignment";

DROP TABLE "AnnualGoalMetricAssignment";
ALTER TABLE "new_AnnualGoalMetricAssignment" RENAME TO "AnnualGoalMetricAssignment";

CREATE TABLE "new_AnnualGoalQuarterTarget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "metricId" TEXT,
  "sourceMetricId" TEXT,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "targetValue" REAL NOT NULL,
  "currentValue" REAL NOT NULL DEFAULT 0,
  "weeklyIncrement" REAL NOT NULL DEFAULT 0,
  "startDate" DATETIME,
  "endDate" DATETIME,
  "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
  "adjustedAt" DATETIME,
  "progressUpdatedAt" DATETIME,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  CONSTRAINT "AnnualGoalQuarterTarget_target_check" CHECK (
    ("metricId" IS NOT NULL AND "sourceMetricId" IS NULL)
    OR
    ("metricId" IS NULL AND "sourceMetricId" IS NOT NULL)
  )
);

INSERT INTO "new_AnnualGoalQuarterTarget" (
  "id",
  "metricId",
  "sourceMetricId",
  "year",
  "quarter",
  "targetValue",
  "currentValue",
  "weeklyIncrement",
  "startDate",
  "endDate",
  "riskStatus",
  "adjustedAt",
  "progressUpdatedAt",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  "id",
  "metricId",
  "sourceMetricId",
  "year",
  "quarter",
  "targetValue",
  "currentValue",
  "weeklyIncrement",
  "startDate",
  "endDate",
  "riskStatus",
  "adjustedAt",
  "progressUpdatedAt",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "AnnualGoalQuarterTarget";

DROP TABLE "AnnualGoalQuarterTarget";
ALTER TABLE "new_AnnualGoalQuarterTarget" RENAME TO "AnnualGoalQuarterTarget";

DROP TABLE "AnnualGoalRevisionLog";

CREATE INDEX "AnnualGoalPlan_year_idx" ON "AnnualGoalPlan" ("year");
CREATE INDEX "AnnualGoalPlan_departmentOrgNodeId_year_idx" ON "AnnualGoalPlan" ("departmentOrgNodeId", "year");
CREATE INDEX "AnnualGoalPlan_status_idx" ON "AnnualGoalPlan" ("status");
CREATE INDEX "AnnualGoalPlan_deletedAt_idx" ON "AnnualGoalPlan" ("deletedAt");

CREATE INDEX "AnnualGoalMetric_planId_idx" ON "AnnualGoalMetric" ("planId");
CREATE INDEX "AnnualGoalMetric_metricCode_idx" ON "AnnualGoalMetric" ("metricCode");
CREATE INDEX "AnnualGoalMetric_riskStatus_idx" ON "AnnualGoalMetric" ("riskStatus");
CREATE INDEX "AnnualGoalMetric_responsibleUserId_idx" ON "AnnualGoalMetric" ("responsibleUserId");
CREATE INDEX "AnnualGoalMetric_deletedAt_idx" ON "AnnualGoalMetric" ("deletedAt");

CREATE INDEX "AnnualGoalMetricAssignment_teamOrgNodeId_idx" ON "AnnualGoalMetricAssignment" ("teamOrgNodeId");
CREATE INDEX "AnnualGoalMetricAssignment_metricId_idx" ON "AnnualGoalMetricAssignment" ("metricId");
CREATE INDEX "AnnualGoalMetricAssignment_sourceMetricId_idx" ON "AnnualGoalMetricAssignment" ("sourceMetricId");
CREATE INDEX "AnnualGoalMetricAssignment_responsibleUserId_idx" ON "AnnualGoalMetricAssignment" ("responsibleUserId");
CREATE INDEX "AnnualGoalMetricAssignment_deletedAt_idx" ON "AnnualGoalMetricAssignment" ("deletedAt");

CREATE INDEX "AnnualGoalQuarterTarget_metricId_idx" ON "AnnualGoalQuarterTarget" ("metricId");
CREATE INDEX "AnnualGoalQuarterTarget_sourceMetricId_idx" ON "AnnualGoalQuarterTarget" ("sourceMetricId");
CREATE INDEX "AnnualGoalQuarterTarget_year_quarter_idx" ON "AnnualGoalQuarterTarget" ("year", "quarter");
CREATE INDEX "AnnualGoalQuarterTarget_riskStatus_idx" ON "AnnualGoalQuarterTarget" ("riskStatus");

CREATE UNIQUE INDEX "AnnualGoalPlan_active_department_year_key"
ON "AnnualGoalPlan" ("departmentOrgNodeId", "year")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "AnnualGoalAssignment_active_team_metric_key"
ON "AnnualGoalMetricAssignment" ("teamOrgNodeId", "metricId")
WHERE "deletedAt" IS NULL AND "metricId" IS NOT NULL;

CREATE UNIQUE INDEX "AnnualGoalAssignment_active_team_source_key"
ON "AnnualGoalMetricAssignment" ("teamOrgNodeId", "sourceMetricId")
WHERE "deletedAt" IS NULL AND "sourceMetricId" IS NOT NULL;

CREATE UNIQUE INDEX "AnnualGoalQuarter_active_metric_key"
ON "AnnualGoalQuarterTarget" ("metricId", "year", "quarter")
WHERE "deletedAt" IS NULL AND "metricId" IS NOT NULL;

CREATE UNIQUE INDEX "AnnualGoalQuarter_active_source_key"
ON "AnnualGoalQuarterTarget" ("sourceMetricId", "year", "quarter")
WHERE "deletedAt" IS NULL AND "sourceMetricId" IS NOT NULL;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
