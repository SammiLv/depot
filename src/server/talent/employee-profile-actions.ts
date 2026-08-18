"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { resolveAuthorizedOrgNodeIds, resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { parseProfileBoolean, validateCurrentContractPeriod } from "./employee-profile";

export type EmployeeProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  savedUserId: string;
  requestId: string;
};

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalDate(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} 日期格式不正确`);
  return date;
}

function optionalSalary(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("薪资必须是大于或等于 0 的整数");
  return amount;
}

function optionalPositiveInteger(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const result = Number(raw);
  if (!Number.isInteger(result) || result < 1) throw new Error("当前聘期期数必须是大于或等于1的整数");
  return result;
}

export async function saveEmployeeBasicProfile(
  _previousState: EmployeeProfileActionState,
  formData: FormData,
): Promise<EmployeeProfileActionState> {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireCurrentUser();
    const userId = value(formData, "userId");
    if (!userId) return { status: "error", message: "请选择员工", savedUserId: "", requestId };

    const target = await prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: { id: true, name: true, orgNodeId: true, joinedAt: true, contractRenewAt: true },
    });
    if (!target?.orgNodeId) return { status: "error", message: "员工不存在或尚未分配组织", savedUserId: userId, requestId };

    const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(actor, orgPermissionModuleKeys.talent, talentAbilityKeys.editProfile);
    if (authorizedOrgNodeIds !== null && !authorizedOrgNodeIds.includes(target.orgNodeId)) {
      return { status: "error", message: "没有权限维护该员工的基础信息", savedUserId: userId, requestId };
    }

    const [sensitiveCoverage, existingProfile] = await Promise.all([
      resolvePermissionCoverage(actor, orgPermissionModuleKeys.talent, talentAbilityKeys.viewSensitive),
      prisma.employeeTalentProfile.findUnique({ where: { userId } }),
    ]);
    const joinedAt = optionalDate(formData, "joinedAt");
    const currentContractStartAt = optionalDate(formData, "currentContractStartAt");
    const currentContractEndAt = optionalDate(formData, "currentContractEndAt");
    const currentContractSequence = optionalPositiveInteger(formData, "currentContractSequence");
    validateCurrentContractPeriod({ joinedAt, startAt: currentContractStartAt, endAt: currentContractEndAt, sequence: currentContractSequence });

    const entryJobLevelId = value(formData, "entryJobLevelId") || null;
    const jobLevelId = value(formData, "jobLevelId") || null;
    const selectedLevelIds = [...new Set([entryJobLevelId, jobLevelId].filter((id): id is string => Boolean(id)))];
    if (selectedLevelIds.length) {
      const levelCount = await prisma.jobLevel.count({ where: { id: { in: selectedLevelIds }, isActive: true, deletedAt: null } });
      if (levelCount !== selectedLevelIds.length) return { status: "error", message: "所选入职职级或当前职级不存在或已停用", savedUserId: userId, requestId };
    }

    const salaryData = sensitiveCoverage.hasPermission
      ? { startingSalary: optionalSalary(formData, "startingSalary"), currentSalary: optionalSalary(formData, "currentSalary") }
      : { startingSalary: existingProfile?.startingSalary ?? null, currentSalary: existingProfile?.currentSalary ?? null };
    const profileNote = value(formData, "profileNote") || null;
    const decisionFacts = {
      hasTwoCReviewsInCurrentContract: parseProfileBoolean(value(formData, "hasTwoCReviewsInCurrentContract")),
      hasConsecutiveTwoCReviewsInCurrentContract: parseProfileBoolean(value(formData, "hasConsecutiveTwoCReviewsInCurrentContract")),
      isLatestPreRenewalReviewC: parseProfileBoolean(value(formData, "isLatestPreRenewalReviewC")),
      hasFormalPromotionInCurrentContract: parseProfileBoolean(value(formData, "hasFormalPromotionInCurrentContract")),
      decisionFactsUpdateNote: value(formData, "decisionFactsUpdateNote") || null,
    };
    const factsChanged = existingProfile
      ? Object.entries(decisionFacts).some(([key, next]) => existingProfile[key as keyof typeof existingProfile] !== next)
      : Object.values(decisionFacts).some((item) => item !== null);
    const profileData = {
      entryJobLevelId,
      jobLevelId,
      ...salaryData,
      currentContractStartAt,
      currentContractEndAt,
      currentContractSequence,
      ...decisionFacts,
      decisionFactsUpdatedAt: factsChanged ? new Date() : existingProfile?.decisionFactsUpdatedAt ?? null,
      profileNote,
      updatedById: actor.id,
      deletedAt: null,
    };

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({ where: { id: userId }, data: { joinedAt, contractRenewAt: currentContractEndAt } });
      const profile = await tx.employeeTalentProfile.upsert({
        where: { userId },
        update: profileData,
        create: { userId, ...profileData },
      });
      await tx.talentActionLog.create({
        data: {
          targetType: "EmployeeBasicProfile",
          targetId: profile.id,
          action: existingProfile ? "UPDATE" : "CREATE",
          actorId: actor.id,
          beforeJson: JSON.stringify({ user: { joinedAt: target.joinedAt, contractRenewAt: target.contractRenewAt }, profile: existingProfile }),
          afterJson: JSON.stringify({ user: updatedUser, profile }),
        },
      });
      return profile;
    });

    revalidatePath("/talent/employees");
    revalidatePath("/talent");
    return { status: "success", message: `已保存 ${target.name} 的基础信息`, savedUserId: userId, requestId: `${requestId}:${result.updatedAt.toISOString()}` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "保存失败，请稍后重试", savedUserId: value(formData, "userId"), requestId };
  }
}

export async function deleteEmployeeTalentProfile(
  _previousState: EmployeeProfileActionState,
  formData: FormData,
): Promise<EmployeeProfileActionState> {
  const requestId = crypto.randomUUID();
  const userId = value(formData, "userId");
  try {
    const actor = await requireCurrentUser();
    if (!userId) return { status: "error", message: "未指定人才档案", savedUserId: "", requestId };

    const target = await prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: { id: true, name: true, orgNodeId: true },
    });
    if (!target?.orgNodeId) return { status: "error", message: "员工不存在或尚未分配组织", savedUserId: userId, requestId };

    const authorizedOrgNodeIds = await resolveAuthorizedOrgNodeIds(actor, orgPermissionModuleKeys.talent, talentAbilityKeys.editProfile);
    if (authorizedOrgNodeIds !== null && !authorizedOrgNodeIds.includes(target.orgNodeId)) {
      return { status: "error", message: "没有权限删除该员工的人才档案", savedUserId: userId, requestId };
    }

    const profile = await prisma.employeeTalentProfile.findFirst({ where: { userId, deletedAt: null } });
    if (!profile) return { status: "error", message: "该员工尚未建立人才档案", savedUserId: userId, requestId };

    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.employeeTalentProfile.update({ where: { id: profile.id }, data: { deletedAt, updatedById: actor.id } });
      await tx.talentActionLog.create({
        data: {
          targetType: "EmployeeTalentProfile",
          targetId: profile.id,
          action: "DELETE",
          actorId: actor.id,
          beforeJson: JSON.stringify(profile),
          afterJson: JSON.stringify({ deletedAt }),
        },
      });
    });

    revalidatePath("/talent/employees");
    revalidatePath("/talent");
    return { status: "success", message: `已删除 ${target.name} 的人才档案，组织架构中的员工信息保持不变`, savedUserId: userId, requestId };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "删除失败，请稍后重试", savedUserId: userId, requestId };
  }
}
