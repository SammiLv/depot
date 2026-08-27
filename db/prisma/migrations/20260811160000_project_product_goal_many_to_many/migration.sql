-- CreateTable
PRAGMA foreign_keys=OFF;

CREATE TABLE "ProjectProductGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "productGoalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectProductGoal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectProductGoal_productGoalId_fkey" FOREIGN KEY ("productGoalId") REFERENCES "ProductGoal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductGoal_projectId_productGoalId_key" ON "ProjectProductGoal"("projectId", "productGoalId");
CREATE INDEX "ProjectProductGoal_projectId_idx" ON "ProjectProductGoal"("projectId");
CREATE INDEX "ProjectProductGoal_productGoalId_idx" ON "ProjectProductGoal"("productGoalId");

-- Backfill from legacy single productGoalId
INSERT INTO "ProjectProductGoal" ("id", "projectId", "productGoalId", "sortOrder", "createdAt")
SELECT 'ppg_' || "id", "id", "productGoalId", 10, CURRENT_TIMESTAMP
FROM "Project"
WHERE "productGoalId" IS NOT NULL AND "deletedAt" IS NULL;

-- DropIndex
DROP INDEX IF EXISTS "Project_productGoalId_idx";

-- AlterTable
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expectedOutcome" TEXT,
    "startQuarter" TEXT,
    "endQuarter" TEXT,
    "ownerId" TEXT NOT NULL,
    "orgNodeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" DATETIME,
    "workloadPersonDay" REAL,
    "otherCost" TEXT,
    "actualValue" TEXT,
    "valueJudgement" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Project" (
    "id", "title", "description", "expectedOutcome", "startQuarter", "endQuarter",
    "ownerId", "orgNodeId", "status", "completedAt", "workloadPersonDay", "otherCost",
    "actualValue", "valueJudgement", "createdById", "createdAt", "updatedAt", "deletedAt"
)
SELECT
    "id", "title", "description", "expectedOutcome", "startQuarter", "endQuarter",
    "ownerId", "orgNodeId", "status", "completedAt", "workloadPersonDay", "otherCost",
    "actualValue", "valueJudgement", "createdById", "createdAt", "updatedAt", "deletedAt"
FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
CREATE INDEX "Project_orgNodeId_idx" ON "Project"("orgNodeId");
CREATE INDEX "Project_status_idx" ON "Project"("status");

PRAGMA foreign_keys=ON;
