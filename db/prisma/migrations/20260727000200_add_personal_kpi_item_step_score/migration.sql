CREATE TABLE "PersonalKpiItemStepScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalKpiItemId" TEXT NOT NULL,
    "approvalStepId" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PersonalKpiItemStepScore_personalKpiItemId_approvalStepId_key" ON "PersonalKpiItemStepScore"("personalKpiItemId", "approvalStepId");
CREATE INDEX "PersonalKpiItemStepScore_approvalStepId_idx" ON "PersonalKpiItemStepScore"("approvalStepId");
CREATE INDEX "PersonalKpiItemStepScore_personalKpiItemId_idx" ON "PersonalKpiItemStepScore"("personalKpiItemId");
