"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getOwnerWhereByScope } from "@/server/permissions/data-scope";
import type { ProjectStatus, WorkStatus } from "@prisma/client";

const editableRoles = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const;
const creatableStatuses: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELAYED_COMPLETED", "COMPLETED", "CLOSED"];
const manuallyEditableStatuses: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
const projectStatuses: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];

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

function parseProjectStatus(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !projectStatuses.includes(value as ProjectStatus)) {
    throw new Error("项目状态不正确");
  }
  return value as ProjectStatus;
}

function parseWorkId(value: FormDataEntryValue | null) {
  const workId = (value as string | null)?.trim();
  if (!workId) throw new Error("季度工作不存在");
  return workId;
}

function parseProjectId(value: FormDataEntryValue | null) {
  const projectId = (value as string | null)?.trim();
  return projectId || null;
}

function assertEditableStatus(status: WorkStatus) {
  if (!manuallyEditableStatuses.includes(status)) {
    throw new Error("当前状态不允许手动变更");
  }
}

function getCompletedAtByStatus(status: WorkStatus) {
  return status === "COMPLETED" ? new Date() : null;
}

function getProjectCompletedAtByStatus(status: ProjectStatus) {
  return status === "COMPLETED" ? new Date() : null;
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

async function findEditableProject(currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...getOwnerWhereByScope(currentUser),
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!project) throw new Error("项目不存在或无权限编辑");
  if (project.status === "COMPLETED" || project.status === "CLOSED") {
    throw new Error("已完成或已关闭的项目不能新增季度工作");
  }
  return project;
}

async function ensureProjectForWork(params: {
  currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>;
  projectId: string | null;
  title: string;
  description: string;
  expectedOutcome: string;
  owner: Awaited<ReturnType<typeof findEditableOwner>>;
  workStatus: WorkStatus;
}) {
  if (params.projectId) {
    return findEditableProject(params.currentUser, params.projectId);
  }

  const projectStatus: ProjectStatus = params.workStatus === "IN_PROGRESS" ? "IN_PROGRESS" : params.workStatus === "CLOSED" ? "CLOSED" : params.workStatus === "COMPLETED" ? "COMPLETED" : "NOT_STARTED";

  return prisma.project.create({
    data: {
      title: params.title,
      description: params.description,
      expectedOutcome: params.expectedOutcome,
      ownerId: params.owner.id,
      teamId: params.owner.teamId,
      departmentId: params.owner.departmentId,
      status: projectStatus,
      createdById: params.currentUser.id,
      completedAt: getProjectCompletedAtByStatus(projectStatus),
    },
    select: { id: true, status: true },
  });
}

async function syncProjectStatusFromWork(projectId: string, status: WorkStatus) {
  if (status !== "IN_PROGRESS") return;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "IN_PROGRESS",
      completedAt: null,
    },
  });
}

export async function createQuarterlyWork(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const title = requiredString(formData.get("title"), "工作标题");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");
  const projectId = parseProjectId(formData.get("projectId"));
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const owner = await findEditableOwner(currentUser, ownerId);
  const project = await ensureProjectForWork({
    currentUser,
    projectId,
    title,
    description,
    expectedOutcome,
    owner,
    workStatus: status,
  });

  await prisma.quarterlyWork.create({
    data: {
      projectId: project.id,
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
      completedAt: getCompletedAtByStatus(status),
    },
  });

  await syncProjectStatusFromWork(project.id, status);

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
    select: { id: true, status: true, projectId: true },
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
      completedAt: getCompletedAtByStatus(status),
    },
  });

  await syncProjectStatusFromWork(existingWork.projectId, status);

  revalidateQuarterlyWork();
}

export async function updateProjectStatus(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const status = parseProjectStatus(formData.get("status"));

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...getOwnerWhereByScope(currentUser),
    },
    select: { id: true },
  });

  if (!project) throw new Error("项目不存在或无权限编辑");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        status,
        completedAt: getProjectCompletedAtByStatus(status),
      },
    });

    if (status === "COMPLETED" || status === "CLOSED") {
      await tx.quarterlyWork.updateMany({
        where: { projectId: project.id, deletedAt: null },
        data: {
          status,
          completedAt: status === "COMPLETED" ? new Date() : null,
        },
      });
    }
  });

  revalidateQuarterlyWork();
}
