import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { kpiRatingBandOptions, talentGradeThresholdOptions } from "./configured-level-options";
import { parseIncidentLevelOptions } from "./incident-level-config";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getTalentDecisionRuleConfiguration(currentUser: Viewer) {
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  const departments = await prisma.orgNode.findMany({
    where: authorizedOrgNodeIds === null ? { nodeType: "DEPARTMENT" } : { nodeType: "DEPARTMENT", id: { in: authorizedOrgNodeIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const departmentIds = departments.map((row) => row.id);
  const [kpiRuleVersions, incidentRuleVersions, talentReviewTemplates, restrictionRules, restrictionFieldDefinitions] = await Promise.all([
    prisma.kpiRatingRuleVersion.findMany({ where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null }, orderBy: [{ createdAt: "desc" }] }),
    prisma.workIncidentRuleVersion.findMany({ where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null }, orderBy: [{ createdAt: "desc" }] }),
    prisma.talentReviewTemplateVersion.findMany({ where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null }, orderBy: [{ createdAt: "desc" }] }),
    prisma.talentRestrictionRule.findMany({
      where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    }),
    prisma.talentRuleFieldDefinition.findMany({
      where: { isEnabled: true },
      orderBy: [{ source: "asc" }, { displayName: "asc" }],
    }),
  ]);
  const restrictionRuleIds = restrictionRules.map((rule) => rule.id);
  const restrictionRuleRevisions = restrictionRuleIds.length
    ? await prisma.talentRestrictionRuleRevision.findMany({
        where: { ruleId: { in: restrictionRuleIds } },
        orderBy: [{ ruleId: "asc" }, { revisionNo: "desc" }],
      })
    : [];
  const restrictionRevisionIds = restrictionRuleRevisions.map((revision) => revision.id);
  const restrictionUserIds = [...new Set([
    ...restrictionRules.map((rule) => rule.createdById),
    ...restrictionRuleRevisions.flatMap((revision) => [revision.createdById, revision.publishedById].filter((id): id is string => Boolean(id))),
  ])];
  const [kpiBands, talentReviewThresholds, restrictionRuleConditions, restrictionRuleOutputs, restrictionRuleUsers] = await Promise.all([
    prisma.kpiRatingBand.findMany({ where: { ruleVersionId: { in: kpiRuleVersions.map((row) => row.id) } }, orderBy: [{ ruleVersionId: "asc" }, { sortOrder: "asc" }] }),
    prisma.talentGradeThreshold.findMany({ where: { templateVersionId: { in: talentReviewTemplates.map((row) => row.id) } }, orderBy: [{ templateVersionId: "asc" }, { sortOrder: "asc" }] }),
    restrictionRevisionIds.length
      ? prisma.talentRestrictionRuleCondition.findMany({ where: { revisionId: { in: restrictionRevisionIds } } })
      : Promise.resolve([]),
    restrictionRevisionIds.length
      ? prisma.talentRestrictionRuleOutput.findMany({ where: { revisionId: { in: restrictionRevisionIds } }, orderBy: [{ revisionId: "asc" }, { sortOrder: "asc" }] })
      : Promise.resolve([]),
    restrictionUserIds.length
      ? prisma.user.findMany({ where: { id: { in: restrictionUserIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const incidentLevelOptionsByDepartment = departments.map((department) => {
    const activeVersion = incidentRuleVersions
      .filter((version) => version.departmentOrgNodeId === department.id && version.status === "ACTIVE")
      .sort((left, right) => (right.publishedAt?.getTime() ?? right.updatedAt.getTime()) - (left.publishedAt?.getTime() ?? left.updatedAt.getTime()))[0];
    return {
      departmentOrgNodeId: department.id,
      ruleVersionId: activeVersion?.id ?? null,
      options: activeVersion ? parseIncidentLevelOptions(activeVersion.matrixJson) : [],
    };
  });
  const kpiLevelOptionsByDepartment = departments.map((department) => {
    const activeVersion = kpiRuleVersions
      .filter((version) => version.departmentOrgNodeId === department.id && version.status === "ACTIVE")
      .sort((left, right) => (right.publishedAt?.getTime() ?? right.updatedAt.getTime()) - (left.publishedAt?.getTime() ?? left.updatedAt.getTime()))[0];
    return {
      departmentOrgNodeId: department.id,
      ruleVersionId: activeVersion?.id ?? null,
      options: activeVersion ? kpiRatingBandOptions(kpiBands.filter((band) => band.ruleVersionId === activeVersion.id)) : [],
    };
  });
  const talentReviewLevelOptionsByDepartment = departments.map((department) => {
    const activeTemplate = talentReviewTemplates
      .filter((template) => template.departmentOrgNodeId === department.id && template.status === "ACTIVE")
      .sort((left, right) => (right.publishedAt?.getTime() ?? right.updatedAt.getTime()) - (left.publishedAt?.getTime() ?? left.updatedAt.getTime()))[0];
    return {
      departmentOrgNodeId: department.id,
      templateVersionId: activeTemplate?.id ?? null,
      options: activeTemplate ? talentGradeThresholdOptions(talentReviewThresholds.filter((threshold) => threshold.templateVersionId === activeTemplate.id)) : [],
    };
  });
  return {
    departments,
    kpiRuleVersions,
    kpiBands,
    incidentRuleVersions,
    incidentLevelOptionsByDepartment,
    kpiLevelOptionsByDepartment,
    talentReviewLevelOptionsByDepartment,
    restrictionRules,
    restrictionRuleRevisions,
    restrictionRuleConditions,
    restrictionRuleOutputs,
    restrictionFieldDefinitions,
    restrictionRuleUsers,
  };
}
