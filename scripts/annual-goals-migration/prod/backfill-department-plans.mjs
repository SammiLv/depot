import Database from "better-sqlite3";

const db = new Database("db/dev.db");
const result = db
  .prepare(
    `UPDATE AnnualGoalPlan
     SET departmentOrgNodeId = ownerOrgNodeId,
         status = CASE
           WHEN isActive = 0 THEN 'CLOSED'
           WHEN approvalStatus = 'APPROVED' THEN 'ACTIVE'
           ELSE 'DRAFT'
         END
     WHERE ownerType = 'DEPARTMENT'
       AND deletedAt IS NULL
       AND departmentOrgNodeId IS NULL
       AND ownerOrgNodeId IS NOT NULL`,
  )
  .run();
console.log(`Updated ${result.changes} department plan(s)`);
db.close();
