-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dingtalkUserId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "avatarUrl" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "roleType" TEXT NOT NULL DEFAULT 'MEMBER',
    "title" TEXT,
    "joinedAt" DATETIME,
    "contractRenewAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dingtalkDeptId" TEXT,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MenuPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoleMenuPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleType" TEXT NOT NULL,
    "menuPermissionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApprovalInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "currentApproverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApprovalTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "comment" TEXT,
    "actedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnnualGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goalLevel" TEXT NOT NULL,
    "parentId" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "ownerId" TEXT,
    "targetValue" REAL NOT NULL,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "weight" REAL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "riskStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "approvedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "GoalProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT NOT NULL,
    "updaterId" TEXT NOT NULL,
    "progressDate" DATETIME NOT NULL,
    "completedValue" REAL NOT NULL,
    "cumulativeValue" REAL NOT NULL,
    "summary" TEXT,
    "riskNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QuarterlyWork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "workType" TEXT,
    "ownerId" TEXT NOT NULL,
    "teamId" TEXT,
    "departmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedOutcome" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "MonthlyWorkPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quarterlyWorkId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "expectedOutcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WeeklyWorkUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quarterlyWorkId" TEXT NOT NULL,
    "monthlyWorkPlanId" TEXT,
    "updaterId" TEXT NOT NULL,
    "updateDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextStep" TEXT,
    "riskNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RequirementValueTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectName" TEXT NOT NULL,
    "requirementName" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "teamId" TEXT,
    "background" TEXT,
    "expectedValue" TEXT NOT NULL,
    "actualValue" TEXT,
    "launchDate" DATETIME,
    "isAchieved" BOOLEAN,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "KpiTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KpiTemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" REAL NOT NULL,
    "scoringStandard" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PersonalKpi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "selfScore" REAL,
    "leaderScore" REAL,
    "managerScore" REAL,
    "finalScore" REAL,
    "selfComment" TEXT,
    "leaderComment" TEXT,
    "managerComment" TEXT,
    "submittedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PersonalKpiItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalKpiId" TEXT NOT NULL,
    "sourceTemplateItemId" TEXT,
    "relatedGoalId" TEXT,
    "relatedWorkId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" REAL NOT NULL,
    "target" TEXT,
    "scoringStandard" TEXT,
    "selfScore" REAL,
    "leaderScore" REAL,
    "managerScore" REAL,
    "finalScore" REAL,
    "selfComment" TEXT,
    "leaderComment" TEXT,
    "managerComment" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TodoItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_dingtalkUserId_key" ON "User"("dingtalkUserId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "User_roleType_idx" ON "User"("roleType");

-- CreateIndex
CREATE UNIQUE INDEX "Department_dingtalkDeptId_key" ON "Department"("dingtalkDeptId");

-- CreateIndex
CREATE INDEX "Team_departmentId_idx" ON "Team"("departmentId");

-- CreateIndex
CREATE INDEX "Team_leaderId_idx" ON "Team"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuPermission_code_key" ON "MenuPermission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoleMenuPermission_roleType_menuPermissionId_key" ON "RoleMenuPermission"("roleType", "menuPermissionId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_targetType_targetId_idx" ON "ApprovalInstance"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ApprovalInstance_currentApproverId_idx" ON "ApprovalInstance"("currentApproverId");

-- CreateIndex
CREATE INDEX "ApprovalTask_instanceId_idx" ON "ApprovalTask"("instanceId");

-- CreateIndex
CREATE INDEX "ApprovalTask_approverId_idx" ON "ApprovalTask"("approverId");

-- CreateIndex
CREATE INDEX "AnnualGoal_year_quarter_idx" ON "AnnualGoal"("year", "quarter");

-- CreateIndex
CREATE INDEX "AnnualGoal_departmentId_teamId_idx" ON "AnnualGoal"("departmentId", "teamId");

-- CreateIndex
CREATE INDEX "AnnualGoal_ownerId_idx" ON "AnnualGoal"("ownerId");

-- CreateIndex
CREATE INDEX "GoalProgress_goalId_idx" ON "GoalProgress"("goalId");

-- CreateIndex
CREATE INDEX "GoalProgress_updaterId_idx" ON "GoalProgress"("updaterId");

-- CreateIndex
CREATE INDEX "QuarterlyWork_year_quarter_idx" ON "QuarterlyWork"("year", "quarter");

-- CreateIndex
CREATE INDEX "QuarterlyWork_ownerId_idx" ON "QuarterlyWork"("ownerId");

-- CreateIndex
CREATE INDEX "QuarterlyWork_departmentId_teamId_idx" ON "QuarterlyWork"("departmentId", "teamId");

-- CreateIndex
CREATE INDEX "MonthlyWorkPlan_quarterlyWorkId_idx" ON "MonthlyWorkPlan"("quarterlyWorkId");

-- CreateIndex
CREATE INDEX "WeeklyWorkUpdate_quarterlyWorkId_idx" ON "WeeklyWorkUpdate"("quarterlyWorkId");

-- CreateIndex
CREATE INDEX "WeeklyWorkUpdate_monthlyWorkPlanId_idx" ON "WeeklyWorkUpdate"("monthlyWorkPlanId");

-- CreateIndex
CREATE INDEX "WeeklyWorkUpdate_updaterId_idx" ON "WeeklyWorkUpdate"("updaterId");

-- CreateIndex
CREATE INDEX "RequirementValueTrack_ownerId_idx" ON "RequirementValueTrack"("ownerId");

-- CreateIndex
CREATE INDEX "RequirementValueTrack_teamId_idx" ON "RequirementValueTrack"("teamId");

-- CreateIndex
CREATE INDEX "KpiTemplateItem_templateId_idx" ON "KpiTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "PersonalKpi_year_quarter_idx" ON "PersonalKpi"("year", "quarter");

-- CreateIndex
CREATE INDEX "PersonalKpi_userId_idx" ON "PersonalKpi"("userId");

-- CreateIndex
CREATE INDEX "PersonalKpi_teamId_idx" ON "PersonalKpi"("teamId");

-- CreateIndex
CREATE INDEX "PersonalKpiItem_personalKpiId_idx" ON "PersonalKpiItem"("personalKpiId");

-- CreateIndex
CREATE INDEX "PersonalKpiItem_relatedGoalId_idx" ON "PersonalKpiItem"("relatedGoalId");

-- CreateIndex
CREATE INDEX "PersonalKpiItem_relatedWorkId_idx" ON "PersonalKpiItem"("relatedWorkId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_targetType_targetId_idx" ON "Notification"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "TodoItem_userId_idx" ON "TodoItem"("userId");

-- CreateIndex
CREATE INDEX "TodoItem_targetType_targetId_idx" ON "TodoItem"("targetType", "targetId");
