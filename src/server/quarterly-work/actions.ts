"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";
import {
  requireManageProductGoal,
  requireManageProductTask,
  requireManageProjectAndValueTracking,
} from "@/server/quarterly-work/permission";
import {
  emitProjectAssigned,
  emitProjectCompleted,
  emitProjectValueChanged,
  emitQuarterlyWorkAssigned,
  emitQuarterlyWorkStatusChanged,
} from "@/server/notifications/quarterly-work-notifications";
import type { ProjectStatus, WorkStatus } from "@prisma/client";
import {
  VALUE_JUDGEMENTS,
  VALUE_TRACK_STATUS_NOT_OBSERVED,
  VALUE_TRACK_STATUS_OBSERVING,
  VALUE_TRACK_STATUSES,
  type ValueJudgement,
  type ValueTrackStatus,
} from "@/server/quarterly-work/value-track-constants";

type ScopeUser = Awaited<ReturnType<typeof requireCurrentUser>>;
const creatableStatuses: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELAYED_COMPLETED", "COMPLETED", "CLOSED"];
const manuallyEditableStatuses: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
const projectStatuses: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];

function revalidateQuarterlyWork() {
  revalidatePath("/quarterly-work");
  revalidatePath("/dashboard");
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

function parseRequiredProductGoalIds(formData: FormData) {
  const ids = [...new Set(
    formData.getAll("productGoalIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
  if (!ids.length) throw new Error("产品目标为必填项，请至少选择一个");
  return ids;
}

async function validateProductGoalIds(
  productGoalIds: string[],
  scopeWhere: ReturnType<typeof getProjectManagementScopeWhere>,
) {
  const goals = await prisma.productGoal.findMany({
    where: {
      id: { in: productGoalIds },
      ...scopeWhere,
    },
    select: { id: true },
  });
  if (goals.length !== productGoalIds.length) {
    throw new Error("产品目标不存在或无权限选择");
  }
}

async function replaceProjectProductGoals(
  tx: Pick<typeof prisma, "projectProductGoal">,
  projectId: string,
  productGoalIds: string[],
) {
  await tx.projectProductGoal.deleteMany({ where: { projectId } });
  await tx.projectProductGoal.createMany({
    data: productGoalIds.map((productGoalId, index) => ({
      projectId,
      productGoalId,
      sortOrder: (index + 1) * 10,
    })),
  });
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

function getValueTrackInitForCompletedStatus(status: ProjectStatus, previousStatus?: ProjectStatus | null) {
  if (status === "COMPLETED" && previousStatus !== "COMPLETED") {
    return {
      valueTrackStatus: VALUE_TRACK_STATUS_NOT_OBSERVED,
      valueJudgement: null,
    };
  }
  return undefined;
}

function parseValueTrackStatus(value: FormDataEntryValue | null, fallback?: ValueTrackStatus) {
  const text = (value as string | null)?.trim() || fallback;
  if (!text || !(VALUE_TRACK_STATUSES as readonly string[]).includes(text)) {
    throw new Error("价值跟踪状态不正确");
  }
  return text as ValueTrackStatus;
}

function parseValueJudgement(value: FormDataEntryValue | null, status: ValueTrackStatus) {
  const text = (value as string | null)?.trim() || null;
  if (status === VALUE_TRACK_STATUS_NOT_OBSERVED) {
    return null;
  }
  if (!text || !(VALUE_JUDGEMENTS as readonly string[]).includes(text)) {
    throw new Error("价值判断为必填项");
  }
  return text as ValueJudgement;
}

function getProjectManagementScopeWhere(currentUser: ScopeUser, departmentOrgNodeId: string | null, scopedOrgNodeIds: string[] | null) {
  if (currentUser.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (departmentOrgNodeId) {
    return { orgNodeId: { in: scopedOrgNodeIds ?? [departmentOrgNodeId] }, deletedAt: null };
  }

  return { ownerId: currentUser.id, deletedAt: null };
}

async function getProjectManagementDepartmentScope(currentUser: ScopeUser) {
  if (currentUser.roleType === "ADMIN") {
    return { departmentOrgNodeId: null, scopedOrgNodeIds: null };
  }

  const departmentOrgNodeId = await findNearestDepartmentOrgNodeId(currentUser.orgNodeId ?? null);
  const scopedOrgNodeIds = departmentOrgNodeId
    ? await getDescendantOrgNodeIds(departmentOrgNodeId)
    : await getDescendantOrgNodeIds(currentUser.orgNodeId ?? null);

  return { departmentOrgNodeId, scopedOrgNodeIds };
}

async function assertDepartmentOrgNodeAccessible(
  currentUser: ScopeUser,
  departmentOrgNodeId: string,
) {
  const department = await prisma.orgNode.findFirst({
    where: { id: departmentOrgNodeId, nodeType: "DEPARTMENT" },
    select: { id: true },
  });
  if (!department) throw new Error("部门不存在");

  if (currentUser.roleType === "ADMIN") {
    return;
  }

  const { departmentOrgNodeId: userDepartmentOrgNodeId } = await getProjectManagementDepartmentScope(currentUser);
  if (userDepartmentOrgNodeId !== departmentOrgNodeId) {
    throw new Error("无权在该部门选择负责人");
  }
}

async function findEditableOwner(
  currentUser: ScopeUser,
  ownerId: string,
  departmentOrgNodeId: string,
) {
  await assertDepartmentOrgNodeAccessible(currentUser, departmentOrgNodeId);
  const scopedOrgNodeIds = await getDescendantOrgNodeIds(departmentOrgNodeId);
  const owner = await prisma.user.findFirst({
    where: {
      id: ownerId,
      isActive: true,
      deletedAt: null,
      orgNodeId: { in: scopedOrgNodeIds },
    },
    select: { id: true, orgNodeId: true },
  });

  if (!owner) throw new Error("负责人不在当前部门范围内");
  return owner;
}

function parseDepartmentOrgNodeId(value: FormDataEntryValue | null) {
  const departmentOrgNodeId = String(value ?? "").trim();
  if (!departmentOrgNodeId) throw new Error("部门范围无效");
  return departmentOrgNodeId;
}

async function findEditableProject(currentUser: ScopeUser, projectId: string) {
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
  currentUser: ScopeUser;
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
      ...(projectStatus === "COMPLETED"
        ? { valueTrackStatus: VALUE_TRACK_STATUS_NOT_OBSERVED, valueJudgement: null }
        : {}),
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
  const { currentUser } = await requireManageProductTask();
  const title = requiredString(formData.get("title"), "工作标题");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const startMonth = parseOptionalMonth(formData.get("startMonth"), "起始月份");
  const endMonth = parseOptionalMonth(formData.get("endMonth"), "结束月份");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");
  const projectId = parseProjectId(formData.get("projectId"));
  const departmentOrgNodeId = parseDepartmentOrgNodeId(formData.get("departmentOrgNodeId"));
  const now = new Date();
  const year = now.getFullYear();
  const periodStartMonth = startMonth ?? (now.getMonth() + 1);
  const periodEndMonth = endMonth ?? periodStartMonth;
  if (periodStartMonth > periodEndMonth) {
    throw new Error("起始月份不能晚于结束月份");
  }
  const quarter = Math.floor((periodStartMonth - 1) / 3) + 1;
  const owner = await findEditableOwner(currentUser, ownerId, departmentOrgNodeId);
  const project = await ensureProjectForWork({
    currentUser,
    projectId,
    title,
    description,
    expectedOutcome,
    owner,
    workStatus: status,
  });

  const work = await prisma.quarterlyWork.create({
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
    select: { id: true },
  });

  await syncProjectStatusFromWork(project.id, status);
  await emitQuarterlyWorkAssigned(work.id);

  revalidateQuarterlyWork();
}

export async function updateQuarterlyWork(formData: FormData) {
  const { currentUser } = await requireManageProductTask();
  const workId = parseWorkId(formData.get("workId"));
  const title = requiredString(formData.get("title"), "工作标题");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const startMonth = parseOptionalMonth(formData.get("startMonth"), "起始月份");
  const endMonth = parseOptionalMonth(formData.get("endMonth"), "结束月份");
  const status = parseStatus(formData.get("status"));
  const description = requiredString(formData.get("description"), "本季度工作目标");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "项目预期收益");
  const projectId = parseProjectId(formData.get("projectId"));
  const departmentOrgNodeId = parseDepartmentOrgNodeId(formData.get("departmentOrgNodeId"));
  const { departmentOrgNodeId: scopeDepartmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const existingWork = await prisma.quarterlyWork.findFirst({
    where: {
      id: workId,
      ...getProjectManagementScopeWhere(currentUser, scopeDepartmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true, status: true, projectId: true, startMonth: true, ownerId: true },
  });

  if (!existingWork) throw new Error("季度工作不存在或无权限编辑");

  assertEditableStatus(existingWork.status);
  assertEditableStatus(status);

  const owner = await findEditableOwner(currentUser, ownerId, departmentOrgNodeId);
  const project = await ensureProjectForWork({
    currentUser,
    projectId: projectId ?? existingWork.projectId,
    title,
    description,
    expectedOutcome,
    owner,
    workStatus: status,
  });
  const periodStartMonth = startMonth ?? existingWork.startMonth ?? 1;
  const periodEndMonth = endMonth ?? periodStartMonth;
  if (periodStartMonth > periodEndMonth) {
    throw new Error("起始月份不能晚于结束月份");
  }
  const quarter = Math.floor((periodStartMonth - 1) / 3) + 1;
  const previousProjectId = existingWork.projectId;

  await prisma.quarterlyWork.update({
    where: { id: workId },
    data: {
      projectId: project.id,
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

  await syncProjectStatusFromWork(project.id, status);
  if (previousProjectId !== project.id) {
    await syncProjectStatusFromWork(previousProjectId, status);
  }
  if (existingWork.ownerId !== owner.id) {
    await emitQuarterlyWorkAssigned(workId);
  }
  if (existingWork.status !== status) {
    await emitQuarterlyWorkStatusChanged(workId, existingWork.status);
  }

  revalidateQuarterlyWork();
}

export async function updateProjectStatus(formData: FormData) {
  const { currentUser } = await requireManageProjectAndValueTracking();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const status = parseProjectStatus(formData.get("status"));
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true, status: true },
  });

  if (!project) throw new Error("项目不存在或无权限编辑");

  const becameCompleted = status === "COMPLETED" && project.status !== "COMPLETED";
  const valueTrackInit = getValueTrackInitForCompletedStatus(status, project.status);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        status,
        completedAt: getProjectCompletedAtByStatus(status),
        ...(valueTrackInit ?? {}),
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

  if (becameCompleted) {
    await emitProjectCompleted(project.id);
  }

  revalidateQuarterlyWork();
}

export async function createProject(formData: FormData) {
  const { currentUser } = await requireManageProjectAndValueTracking();
  const title = requiredString(formData.get("title"), "项目名称");
  const productGoalIds = parseRequiredProductGoalIds(formData);
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const departmentOrgNodeId = parseDepartmentOrgNodeId(formData.get("departmentOrgNodeId"));
  const description = requiredString(formData.get("description"), "项目描述");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "预期收益");
  const status = parseProjectStatus(formData.get("status") ?? "NOT_STARTED");
  const startQuarter = parseRequiredQuarter(formData.get("startQuarter"), "起始季度");
  const endQuarter = parseRequiredQuarter(formData.get("endQuarter"), "结束季度");
  assertQuarterRange(startQuarter, endQuarter);
  const owner = await findEditableOwner(currentUser, ownerId, departmentOrgNodeId);
  const { departmentOrgNodeId: scopeDepartmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);
  const scopeWhere = getProjectManagementScopeWhere(currentUser, scopeDepartmentOrgNodeId, scopedOrgNodeIds);
  await validateProductGoalIds(productGoalIds, scopeWhere);

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        title,
        description,
        expectedOutcome,
        startQuarter,
        endQuarter,
        ownerId: owner.id,
        orgNodeId: owner.orgNodeId,
        status,
        createdById: currentUser.id,
        completedAt: getProjectCompletedAtByStatus(status),
        ...(status === "COMPLETED"
          ? { valueTrackStatus: VALUE_TRACK_STATUS_NOT_OBSERVED, valueJudgement: null }
          : {}),
      },
    });
    await replaceProjectProductGoals(tx, project.id, productGoalIds);
    return project;
  });

  await emitProjectAssigned(created.id);
  if (created.status === "COMPLETED") {
    await emitProjectCompleted(created.id);
  }

  revalidateQuarterlyWork();
}

export async function createProductGoal(formData: FormData) {
  const { currentUser } = await requireManageProductGoal();
  const title = requiredString(formData.get("title"), "产品目标名称");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const departmentOrgNodeId = parseDepartmentOrgNodeId(formData.get("departmentOrgNodeId"));
  const year = parseRequiredYear(formData.get("year"), "年份");
  const description = requiredString(formData.get("description"), "产品目标描述");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "预期收益");
  const status = parseProjectStatus(formData.get("status") ?? "NOT_STARTED");
  const owner = await findEditableOwner(currentUser, ownerId, departmentOrgNodeId);

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
  const { currentUser } = await requireManageProductGoal();
  const productGoalId = requiredString(formData.get("productGoalId"), "产品目标");
  const title = requiredString(formData.get("title"), "产品目标名称");
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const departmentOrgNodeId = parseDepartmentOrgNodeId(formData.get("departmentOrgNodeId"));
  const year = parseRequiredYear(formData.get("year"), "年份");
  const description = requiredString(formData.get("description"), "产品目标描述");
  const expectedOutcome = requiredString(formData.get("expectedOutcome"), "预期收益");
  const status = parseProjectStatus(formData.get("status"));
  const { departmentOrgNodeId: scopeDepartmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const productGoal = await prisma.productGoal.findFirst({
    where: {
      id: productGoalId,
      ...getProjectManagementScopeWhere(currentUser, scopeDepartmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true },
  });
  if (!productGoal) throw new Error("产品目标不存在或无权限编辑");

  const owner = await findEditableOwner(currentUser, ownerId, departmentOrgNodeId);

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
  const { currentUser } = await requireManageProjectAndValueTracking();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const workloadPersonDay = parseOptionalFloat(formData.get("workloadPersonDay"));
  const otherCost = (formData.get("otherCost") as string | null)?.trim() || null;
  const actualValue = (formData.get("actualValue") as string | null)?.trim() || null;
  const valueTrackStatus = parseValueTrackStatus(formData.get("valueTrackStatus"), VALUE_TRACK_STATUS_OBSERVING);
  const valueJudgement = parseValueJudgement(formData.get("valueJudgement"), valueTrackStatus);
  const trackingResult = requiredString(formData.get("trackingResult"), "跟踪结果描述");
  const followUpOptimization = (formData.get("followUpOptimization") as string | null)?.trim() || null;
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      status: "COMPLETED",
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true, valueJudgement: true, valueTrackStatus: true },
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
        valueTrackStatus,
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

  await emitProjectValueChanged(project.id, {
    valueJudgement: project.valueJudgement,
    valueTrackStatus: project.valueTrackStatus,
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function updateValueTrack(formData: FormData) {
  const { currentUser } = await requireManageProjectAndValueTracking();
  const trackId = requiredString(formData.get("trackId"), "价值跟踪");
  const actualValue = (formData.get("actualValue") as string | null)?.trim() || null;
  const valueTrackStatus = parseValueTrackStatus(formData.get("valueTrackStatus"), VALUE_TRACK_STATUS_OBSERVING);
  const valueJudgement = parseValueJudgement(formData.get("valueJudgement"), valueTrackStatus);
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

  const existingProject = await prisma.project.findFirst({
    where: { id: track.projectId },
    select: { valueJudgement: true, valueTrackStatus: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: track.projectId },
      data: {
        actualValue,
        valueJudgement,
        valueTrackStatus,
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

  await emitProjectValueChanged(track.projectId, {
    valueJudgement: existingProject?.valueJudgement,
    valueTrackStatus: existingProject?.valueTrackStatus,
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function updateProjectValue(formData: FormData) {
  const { currentUser } = await requireManageProjectAndValueTracking();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const workloadPersonDay = parseOptionalFloat(formData.get("workloadPersonDay"));
  const otherCost = (formData.get("otherCost") as string | null)?.trim() || null;
  const actualValue = (formData.get("actualValue") as string | null)?.trim() || null;
  const valueTrackStatus = parseValueTrackStatus(formData.get("valueTrackStatus"));
  const valueJudgement = parseValueJudgement(formData.get("valueJudgement"), valueTrackStatus);
  const { departmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);

  if (workloadPersonDay === null) {
    throw new Error("工作量(人天)为必填项");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      status: "COMPLETED",
      ...getProjectManagementScopeWhere(currentUser, departmentOrgNodeId, scopedOrgNodeIds),
    },
    select: { id: true, valueJudgement: true, valueTrackStatus: true },
  });

  if (!project) throw new Error("项目不存在、未完成或无权限编辑");

  await prisma.project.update({
    where: { id: project.id },
    data: {
      workloadPersonDay,
      otherCost,
      actualValue,
      valueJudgement,
      valueTrackStatus,
    },
  });

  await emitProjectValueChanged(project.id, {
    valueJudgement: project.valueJudgement,
    valueTrackStatus: project.valueTrackStatus,
  });

  revalidateQuarterlyWork();
  revalidatePath("/value-tracking");
}

export async function deleteValueTrack(formData: FormData) {
  const { currentUser } = await requireManageProjectAndValueTracking();
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
  const { currentUser } = await requireManageProductTask();
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
  const { currentUser } = await requireManageProjectAndValueTracking();
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
  const { currentUser } = await requireManageProductGoal();
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
    await tx.projectProductGoal.deleteMany({ where: { productGoalId: productGoal.id } });

    await tx.productGoal.update({
      where: { id: productGoal.id },
      data: { deletedAt: new Date() },
    });
  });

  revalidateQuarterlyWork();
}

export async function updateProject(formData: FormData) {
  const { currentUser } = await requireManageProjectAndValueTracking();
  const projectId = requiredString(formData.get("projectId"), "项目");
  const title = requiredString(formData.get("title"), "项目名称");
  const productGoalIds = parseRequiredProductGoalIds(formData);
  const ownerId = requiredString(formData.get("ownerId"), "负责人");
  const departmentOrgNodeId = parseDepartmentOrgNodeId(formData.get("departmentOrgNodeId"));
  const status = parseProjectStatus(formData.get("status"));
  const description = (formData.get("description") as string)?.trim() || null;
  const expectedOutcome = (formData.get("expectedOutcome") as string)?.trim() || null;
  const workloadPersonDay = parseOptionalFloat(formData.get("workloadPersonDay"));
  const otherCost = (formData.get("otherCost") as string | null)?.trim() || null;
  const startQuarter = (formData.get("startQuarter") as string)?.trim() || null;
  const endQuarter = (formData.get("endQuarter") as string)?.trim() || null;
  const { departmentOrgNodeId: scopeDepartmentOrgNodeId, scopedOrgNodeIds } = await getProjectManagementDepartmentScope(currentUser);
  const scopeWhere = getProjectManagementScopeWhere(currentUser, scopeDepartmentOrgNodeId, scopedOrgNodeIds);

  if (status === "COMPLETED" && workloadPersonDay === null) {
    throw new Error("项目状态为已完成时，工作量(人天)为必填项");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...scopeWhere },
    select: { id: true, status: true, ownerId: true },
  });
  if (!project) throw new Error("项目不存在或无权限编辑");

  await validateProductGoalIds(productGoalIds, scopeWhere);

  const owner = await findEditableOwner(currentUser, ownerId, departmentOrgNodeId);
  const valueTrackInit = getValueTrackInitForCompletedStatus(status, project.status);

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
        ...(valueTrackInit ?? {}),
      },
    });
    await replaceProjectProductGoals(tx, project.id, productGoalIds);

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

  if (project.ownerId !== owner.id) {
    await emitProjectAssigned(project.id);
  }
  if (status === "COMPLETED" && project.status !== "COMPLETED") {
    await emitProjectCompleted(project.id);
  }

  revalidateQuarterlyWork();
}
