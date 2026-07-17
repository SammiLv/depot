"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
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

function parseOptionalFloat(value: FormDataEntryValue | null) {
  const text = (value as string | null)?.trim();
  if (!text) return null;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) {
    throw new Error("工作量格式不正确");
  }
  return Math.round(parsed * 10) / 10;
}

function parseOptionalId(value: FormDataEntryValue | null) {
  const text = (value as string | null)?.trim();
  return text || null;
}

function parseRequiredYear(value: FormDataEntryValue | null, fieldName: string) {
  const text = (value as string | null)?.trim();
  if (!text) throw new Error(`${fieldName}为必填项`);
  if (!/^\d{4}$/.test(text)) throw new Error(`${fieldName}格式不正确`);
  return Number(text);
}

function parseOptionalMonth(value: FormDataEntryValue | null, fieldName = "月份") {
  const text = (value as string | null)?.trim();
  if (!text) return null;
  const month = Number.parseInt(text, 10);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`${fieldName}格式不正确`);
  }
  return month;
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

function parseRequiredQuarter(value: FormDataEntryValue | null, fieldName: string) {
  const quarter = (value as string | null)?.trim();
  if (!quarter) throw new Error(`${fieldName}为必填项`);
  if (!/^\d{4}-Q[1-4]$/.test(quarter)) throw new Error(`${fieldName}格式不正确`);
  return quarter;
}

function assertQuarterRange(startQuarter: string, endQuarter: string) {
  const [startYear, startQ] = startQuarter.split("-Q");
  const [endYear, endQ] = endQuarter.split("-Q");
  const startValue = Number(startYear) * 10 + Number(startQ);
  const endValue = Number(endYear) * 10 + Number(endQ);
  if (startValue > endValue) {
    throw new Error("起始季度不能晚于结束季度");
  }
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

function getProjectManagementScopeWhere(currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>, departmentOrgNodeId: string | null, scopedOrgNodeIds: string[] | null) {
  if (currentUser.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (departmentOrgNodeId) {
    return { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] }, deletedAt: null };
  }

  return { ownerId: currentUser.id, deletedAt: null };
}

async function getProjectManagementDepartmentScope(currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>) {
  if (currentUser.roleType === "ADMIN") {
    return { departmentOrgNodeId: null, scopedOrgNodeIds: null };
  }

  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(currentUser.orgNodeId ?? null);
  const scopedOrgNodeIds = departmentOrgNodeId
    ? await getDescendantOrgNodeIds(departmentOrgNodeId)
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);

  return { departmentOrgNodeId, scopedOrgNodeIds };
}

async function findEditableOwner(currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>, ownerId: string) {
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);
  const owner = await prisma.user.findFirst({
    where: {
      id: ownerId,
      isActive: true,
      deletedAt: null,
      ...(currentUser.roleType === "ADMIN"
        ? {}
        : departmentOrgNodeId
          ? { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] } }
          : { id: currentUser.id }),
    },
    select: { id: true, orgNodeId: true },
  });

  if (!owner) throw new Error("负责人不在当前部门范围内");
  return owner;
}

async function findEditableProject(currentUser: Awaited<ReturnType<typeof requireQuarterlyWorkEditor>>, projectId: string) {
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
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
      orgNodeId: params.owner.orgNodeId,
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
  const startMonth = parseOptionalMonth(formData.get("startMonth"), "起始月份");
  const endMonth = parseOptionalMonth(formData.get("endMonth"), "结束月份");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");
  const projectId = parseProjectId(formData.get("projectId"));
  const now = new Date();
  const year = now.getFullYear();
  const periodStartMonth = startMonth ?? (now.getMonth() + 1);
  const periodEndMonth = endMonth ?? periodStartMonth;
  if (periodStartMonth > periodEndMonth) {
    throw new Error("起始月份不能晚于结束月份");
  }
  const quarter = Math.floor((periodStartMonth - 1) / 3) + 1;
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
      startMonth: periodStartMonth,
      endMonth: periodEndMonth,
      title,
      description,
      expectedOutcome,
      status,
      ownerId: owner.id,
      orgNodeId: owner.orgNodeId,
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
  const startMonth = parseOptionalMonth(formData.get("startMonth"), "起始月份");
  const endMonth = parseOptionalMonth(formData.get("endMonth"), "结束月份");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const existingWork = await prisma.quarterlyWork.findFirst({
    where: {
      id: workId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true, status: true, projectId: true, startMonth: true },
  });

  if (!existingWork) throw new Error("季度工作不存在或无权限编辑");

  assertEditableStatus(existingWork.status);
  assertEditableStatus(status);

  const owner = await findEditableOwner(currentUser, ownerId);
  const periodStartMonth = startMonth ?? existingWork.startMonth ?? 1;
  const periodEndMonth = endMonth ?? periodStartMonth;
  if (periodStartMonth > periodEndMonth) {
    throw new Error("起始月份不能晚于结束月份");
  }
  const quarter = Math.floor((periodStartMonth - 1) / 3) + 1;

  await prisma.quarterlyWork.update({
    where: { id: workId },
    data: {
      title,
      description,
      expectedOutcome,
      startMonth: periodStartMonth,
      endMonth: periodEndMonth,
      quarter,
      status,
      ownerId: owner.id,
      orgNodeId: owner.orgNodeId,
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
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
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

export async function createProject(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const title = requiredString(formData.get("title"), "项目名称");
  const productGoalId = parseOptionalId(formData.get("productGoalId"));
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const description = requiredString(formData.get("description"), "项目描述");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "预期收益");
  const status = parseProjectStatus(formData.get("status") ?? "NOT_STARTED");
  const startQuarter = parseRequiredQuarter(formData.get("startQuarter"), "起始季度");
  const endQuarter = parseRequiredQuarter(formData.get("endQuarter"), "结束季度");
  assertQuarterRange(startQuarter, endQuarter);
  const owner = await findEditableOwner(currentUser, ownerId);

  if (productGoalId) {
    const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);
    const productGoal = await prisma.productGoal.findFirst({
      where: {
        id: productGoalId,
        ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
      },
      select: { id: true },
    });
    if (!productGoal) throw new Error("产品目标不存在或无权限选择");
  }

  await prisma.project.create({
    data: {
      title,
      productGoalId,
      description,
      expectedOutcome,
      startQuarter,
      endQuarter,
      ownerId: owner.id,
      orgNodeId: owner.orgNodeId,
      status,
      createdById: currentUser.id,
      completedAt: getProjectCompletedAtByStatus(status),
    },
  });

  revalidateQuarterlyWork();
}

export async function createProductGoal(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const title = requiredString(formData.get("title"), "产品目标名称");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const year = parseRequiredYear(formData.get("year"), "年份");
  const description = requiredString(formData.get("description"), "产品目标描述");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "预期收益");
  const status = parseProjectStatus(formData.get("status") ?? "NOT_STARTED");
  const owner = await findEditableOwner(currentUser, ownerId);

  await prisma.productGoal.create({
    data: {
      title,
      year,
      description,
      expectedOutcome,
      ownerId: owner.id,
      orgNodeId: owner.orgNodeId,
      status,
      createdById: currentUser.id,
      completedAt: getProjectCompletedAtByStatus(status),
    },
  });

  revalidateQuarterlyWork();
}

export async function updateProductGoal(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const productGoalId = requiredString(formData.get("productGoalId"), "产品目标");
  const title = requiredString(formData.get("title"), "产品目标名称");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const year = parseRequiredYear(formData.get("year"), "年份");
  const description = requiredString(formData.get("description"), "产品目标描述");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "预期收益");
  const status = parseProjectStatus(formData.get("status"));
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const productGoal = await prisma.productGoal.findFirst({
    where: {
      id: productGoalId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true },
  });
  if (!productGoal) throw new Error("产品目标不存在或无权限编辑");

  const owner = await findEditableOwner(currentUser, ownerId);

  await prisma.productGoal.update({
    where: { id: productGoal.id },
    data: {
      title,
      year,
      description,
      expectedOutcome,
      ownerId: owner.id,
      orgNodeId: owner.orgNodeId,
      status,
      completedAt: getProjectCompletedAtByStatus(status),
    },
  });

  revalidateQuarterlyWork();
}

export async function createValueTrack(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const workloadPersonDay = parseOptionalFloat(formData.get("workloadPersonDay"));
  const otherCost = (formData.get("otherCost") as string | null)?.trim() || null;
  const actualValue = (formData.get("actualValue") as string | null)?.trim() || null;
  const valueJudgement = requiredString(formData.get("valueJudgement"), "价值判断");
  const trackingResult = requiredString(formData.get("trackingResult"), "跟踪结果描述");
  const followUpOptimization = (formData.get("followUpOptimization") as string | null)?.trim() || null;
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      status: "COMPLETED",
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true },
  });

  if (!project) throw new Error("项目不存在、未完成或无权限选择");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        workloadPersonDay,
        otherCost,
        actualValue,
        valueJudgement,
      },
    });

    await tx.requirementValueTrack.create({
      data: {
        projectId: project.id,
        trackingResult,
        followUpOptimization,
      },
    });
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function updateValueTrack(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const trackId = requiredString(formData.get("trackId"), "价值跟踪");
  const actualValue = (formData.get("actualValue") as string | null)?.trim() || null;
  const valueJudgement = requiredString(formData.get("valueJudgement"), "价值判断");
  const trackingResult = requiredString(formData.get("trackingResult"), "跟踪结果描述");
  const followUpOptimization = (formData.get("followUpOptimization") as string | null)?.trim() || null;
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const track = await prisma.requirementValueTrack.findFirst({
    where: {
      id: trackId,
      deletedAt: null,
      projectId: {
        in: (await prisma.project.findMany({
          where: { ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds), status: "COMPLETED" },
          select: { id: true },
        })).map((project) => project.id),
      },
    },
    select: { id: true, projectId: true },
  });

  if (!track) throw new Error("价值跟踪不存在或无权限编辑");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: track.projectId },
      data: {
        actualValue,
        valueJudgement,
      },
    });

    await tx.requirementValueTrack.update({
      where: { id: track.id },
      data: {
        trackingResult,
        followUpOptimization,
      },
    });
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function deleteValueTrack(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const trackId = requiredString(formData.get("trackId"), "价值跟踪");
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const track = await prisma.requirementValueTrack.findFirst({
    where: {
      id: trackId,
      deletedAt: null,
      projectId: {
        in: (await prisma.project.findMany({
          where: getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
          select: { id: true },
        })).map((project) => project.id),
      },
    },
    select: { id: true },
  });

  if (!track) throw new Error("价值跟踪不存在或无权限删除");

  await prisma.requirementValueTrack.update({
    where: { id: track.id },
    data: { deletedAt: new Date() },
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function deleteQuarterlyWork(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const workId = requiredString(formData.get("workId"), "任务");
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const work = await prisma.quarterlyWork.findFirst({
    where: {
      id: workId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true },
  });

  if (!work) throw new Error("任务不存在或无权限删除");

  await prisma.quarterlyWork.update({
    where: { id: work.id },
    data: { deletedAt: new Date() },
  });

  revalidateQuarterlyWork();
}

export async function deleteProject(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true },
  });

  if (!project) throw new Error("项目不存在或无权限删除");

  await prisma.$transaction(async (tx) => {
    await tx.requirementValueTrack.updateMany({
      where: { projectId: project.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await tx.quarterlyWork.updateMany({
      where: { projectId: project.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await tx.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date() },
    });
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function deleteProductGoal(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const productGoalId = requiredString(formData.get("productGoalId"), "产品目标");
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const productGoal = await prisma.productGoal.findFirst({
    where: {
      id: productGoalId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true },
  });

  if (!productGoal) throw new Error("产品目标不存在或无权限删除");

  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({
      where: { productGoalId: productGoal.id, deletedAt: null },
      data: { productGoalId: null },
    });

    await tx.productGoal.update({
      where: { id: productGoal.id },
      data: { deletedAt: new Date() },
    });
  });

  revalidateQuarterlyWork();
}

export async function updateProject(formData: FormData) {
  const currentUser = await requireQuarterlyWorkEditor();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const title = requiredString(formData.get("title"), "项目名称");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const status = parseProjectStatus(formData.get("status"));
  const description = (formData.get("description") as string)?.trim() || null;
  const expectedOutcome = (formData.get("expectedOutcome") as string)?.trim() || null;
  const workloadPersonDay = parseOptionalFloat(formData.get("workloadPersonDay"));
  const otherCost = (formData.get("otherCost") as string | null)?.trim() || null;
  const startQuarter = (formData.get("startQuarter") as string)?.trim() || null;
  const endQuarter = (formData.get("endQuarter") as string)?.trim() || null;
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  if (status === "COMPLETED" && workloadPersonDay === null) {
    throw new Error("项目状态为已完成时，工作量(人天)为必填项");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds) },
    select: { id: true },
  });
  if (!project) throw new Error("项目不存在或无权限编辑");

  const owner = await findEditableOwner(currentUser, ownerId);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        title,
        description,
        expectedOutcome,
        workloadPersonDay,
        otherCost,
        startQuarter,
        endQuarter,
        status,
        ownerId: owner.id,
        orgNodeId: owner.orgNodeId,
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
