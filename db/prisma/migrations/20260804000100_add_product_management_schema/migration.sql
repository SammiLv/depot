-- Product planning models were introduced in the Prisma schema before a
-- corresponding migration was registered. Keep this migration additive for
-- Project and QuarterlyWork, and explicitly preserve legacy value-track rows.

ALTER TABLE "Project" ADD COLUMN "productGoalId" TEXT;
ALTER TABLE "Project" ADD COLUMN "workloadPersonDay" REAL;
ALTER TABLE "Project" ADD COLUMN "otherCost" TEXT;
ALTER TABLE "Project" ADD COLUMN "actualValue" TEXT;
ALTER TABLE "Project" ADD COLUMN "valueJudgement" TEXT;

ALTER TABLE "QuarterlyWork" ADD COLUMN "startMonth" INTEGER;
ALTER TABLE "QuarterlyWork" ADD COLUMN "endMonth" INTEGER;

CREATE TABLE "ProductGoal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "description" TEXT,
  "expectedOutcome" TEXT,
  "ownerId" TEXT NOT NULL,
  "orgNodeId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "createdById" TEXT NOT NULL,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);

CREATE INDEX "ProductGoal_year_idx" ON "ProductGoal"("year");
CREATE INDEX "ProductGoal_ownerId_idx" ON "ProductGoal"("ownerId");
CREATE INDEX "ProductGoal_orgNodeId_idx" ON "ProductGoal"("orgNodeId");
CREATE INDEX "ProductGoal_status_idx" ON "ProductGoal"("status");
CREATE INDEX "Project_productGoalId_idx" ON "Project"("productGoalId");

-- A legacy value-track may refer to a project only by name. Create a stable
-- project container when no project with the same title and owner exists, so
-- every migrated log remains reachable in the new project-based UI.
INSERT INTO "Project" (
  "id",
  "title",
  "description",
  "expectedOutcome",
  "ownerId",
  "orgNodeId",
  "status",
  "completedAt",
  "actualValue",
  "valueJudgement",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  'legacy-project-' || lower(hex(randomblob(12))),
  legacy."projectName",
  MAX(legacy."background"),
  MAX(legacy."expectedValue"),
  legacy."ownerId",
  (
    SELECT user."orgNodeId"
    FROM "User" AS user
    WHERE user."id" = legacy."ownerId"
    LIMIT 1
  ),
  'COMPLETED',
  COALESCE(MAX(legacy."launchDate"), MAX(legacy."updatedAt")),
  (
    SELECT latest."actualValue"
    FROM "RequirementValueTrack" AS latest
    WHERE latest."projectName" = legacy."projectName"
      AND latest."ownerId" = legacy."ownerId"
      AND latest."actualValue" IS NOT NULL
    ORDER BY latest."updatedAt" DESC
    LIMIT 1
  ),
  (
    SELECT CASE
      WHEN latest."isAchieved" = 1 THEN '已达成'
      WHEN latest."isAchieved" = 0 THEN '未达成'
      ELSE '待观察'
    END
    FROM "RequirementValueTrack" AS latest
    WHERE latest."projectName" = legacy."projectName"
      AND latest."ownerId" = legacy."ownerId"
    ORDER BY latest."updatedAt" DESC
    LIMIT 1
  ),
  legacy."ownerId",
  MIN(legacy."createdAt"),
  MAX(legacy."updatedAt"),
  CASE
    WHEN SUM(CASE WHEN legacy."deletedAt" IS NULL THEN 1 ELSE 0 END) = 0
      THEN MAX(legacy."deletedAt")
    ELSE NULL
  END
FROM "RequirementValueTrack" AS legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM "Project" AS project
  WHERE project."title" = legacy."projectName"
    AND project."ownerId" = legacy."ownerId"
)
GROUP BY legacy."projectName", legacy."ownerId";

-- Carry the most recent legacy value summary onto an already-existing project.
UPDATE "Project"
SET
  "actualValue" = COALESCE(
    (
      SELECT legacy."actualValue"
      FROM "RequirementValueTrack" AS legacy
      WHERE legacy."projectName" = "Project"."title"
        AND legacy."ownerId" = "Project"."ownerId"
        AND legacy."actualValue" IS NOT NULL
      ORDER BY legacy."updatedAt" DESC
      LIMIT 1
    ),
    "actualValue"
  ),
  "valueJudgement" = COALESCE(
    (
      SELECT CASE
        WHEN legacy."isAchieved" = 1 THEN '已达成'
        WHEN legacy."isAchieved" = 0 THEN '未达成'
        ELSE '待观察'
      END
      FROM "RequirementValueTrack" AS legacy
      WHERE legacy."projectName" = "Project"."title"
        AND legacy."ownerId" = "Project"."ownerId"
      ORDER BY legacy."updatedAt" DESC
      LIMIT 1
    ),
    "valueJudgement"
  )
WHERE EXISTS (
  SELECT 1
  FROM "RequirementValueTrack" AS legacy
  WHERE legacy."projectName" = "Project"."title"
    AND legacy."ownerId" = "Project"."ownerId"
);

CREATE TABLE "new_RequirementValueTrack" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "trackingResult" TEXT NOT NULL,
  "followUpOptimization" TEXT,
  "trackedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);

INSERT INTO "new_RequirementValueTrack" (
  "id",
  "projectId",
  "trackingResult",
  "followUpOptimization",
  "trackedAt",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  legacy."id",
  (
    SELECT project."id"
    FROM "Project" AS project
    WHERE project."title" = legacy."projectName"
      AND project."ownerId" = legacy."ownerId"
    ORDER BY (project."deletedAt" IS NULL) DESC, project."createdAt" ASC
    LIMIT 1
  ),
  '需求：' || legacy."requirementName"
    || char(10) || '预期价值：' || legacy."expectedValue"
    || CASE
      WHEN legacy."actualValue" IS NOT NULL
        THEN char(10) || '实际价值：' || legacy."actualValue"
      ELSE ''
    END,
  legacy."reviewNote",
  COALESCE(legacy."launchDate", legacy."updatedAt", legacy."createdAt"),
  legacy."createdAt",
  legacy."updatedAt",
  legacy."deletedAt"
FROM "RequirementValueTrack" AS legacy;

DROP TABLE "RequirementValueTrack";
ALTER TABLE "new_RequirementValueTrack" RENAME TO "RequirementValueTrack";

CREATE INDEX "RequirementValueTrack_projectId_idx"
ON "RequirementValueTrack"("projectId");
CREATE INDEX "RequirementValueTrack_trackedAt_idx"
ON "RequirementValueTrack"("trackedAt");
