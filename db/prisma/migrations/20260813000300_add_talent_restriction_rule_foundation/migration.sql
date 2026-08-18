CREATE TABLE "TalentRestrictionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "departmentOrgNodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentRevisionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

CREATE TABLE "TalentRestrictionRuleRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "policyBasis" TEXT,
    "description" TEXT,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "revisionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "TalentRuleFieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFieldPath" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "enumValuesJson" TEXT NOT NULL,
    "operatorsJson" TEXT NOT NULL DEFAULT '["EQUALS"]',
    "description" TEXT,
    "ownerModule" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "TalentRestrictionRuleCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT 'EQUALS',
    "comparisonValueJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "TalentRestrictionRuleOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "outputType" TEXT NOT NULL,
    "handlingCode" TEXT NOT NULL,
    "numericValue" REAL,
    "durationValue" INTEGER,
    "durationUnit" TEXT,
    "effectPeriodCode" TEXT,
    "parametersJson" TEXT NOT NULL DEFAULT '{}',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "TalentRestrictionRule_code_key" ON "TalentRestrictionRule"("code");
CREATE UNIQUE INDEX "TalentRestrictionRule_departmentOrgNodeId_name_key" ON "TalentRestrictionRule"("departmentOrgNodeId", "name");
CREATE INDEX "TalentRestrictionRule_departmentOrgNodeId_category_status_idx" ON "TalentRestrictionRule"("departmentOrgNodeId", "category", "status");
CREATE INDEX "TalentRestrictionRule_currentRevisionId_idx" ON "TalentRestrictionRule"("currentRevisionId");
CREATE INDEX "TalentRestrictionRule_deletedAt_idx" ON "TalentRestrictionRule"("deletedAt");

CREATE UNIQUE INDEX "TalentRestrictionRuleRevision_ruleId_revisionNo_key" ON "TalentRestrictionRuleRevision"("ruleId", "revisionNo");
CREATE INDEX "TalentRestrictionRuleRevision_ruleId_status_idx" ON "TalentRestrictionRuleRevision"("ruleId", "status");
CREATE INDEX "TalentRestrictionRuleRevision_effectiveFrom_effectiveTo_idx" ON "TalentRestrictionRuleRevision"("effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX "TalentRuleFieldDefinition_code_key" ON "TalentRuleFieldDefinition"("code");
CREATE UNIQUE INDEX "TalentRuleFieldDefinition_source_sourceFieldPath_key" ON "TalentRuleFieldDefinition"("source", "sourceFieldPath");
CREATE INDEX "TalentRuleFieldDefinition_source_isEnabled_idx" ON "TalentRuleFieldDefinition"("source", "isEnabled");

CREATE UNIQUE INDEX "TalentRestrictionRuleCondition_revisionId_key" ON "TalentRestrictionRuleCondition"("revisionId");
CREATE INDEX "TalentRestrictionRuleCondition_fieldDefinitionId_operator_idx" ON "TalentRestrictionRuleCondition"("fieldDefinitionId", "operator");

CREATE UNIQUE INDEX "TalentRestrictionRuleOutput_revisionId_sortOrder_key" ON "TalentRestrictionRuleOutput"("revisionId", "sortOrder");
CREATE INDEX "TalentRestrictionRuleOutput_revisionId_outputType_idx" ON "TalentRestrictionRuleOutput"("revisionId", "outputType");

INSERT INTO "TalentRuleFieldDefinition" ("id", "code", "displayName", "source", "sourceFieldPath", "dataType", "enumValuesJson", "operatorsJson", "description", "ownerModule", "isEnabled", "isSystem", "createdAt", "updatedAt") VALUES
('field_work_incident_level', 'WORK_INCIDENT_LEVEL', '事故等级', 'WORK_INCIDENT', 'WorkIncident.level', 'ENUM', '[{"value":"S","label":"S"},{"value":"A","label":"A"},{"value":"B","label":"B"},{"value":"C","label":"C"},{"value":"D","label":"D"}]', '["EQUALS"]', '已确认工作事故的正式事故等级', '工作事故', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_quarterly_kpi_rating', 'QUARTERLY_KPI_RATING', 'KPI等级', 'QUARTERLY_KPI', 'PersonalKpi.finalRatingName', 'ENUM', '[{"value":"S","label":"S"},{"value":"A","label":"A"},{"value":"B","label":"B"},{"value":"C","label":"C"},{"value":"D","label":"D"}]', '["EQUALS"]', '季度KPI完成审批后的最终等级', 'KPI', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_business_assessment_result', 'BUSINESS_ASSESSMENT_RESULT', '业务考核等级', 'BUSINESS_ASSESSMENT', 'BusinessAssessmentSummary.isOverallPassed', 'ENUM', '[{"value":"PASSED","label":"合格"},{"value":"FAILED","label":"不及格"}]', '["EQUALS"]', '业务考核汇总后的整体是否合格', '业务考核', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_talent_review_grade', 'TALENT_REVIEW_GRADE', '人才盘点等级', 'TALENT_REVIEW', 'TalentReviewResult.gradeCode', 'ENUM', '[{"value":"S","label":"S"},{"value":"A","label":"A"},{"value":"B","label":"B"},{"value":"C","label":"C"},{"value":"D","label":"D"}]', '["EQUALS"]', '已确认人才盘点结果的最终等级', '人才盘点', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_profile_two_c_reviews', 'PROFILE_TWO_C_REVIEWS_IN_CONTRACT', '聘期内人才盘点2次C', 'EMPLOYEE_PROFILE', 'EmployeeTalentProfile.hasTwoCReviewsInCurrentContract', 'TRISTATE_BOOLEAN', '[{"value":"PENDING","label":"待更新"},{"value":"YES","label":"是"},{"value":"NO","label":"否"}]', '["EQUALS"]', '只读取员工档案最终事实，不在配置中心统计次数', '员工档案', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_profile_consecutive_two_c_reviews', 'PROFILE_CONSECUTIVE_TWO_C_REVIEWS_IN_CONTRACT', '聘期内人才盘点连续2次C', 'EMPLOYEE_PROFILE', 'EmployeeTalentProfile.hasConsecutiveTwoCReviewsInCurrentContract', 'TRISTATE_BOOLEAN', '[{"value":"PENDING","label":"待更新"},{"value":"YES","label":"是"},{"value":"NO","label":"否"}]', '["EQUALS"]', '只读取员工档案最终事实，不在配置中心判断连续次数', '员工档案', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_profile_latest_pre_renewal_review_c', 'PROFILE_LATEST_PRE_RENEWAL_REVIEW_C', '续聘前最近一次人才盘点为C级', 'EMPLOYEE_PROFILE', 'EmployeeTalentProfile.isLatestPreRenewalReviewC', 'TRISTATE_BOOLEAN', '[{"value":"PENDING","label":"待更新"},{"value":"YES","label":"是"},{"value":"NO","label":"否"}]', '["EQUALS"]', '只读取员工档案最终事实，不在配置中心查找最近一次盘点', '员工档案', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('field_profile_formal_promotion', 'PROFILE_FORMAL_PROMOTION_IN_CONTRACT', '当前聘期内是否有正式晋升', 'EMPLOYEE_PROFILE', 'EmployeeTalentProfile.hasFormalPromotionInCurrentContract', 'TRISTATE_BOOLEAN', '[{"value":"PENDING","label":"待更新"},{"value":"YES","label":"是"},{"value":"NO","label":"否"}]', '["EQUALS"]', '只读取员工档案最终事实，不在配置中心聚合晋升记录', '员工档案', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
