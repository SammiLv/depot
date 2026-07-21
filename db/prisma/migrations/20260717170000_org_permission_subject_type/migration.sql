PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "OrgPermissionGrant" (
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

CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_subjectType_roleType_isActive_idx" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "roleType", "isActive");
CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_subjectType_userId_isActive_idx" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "subjectType", "userId", "isActive");
CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_subjectType_roleType_idx" ON "OrgPermissionGrant"("subjectType", "roleType");
CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_subjectType_userId_idx" ON "OrgPermissionGrant"("subjectType", "userId");
CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_orgNodeId_idx" ON "OrgPermissionGrant"("orgNodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_scopeType_subjectType_roleType_userId_orgNodeId_key" ON "OrgPermissionGrant"("moduleKey", "abilityKey", "scopeType", "subjectType", "roleType", "userId", "orgNodeId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
