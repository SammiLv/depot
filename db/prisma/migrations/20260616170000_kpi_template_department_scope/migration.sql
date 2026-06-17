-- AlterTable
ALTER TABLE "KpiTemplate" ADD COLUMN "departmentOrgNodeId" TEXT;

-- Backfill department scope from existing org-node assignments
UPDATE "KpiTemplate"
SET "departmentOrgNodeId" = (
  SELECT CASE
    WHEN "OrgNode"."nodeType" = 'DEPARTMENT' THEN "OrgNode"."id"
    WHEN "OrgNode"."nodeType" = 'TEAM' THEN "OrgNode"."parentId"
    ELSE NULL
  END
  FROM "KpiTemplateAssignment"
  LEFT JOIN "OrgNode" ON "OrgNode"."id" = "KpiTemplateAssignment"."targetOrgNodeId"
  WHERE "KpiTemplateAssignment"."templateId" = "KpiTemplate"."id"
    AND "KpiTemplateAssignment"."targetType" = 'ORG_NODE'
  ORDER BY "KpiTemplateAssignment"."updatedAt" DESC, "KpiTemplateAssignment"."createdAt" DESC
  LIMIT 1
)
WHERE "departmentOrgNodeId" IS NULL;

UPDATE "KpiTemplate"
SET "departmentOrgNodeId" = ''
WHERE "departmentOrgNodeId" IS NULL;

CREATE TABLE "new_KpiTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateKey" TEXT NOT NULL,
    "departmentOrgNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "reviewComment" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

INSERT INTO "new_KpiTemplate" (
  "id",
  "templateKey",
  "departmentOrgNodeId",
  "name",
  "description",
  "status",
  "version",
  "isLatest",
  "isActive",
  "submittedAt",
  "approvedAt",
  "rejectedAt",
  "reviewComment",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  "id",
  "templateKey",
  "departmentOrgNodeId",
  "name",
  "description",
  "status",
  "version",
  "isLatest",
  "isActive",
  "submittedAt",
  "approvedAt",
  "rejectedAt",
  "reviewComment",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "KpiTemplate";

DROP TABLE "KpiTemplate";
ALTER TABLE "new_KpiTemplate" RENAME TO "KpiTemplate";

CREATE UNIQUE INDEX "KpiTemplate_templateKey_version_key" ON "KpiTemplate"("templateKey", "version");
CREATE INDEX "KpiTemplate_departmentOrgNodeId_status_isActive_idx" ON "KpiTemplate"("departmentOrgNodeId", "status", "isActive");
CREATE INDEX "KpiTemplate_templateKey_isLatest_idx" ON "KpiTemplate"("templateKey", "isLatest");
CREATE INDEX "KpiTemplate_status_isActive_idx" ON "KpiTemplate"("status", "isActive");
CREATE INDEX "KpiTemplate_deletedAt_idx" ON "KpiTemplate"("deletedAt");
