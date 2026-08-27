-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetTitle" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "OperationLog_targetType_targetId_idx" ON "OperationLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");
