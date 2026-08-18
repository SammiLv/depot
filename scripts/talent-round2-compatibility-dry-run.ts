import { prisma } from "../src/server/db/prisma";
import { legacyRestrictionControlledTypes } from "../src/server/talent/incident-engine";

async function main() {
const restrictions = await prisma.$queryRawUnsafe<Array<{ id: string; restrictionType: string }>>('SELECT id, restrictionType FROM "IncidentRestriction"');

const restrictionReport = restrictions.map((row) => ({
  id: row.id,
  legacyType: row.restrictionType,
  currentControlledType: null,
  targetControlledTypes: legacyRestrictionControlledTypes(row.restrictionType),
}));
const report = {
  mode: "dry-run",
  generatedAt: new Date().toISOString(),
  restrictions: {
    total: restrictionReport.length,
    combinedRowsToSplit: restrictionReport.filter((row) => row.targetControlledTypes.length > 1).length,
    unmapped: restrictionReport.filter((row) => row.targetControlledTypes.length === 0),
    rows: restrictionReport,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
await prisma.$disconnect();
}

main().catch(async (error) => {
  await prisma.$disconnect();
  throw error;
});
