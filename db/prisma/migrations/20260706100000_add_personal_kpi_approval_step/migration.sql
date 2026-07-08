CREATE TABLE "PersonalKpiApprovalStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personalKpiId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "stageKey" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PersonalKpiApprovalStep_personalKpiId_stepOrder_idx"
ON "PersonalKpiApprovalStep"("personalKpiId", "stepOrder");

CREATE INDEX "PersonalKpiApprovalStep_approverId_status_idx"
ON "PersonalKpiApprovalStep"("approverId", "status");
