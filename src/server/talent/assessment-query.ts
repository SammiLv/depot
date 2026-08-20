import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import { resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { kpiAbilityKeys, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getBusinessAssessmentPageData(
  viewer: Viewer,
  options?: { selectedYear?: number; selectedQuarter?: number },
) {
  const manageCoverage = await resolvePermissionCoverage(viewer, orgPermissionModuleKeys.kpi, kpiAbilityKeys.manageBusinessAssessment);
  const viewerDepartmentOrgNodeId = await findNearestDepartmentOrgNodeId(viewer.orgNodeId);
  const now = new Date();
  const filterYear = options?.selectedYear ?? now.getFullYear();
  const filterAllQuarters = options?.selectedQuarter === 0;
  const filterQuarter = filterAllQuarters ? null : (options?.selectedQuarter ?? Math.floor(now.getMonth() / 3) + 1);
  const [departments, storedRule] = await Promise.all([
    viewer.roleType === "ADMIN" || viewerDepartmentOrgNodeId === null
      ? prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT", id: viewerDepartmentOrgNodeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
  if (departments.length === 0) return { departments: [], teams: [], cycles: [], subjects: [], results: [], summaries: [], users: [], imports: [], rules: [], ruleSubjects: [], standards: [], rule, canManage: manageCoverage.hasPermission };
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
  const periodWhere = { year: filterYear, ...(filterQuarter == null ? {} : { quarter: filterQuarter }) };
  const [cycles, rules] = await Promise.all([
    prisma.businessAssessmentCycle.findMany({
      where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, ...periodWhere, deletedAt: null },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
    prisma.businessAssessmentRule.findMany({
      where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, ...periodWhere, deletedAt: null },
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
    prisma.talentImportBatch.findMany({ where: { importType: "BUSINESS_ASSESSMENT", departmentOrgNodeId: { in: departments.map((row) => row.id) }, ...periodWhere, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.businessAssessmentPassingStandard.findMany({
      where: { ruleSubjectId: { in: ruleSubjects.map((row) => row.id) } },
      orderBy: [{ ruleSubjectId: "asc" }, { scopeType: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { departments, teams, cycles, subjects, results, summaries, users: configUsers, imports, rules, ruleSubjects, standards, rule, canManage: manageCoverage.hasPermission };
}
