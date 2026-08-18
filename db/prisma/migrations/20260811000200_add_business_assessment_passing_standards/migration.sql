ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "passingStandardsJson" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "BusinessAssessmentPassingStandard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "scoringType" TEXT NOT NULL,
    "passingNumericScore" REAL,
    "requiredGradeCode" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BusinessAssessmentPassingStandard_scopeType_scopeId_key"
ON "BusinessAssessmentPassingStandard"("scopeType", "scopeId");

CREATE INDEX "BusinessAssessmentPassingStandard_scopeType_scopeId_idx"
ON "BusinessAssessmentPassingStandard"("scopeType", "scopeId");
