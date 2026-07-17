PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_OrgPermissionGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "abilityKey" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT 'ROLE',
    "roleType" TEXT,
    "userId" TEXT,
    "orgNodeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_OrgPermissionGrant" (
  "id", "moduleKey", "abilityKey", "scopeType", "subjectType", "roleType", "userId", "orgNodeId", "isActive", "createdAt", "updatedAt"
)
SELECT
  "id", "moduleKey", "abilityKey", "scopeType", 'ROLE', "roleType", NULL, "orgNodeId", "isActive", "createdAt", "updatedAt"
FROM "OrgPermissionGrant";

DROP TABLE "OrgPermissionGrant";
ALTER TABLE "new_OrgPermissionGrant" RENAME TO "OrgPermissionGrant";

CREATE INDEX "OrgPermissionGrant_moduleKey_abilityKey_subjectType_roleType_isActive_idx" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "roleType", "isActive");
CREATE INDEX "OrgPermissionGrant_moduleKey_abilityKey_subjectType_userId_isActive_idx" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "userId", "isActive");
CREATE INDEX "OrgPermissionGrant_subjectType_roleType_idx" ON "OrgPermissionGrant"("subjectType", "roleType");
CREATE INDEX "OrgPermissionGrant_subjectType_userId_idx" ON "OrgPermissionGrant"("subjectType", "userId");
CREATE INDEX "OrgPermissionGrant_orgNodeId_idx" ON "OrgPermissionGrant"("orgNodeId");
CREATE UNIQUE INDEX "OrgPermissionGrant_moduleKey_abilityKey_scopeType_subjectType_roleType_userId_orgNodeId_key" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "scopeType", "subjectType", "roleType", "userId", "orgNodeId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
