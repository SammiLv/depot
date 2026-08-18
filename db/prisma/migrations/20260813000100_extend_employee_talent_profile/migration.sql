ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "entryJobLevelId" TEXT;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "currentContractStartAt" DATETIME;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "currentContractEndAt" DATETIME;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "currentContractSequence" INTEGER;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "hasTwoCReviewsInCurrentContract" BOOLEAN;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "hasConsecutiveTwoCReviewsInCurrentContract" BOOLEAN;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "isLatestPreRenewalReviewC" BOOLEAN;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "hasFormalPromotionInCurrentContract" BOOLEAN;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "decisionFactsUpdatedAt" DATETIME;
ALTER TABLE "EmployeeTalentProfile" ADD COLUMN "decisionFactsUpdateNote" TEXT;

UPDATE "EmployeeTalentProfile"
SET "currentContractEndAt" = (
  SELECT "contractRenewAt"
  FROM "User"
  WHERE "User"."id" = "EmployeeTalentProfile"."userId"
)
WHERE "currentContractEndAt" IS NULL;

CREATE INDEX "EmployeeTalentProfile_entryJobLevelId_idx" ON "EmployeeTalentProfile"("entryJobLevelId");
