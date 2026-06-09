"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getOwnerWhereByScope } from "@/server/permissions/data-scope";
import type { WorkStatus } from "@prisma/client";

const editableRoles = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const;
const creatableStatuses: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELAYED_COMPLETED", "COMPLETED"];
const manuallyEditableStatuses: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];

function revalidateQuarterlyWork() {
  revalidatePath("/quarterly-work");
  revalidatePath("/dashboard");
}

async function requireQuarterlyWorkEditor() {
  const user = await requireCurrentUser();
  if (!editableRoles.includes(user.roleType as (typeof editableRoles)[number])) {
    throw new Error("当前角色不能维护季度工作");
  }
  return user;
}

function requiredString(value: FormDataEntryValue | null, fieldName: string) {
  const text = (value as string | null)?.trim();
  if (!text) throw new Error(`${fieldName}为必填项`);
  return text;
}

function parseStatus(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !creatableStatuses.includes(value as WorkStatus)) {
    throw new Error("状态不正确");
  }
  return value as WorkStatus;
}

function parseWorkId(value: FormDataEntryValue | null) {
  const workId = (value as string | null)?.trim();
  if (!workId) throw new Error("季度工作不存在");
  return workId;
}

function assertEditableStatus(status: WorkStatus) {
  if (!manuallyEditableStatuses.includes(status)) {
    throw new Error("当前状态不允许手动变更");
  }
}

async function findEditableOwner(currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>, ownerId: string) {
  const owner = await prisma.user.findFirst({
    where: {
      id: ownerId,
      isActive: true,
      deletedAt: null,
      ...(currentUser.roleType === "ADMIN"
        ? {}
        : currentUser.roleType === "DEPARTMENT_MANAGER"
          ? { departmentId: currentUser.departmentId }
          : currentUser.teamId
            ? { teamId: currentUser.teamId }
            : { id: currentUser.id }),
    },
    select: { id: true, departmentId: true, teamId: true },
  });

  if (!owner) throw new Error("负责人不在当前可维护范围内");
  return owner;
}

export async function createQuarterlyWork(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const title = requiredString(formData.get("title"), "工作标题");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const owner = await findEditableOwner(currentUser, ownerId);

  await prisma.quarterlyWork.create({
    data: {
      year,
      quarter,
      title,
      description,
      expectedOutcome,
      status,
      ownerId: owner.id,
      departmentId: owner.departmentId,
      teamId: owner.teamId,
      createdById: currentUser.id,
    },
  });

  revalidateQuarterlyWork();
}

export async function updateQuarterlyWork(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const workId = parseWorkId(formData.get("workId"));
  const title = requiredString(formData.get("title"), "工作标题");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");

  const existingWork = await prisma.quarterlyWork.findFirst({
    where: {
      id: workId,
      ...getOwnerWhereByScope(currentUser),
    },
    select: { id: true, status: true },
  });

  if (!existingWork) throw new Error("季度工作不存在或无权限编辑");

  assertEditableStatus(existingWork.status);
  assertEditableStatus(status);

  const owner = await findEditableOwner(currentUser, ownerId);

  await prisma.quarterlyWork.update({
    where: { id: workId },
    data: {
      title,
      description,
      expectedOutcome,
      status,
      ownerId: owner.id,
      departmentId: owner.departmentId,
      teamId: owner.teamId,
    },
  });

  revalidateQuarterlyWork();
}
