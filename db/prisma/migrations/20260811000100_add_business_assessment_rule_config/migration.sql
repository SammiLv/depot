ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "initialPassPercent" REAL NOT NULL DEFAULT 100;
ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "retestPassPercent" REAL NOT NULL DEFAULT 50;
ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "finalFailPercent" REAL NOT NULL DEFAULT 0;
ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "defaultScoringType" TEXT NOT NULL DEFAULT 'NUMERIC';
ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "passingNumericScore" REAL NOT NULL DEFAULT 80;
ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "requiredGradeCode" TEXT NOT NULL DEFAULT 'A';

CREATE TABLE "BusinessAssessmentRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
  "totalKpiScore" REAL NOT NULL DEFAULT 6,
  "allocationMode" TEXT NOT NULL DEFAULT 'EQUAL',
  "initialPassPercent" REAL NOT NULL DEFAULT 100,
  "retestPassPercent" REAL NOT NULL DEFAULT 50,
  "finalFailPercent" REAL NOT NULL DEFAULT 0,
  "defaultScoringType" TEXT NOT NULL DEFAULT 'NUMERIC',
  "passingNumericScore" REAL NOT NULL DEFAULT 80,
  "requiredGradeCode" TEXT NOT NULL DEFAULT 'A',
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BusinessAssessmentRule_scopeKey_key" ON "BusinessAssessmentRule"("scopeKey");
