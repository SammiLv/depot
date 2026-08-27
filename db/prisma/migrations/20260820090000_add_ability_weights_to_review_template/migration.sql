-- AlterTable
ALTER TABLE "TalentReviewTemplateVersion" ADD COLUMN "kpiWeight" REAL NOT NULL DEFAULT 0.6;
ALTER TABLE "TalentReviewTemplateVersion" ADD COLUMN "reviewWeight" REAL NOT NULL DEFAULT 0.4;
