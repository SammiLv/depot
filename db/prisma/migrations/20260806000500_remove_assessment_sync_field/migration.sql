PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BusinessAssessmentCycle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "departmentOrgNodeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "totalKpiScore" REAL NOT NULL DEFAULT 6,
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);
INSERT INTO "new_BusinessAssessmentCycle" ("id","year","quarter","name","departmentOrgNodeId","status","totalKpiScore","createdById","confirmedById","confirmedAt","createdAt","updatedAt","deletedAt")
SELECT "id","year","quarter","name","departmentOrgNodeId","status","totalKpiScore","createdById","confirmedById","confirmedAt","createdAt","updatedAt","deletedAt" FROM "BusinessAssessmentCycle";
DROP TABLE "BusinessAssessmentCycle";
ALTER TABLE "new_BusinessAssessmentCycle" RENAME TO "BusinessAssessmentCycle";
CREATE UNIQUE INDEX "BusinessAssessmentCycle_departmentOrgNodeId_year_quarter_key" ON "BusinessAssessmentCycle"("departmentOrgNodeId","year","quarter");
CREATE INDEX "BusinessAssessmentCycle_status_deletedAt_idx" ON "BusinessAssessmentCycle"("status","deletedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
