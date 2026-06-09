-- CreateTable
CREATE TABLE "AnnualGoalPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoleAnnualGoalPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleType" TEXT NOT NULL,
    "annualGoalPermissionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleAnnualGoalPermission_annualGoalPermissionId_fkey" FOREIGN KEY ("annualGoalPermissionId") REFERENCES "AnnualGoalPermission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualGoalPermission_code_key" ON "AnnualGoalPermission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAnnualGoalPermission_roleType_annualGoalPermissionId_key" ON "RoleAnnualGoalPermission"("roleType", "annualGoalPermissionId");

-- CreateIndex
CREATE INDEX "RoleAnnualGoalPermission_annualGoalPermissionId_idx" ON "RoleAnnualGoalPermission"("annualGoalPermissionId");
