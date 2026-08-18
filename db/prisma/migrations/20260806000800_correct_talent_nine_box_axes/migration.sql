-- Correct the six-dimension nine-box axes without changing templates that
-- already have calculated review results.
UPDATE "TalentReviewDimension"
SET "category" = CASE
  WHEN "name" IN ('忠诚度', '匹配度', '成长性', '成长度') THEN 'POTENTIAL'
  WHEN "name" IN ('工作态度', '能力度', '产出度') THEN 'PERFORMANCE'
  ELSE "category"
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "name" IN ('忠诚度', '匹配度', '成长性', '成长度', '工作态度', '能力度', '产出度')
  AND NOT EXISTS (
    SELECT 1
    FROM "TalentReviewCycle" AS cycle
    JOIN "TalentReviewParticipant" AS participant ON participant."cycleId" = cycle."id"
    JOIN "TalentReviewResult" AS result ON result."participantId" = participant."id"
    WHERE cycle."templateVersionId" = "TalentReviewDimension"."templateVersionId"
  );

-- Existing standard six-dimension templates previously generated 2-10 ranges
-- because only two dimensions were assigned to each axis. Each axis now sums
-- three 1-5 dimensions, so its valid range is 3-15.
UPDATE "TalentNineBoxRule"
SET "potentialMin" = CASE substr("code", instr("code", '_') + 1)
    WHEN 'LOW' THEN 3 WHEN 'MID' THEN 8 WHEN 'HIGH' THEN 12 ELSE "potentialMin" END,
    "potentialMax" = CASE substr("code", instr("code", '_') + 1)
    WHEN 'LOW' THEN 7 WHEN 'MID' THEN 11 WHEN 'HIGH' THEN 15 ELSE "potentialMax" END,
    "performanceMin" = CASE substr("code", 1, instr("code", '_') - 1)
    WHEN 'LOW' THEN 3 WHEN 'MID' THEN 8 WHEN 'HIGH' THEN 12 ELSE "performanceMin" END,
    "performanceMax" = CASE substr("code", 1, instr("code", '_') - 1)
    WHEN 'LOW' THEN 7 WHEN 'MID' THEN 11 WHEN 'HIGH' THEN 15 ELSE "performanceMax" END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "templateVersionId" IN (
  SELECT template."id"
  FROM "TalentReviewTemplateVersion" AS template
  WHERE NOT EXISTS (
      SELECT 1
      FROM "TalentReviewCycle" AS cycle
      JOIN "TalentReviewParticipant" AS participant ON participant."cycleId" = cycle."id"
      JOIN "TalentReviewResult" AS result ON result."participantId" = participant."id"
      WHERE cycle."templateVersionId" = template."id"
    )
    AND 6 = (
      SELECT count(*)
      FROM "TalentReviewDimension" AS dimension
      WHERE dimension."templateVersionId" = template."id"
        AND dimension."name" IN ('忠诚度', '工作态度', '匹配度', '成长性', '成长度', '能力度', '产出度')
        AND dimension."maxScore" = 5
    )
    AND 1 = (SELECT min(option."numericScore") FROM "TalentRatingOption" AS option WHERE option."templateVersionId" = template."id")
    AND 5 = (SELECT max(option."numericScore") FROM "TalentRatingOption" AS option WHERE option."templateVersionId" = template."id")
);
