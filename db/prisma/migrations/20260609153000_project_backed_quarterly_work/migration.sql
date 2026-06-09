-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expectedOutcome" TEXT,
    "ownerId" TEXT NOT NULL,
    "teamId" TEXT,
    "departmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "createdById" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuarterlyWork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "workType" TEXT,
    "ownerId" TEXT NOT NULL,
    "teamId" TEXT,
    "departmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedOutcome" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdById" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "QuarterlyWork_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "Project" (
    "id",
    "title",
    "description",
    "expectedOutcome",
    "ownerId",
    "teamId",
    "departmentId",
    "status",
    "createdById",
    "completedAt",
    "createdAt",
    "updatedAt",
    "deletedAt"
)
SELECT
    'proj_' || "id",
    "title",
    "description",
    "expectedOutcome",
    "ownerId",
    "teamId",
    "departmentId",
    CASE
        WHEN "status" = 'DELAYED_COMPLETED' THEN 'IN_PROGRESS'
        ELSE "status"
    END,
    "createdById",
    CASE
        WHEN "status" = 'COMPLETED' THEN COALESCE("endDate", "updatedAt", "createdAt")
        ELSE NULL
    END,
    "createdAt",
    "updatedAt",
    "deletedAt"
FROM "QuarterlyWork";
INSERT INTO "new_QuarterlyWork" (
    "id",
    "projectId",
    "year",
    "quarter",
    "title",
    "description",
    "workType",
    "ownerId",
    "teamId",
    "departmentId",
    "status",
    "approvalStatus",
    "expectedOutcome",
    "startDate",
    "endDate",
    "createdById",
    "completedAt",
    "createdAt",
    "updatedAt",
    "deletedAt"
)
SELECT
    "id",
    'proj_' || "id",
    "year",
    "quarter",
    "title",
    "description",
    "workType",
    "ownerId",
    "teamId",
    "departmentId",
    "status",
    "approvalStatus",
    "expectedOutcome",
    "startDate",
    "endDate",
    "createdById",
    CASE
        WHEN "status" = 'COMPLETED' THEN COALESCE("endDate", "updatedAt", "createdAt")
        ELSE NULL
    END,
    "createdAt",
    "updatedAt",
    "deletedAt"
FROM "QuarterlyWork";
DROP TABLE "QuarterlyWork";
ALTER TABLE "new_QuarterlyWork" RENAME TO "QuarterlyWork";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_departmentId_teamId_idx" ON "Project"("departmentId", "teamId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "QuarterlyWork_projectId_idx" ON "QuarterlyWork"("projectId");

-- CreateIndex
CREATE INDEX "QuarterlyWork_year_quarter_idx" ON "QuarterlyWork"("year", "quarter");

-- CreateIndex
CREATE INDEX "QuarterlyWork_ownerId_idx" ON "QuarterlyWork"("ownerId");

-- CreateIndex
CREATE INDEX "QuarterlyWork_departmentId_teamId_idx" ON "QuarterlyWork"("departmentId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyWork_projectId_year_quarter_key" ON "QuarterlyWork"("projectId", "year", "quarter");
