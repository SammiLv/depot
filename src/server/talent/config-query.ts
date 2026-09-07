import { prisma } from "@/server/db/prisma";
import type { RoleType } from "@prisma/client";
import { resolveAuthorizedOrgNodeIds } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { findNearestDepartmentOrgNodeId } from "@/server/organization/org-tree-utils";

type TalentConfigViewer = { id: string; roleType: RoleType; orgNodeId: string | null };

export async function getCareerConfiguration(currentUser: TalentConfigViewer) {
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig);
  const departmentWhere = authorizedOrgNodeIds === null ? { nodeType: "DEPARTMENT" as const } : { nodeType: "DEPARTMENT" as const, id: { in: authorizedOrgNodeIds } };
  const departments = await prisma.orgNode.findMany({ where: departmentWhere, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const departmentIds = departments.map((department) => department.id);
  const tracks = await prisma.careerTrack.findMany({ where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null }, orderBy: [{ departmentOrgNodeId: "asc" }, { sortOrder: "asc" }] });
  const trackIds = tracks.map((track) => track.id);
  const families = await prisma.jobFamily.findMany({ where: { careerTrackId: { in: trackIds }, deletedAt: null }, orderBy: [{ careerTrackId: "asc" }, { sortOrder: "asc" }] });
  const familyIds = families.map((family) => family.id);
  const roles = await prisma.jobRole.findMany({ where: { jobFamilyId: { in: familyIds }, deletedAt: null }, orderBy: [{ jobFamilyId: "asc" }, { sortOrder: "asc" }] });
  const roleIds = roles.map((role) => role.id);
  const [levelGroups, levels, salaryCaps, promotionPaths, users] = await Promise.all([
    prisma.jobLevelGroup.findMany({ where: { deletedAt: null }, orderBy: { rankOrder: "asc" } }),
    prisma.jobLevel.findMany({ where: { deletedAt: null }, orderBy: [{ displayOrder: "asc" }, { stepOrder: "asc" }] }),
    prisma.salaryCapConfig.findMany({ where: { departmentOrgNodeId: { in: departmentIds }, deletedAt: null }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
    prisma.promotionPath.findMany({ where: { jobRoleId: { in: roleIds }, deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { ...(authorizedOrgNodeIds === null ? {} : { orgNodeId: { in: authorizedOrgNodeIds } }), isActive: true, deletedAt: null }, select: { id: true, name: true, title: true, orgNodeId: true }, orderBy: { name: "asc" } }),
  ]);
  const profiles = await prisma.employeeTalentProfile.findMany({ where: { userId: { in: users.map((user) => user.id) }, deletedAt: null } });
  const departmentEntries = await Promise.all(users.map(async (user) => [user.id, await findNearestDepartmentOrgNodeId(user.orgNodeId)] as const));
  return { departments, tracks, families, roles, levelGroups, levels, salaryCaps, promotionPaths, users, profiles, departmentOrgNodeIdByUserId: Object.fromEntries(departmentEntries) as Record<string, string | null> };
}

export async function getCompetencyConfiguration(currentUser: TalentConfigViewer) {
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(currentUser, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig);
  const departments = await prisma.orgNode.findMany({ where: authorizedOrgNodeIds === null ? { nodeType: "DEPARTMENT" } : { nodeType: "DEPARTMENT", id: { in: authorizedOrgNodeIds } }, select: { id: true } });
  const tracks = await prisma.careerTrack.findMany({ where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, deletedAt: null }, select: { id: true } });
  const families = await prisma.jobFamily.findMany({ where: { careerTrackId: { in: tracks.map((row) => row.id) }, deletedAt: null }, select: { id: true } });
  const roles = await prisma.jobRole.findMany({ where: { jobFamilyId: { in: families.map((row) => row.id) }, deletedAt: null, isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
  const roleIds = roles.map((role) => role.id);
  const [items, packages, packageItems, models, levels] = await Promise.all([
    prisma.competencyItem.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { code: "asc" }] }),
    prisma.competencyPackage.findMany({ where: { deletedAt: null }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    prisma.competencyPackageItem.findMany({ orderBy: [{ packageId: "asc" }, { sortOrder: "asc" }] }),
    prisma.competencyModelVersion.findMany({ where: { jobRoleId: { in: roleIds }, deletedAt: null }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    prisma.jobLevel.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, code: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  const requirements = await prisma.jobLevelRequirement.findMany({ where: { modelVersionId: { in: models.map((model) => model.id) } }, orderBy: [{ modelVersionId: "asc" }, { sortOrder: "asc" }] });
  return { items, packages, packageItems, models, requirements, roles, levels };
}
