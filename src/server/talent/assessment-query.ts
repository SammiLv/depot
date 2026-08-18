import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getBusinessAssessmentPageData(viewer: Viewer) {
  const [viewCoverage, manageCoverage] = await Promise.all([
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewBusinessAssessment),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.manageBusinessAssessment),
  ]);
  const orgNodeIds = await resolveAuthorizedOrgNodeIds(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewBusinessAssessment);
  const [departments, storedRule] = await Promise.all([
    prisma.orgNode.findMany({
      where: { nodeType: "DEPARTMENT", ...(orgNodeIds === null ? {} : { id: { in: orgNodeIds } }) },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    prisma.businessAssessmentRule.findUnique({ where: { scopeKey: "GLOBAL" } }),
  ]);
  const rule = storedRule ?? {
    id: "DEFAULT",
    scopeKey: "GLOBAL",
    totalKpiScore: 6,
    allocationMode: "EQUAL",
    initialPassPercent: 100,
    retestPassPercent: 50,
    finalFailPercent: 0,
    defaultScoringType: "NUMERIC" as const,
    passingNumericScore: 80,
    requiredGradeCode: "A",
    updatedById: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  if (!viewCoverage.hasPermission) return { departments: [], teams: [], cycles: [], subjects: [], results: [], summaries: [], users: [], imports: [], rules: [], ruleSubjects: [], standards: [], rule, canManage: manageCoverage.hasPermission };
  const coveredOrgNodeIds = [...new Set((await Promise.all(departments.map((row) => getDescendantOrgNodeIds(row.id)))).flat())];
  const [teams, configUsers] = await Promise.all([
    prisma.orgNode.findMany({
      where: { id: { in: coveredOrgNodeIds }, nodeType: "TEAM" },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { orgNodeId: { in: coveredOrgNodeIds }, roleType: { in: ["TEAM_LEADER", "MEMBER"] }, isActive: true, deletedAt: null },
      select: { id: true, name: true, orgNodeId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const [cycles, rules] = await Promise.all([
    prisma.businessAssessmentCycle.findMany({
      where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, deletedAt: null },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
    prisma.businessAssessmentRule.findMany({
      where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, year: { not: null }, quarter: { not: null }, deletedAt: null },
      orderBy: [{ year: "desc" }, { quarter: "desc" }, { version: "desc" }],
    }),
  ]);
  const cycleIds = cycles.map((row) => row.id);
  const ruleIds = rules.map((row) => row.id);
  const ruleSubjects = await prisma.businessAssessmentRuleSubject.findMany({ where: { ruleId: { in: ruleIds } }, orderBy: [{ ruleId: "asc" }, { sortOrder: "asc" }] });
  const [subjects, results, summaries, imports, standards] = await Promise.all([
    prisma.businessAssessmentSubject.findMany({ where: { cycleId: { in: cycleIds } }, orderBy: [{ cycleId: "asc" }, { sortOrder: "asc" }] }),
    prisma.businessAssessmentResult.findMany({ where: { cycleId: { in: cycleIds } }, orderBy: [{ cycleId: "asc" }, { userId: "asc" }, { createdAt: "asc" }] }),
    prisma.businessAssessmentSummary.findMany({ where: { cycleId: { in: cycleIds } }, orderBy: { earnedScore: "desc" } }),
    prisma.talentImportBatch.findMany({ where: { importType: "BUSINESS_ASSESSMENT", departmentOrgNodeId: { in: departments.map((row) => row.id) }, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.businessAssessmentPassingStandard.findMany({
      where: { ruleSubjectId: { in: ruleSubjects.map((row) => row.id) } },
      orderBy: [{ ruleSubjectId: "asc" }, { scopeType: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { departments, teams, cycles, subjects, results, summaries, users: configUsers, imports, rules, ruleSubjects, standards, rule, canManage: manageCoverage.hasPermission };
}
