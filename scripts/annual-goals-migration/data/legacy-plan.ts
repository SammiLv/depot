import Database from "better-sqlite3";
import path from "node:path";

export type LegacyPlanRow = {
  id: string;
  year: number;
  name: string;
  ownerType: string;
  ownerOrgNodeId: string | null;
  departmentOrgNodeId: string | null;
  isActive: number | boolean;
  approvalStatus: string;
  deletedAt: string | null;
};

export function resolveMigrationDatabasePath() {
  const configured = process.env.DATABASE_URL;
  if (!configured || configured === "file:./dev.db") {
    return path.resolve(process.cwd(), "db/dev.db");
  }
  if (configured.startsWith("file:")) {
    const rawPath = configured.slice("file:".length);
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  throw new Error("legacy plan loader 仅支持 SQLite file: DATABASE_URL");
}

export type LegacyMetricRow = {
  id: string;
  planId: string;
  metricCode: string;
  name: string;
  sourceMetricId: string | null;
  deletedAt: string | null;
};

export function loadLegacyPlansById() {
  const db = new Database(resolveMigrationDatabasePath(), { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, year, name, ownerType, ownerOrgNodeId, departmentOrgNodeId,
              isActive, approvalStatus, deletedAt
       FROM AnnualGoalPlan`,
    )
    .all() as LegacyPlanRow[];
  db.close();
  return new Map(rows.map((row) => [row.id, row]));
}

export function loadLegacyMetricsById() {
  const db = new Database(resolveMigrationDatabasePath(), { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, planId, metricCode, name, sourceMetricId, deletedAt
       FROM AnnualGoalMetric`,
    )
    .all() as LegacyMetricRow[];
  db.close();
  return new Map(rows.map((row) => [row.id, row]));
}

export function getLegacyMetric(legacyById: Map<string, LegacyMetricRow>, metricId: string | null | undefined) {
  if (!metricId) return null;
  return legacyById.get(metricId) ?? null;
}

export function getLegacyPlan(legacyById: Map<string, LegacyPlanRow>, planId: string | null | undefined) {
  if (!planId) return null;
  return legacyById.get(planId) ?? null;
}

export function mapLegacyPlanStatus(plan: Pick<LegacyPlanRow, "isActive" | "approvalStatus">) {
  const isActive = plan.isActive === true || plan.isActive === 1;
  if (!isActive) return "CLOSED";
  if (plan.approvalStatus === "APPROVED") return "ACTIVE";
  return "DRAFT";
}
