-- Compatibility baseline for databases created exclusively through migrations.
-- Existing environments may already have this table from an earlier db push,
-- so every statement must remain safe when this migration is applied later.
CREATE TABLE IF NOT EXISTS "OrgPermissionGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "abilityKey" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "orgNodeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_roleType_isActive_idx"
ON "OrgPermissionGrant"("moduleKey", "abilityKey", "roleType", "isActive");

CREATE INDEX IF NOT EXISTS "OrgPermissionGrant_orgNodeId_idx"
ON "OrgPermissionGrant"("orgNodeId");

CREATE UNIQUE INDEX IF NOT EXISTS "OrgPermissionGrant_moduleKey_abilityKey_scopeType_roleType_orgNodeId_key"
ON "OrgPermissionGrant"("moduleKey", "abilityKey", "scopeType", "roleType", "orgNodeId");
