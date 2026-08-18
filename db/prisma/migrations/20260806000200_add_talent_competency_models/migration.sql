CREATE TABLE "CompetencyItem" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
  "description" TEXT, "measurementGuide" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "CompetencyItem_code_key" ON "CompetencyItem"("code");
CREATE INDEX "CompetencyItem_category_isActive_idx" ON "CompetencyItem"("category", "isActive");
CREATE INDEX "CompetencyItem_deletedAt_idx" ON "CompetencyItem"("deletedAt");

CREATE TABLE "CompetencyPackage" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1, "createdById" TEXT NOT NULL,
  "publishedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "CompetencyPackage_code_version_key" ON "CompetencyPackage"("code", "version");
CREATE INDEX "CompetencyPackage_status_deletedAt_idx" ON "CompetencyPackage"("status", "deletedAt");

CREATE TABLE "CompetencyPackageItem" (
  "id" TEXT NOT NULL PRIMARY KEY, "packageId" TEXT NOT NULL, "competencyItemId" TEXT NOT NULL,
  "weight" REAL NOT NULL DEFAULT 0, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CompetencyPackageItem_packageId_competencyItemId_key" ON "CompetencyPackageItem"("packageId", "competencyItemId");
CREATE INDEX "CompetencyPackageItem_competencyItemId_idx" ON "CompetencyPackageItem"("competencyItemId");

CREATE TABLE "CompetencyModelVersion" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "jobRoleId" TEXT NOT NULL,
  "targetJobLevelId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT, "createdById" TEXT NOT NULL, "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "CompetencyModelVersion_jobRoleId_targetJobLevelId_version_key" ON "CompetencyModelVersion"("jobRoleId", "targetJobLevelId", "version");
CREATE INDEX "CompetencyModelVersion_code_status_idx" ON "CompetencyModelVersion"("code", "status");
CREATE INDEX "CompetencyModelVersion_deletedAt_idx" ON "CompetencyModelVersion"("deletedAt");

CREATE TABLE "JobLevelRequirement" (
  "id" TEXT NOT NULL PRIMARY KEY, "modelVersionId" TEXT NOT NULL, "competencyItemId" TEXT NOT NULL,
  "requiredLevel" INTEGER NOT NULL, "weight" REAL NOT NULL DEFAULT 0, "isMandatory" BOOLEAN NOT NULL DEFAULT false,
  "evidenceRequirement" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "JobLevelRequirement_modelVersionId_competencyItemId_key" ON "JobLevelRequirement"("modelVersionId", "competencyItemId");
CREATE INDEX "JobLevelRequirement_competencyItemId_idx" ON "JobLevelRequirement"("competencyItemId");

CREATE TABLE "PromotionPath" (
  "id" TEXT NOT NULL PRIMARY KEY, "jobRoleId" TEXT NOT NULL, "fromJobLevelId" TEXT NOT NULL,
  "toJobLevelId" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "PromotionPath_jobRoleId_fromJobLevelId_toJobLevelId_key" ON "PromotionPath"("jobRoleId", "fromJobLevelId", "toJobLevelId");
CREATE INDEX "PromotionPath_isActive_deletedAt_idx" ON "PromotionPath"("isActive", "deletedAt");
