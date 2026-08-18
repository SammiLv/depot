-- A department may create separate cycles for different models in the same
-- half-year. Uniqueness is enforced per employee and period instead.
DROP INDEX IF EXISTS "TalentReviewCycle_departmentOrgNodeId_year_quarter_key";

CREATE TABLE "new_TalentReviewParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cycleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "periodHalfYear" INTEGER NOT NULL,
  "orgNodeIdSnapshot" TEXT,
  "jobRoleIdSnapshot" TEXT,
  "jobLevelIdSnapshot" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT,
  "confirmedById" TEXT,
  "confirmedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_TalentReviewParticipant" (
  "id", "cycleId", "userId", "periodYear", "periodHalfYear",
  "orgNodeIdSnapshot", "jobRoleIdSnapshot", "jobLevelIdSnapshot", "status",
  "reviewerId", "confirmedById", "confirmedAt", "createdAt", "updatedAt"
)
SELECT
  participant."id", participant."cycleId", participant."userId", cycle."year", cycle."quarter",
  participant."orgNodeIdSnapshot", participant."jobRoleIdSnapshot", participant."jobLevelIdSnapshot", participant."status",
  participant."reviewerId", participant."confirmedById", participant."confirmedAt", participant."createdAt", participant."updatedAt"
FROM "TalentReviewParticipant" AS participant
JOIN "TalentReviewCycle" AS cycle ON cycle."id" = participant."cycleId"
JOIN "User" AS employee ON employee."id" = participant."userId"
WHERE employee."roleType" IN ('TEAM_LEADER', 'MEMBER')
   OR EXISTS (SELECT 1 FROM "TalentReviewResult" AS result WHERE result."participantId" = participant."id");

DROP TABLE "TalentReviewParticipant";
ALTER TABLE "new_TalentReviewParticipant" RENAME TO "TalentReviewParticipant";

CREATE UNIQUE INDEX "TalentReviewParticipant_cycleId_userId_key" ON "TalentReviewParticipant"("cycleId", "userId");
CREATE UNIQUE INDEX "TalentReviewParticipant_userId_periodYear_periodHalfYear_key" ON "TalentReviewParticipant"("userId", "periodYear", "periodHalfYear");
CREATE INDEX "TalentReviewParticipant_reviewerId_status_idx" ON "TalentReviewParticipant"("reviewerId", "status");
