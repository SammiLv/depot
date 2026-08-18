ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "ruleId" TEXT;

ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "departmentOrgNodeId" TEXT;
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "year" INTEGER;
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "quarter" INTEGER;
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "name" TEXT NOT NULL DEFAULT '业务考核规则';
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "publishedById" TEXT;
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "BusinessAssessmentRule" ADD COLUMN "deletedAt" DATETIME;

CREATE TABLE "BusinessAssessmentRuleSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scoringType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BusinessAssessmentRuleSubject_ruleId_code_key"
ON "BusinessAssessmentRuleSubject"("ruleId", "code");

CREATE INDEX "BusinessAssessmentRuleSubject_ruleId_sortOrder_idx"
ON "BusinessAssessmentRuleSubject"("ruleId", "sortOrder");

ALTER TABLE "BusinessAssessmentPassingStandard" ADD COLUMN "ruleSubjectId" TEXT;

DROP INDEX "BusinessAssessmentPassingStandard_scopeType_scopeId_key";
DROP INDEX "BusinessAssessmentPassingStandard_scopeType_scopeId_idx";

CREATE UNIQUE INDEX "BusinessAssessmentPassingStandard_ruleSubjectId_scopeType_scopeId_key"
ON "BusinessAssessmentPassingStandard"("ruleSubjectId", "scopeType", "scopeId");

CREATE INDEX "BusinessAssessmentPassingStandard_ruleSubjectId_scopeType_scopeId_idx"
ON "BusinessAssessmentPassingStandard"("ruleSubjectId", "scopeType", "scopeId");
