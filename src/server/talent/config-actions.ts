"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { assertValidJobLevelStep, assertValidSalaryCap, salaryCapScopesOverlap } from "./foundation";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} 不能为空`);
  return value;
}
function integer(formData: FormData, key: string, fallback = 0) {
  const raw = String(formData.get(key) ?? "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value)) throw new Error(`${key} 必须是整数`);
  return value;
}
function optional(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim() || null; }
function generatedCode(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`; }
function revalidateCompetencyConfiguration() {
  revalidatePath("/talent");
  revalidatePath("/talent/config/competencies");
}

async function requireConfigManager() {
  const user = await requireCurrentUser();
  const coverage = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  if (!coverage.hasPermission) throw new Error("没有人才配置权限");
  return user;
}

async function assertDepartmentAllowed(user: Awaited<ReturnType<typeof requireCurrentUser>>, departmentOrgNodeId: string) {
  const ids = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.manageConfig);
  if (ids !== null && !ids.includes(departmentOrgNodeId)) throw new Error("不能配置该部门的人才规则");
}

async function assertJobRoleAllowed(user: Awaited<ReturnType<typeof requireCurrentUser>>, jobRoleId: string) {
  const role = await prisma.jobRole.findFirst({ where: { id: jobRoleId, deletedAt: null } });
  const family = role ? await prisma.jobFamily.findFirst({ where: { id: role.jobFamilyId, deletedAt: null } }) : null;
  const track = family ? await prisma.careerTrack.findFirst({ where: { id: family.careerTrackId, deletedAt: null } }) : null;
  if (!track) throw new Error("岗位不存在或职业通道不完整");
  await assertDepartmentAllowed(user, track.departmentOrgNodeId);
}

async function logAction(targetType: string, targetId: string, action: string, actorId: string, after: unknown) {
  await prisma.talentActionLog.create({ data: { targetType, targetId, action, actorId, afterJson: JSON.stringify(after) } });
}

export async function createCareerTrack(formData: FormData) {
  const user = await requireConfigManager();
  const departmentOrgNodeId = required(formData, "departmentOrgNodeId");
  await assertDepartmentAllowed(user, departmentOrgNodeId);
  const row = await prisma.careerTrack.create({ data: { departmentOrgNodeId, code: required(formData, "code"), name: required(formData, "name"), description: optional(formData, "description"), sortOrder: integer(formData, "sortOrder"), createdById: user.id } });
  await logAction("CareerTrack", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export async function createJobFamily(formData: FormData) {
  const user = await requireConfigManager();
  const careerTrackId = required(formData, "careerTrackId");
  const track = await prisma.careerTrack.findFirst({ where: { id: careerTrackId, deletedAt: null } });
  if (!track) throw new Error("职业通道不存在");
  await assertDepartmentAllowed(user, track.departmentOrgNodeId);
  const row = await prisma.jobFamily.create({ data: { careerTrackId, code: required(formData, "code"), name: required(formData, "name"), description: optional(formData, "description"), sortOrder: integer(formData, "sortOrder"), createdById: user.id } });
  await logAction("JobFamily", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export async function createJobRole(formData: FormData) {
  const user = await requireConfigManager();
  const jobFamilyId = required(formData, "jobFamilyId");
  const family = await prisma.jobFamily.findFirst({ where: { id: jobFamilyId, deletedAt: null } });
  if (!family) throw new Error("岗位序列不存在");
  const track = await prisma.careerTrack.findUnique({ where: { id: family.careerTrackId } });
  if (!track) throw new Error("职业通道不存在");
  await assertDepartmentAllowed(user, track.departmentOrgNodeId);
  const row = await prisma.jobRole.create({ data: { jobFamilyId, code: required(formData, "code"), name: required(formData, "name"), description: optional(formData, "description"), sortOrder: integer(formData, "sortOrder"), createdById: user.id } });
  await logAction("JobRole", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export type CareerRoleStructureActionState = { status: "idle" | "success" | "error"; message: string };

export async function saveCareerRoleStructure(
  _previousState: CareerRoleStructureActionState,
  formData: FormData,
): Promise<CareerRoleStructureActionState> {
  try {
    const user = await requireConfigManager();
    const parsed = JSON.parse(required(formData, "rowsJson")) as Array<Record<string, unknown>>;
    const originalRoleIds = JSON.parse(String(formData.get("originalRoleIdsJson") ?? "[]")) as unknown;
    if (!Array.isArray(originalRoleIds) || originalRoleIds.some((id) => typeof id !== "string")) throw new Error("原始岗位数据无效");
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("请至少配置一个人才岗位");
    const rows = parsed.map((item, index) => {
      const id = String(item.id ?? "").trim() || null;
      const departmentOrgNodeId = String(item.departmentOrgNodeId ?? "").trim();
      const trackName = String(item.trackName ?? "").trim();
      const familyName = String(item.familyName ?? "").trim();
      const name = String(item.name ?? "").trim();
      if (!departmentOrgNodeId || !familyName || !name) throw new Error(`第 ${index + 1} 行配置不完整`);
      if (!["技术岗", "管理岗"].includes(trackName)) throw new Error(`第 ${index + 1} 行职业通道只能选择技术岗或管理岗`);
      return { id, departmentOrgNodeId, trackName, familyName, name };
    });
    for (const departmentOrgNodeId of new Set(rows.map((row) => row.departmentOrgNodeId))) await assertDepartmentAllowed(user, departmentOrgNodeId);
    for (const roleId of new Set([...rows.map((row) => row.id).filter((id): id is string => Boolean(id)), ...originalRoleIds])) await assertJobRoleAllowed(user, roleId);
    const uniqueKeys = rows.map((row) => [row.departmentOrgNodeId, row.trackName, row.familyName, row.name].join("::"));
    if (new Set(uniqueKeys).size !== uniqueKeys.length) throw new Error("存在重复的人才岗位配置");

    await prisma.$transaction(async (tx) => {
      const savedRoleIds: string[] = [];
      for (const [index, input] of rows.entries()) {
        const existingTrack = await tx.careerTrack.findFirst({ where: { departmentOrgNodeId: input.departmentOrgNodeId, name: input.trackName, deletedAt: null } });
        const track = existingTrack
          ? await tx.careerTrack.update({ where: { id: existingTrack.id }, data: { isActive: true } })
          : await tx.careerTrack.create({ data: { departmentOrgNodeId: input.departmentOrgNodeId, code: `TRACK_${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`, name: input.trackName, sortOrder: input.trackName === "技术岗" ? 1 : 2, createdById: user.id } });
        const existingFamily = await tx.jobFamily.findFirst({ where: { careerTrackId: track.id, name: input.familyName, deletedAt: null } });
        const family = existingFamily
          ? await tx.jobFamily.update({ where: { id: existingFamily.id }, data: { isActive: true } })
          : await tx.jobFamily.create({ data: { careerTrackId: track.id, code: `FAMILY_${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`, name: input.familyName, sortOrder: index + 1, createdById: user.id } });
        const existingRole = input.id ? await tx.jobRole.findFirst({ where: { id: input.id, deletedAt: null } }) : await tx.jobRole.findFirst({ where: { jobFamilyId: family.id, name: input.name, deletedAt: null } });
        const role = existingRole
          ? await tx.jobRole.update({ where: { id: existingRole.id }, data: { jobFamilyId: family.id, name: input.name, sortOrder: index + 1, isActive: true } })
          : await tx.jobRole.create({ data: { jobFamilyId: family.id, code: `ROLE_${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`, name: input.name, sortOrder: index + 1, createdById: user.id } });
        savedRoleIds.push(role.id);
      }
      const removedRoleIds = originalRoleIds.filter((id) => !savedRoleIds.includes(id));
      if (removedRoleIds.length > 0) await tx.jobRole.updateMany({ where: { id: { in: removedRoleIds }, deletedAt: null }, data: { isActive: false } });
    });
    revalidatePath("/talent");
    revalidatePath("/talent/config/career");
    return { status: "success", message: `已保存 ${rows.length} 个人才岗位` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "人才岗位保存失败" };
  }
}

export async function createJobLevelGroup(formData: FormData) {
  const user = await requireConfigManager();
  const row = await prisma.jobLevelGroup.create({ data: { code: required(formData, "code"), name: required(formData, "name"), rankOrder: integer(formData, "rankOrder"), description: optional(formData, "description"), createdById: user.id } });
  await logAction("JobLevelGroup", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export async function createJobLevel(formData: FormData) {
  const user = await requireConfigManager();
  const stepOrder = integer(formData, "stepOrder");
  assertValidJobLevelStep(stepOrder);
  const row = await prisma.jobLevel.create({ data: { jobLevelGroupId: required(formData, "jobLevelGroupId"), code: required(formData, "code"), name: required(formData, "name"), stepOrder, displayOrder: integer(formData, "displayOrder"), createdById: user.id } });
  await logAction("JobLevel", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export type JobLevelStructureActionState = { status: "idle" | "success" | "error"; message: string };

export async function saveJobLevelStructure(
  _previousState: JobLevelStructureActionState,
  formData: FormData,
): Promise<JobLevelStructureActionState> {
  try {
    const user = await requireConfigManager();
    const parsed = JSON.parse(required(formData, "rowsJson")) as Array<{ code?: unknown; levels?: unknown }>;
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("请至少保留一个职级段");
    const rows = parsed.map((item, index) => {
      const code = String(item.code ?? "").trim().toUpperCase();
      const levels = Array.isArray(item.levels) ? item.levels.map((value) => String(value).trim().toUpperCase()).filter(Boolean) : [];
      if (!code) throw new Error(`第 ${index + 1} 行缺少职级段`);
      if (new Set(levels).size !== levels.length) throw new Error(`${code} 存在重复的细分职级`);
      return { code, levels: levels.length > 0 ? levels : [code] };
    });
    if (new Set(rows.map((row) => row.code)).size !== rows.length) throw new Error("职级段不能重复");

    await prisma.$transaction(async (tx) => {
      const omittedGroups = await tx.jobLevelGroup.findMany({ where: { code: { notIn: rows.map((row) => row.code) }, deletedAt: null }, select: { id: true } });
      if (omittedGroups.length > 0) {
        await tx.jobLevelGroup.updateMany({ where: { id: { in: omittedGroups.map((group) => group.id) } }, data: { isActive: false } });
        await tx.jobLevel.updateMany({ where: { jobLevelGroupId: { in: omittedGroups.map((group) => group.id) }, deletedAt: null }, data: { isActive: false } });
      }
      for (const [groupIndex, input] of rows.entries()) {
        const existingGroup = await tx.jobLevelGroup.findUnique({ where: { code: input.code } });
        const group = existingGroup
          ? await tx.jobLevelGroup.update({ where: { id: existingGroup.id }, data: { name: `${input.code}职级`, rankOrder: groupIndex + 1, isActive: true, deletedAt: null } })
          : await tx.jobLevelGroup.create({ data: { code: input.code, name: `${input.code}职级`, rankOrder: groupIndex + 1, createdById: user.id } });
        const existingLevels = await tx.jobLevel.findMany({ where: { jobLevelGroupId: group.id, deletedAt: null } });
        await tx.jobLevel.updateMany({ where: { jobLevelGroupId: group.id, deletedAt: null }, data: { isActive: false } });
        for (const [levelIndex, code] of input.levels.entries()) {
          const existing = existingLevels.find((level) => level.code === code);
          const data = { name: code, stepOrder: levelIndex + 1, displayOrder: (groupIndex + 1) * 100 + levelIndex + 1, isActive: true, deletedAt: null };
          if (existing) await tx.jobLevel.update({ where: { id: existing.id }, data });
          else await tx.jobLevel.create({ data: { jobLevelGroupId: group.id, code, ...data, createdById: user.id } });
        }
      }
    });
    revalidatePath("/talent");
    revalidatePath("/talent/config/career");
    return { status: "success", message: `已保存 ${rows.length} 个职级段` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "职级配置保存失败" };
  }
}

export async function createSalaryCap(formData: FormData) {
  const user = await requireConfigManager();
  const departmentOrgNodeId = required(formData, "departmentOrgNodeId");
  await assertDepartmentAllowed(user, departmentOrgNodeId);
  const maxSalary = integer(formData, "maxSalary");
  assertValidSalaryCap(maxSalary);
  const input = { jobLevelGroupId: required(formData, "jobLevelGroupId"), jobLevelId: optional(formData, "jobLevelId"), effectiveFrom: new Date(required(formData, "effectiveFrom")), effectiveTo: optional(formData, "effectiveTo") ? new Date(required(formData, "effectiveTo")) : null };
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new Error("失效日期不能早于生效日期");
  const existing = await prisma.salaryCapConfig.findMany({ where: { departmentOrgNodeId, jobLevelGroupId: input.jobLevelGroupId, jobLevelId: input.jobLevelId, versionStatus: "ACTIVE", deletedAt: null } });
  if (existing.some((row) => salaryCapScopesOverlap(input, row))) throw new Error("同一职级已有生效期重叠的薪资上限");
  const row = await prisma.salaryCapConfig.create({ data: { departmentOrgNodeId, ...input, maxSalary, version: integer(formData, "version", 1), versionStatus: "ACTIVE", publishedAt: new Date(), createdById: user.id } });
  await logAction("SalaryCapConfig", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export async function saveEmployeeTalentProfile(formData: FormData) {
  const user = await requireConfigManager();
  const userId = required(formData, "userId");
  const target = await prisma.user.findFirst({ where: { id: userId, isActive: true, deletedAt: null }, select: { orgNodeId: true } });
  if (!target?.orgNodeId) throw new Error("员工不存在或尚未分配组织");
  const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(user, orgPermissionModuleKeys.talent, talentAbilityKeys.editProfile);
  if (authorizedOrgNodeIds !== null && !authorizedOrgNodeIds.includes(target.orgNodeId)) throw new Error("不能维护该员工的人才档案");
  const salaryRaw = optional(formData, "currentSalary");
  const currentSalary = salaryRaw ? Number(salaryRaw) : null;
  if (currentSalary !== null) assertValidSalaryCap(currentSalary);
  const before = await prisma.employeeTalentProfile.findUnique({ where: { userId } });
  const row = await prisma.employeeTalentProfile.upsert({
    where: { userId },
    update: { jobLevelId: optional(formData, "jobLevelId"), currentSalary, updatedById: user.id, deletedAt: null },
    create: { userId, jobLevelId: optional(formData, "jobLevelId"), currentSalary, updatedById: user.id },
  });
  await prisma.talentActionLog.create({ data: { targetType: "EmployeeTalentProfile", targetId: row.id, action: before ? "UPDATE" : "CREATE", actorId: user.id, beforeJson: before ? JSON.stringify(before) : null, afterJson: JSON.stringify(row) } });
  revalidatePath("/talent/config/career");
  revalidatePath("/talent");
}

export async function createPromotionPath(formData: FormData) {
  const user = await requireConfigManager();
  const jobRoleId = required(formData, "jobRoleId");
  await assertJobRoleAllowed(user, jobRoleId);
  const fromJobLevelId = required(formData, "fromJobLevelId");
  const toJobLevelId = required(formData, "toJobLevelId");
  if (fromJobLevelId === toJobLevelId) throw new Error("晋升前后职级不能相同");
  const row = await prisma.promotionPath.create({ data: { jobRoleId, fromJobLevelId, toJobLevelId, sortOrder: integer(formData, "sortOrder"), createdById: user.id } });
  await logAction("PromotionPath", row.id, "CREATE", user.id, row);
  revalidatePath("/talent/config/career");
}

export async function createCompetencyItem(formData: FormData) {
  const user = await requireConfigManager();
  const row = await prisma.competencyItem.create({ data: { code: generatedCode("COMP"), name: required(formData, "name"), category: required(formData, "category"), description: optional(formData, "description"), measurementGuide: optional(formData, "measurementGuide"), createdById: user.id } });
  await logAction("CompetencyItem", row.id, "CREATE", user.id, row);
  revalidateCompetencyConfiguration();
}

export async function createCompetencyPackage(formData: FormData) {
  const user = await requireConfigManager();
  const row = await prisma.competencyPackage.create({ data: { code: generatedCode("CPKG"), name: required(formData, "name"), description: optional(formData, "description"), version: 1, createdById: user.id } });
  await logAction("CompetencyPackage", row.id, "CREATE", user.id, row);
  revalidateCompetencyConfiguration();
}

export async function addCompetencyPackageItem(formData: FormData) {
  const user = await requireConfigManager();
  const packageId = required(formData, "packageId");
  const competencyPackage = await prisma.competencyPackage.findFirst({ where: { id: packageId, status: "DRAFT", deletedAt: null } });
  if (!competencyPackage) throw new Error("只能向草稿能力包添加能力项");
  const latest = await prisma.competencyPackageItem.aggregate({ where: { packageId }, _max: { sortOrder: true } });
  const row = await prisma.competencyPackageItem.create({ data: { packageId, competencyItemId: required(formData, "competencyItemId"), weight: 1, sortOrder: (latest._max.sortOrder ?? 0) + 10 } });
  await logAction("CompetencyPackageItem", row.id, "CREATE", user.id, row);
  revalidateCompetencyConfiguration();
}

export async function createCompetencyModel(formData: FormData) {
  const user = await requireConfigManager();
  const jobRoleId = required(formData, "jobRoleId");
  await assertJobRoleAllowed(user, jobRoleId);
  const targetJobLevelId = required(formData, "targetJobLevelId");
  const latest = await prisma.competencyModelVersion.findFirst({ where: { jobRoleId, targetJobLevelId, deletedAt: null }, orderBy: { version: "desc" } });
  const row = await prisma.competencyModelVersion.create({ data: { code: latest?.code ?? generatedCode("CMOD"), name: required(formData, "name"), jobRoleId, targetJobLevelId, version: (latest?.version ?? 0) + 1, description: optional(formData, "description"), createdById: user.id } });
  await logAction("CompetencyModelVersion", row.id, "CREATE", user.id, row);
  revalidateCompetencyConfiguration();
}

export async function addJobLevelRequirement(formData: FormData) {
  const user = await requireConfigManager();
  const requiredLevel = integer(formData, "requiredLevel");
  if (requiredLevel < 1 || requiredLevel > 5) throw new Error("要求等级必须为 1 至 5");
  const modelVersionId = required(formData, "modelVersionId");
  const model = await prisma.competencyModelVersion.findUnique({ where: { id: modelVersionId } });
  if (!model || model.status !== "DRAFT") throw new Error("只能修改草稿能力模型");
  await assertJobRoleAllowed(user, model.jobRoleId);
  const latest = await prisma.jobLevelRequirement.aggregate({ where: { modelVersionId }, _max: { sortOrder: true } });
  const row = await prisma.jobLevelRequirement.create({ data: { modelVersionId, competencyItemId: required(formData, "competencyItemId"), requiredLevel, weight: 1, isMandatory: formData.get("isMandatory") === "on", evidenceRequirement: optional(formData, "evidenceRequirement"), sortOrder: (latest._max.sortOrder ?? 0) + 10 } });
  await logAction("JobLevelRequirement", row.id, "CREATE", user.id, row);
  revalidateCompetencyConfiguration();
}

export async function addCompetencyPackageToModel(formData: FormData) {
  const user = await requireConfigManager();
  const modelVersionId = required(formData, "modelVersionId");
  const packageId = required(formData, "packageId");
  const requiredLevel = integer(formData, "requiredLevel", 3);
  if (requiredLevel < 1 || requiredLevel > 5) throw new Error("要求等级必须为 1 至 5");
  const model = await prisma.competencyModelVersion.findFirst({ where: { id: modelVersionId, status: "DRAFT", deletedAt: null } });
  if (!model) throw new Error("只能向草稿能力模型导入能力包");
  await assertJobRoleAllowed(user, model.jobRoleId);
  const packageItems = await prisma.competencyPackageItem.findMany({ where: { packageId }, orderBy: { sortOrder: "asc" } });
  if (!packageItems.length) throw new Error("所选能力包尚未包含能力项");
  const existing = await prisma.jobLevelRequirement.findMany({ where: { modelVersionId }, select: { competencyItemId: true, sortOrder: true } });
  const existingIds = new Set(existing.map((row) => row.competencyItemId));
  const newItems = packageItems.filter((row) => !existingIds.has(row.competencyItemId));
  if (!newItems.length) throw new Error("所选能力包中的能力项已全部加入当前模型");
  const startOrder = existing.reduce((maximum, row) => Math.max(maximum, row.sortOrder), 0);
  const created = await prisma.jobLevelRequirement.createMany({ data: newItems.map((item, index) => ({
    modelVersionId,
    competencyItemId: item.competencyItemId,
    requiredLevel,
    weight: 1,
    isMandatory: false,
    sortOrder: startOrder + (index + 1) * 10,
  })) });
  await logAction("CompetencyModelVersion", modelVersionId, "IMPORT_PACKAGE", user.id, { packageId, requiredLevel, count: created.count });
  revalidateCompetencyConfiguration();
}

export async function publishCompetencyModel(formData: FormData) {
  const user = await requireConfigManager();
  const id = required(formData, "id");
  const model = await prisma.competencyModelVersion.findUnique({ where: { id } });
  if (!model) throw new Error("能力模型不存在");
  await assertJobRoleAllowed(user, model.jobRoleId);
  const count = await prisma.jobLevelRequirement.count({ where: { modelVersionId: id } });
  if (count === 0) throw new Error("能力模型至少配置一个职级要求后才能发布");
  const row = await prisma.competencyModelVersion.update({ where: { id, status: "DRAFT" }, data: { status: "ACTIVE", publishedAt: new Date() } });
  await logAction("CompetencyModelVersion", row.id, "PUBLISH", user.id, row);
  revalidateCompetencyConfiguration();
}
