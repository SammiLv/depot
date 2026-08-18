ALTER TABLE "BusinessAssessmentResult" ADD COLUMN "assessmentStartDate" DATETIME;
ALTER TABLE "BusinessAssessmentResult" ADD COLUMN "assessmentEndDate" DATETIME;

UPDATE "BusinessAssessmentResult"
SET "assessmentStartDate" = "assessmentDate",
    "assessmentEndDate" = "assessmentDate"
WHERE "assessmentDate" IS NOT NULL;
