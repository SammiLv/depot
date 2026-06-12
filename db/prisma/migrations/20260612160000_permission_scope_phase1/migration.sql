-- Redefine RoleMenuPermission with scope fields and explicit allowed values
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoleMenuPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
    "roleType" TEXT NOT NULL,
    "menuPermissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RoleMenuPermission" ("id", "scopeType", "departmentOrgNodeId", "roleType", "menuPermissionId", "allowed", "createdAt", "updatedAt")
SELECT "id", 'SYSTEM', '', "roleType", "menuPermissionId", true, "createdAt", "createdAt"
FROM "RoleMenuPermission";
DROP TABLE "RoleMenuPermission";
ALTER TABLE "new_RoleMenuPermission" RENAME TO "RoleMenuPermission";
CREATE UNIQUE INDEX "RoleMenuPermission_scopeType_departmentOrgNodeId_roleType_menuPermissionId_key" ON "RoleMenuPermission"("scopeType", "departmentOrgNodeId", "roleType", "menuPermissionId");
CREATE INDEX "RoleMenuPermission_scopeType_departmentOrgNodeId_idx" ON "RoleMenuPermission"("scopeType", "departmentOrgNodeId");
CREATE INDEX "RoleMenuPermission_menuPermissionId_idx" ON "RoleMenuPermission"("menuPermissionId");

-- Redefine RoleAnnualGoalPermission with scope fields and explicit allowed values
CREATE TABLE "new_RoleAnnualGoalPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
    "roleType" TEXT NOT NULL,
    "annualGoalPermissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleAnnualGoalPermission_annualGoalPermissionId_fkey" FOREIGN KEY ("annualGoalPermissionId") REFERENCES "AnnualGoalPermission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RoleAnnualGoalPermission" ("id", "scopeType", "departmentOrgNodeId", "roleType", "annualGoalPermissionId", "allowed", "createdAt", "updatedAt")
SELECT "id", 'SYSTEM', '', "roleType", "annualGoalPermissionId", true, "createdAt", "createdAt"
FROM "RoleAnnualGoalPermission";
DROP TABLE "RoleAnnualGoalPermission";
ALTER TABLE "new_RoleAnnualGoalPermission" RENAME TO "RoleAnnualGoalPermission";
CREATE UNIQUE INDEX "RoleAnnualGoalPermission_scopeType_departmentOrgNodeId_roleType_annualGoalPermissionId_key" ON "RoleAnnualGoalPermission"("scopeType", "departmentOrgNodeId", "roleType", "annualGoalPermissionId");
CREATE INDEX "RoleAnnualGoalPermission_scopeType_departmentOrgNodeId_idx" ON "RoleAnnualGoalPermission"("scopeType", "departmentOrgNodeId");
CREATE INDEX "RoleAnnualGoalPermission_annualGoalPermissionId_idx" ON "RoleAnnualGoalPermission"("annualGoalPermissionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
