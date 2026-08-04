CREATE UNIQUE INDEX IF NOT EXISTS "AnnualGoalPlan_active_department_year_key"
ON "AnnualGoalPlan" ("departmentOrgNodeId", "year")
WHERE "deletedAt" IS NULL AND "departmentOrgNodeId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AnnualGoalAssignment_active_team_metric_key"
ON "AnnualGoalMetricAssignment" ("teamOrgNodeId", "metricId")
WHERE "deletedAt" IS NULL AND "metricId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AnnualGoalAssignment_active_team_source_key"
ON "AnnualGoalMetricAssignment" ("teamOrgNodeId", "sourceMetricId")
WHERE "deletedAt" IS NULL AND "sourceMetricId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AnnualGoalQuarter_active_metric_key"
ON "AnnualGoalQuarterTarget" ("metricId", "year", "quarter")
WHERE "deletedAt" IS NULL AND "metricId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AnnualGoalQuarter_active_source_key"
ON "AnnualGoalQuarterTarget" ("sourceMetricId", "year", "quarter")
WHERE "deletedAt" IS NULL AND "sourceMetricId" IS NOT NULL;
