-- 产品价值跟踪改造：RequirementValueTrack 扩展为「跟踪任务 + 填报结果」
-- 1. trackingResult 改为可空：项目首次上线时预生成两条跟踪任务，填报时由服务端校验必填
-- 2. 新增跟踪周期/检查点/截止日期与首版完成度快照字段
-- 3. 状态文案迁移：未观测 → 待观测

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RequirementValueTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "trackingResult" TEXT,
    "followUpOptimization" TEXT,
    "trackedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackingSequence" INTEGER,
    "periodStartAt" DATETIME,
    "checkpointAt" DATETIME,
    "deadlineAt" DATETIME,
    "firstVersionWorkloadPersonDay" REAL,
    "postLaunchIterationWorkloadPersonDay" REAL,
    "totalWorkloadPersonDay" REAL,
    "firstVersionCompletionPercent" REAL,
    "workloadComplete" BOOLEAN,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "completedById" TEXT,
    "completedAt" DATETIME,
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_RequirementValueTrack" ("id", "projectId", "trackingResult", "followUpOptimization", "trackedAt", "createdAt", "updatedAt", "deletedAt") SELECT "id", "projectId", "trackingResult", "followUpOptimization", "trackedAt", "createdAt", "updatedAt", "deletedAt" FROM "RequirementValueTrack";
DROP TABLE "RequirementValueTrack";
ALTER TABLE "new_RequirementValueTrack" RENAME TO "RequirementValueTrack";
CREATE INDEX "RequirementValueTrack_projectId_idx" ON "RequirementValueTrack"("projectId");
CREATE INDEX "RequirementValueTrack_trackedAt_idx" ON "RequirementValueTrack"("trackedAt");
CREATE INDEX "RequirementValueTrack_projectId_trackingSequence_idx" ON "RequirementValueTrack"("projectId", "trackingSequence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 状态文案迁移：未观测 → 待观测
UPDATE "Project" SET "valueTrackStatus" = '待观测' WHERE "valueTrackStatus" = '未观测';
