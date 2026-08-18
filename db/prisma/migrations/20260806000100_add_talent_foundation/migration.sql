CREATE TABLE "CareerTrack" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "departmentOrgNodeId" TEXT NOT NULL, "description" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "CareerTrack_departmentOrgNodeId_code_key" ON "CareerTrack"("departmentOrgNodeId", "code");
CREATE INDEX "CareerTrack_departmentOrgNodeId_isActive_idx" ON "CareerTrack"("departmentOrgNodeId", "isActive");
CREATE INDEX "CareerTrack_deletedAt_idx" ON "CareerTrack"("deletedAt");

CREATE TABLE "JobFamily" (
  "id" TEXT NOT NULL PRIMARY KEY, "careerTrackId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "JobFamily_careerTrackId_code_key" ON "JobFamily"("careerTrackId", "code");
CREATE INDEX "JobFamily_careerTrackId_isActive_idx" ON "JobFamily"("careerTrackId", "isActive");
CREATE INDEX "JobFamily_deletedAt_idx" ON "JobFamily"("deletedAt");

CREATE TABLE "JobRole" (
  "id" TEXT NOT NULL PRIMARY KEY, "jobFamilyId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "JobRole_jobFamilyId_code_key" ON "JobRole"("jobFamilyId", "code");
CREATE INDEX "JobRole_jobFamilyId_isActive_idx" ON "JobRole"("jobFamilyId", "isActive");
CREATE INDEX "JobRole_deletedAt_idx" ON "JobRole"("deletedAt");

CREATE TABLE "JobLevelGroup" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "rankOrder" INTEGER NOT NULL,
  "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "JobLevelGroup_code_key" ON "JobLevelGroup"("code");
CREATE INDEX "JobLevelGroup_rankOrder_idx" ON "JobLevelGroup"("rankOrder");
CREATE INDEX "JobLevelGroup_isActive_deletedAt_idx" ON "JobLevelGroup"("isActive", "deletedAt");

CREATE TABLE "JobLevel" (
  "id" TEXT NOT NULL PRIMARY KEY, "jobLevelGroupId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL, "displayOrder" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "JobLevel_jobLevelGroupId_code_key" ON "JobLevel"("jobLevelGroupId", "code");
CREATE UNIQUE INDEX "JobLevel_jobLevelGroupId_stepOrder_key" ON "JobLevel"("jobLevelGroupId", "stepOrder");
CREATE INDEX "JobLevel_displayOrder_idx" ON "JobLevel"("displayOrder");
CREATE INDEX "JobLevel_isActive_deletedAt_idx" ON "JobLevel"("isActive", "deletedAt");

CREATE TABLE "EmployeeTalentProfile" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "jobRoleId" TEXT, "jobLevelId" TEXT,
  "managerUserId" TEXT, "currentSalary" INTEGER, "salaryCurrency" TEXT NOT NULL DEFAULT 'CNY', "profileNote" TEXT,
  "updatedById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "EmployeeTalentProfile_userId_key" ON "EmployeeTalentProfile"("userId");
CREATE INDEX "EmployeeTalentProfile_jobRoleId_idx" ON "EmployeeTalentProfile"("jobRoleId");
CREATE INDEX "EmployeeTalentProfile_jobLevelId_idx" ON "EmployeeTalentProfile"("jobLevelId");
CREATE INDEX "EmployeeTalentProfile_managerUserId_idx" ON "EmployeeTalentProfile"("managerUserId");
CREATE INDEX "EmployeeTalentProfile_deletedAt_idx" ON "EmployeeTalentProfile"("deletedAt");

CREATE TABLE "EmploymentContractTerm" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "contractNo" TEXT, "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL, "renewalSequence" INTEGER NOT NULL DEFAULT 1, "resultStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  "recommendationId" TEXT, "sourceType" TEXT NOT NULL DEFAULT 'MANUAL_ENTRY', "externalProcessNo" TEXT,
  "confirmedById" TEXT, "confirmedAt" DATETIME, "voidReason" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "EmploymentContractTerm_userId_startDate_renewalSequence_key" ON "EmploymentContractTerm"("userId", "startDate", "renewalSequence");
CREATE INDEX "EmploymentContractTerm_userId_endDate_idx" ON "EmploymentContractTerm"("userId", "endDate");
CREATE INDEX "EmploymentContractTerm_recommendationId_idx" ON "EmploymentContractTerm"("recommendationId");
CREATE INDEX "EmploymentContractTerm_externalProcessNo_idx" ON "EmploymentContractTerm"("externalProcessNo");
CREATE INDEX "EmploymentContractTerm_resultStatus_deletedAt_idx" ON "EmploymentContractTerm"("resultStatus", "deletedAt");

CREATE TABLE "SalaryCapConfig" (
  "id" TEXT NOT NULL PRIMARY KEY, "departmentOrgNodeId" TEXT NOT NULL, "jobLevelGroupId" TEXT NOT NULL,
  "jobLevelId" TEXT, "maxSalary" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'CNY',
  "effectiveFrom" DATETIME NOT NULL, "effectiveTo" DATETIME, "version" INTEGER NOT NULL DEFAULT 1,
  "versionStatus" TEXT NOT NULL DEFAULT 'DRAFT', "createdById" TEXT NOT NULL, "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "SalaryCapConfig_departmentOrgNodeId_jobLevelGroupId_jobLevelId_version_key" ON "SalaryCapConfig"("departmentOrgNodeId", "jobLevelGroupId", "jobLevelId", "version");
CREATE INDEX "SalaryCapConfig_departmentOrgNodeId_effectiveFrom_idx" ON "SalaryCapConfig"("departmentOrgNodeId", "effectiveFrom");
CREATE INDEX "SalaryCapConfig_jobLevelGroupId_idx" ON "SalaryCapConfig"("jobLevelGroupId");
CREATE INDEX "SalaryCapConfig_jobLevelId_idx" ON "SalaryCapConfig"("jobLevelId");
CREATE INDEX "SalaryCapConfig_versionStatus_deletedAt_idx" ON "SalaryCapConfig"("versionStatus", "deletedAt");

CREATE TABLE "TalentImportBatch" (
  "id" TEXT NOT NULL PRIMARY KEY, "importType" TEXT NOT NULL, "fileName" TEXT NOT NULL, "fileSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UPLOADED', "year" INTEGER, "quarter" INTEGER, "departmentOrgNodeId" TEXT,
  "mappingJson" TEXT, "summaryJson" TEXT, "errorFilePath" TEXT, "createdById" TEXT NOT NULL,
  "confirmedById" TEXT, "confirmedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL, "deletedAt" DATETIME
);
CREATE INDEX "TalentImportBatch_importType_status_idx" ON "TalentImportBatch"("importType", "status");
CREATE INDEX "TalentImportBatch_departmentOrgNodeId_createdAt_idx" ON "TalentImportBatch"("departmentOrgNodeId", "createdAt");
CREATE INDEX "TalentImportBatch_fileSha256_idx" ON "TalentImportBatch"("fileSha256");
CREATE INDEX "TalentImportBatch_deletedAt_idx" ON "TalentImportBatch"("deletedAt");

CREATE TABLE "TalentImportRow" (
  "id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL,
  "rawDataJson" TEXT NOT NULL, "normalizedDataJson" TEXT, "userId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "errorMessagesJson" TEXT, "importedTargetType" TEXT,
  "importedTargetId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TalentImportRow_batchId_rowNumber_key" ON "TalentImportRow"("batchId", "rowNumber");
CREATE INDEX "TalentImportRow_batchId_status_idx" ON "TalentImportRow"("batchId", "status");
CREATE INDEX "TalentImportRow_userId_idx" ON "TalentImportRow"("userId");
CREATE INDEX "TalentImportRow_importedTargetType_importedTargetId_idx" ON "TalentImportRow"("importedTargetType", "importedTargetId");

CREATE TABLE "TalentActionLog" (
  "id" TEXT NOT NULL PRIMARY KEY, "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "beforeJson" TEXT, "afterJson" TEXT, "remark" TEXT,
  "actedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TalentActionLog_targetType_targetId_actedAt_idx" ON "TalentActionLog"("targetType", "targetId", "actedAt");
CREATE INDEX "TalentActionLog_actorId_idx" ON "TalentActionLog"("actorId");
