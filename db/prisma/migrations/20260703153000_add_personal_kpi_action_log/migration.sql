CREATE TABLE IF NOT EXISTS "PersonalKpiActionLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personalKpiId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "remark" TEXT,
  "actedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PersonalKpiActionLog_personalKpiId_actedAt_idx"
ON "PersonalKpiActionLog"("personalKpiId", "actedAt");

CREATE INDEX IF NOT EXISTS "PersonalKpiActionLog_actorId_idx"
ON "PersonalKpiActionLog"("actorId");
