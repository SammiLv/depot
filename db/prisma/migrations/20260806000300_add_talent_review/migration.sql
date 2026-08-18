CREATE TABLE "TalentReviewTemplateVersion" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "departmentOrgNodeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'DRAFT', "description" TEXT,
  "createdById" TEXT NOT NULL, "publishedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "TalentReviewTemplateVersion_departmentOrgNodeId_code_version_key" ON "TalentReviewTemplateVersion"("departmentOrgNodeId", "code", "version");
CREATE INDEX "TalentReviewTemplateVersion_departmentOrgNodeId_status_idx" ON "TalentReviewTemplateVersion"("departmentOrgNodeId", "status");
CREATE INDEX "TalentReviewTemplateVersion_deletedAt_idx" ON "TalentReviewTemplateVersion"("deletedAt");

CREATE TABLE "TalentReviewDimension" (
  "id" TEXT NOT NULL PRIMARY KEY, "templateVersionId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "category" TEXT NOT NULL, "weight" REAL NOT NULL DEFAULT 1, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentReviewDimension_templateVersionId_code_key" ON "TalentReviewDimension"("templateVersionId", "code");
CREATE INDEX "TalentReviewDimension_templateVersionId_sortOrder_idx" ON "TalentReviewDimension"("templateVersionId", "sortOrder");

CREATE TABLE "TalentRatingOption" (
  "id" TEXT NOT NULL PRIMARY KEY, "templateVersionId" TEXT NOT NULL, "code" TEXT NOT NULL, "label" TEXT NOT NULL,
  "numericScore" REAL NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentRatingOption_templateVersionId_code_key" ON "TalentRatingOption"("templateVersionId", "code");
CREATE INDEX "TalentRatingOption_templateVersionId_sortOrder_idx" ON "TalentRatingOption"("templateVersionId", "sortOrder");

CREATE TABLE "TalentGradeThreshold" (
  "id" TEXT NOT NULL PRIMARY KEY, "templateVersionId" TEXT NOT NULL, "gradeCode" TEXT NOT NULL, "label" TEXT NOT NULL,
  "minScore" REAL NOT NULL, "maxScore" REAL NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentGradeThreshold_templateVersionId_gradeCode_key" ON "TalentGradeThreshold"("templateVersionId", "gradeCode");
CREATE INDEX "TalentGradeThreshold_templateVersionId_sortOrder_idx" ON "TalentGradeThreshold"("templateVersionId", "sortOrder");

CREATE TABLE "TalentNineBoxRule" (
  "id" TEXT NOT NULL PRIMARY KEY, "templateVersionId" TEXT NOT NULL, "code" TEXT NOT NULL, "label" TEXT NOT NULL,
  "potentialMin" REAL NOT NULL, "potentialMax" REAL NOT NULL, "performanceMin" REAL NOT NULL, "performanceMax" REAL NOT NULL,
  "colorToken" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentNineBoxRule_templateVersionId_code_key" ON "TalentNineBoxRule"("templateVersionId", "code");
CREATE INDEX "TalentNineBoxRule_templateVersionId_sortOrder_idx" ON "TalentNineBoxRule"("templateVersionId", "sortOrder");

CREATE TABLE "TalentReviewCycle" (
  "id" TEXT NOT NULL PRIMARY KEY, "year" INTEGER NOT NULL, "quarter" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "departmentOrgNodeId" TEXT NOT NULL, "templateVersionId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startedAt" DATETIME, "confirmedAt" DATETIME, "archivedAt" DATETIME, "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "TalentReviewCycle_departmentOrgNodeId_year_quarter_key" ON "TalentReviewCycle"("departmentOrgNodeId", "year", "quarter");
CREATE INDEX "TalentReviewCycle_templateVersionId_idx" ON "TalentReviewCycle"("templateVersionId");
CREATE INDEX "TalentReviewCycle_status_deletedAt_idx" ON "TalentReviewCycle"("status", "deletedAt");

CREATE TABLE "TalentReviewParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY, "cycleId" TEXT NOT NULL, "userId" TEXT NOT NULL, "orgNodeIdSnapshot" TEXT,
  "jobRoleIdSnapshot" TEXT, "jobLevelIdSnapshot" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "reviewerId" TEXT,
  "confirmedById" TEXT, "confirmedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentReviewParticipant_cycleId_userId_key" ON "TalentReviewParticipant"("cycleId", "userId");
CREATE INDEX "TalentReviewParticipant_reviewerId_status_idx" ON "TalentReviewParticipant"("reviewerId", "status");

CREATE TABLE "TalentReviewDimensionResult" (
  "id" TEXT NOT NULL PRIMARY KEY, "participantId" TEXT NOT NULL, "dimensionId" TEXT NOT NULL, "ratingCode" TEXT NOT NULL,
  "numericScore" REAL NOT NULL, "comment" TEXT, "evaluatorId" TEXT NOT NULL,
  "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentReviewDimensionResult_participantId_dimensionId_key" ON "TalentReviewDimensionResult"("participantId", "dimensionId");
CREATE INDEX "TalentReviewDimensionResult_evaluatorId_evaluatedAt_idx" ON "TalentReviewDimensionResult"("evaluatorId", "evaluatedAt");

CREATE TABLE "TalentReviewResult" (
  "id" TEXT NOT NULL PRIMARY KEY, "participantId" TEXT NOT NULL, "totalScore" REAL NOT NULL, "gradeCode" TEXT NOT NULL,
  "potentialScore" REAL NOT NULL, "performanceScore" REAL NOT NULL, "nineBoxCode" TEXT, "talentType" TEXT,
  "backupUserId" TEXT, "appointmentSuggestion" TEXT, "managerComment" TEXT,
  "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentReviewResult_participantId_key" ON "TalentReviewResult"("participantId");
CREATE INDEX "TalentReviewResult_gradeCode_idx" ON "TalentReviewResult"("gradeCode");
CREATE INDEX "TalentReviewResult_nineBoxCode_idx" ON "TalentReviewResult"("nineBoxCode");
