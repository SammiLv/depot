import Database from "better-sqlite3";

const db = new Database("db/dev.db");
db.exec("DROP TABLE IF EXISTS new_AnnualGoalPlan");
db.exec("DROP TABLE IF EXISTS new_AnnualGoalMetric");
db.exec("DROP TABLE IF EXISTS new_AnnualGoalMetricAssignment");
db.exec("DROP TABLE IF EXISTS new_AnnualGoalQuarterTarget");
console.log(
  "Remaining new_*:",
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'new_%'")
    .all(),
);
db.close();
