import { syncParallelApprovalStepsForInProgressKpis } from "@/server/kpi/sync-parallel-approval-steps";
import { prisma } from "@/server/db/prisma";

async function main() {
  const results = await syncParallelApprovalStepsForInProgressKpis();
  const added = results.filter((result) => result.added > 0);
  const repaired = results.filter((result) => result.repaired);
  console.log(` scanned ${results.length} in-progress KPI(s)`);
  console.log(` repaired stalled approval steps for ${repaired.length} KPI(s)`);
  console.log(` added parallel approvers for ${added.length} KPI(s)`);
  for (const result of [...repaired, ...added]) {
    console.log(`  - ${result.personalKpiId}: repaired=${result.repaired} added=${result.added}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
