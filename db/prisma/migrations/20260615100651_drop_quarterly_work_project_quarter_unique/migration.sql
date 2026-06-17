-- DropIndex
DROP INDEX "QuarterlyWork_projectId_year_quarter_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoleAnnualGoalPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
    "roleType" TEXT NOT NULL,
    "annualGoalPermissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleAnnualGoalPermission_annualGoalPermissionId_fkey" FOREIGN KEY ("annualGoalPermissionId") REFERENCES "AnnualGoalPermission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RoleAnnualGoalPermission" ("allowed", "annualGoalPermissionId", "createdAt", "departmentOrgNodeId", "id", "roleType", "scopeType", "updatedAt") SELECT "allowed", "annualGoalPermissionId", "createdAt", "departmentOrgNodeId", "id", "roleType", "scopeType", "updatedAt" FROM "RoleAnnualGoalPermission";
DROP TABLE "RoleAnnualGoalPermission";
ALTER TABLE "new_RoleAnnualGoalPermission" RENAME TO "RoleAnnualGoalPermission";
CREATE INDEX "RoleAnnualGoalPermission_scopeType_departmentOrgNodeId_idx" ON "RoleAnnualGoalPermission"("scopeType", "departmentOrgNodeId");
CREATE INDEX "RoleAnnualGoalPermission_annualGoalPermissionId_idx" ON "RoleAnnualGoalPermission"("annualGoalPermissionId");
CREATE UNIQUE INDEX "RoleAnnualGoalPermission_scopeType_departmentOrgNodeId_roleType_annualGoalPermissionId_key" ON "RoleAnnualGoalPermission"("scopeType", "departmentOrgNodeId", "roleType", "annualGoalPermissionId");
CREATE TABLE "new_RoleMenuPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "departmentOrgNodeId" TEXT NOT NULL DEFAULT '',
    "roleType" TEXT NOT NULL,
    "menuPermissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RoleMenuPermission" ("allowed", "createdAt", "departmentOrgNodeId", "id", "menuPermissionId", "roleType", "scopeType", "updatedAt") SELECT "allowed", "createdAt", "departmentOrgNodeId", "id", "menuPermissionId", "roleType", "scopeType", "updatedAt" FROM "RoleMenuPermission";
DROP TABLE "RoleMenuPermission";
ALTER TABLE "new_RoleMenuPermission" RENAME TO "RoleMenuPermission";
CREATE INDEX "RoleMenuPermission_scopeType_departmentOrgNodeId_idx" ON "RoleMenuPermission"("scopeType", "departmentOrgNodeId");
CREATE INDEX "RoleMenuPermission_menuPermissionId_idx" ON "RoleMenuPermission"("menuPermissionId");
CREATE UNIQUE INDEX "RoleMenuPermission_scopeType_departmentOrgNodeId_roleType_menuPermissionId_key" ON "RoleMenuPermission"("scopeType", "departmentOrgNodeId", "roleType", "menuPermissionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
