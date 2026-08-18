ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "assessmentStartDate" DATETIME;
ALTER TABLE "BusinessAssessmentCycle" ADD COLUMN "assessmentEndDate" DATETIME;

-- 将历史员工成绩上的考试时间汇总到所属业务考核，后续以批次时间为唯一业务来源。
UPDATE "BusinessAssessmentCycle"
SET "assessmentStartDate" = (
      SELECT MIN(COALESCE("assessmentStartDate", "assessmentDate"))
      FROM "BusinessAssessmentResult"
      WHERE "BusinessAssessmentResult"."cycleId" = "BusinessAssessmentCycle"."id"
    ),
    "assessmentEndDate" = (
      SELECT MAX(COALESCE("assessmentEndDate", "assessmentDate"))
      FROM "BusinessAssessmentResult"
      WHERE "BusinessAssessmentResult"."cycleId" = "BusinessAssessmentCycle"."id"
    );
