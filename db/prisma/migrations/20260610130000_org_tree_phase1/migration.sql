-- CreateTable
CREATE TABLE "OrgNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dingtalkDeptId" TEXT,
    "name" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrgClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ancestorId" TEXT NOT NULL,
    "descendantId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "orgNodeId" TEXT;

-- AlterTable
ALTER TABLE "AnnualGoalPlan" ADD COLUMN "ownerOrgNodeId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "orgNodeId" TEXT;

-- AlterTable
ALTER TABLE "QuarterlyWork" ADD COLUMN "orgNodeId" TEXT;

-- AlterTable
ALTER TABLE "PersonalKpi" ADD COLUMN "orgNodeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrgNode_dingtalkDeptId_key" ON "OrgNode"("dingtalkDeptId");

-- CreateIndex
CREATE INDEX "OrgNode_nodeType_idx" ON "OrgNode"("nodeType");

-- CreateIndex
CREATE INDEX "OrgNode_parentId_idx" ON "OrgNode"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgClosure_ancestorId_descendantId_key" ON "OrgClosure"("ancestorId", "descendantId");

-- CreateIndex
CREATE INDEX "OrgClosure_ancestorId_idx" ON "OrgClosure"("ancestorId");

-- CreateIndex
CREATE INDEX "OrgClosure_descendantId_idx" ON "OrgClosure"("descendantId");

-- CreateIndex
CREATE INDEX "OrgClosure_ancestorId_depth_idx" ON "OrgClosure"("ancestorId", "depth");

-- CreateIndex
CREATE INDEX "OrgClosure_descendantId_depth_idx" ON "OrgClosure"("descendantId", "depth");

-- CreateIndex
CREATE INDEX "User_orgNodeId_idx" ON "User"("orgNodeId");

-- CreateIndex
CREATE INDEX "AnnualGoalPlan_ownerOrgNodeId_idx" ON "AnnualGoalPlan"("ownerOrgNodeId");

-- CreateIndex
CREATE INDEX "Project_orgNodeId_idx" ON "Project"("orgNodeId");

-- CreateIndex
CREATE INDEX "QuarterlyWork_orgNodeId_idx" ON "QuarterlyWork"("orgNodeId");

-- CreateIndex
CREATE INDEX "PersonalKpi_orgNodeId_idx" ON "PersonalKpi"("orgNodeId");

-- Backfill root org node
INSERT INTO "OrgNode" ("id", "dingtalkDeptId", "name", "nodeType", "parentId", "createdAt", "updatedAt")
VALUES ('org_root_legacy', '__root__', '组织根节点', 'ROOT', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Backfill department org nodes
INSERT INTO "OrgNode" ("id", "dingtalkDeptId", "name", "nodeType", "parentId", "createdAt", "updatedAt")
SELECT 'org_dept_' || "id", "dingtalkDeptId", "name", 'DEPARTMENT', 'org_root_legacy', "createdAt", "updatedAt"
FROM "Department";

-- Backfill team org nodes
INSERT INTO "OrgNode" ("id", "dingtalkDeptId", "name", "nodeType", "parentId", "createdAt", "updatedAt")
SELECT 'org_team_' || "id", "dingtalkDeptId", "name", 'TEAM', 'org_dept_' || "departmentId", "createdAt", "updatedAt"
FROM "Team";

-- Backfill org closure self rows
INSERT INTO "OrgClosure" ("id", "ancestorId", "descendantId", "depth", "createdAt")
SELECT 'org_closure_self_' || "id", "id", "id", 0, CURRENT_TIMESTAMP
FROM "OrgNode";

-- Backfill root -> department closure rows
INSERT INTO "OrgClosure" ("id", "ancestorId", "descendantId", "depth", "createdAt")
SELECT 'org_closure_root_dept_' || "id", 'org_root_legacy', 'org_dept_' || "id", 1, CURRENT_TIMESTAMP
FROM "Department";

-- Backfill root -> team closure rows
INSERT INTO "OrgClosure" ("id", "ancestorId", "descendantId", "depth", "createdAt")
SELECT 'org_closure_root_team_' || "id", 'org_root_legacy', 'org_team_' || "id", 2, CURRENT_TIMESTAMP
FROM "Team";

-- Backfill department -> team closure rows
INSERT INTO "OrgClosure" ("id", "ancestorId", "descendantId", "depth", "createdAt")
SELECT 'org_closure_dept_team_' || "id", 'org_dept_' || "departmentId", 'org_team_' || "id", 1, CURRENT_TIMESTAMP
FROM "Team";

-- Backfill user org node ownership
UPDATE "User"
SET "orgNodeId" = CASE
    WHEN "roleType" = 'ADMIN' THEN 'org_root_legacy'
    WHEN "teamId" IS NOT NULL THEN 'org_team_' || "teamId"
    WHEN "departmentId" IS NOT NULL THEN 'org_dept_' || "departmentId"
    ELSE NULL
END;

-- Backfill annual goal plan owner org nodes
UPDATE "AnnualGoalPlan"
SET "ownerOrgNodeId" = CASE
    WHEN "ownerType" = 'TEAM' AND "teamId" IS NOT NULL THEN 'org_team_' || "teamId"
    WHEN "departmentId" IS NOT NULL THEN 'org_dept_' || "departmentId"
    ELSE NULL
END;

-- Backfill project org nodes
UPDATE "Project"
SET "orgNodeId" = CASE
    WHEN "teamId" IS NOT NULL THEN 'org_team_' || "teamId"
    WHEN "departmentId" IS NOT NULL THEN 'org_dept_' || "departmentId"
    ELSE NULL
END;

-- Backfill quarterly work org nodes
UPDATE "QuarterlyWork"
SET "orgNodeId" = CASE
    WHEN "teamId" IS NOT NULL THEN 'org_team_' || "teamId"
    WHEN "departmentId" IS NOT NULL THEN 'org_dept_' || "departmentId"
    ELSE NULL
END;

-- Backfill personal KPI org nodes
UPDATE "PersonalKpi"
SET "orgNodeId" = CASE
    WHEN "teamId" IS NOT NULL THEN 'org_team_' || "teamId"
    ELSE (
        SELECT "orgNodeId"
        FROM "User"
        WHERE "User"."id" = "PersonalKpi"."userId"
    )
END;