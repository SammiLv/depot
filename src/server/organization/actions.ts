"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { syncDingTalkOrganization } from "@/server/dingtalk/organization";
import { type PermissionScopeInput } from "@/server/organization/annual-goal-permissions";
import { findNearestDepartmentOrgNodeId, isOrgNodeInSubtree } from "@/server/organization/org-tree-utils";
import { applyUserOrgChange } from "@/server/organization/user-org-change";
import { ensureResignedPoolNode } from "@/server/organization/resigned-pool";
import { writeAuditEvent, AUDIT_MODULES, AUDIT_ACTION_CODES } from "@/server/audit";
import {
  annualGoalMatrixPermissionAbilityKeys,
  annualGoalPermissionScopeByAbilityRole,
  kpiOrdinaryPermissionAbilityKeys,
  notificationOrdinaryPermissionAbilityKeys,
  productManagementOrdinaryPermissionAbilityKeys,
  talentMatrixPermissionAbilityKeys,
  orgPermissionModuleKeys,
  type AnnualGoalAbilityKey,
} from "@/server/permissions/permission-constants";
import type { OrgNodeType, OrgPermissionAbilityKey, OrgPermissionGrantScopeType, Prisma, RoleType } from "@prisma/client";
import {
  getKpiApprovalPolicyActiveScopeKey,
  getKpiApprovalResolverTypeForNode,
  parseKpiApprovalPolicySteps,
} from "@/server/kpi/approval-policy-admin";
import {
  syncAnnualGoalPermissionMatrix,
  syncKpiPermissionMatrix,
  syncNotificationPermissionMatrix,
  syncProductManagementPermissionMatrix,
  syncRoleMenuPermissionMatrix,
  syncTalentPermissionMatrix,
  type PermissionMatrixSyncMode,
} from "@/server/organization/permission-matrix-sync";

const managerEditableRoles: RoleType[] = ["TEAM_LEADER", "MEMBER"];
const permissionRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];
const kpiPermissionScopeByRole: Record<RoleType, OrgPermissionGrantScopeType> = {
  ADMIN: "ALL",
  DEPARTMENT_MANAGER: "SUBTREE",
  TEAM_LEADER: "NODE",
  MEMBER: "SELF",
};
const ROOT_ORG_NODE_ID = "org_root";


async function requireOrgManager() {
  const user = await requireCurrentUser();
  if (user.roleType !== "ADMIN" && user.roleType !== "DEPARTMENT_MANAGER") {
    throw new Error("仅管理员或部门主管可执行此操作");
  }
  return user;
}

async function requireAdmin() {
  return requirePermissionEditor({ scopeType: "SYSTEM" });
}

async function requirePermissionEditor(scope: PermissionScopeInput) {
  const user = await requireCurrentUser();
  if (scope.scopeType === "SYSTEM") {
    if (user.roleType !== "ADMIN") {
      throw new Error("仅管理员可执行此操作");
    }
    return user;
  }

  if (user.roleType !== "ADMIN" && user.roleType !== "DEPARTMENT_MANAGER") {
    throw new Error("仅管理员或部门主管可执行此操作");
  }

  if (user.roleType === "DEPARTMENT_MANAGER") {
    const currentDepartmentOrgNodeId = await findDepartmentOrgNodeId(user.orgNodeId);
    if (!currentDepartmentOrgNodeId || currentDepartmentOrgNodeId !== scope.departmentOrgNodeId) {
      throw new Error("无权管理该部门权限");
    }
  }

  return user;
}

/**
 * 权限类变更统一审计：模块 PERMISSION，日志中心「账号与权限」视图可见。
 * 必须在业务写同一事务内调用，保证日志失败随业务回滚。
 */
async function writePermissionAuditEvent(
  tx: Prisma.TransactionClient,
  currentUser: { id: string; name: string },
  input: {
    actionName: string;
    objectType: string;
    objectName: string;
    objectId?: string;
    operationNote?: string;
  },
) {
  await writeAuditEvent(tx, {
    actorId: currentUser.id,
    actorType: "USER",
    actorName: currentUser.name,
    module: AUDIT_MODULES.PERMISSION,
    actionCode: AUDIT_ACTION_CODES.PERMISSION_SCOPE_CHANGE,
    actionName: input.actionName,
    isSuccess: true,
    objectType: input.objectType,
    objectId: input.objectId ?? null,
    objectName: input.objectName,
    operationNote: input.operationNote,
  });
}

function formatPermissionScopeNote(scope: { scopeType: string; departmentOrgNodeId: string }) {
  return scope.scopeType === "SYSTEM" ? "系统" : `部门(${scope.departmentOrgNodeId})`;
}

function assertManagerRole(roleType: RoleType) {
  if (!managerEditableRoles.includes(roleType)) {
    throw new Error("部门主管只能设置组长或普通成员角色");
  }
}

async function findDepartmentOrgNodeId(orgNodeId: string | null | undefined) {
  return findNearestDepartmentOrgNodeId(orgNodeId);
}

async function ensureRootOrgNode(tx: Prisma.TransactionClient) {
  await tx.orgNode.upsert({
    where: { id: ROOT_ORG_NODE_ID },
    update: { dingtalkDeptId: "__org_root__", name: "组织根节点", nodeType: "ROOT", parentId: null },
    create: { id: ROOT_ORG_NODE_ID, dingtalkDeptId: "__org_root__", name: "组织根节点", nodeType: "ROOT", parentId: null },
  });
}

async function rebuildOrgClosures(tx: Prisma.TransactionClient) {
  const allOrgNodes = await tx.orgNode.findMany({ select: { id: true, parentId: true } });
  const nodeMap = new Map(allOrgNodes.map((node) => [node.id, node]));

  await tx.orgClosure.deleteMany();

  for (const node of allOrgNodes) {
    await tx.orgClosure.create({
      data: {
        ancestorId: node.id,
        descendantId: node.id,
        depth: 0,
      },
    });

    let ancestor = node.parentId ? nodeMap.get(node.parentId) ?? null : null;
    let depth = 1;
    while (ancestor) {
      await tx.orgClosure.create({
        data: {
          ancestorId: ancestor.id,
          descendantId: node.id,
          depth,
        },
      });
      ancestor = ancestor.parentId ? nodeMap.get(ancestor.parentId) ?? null : null;
      depth += 1;
    }
  }
}

async function assertOrgNodeType(orgNodeId: string, nodeType: OrgNodeType) {
  const orgNode = await prisma.orgNode.findUnique({
    where: { id: orgNodeId },
    select: { id: true, parentId: true, nodeType: true, name: true, isResignedPool: true },
  });
  if (!orgNode || orgNode.nodeType !== nodeType) {
    throw new Error(nodeType === "DEPARTMENT" ? "部门不存在" : "小组不存在");
  }
  return orgNode;
}

async function findDepartmentNode(orgNodeId: string) {
  return assertOrgNodeType(orgNodeId, "DEPARTMENT");
}

async function findTeamNode(orgNodeId: string) {
  return assertOrgNodeType(orgNodeId, "TEAM");
}

async function assertDepartmentExists(orgNodeId: string) {
  const departmentNode = await findDepartmentNode(orgNodeId);
  if (!departmentNode) throw new Error("部门不存在");
  return departmentNode;
}

async function assertTeamInDepartment(teamOrgNodeId: string | null, departmentOrgNodeId: string) {
  if (!teamOrgNodeId) return null;
  const teamNode = await findTeamNode(teamOrgNodeId);
  const teamDepartmentOrgNodeId = await findDepartmentOrgNodeId(teamNode.id);
  if (!teamNode || teamDepartmentOrgNodeId !== departmentOrgNodeId) {
    throw new Error("小组不属于当前部门");
  }
  return teamNode;
}

async function assertParentOrgNode(parentOrgNodeId: string, currentUser: Awaited<ReturnType<typeof requireOrgManager>>) {
  const parentNode = await prisma.orgNode.findUnique({
    where: { id: parentOrgNodeId },
    select: { id: true, nodeType: true, parentId: true, name: true },
  });

  if (!parentNode || !["DEPARTMENT", "TEAM"].includes(parentNode.nodeType)) {
    throw new Error("上级节点不存在");
  }

  await assertDepartmentManagerScope(currentUser, parentNode.id);
  return parentNode;
}

async function assertDepartmentManagerScope(currentUser: Awaited<ReturnType<typeof requireOrgManager>>, targetOrgNodeId: string | null | undefined) {
  if (currentUser.roleType !== "DEPARTMENT_MANAGER") return;
  const currentDepartmentOrgNodeId = await findDepartmentOrgNodeId(currentUser.orgNodeId);
  if (!currentDepartmentOrgNodeId || !(await isOrgNodeInSubtree(targetOrgNodeId, currentDepartmentOrgNodeId))) {
    throw new Error("无权管理该对象");
  }
}

async function syncTeamLeader(teamOrgNodeId: string, leaderId: string | null, departmentOrgNodeId: string) {
  if (!leaderId) return;
  const leader = await prisma.user.findUnique({ where: { id: leaderId } });
  const leaderDepartmentOrgNodeId = await findDepartmentOrgNodeId(leader?.orgNodeId);
  if (!leader || !leader.isActive || leader.roleType === "ADMIN" || leaderDepartmentOrgNodeId !== departmentOrgNodeId) {
    throw new Error("组长必须是当前部门有效非管理员成员");
  }
  await prisma.user.update({
    where: { id: leaderId },
    data: { orgNodeId: teamOrgNodeId, roleType: "TEAM_LEADER" },
  });
}

function revalidateOrganization() {
  revalidatePath("/organization");
  revalidatePath("/dashboard");
}

async function resolvePermissionScope(formData: FormData): Promise<{ scopeType: PermissionScopeInput["scopeType"]; departmentOrgNodeId: string }> {
  const scopeType = formData.get("scopeType");
  if (scopeType !== "SYSTEM" && scopeType !== "DEPARTMENT") {
    throw new Error("权限作用域无效");
  }

  if (scopeType === "SYSTEM") {
    return { scopeType, departmentOrgNodeId: "" };
  }

  const departmentOrgNodeId = (formData.get("departmentOrgNodeId") as string) || "";
  if (!departmentOrgNodeId) {
    throw new Error("部门权限缺少部门信息");
  }

  await assertDepartmentExists(departmentOrgNodeId);
  return { scopeType, departmentOrgNodeId };
}

function parsePermissionCells(permissionsValue: string, validIds: Set<string>) {
  let requestedCells: unknown;
  try {
    requestedCells = JSON.parse(permissionsValue || "[]");
  } catch {
    throw new Error("权限数据格式错误");
  }

  if (!Array.isArray(requestedCells)) {
    throw new Error("权限数据格式错误");
  }

  return requestedCells.map((cell) => {
    if (!cell || typeof cell !== "object") {
      throw new Error("权限数据格式错误");
    }

    const roleType = Reflect.get(cell, "roleType");
    const permissionId = Reflect.get(cell, "permissionId");
    const allowed = Reflect.get(cell, "allowed");
    const explicit = Reflect.get(cell, "explicit");
    const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

    if (
      !validRoles.includes(roleType as RoleType) ||
      typeof permissionId !== "string" ||
      !validIds.has(permissionId) ||
      typeof allowed !== "boolean" ||
      typeof explicit !== "boolean"
    ) {
      throw new Error("权限数据包含无效项");
    }

    return {
      roleType: roleType as RoleType,
      permissionId,
      allowed,
      explicit,
    };
  });
}


export async function updateFromDingTalk() {
  const currentUser = await requireAdmin();
  const result = await syncDingTalkOrganization(currentUser.dingtalkUserId);
  revalidateOrganization();
  return result;
}

export async function createDepartment(formData: FormData) {
  const currentUser = await requireAdmin();
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const managerId = ((formData.get("managerId") as string) || "").trim() || null;

  if (!name) {
    throw new Error("部门名称为必填项");
  }

  const duplicateDepartment = await prisma.orgNode.findFirst({
    where: {
      nodeType: "DEPARTMENT",
      name,
    },
    select: { id: true },
  });
  if (duplicateDepartment) {
    throw new Error("部门名称已存在");
  }

  await prisma.orgNode.upsert({
    where: { id: ROOT_ORG_NODE_ID },
    update: { dingtalkDeptId: "__org_root__", name: "组织根节点", nodeType: "ROOT", parentId: null },
    create: { id: ROOT_ORG_NODE_ID, dingtalkDeptId: "__org_root__", name: "组织根节点", nodeType: "ROOT", parentId: null },
  });

  const departmentId = randomUUID();
  let managerName: string | null = null;

  await prisma.$transaction(async (tx) => {
    await ensureRootOrgNode(tx);

    await tx.orgNode.create({
      data: {
        id: departmentId,
        name,
        nodeType: "DEPARTMENT",
        parentId: ROOT_ORG_NODE_ID,
      },
    });

    await rebuildOrgClosures(tx);

    // 记录组织节点创建日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ORGANIZATION,
      actionCode: AUDIT_ACTION_CODES.ORG_NODE_CREATE,
      actionName: "创建部门",
      isSuccess: true,
      objectType: "Department",
      objectId: departmentId,
      objectName: name,
      afterData: {
        name,
        nodeType: "DEPARTMENT",
        parentId: ROOT_ORG_NODE_ID,
      },
    });
  });

  if (managerId) {
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, name: true, isActive: true, deletedAt: true, roleType: true },
    });

    if (!manager || !manager.isActive || manager.deletedAt || manager.roleType === "ADMIN") {
      throw new Error("部门主管必须是有效非管理员成员");
    }

    managerName = manager.name;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: managerId },
        data: {
          orgNodeId: departmentId,
          roleType: "DEPARTMENT_MANAGER",
        },
      });

      // 记录设置部门负责人日志
      await writeAuditEvent(tx, {
        actorId: currentUser.id,
        actorType: "USER",
        actorName: currentUser.name,
        module: AUDIT_MODULES.ORGANIZATION,
        actionCode: AUDIT_ACTION_CODES.ORG_LEADER_CHANGE,
        actionName: "设置部门负责人",
        isSuccess: true,
        objectType: "Department",
        objectId: departmentId,
        objectName: name,
        afterData: { managerId, managerName: manager.name },
        operationNote: `设置为: ${manager.name}`,
      });
    });
  }

  revalidateOrganization();
}


export async function createUser(formData: FormData) {
  const currentUser = await requireOrgManager();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const mobile = formData.get("mobile") as string;
  const requestedRole = formData.get("roleType") as RoleType;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  const title = (formData.get("title") as string) || null;
  const departmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? ((formData.get("departmentOrgNodeId") as string) || await findDepartmentOrgNodeId(currentUser.orgNodeId))
    : await findDepartmentOrgNodeId(currentUser.orgNodeId);

  if (!name || !requestedRole || !departmentOrgNodeId) throw new Error("姓名、角色和部门为必填项");
  if (currentUser.roleType === "DEPARTMENT_MANAGER") assertManagerRole(requestedRole);
  await assertDepartmentExists(departmentOrgNodeId);
  await assertTeamInDepartment(teamOrgNodeId, departmentOrgNodeId);

  await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        mobile: mobile?.trim() || null,
        roleType: requestedRole,
        title: title?.trim() || null,
        orgNodeId: teamOrgNodeId ?? departmentOrgNodeId,
      },
    });

    // 记录账号创建日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ACCOUNT,
      actionCode: "ACCOUNT_CREATE",
      actionName: "创建用户账号",
      isSuccess: true,
      objectType: "User",
      objectId: newUser.id,
      objectName: newUser.name,
      afterData: {
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        roleType: newUser.roleType,
        title: newUser.title,
        orgNodeId: newUser.orgNodeId,
      },
      operationNote: `角色: ${requestedRole}`,
    });
  });

  revalidateOrganization();
}

export async function updateUser(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const mobile = formData.get("mobile") as string;
  const requestedRole = formData.get("roleType") as RoleType;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  const title = (formData.get("title") as string) || null;

  if (!id || !name || !requestedRole) throw new Error("缺少必要参数");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !target.isActive) throw new Error("用户不存在");

  if (currentUser.roleType === "DEPARTMENT_MANAGER") {
    await assertDepartmentManagerScope(currentUser, target.orgNodeId);
    if (!managerEditableRoles.includes(target.roleType)) {
      throw new Error("无权管理该用户");
    }
    assertManagerRole(requestedRole);
  }

  const departmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? await findDepartmentOrgNodeId(target.orgNodeId)
    : await findDepartmentOrgNodeId(currentUser.orgNodeId);
  if (!departmentOrgNodeId) throw new Error("用户缺少部门信息");
  await assertDepartmentExists(departmentOrgNodeId);
  await assertTeamInDepartment(teamOrgNodeId, departmentOrgNodeId);

  // 记录变更前的数据
  const beforeData = {
    name: target.name,
    email: target.email,
    mobile: target.mobile,
    roleType: target.roleType,
    title: target.title,
    orgNodeId: target.orgNodeId,
  };

  // 执行更新
  const newOrgNodeId = teamOrgNodeId ?? departmentOrgNodeId;
  const orgChanged = newOrgNodeId !== target.orgNodeId;
  const orgNodeNames = orgChanged
    ? await prisma.orgNode.findMany({
        where: { id: { in: [target.orgNodeId ?? "", newOrgNodeId] } },
        select: { id: true, name: true },
      })
    : [];
  const orgNameOf = (nodeId: string | null) =>
    nodeId ? (orgNodeNames.find((node) => node.id === nodeId)?.name ?? "未知") : "未分配";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        mobile: mobile?.trim() || null,
        roleType: requestedRole,
        title: title?.trim() || null,
      },
    });

    // 调组跟随：人 + 名下项目/需求/产品目标一起改挂新组（applyUserOrgChange 内部自行更新 orgNodeId）
    if (orgChanged) {
      const moveResult = await applyUserOrgChange(tx, { userId: id, newOrgNodeId });
      await writeAuditEvent(tx, {
        actorId: currentUser.id,
        actorType: "USER",
        actorName: currentUser.name,
        module: AUDIT_MODULES.ORGANIZATION,
        actionCode: AUDIT_ACTION_CODES.ORG_MEMBER_MOVE,
        actionName: "成员调组",
        isSuccess: true,
        objectType: "User",
        objectId: id,
        objectName: target.name,
        beforeData: { orgNodeId: target.orgNodeId, orgName: orgNameOf(target.orgNodeId) },
        afterData: { orgNodeId: newOrgNodeId, orgName: orgNameOf(newOrgNodeId), ...moveResult },
        changedFields: ["orgNodeId"],
        operationNote: `${orgNameOf(target.orgNodeId)} → ${orgNameOf(newOrgNodeId)}；随组改挂：项目 ${moveResult.projectCount} 个、需求 ${moveResult.quarterlyWorkCount} 条、产品目标 ${moveResult.productGoalCount} 个`,
      });
    }

    // 记录变更后的数据
    const afterData = {
      name: name.trim(),
      email: email?.trim() || null,
      mobile: mobile?.trim() || null,
      roleType: requestedRole,
      title: title?.trim() || null,
      orgNodeId: teamOrgNodeId ?? departmentOrgNodeId,
    };

    // 识别变更的字段
    const changedFields: string[] = [];
    if (beforeData.name !== afterData.name) changedFields.push("name");
    if (beforeData.email !== afterData.email) changedFields.push("email");
    if (beforeData.mobile !== afterData.mobile) changedFields.push("mobile");
    if (beforeData.roleType !== afterData.roleType) changedFields.push("roleType");
    if (beforeData.title !== afterData.title) changedFields.push("title");
    if (beforeData.orgNodeId !== afterData.orgNodeId) changedFields.push("orgNodeId");

    // 如果角色发生变更，记录角色变更日志
    if (beforeData.roleType !== afterData.roleType) {
      await writeAuditEvent(tx, {
        actorId: currentUser.id,
        actorType: "USER",
        actorName: currentUser.name,
        module: AUDIT_MODULES.ACCOUNT,
        actionCode: AUDIT_ACTION_CODES.ROLE_CHANGE,
        actionName: "变更用户角色",
        isSuccess: true,
        objectType: "User",
        objectId: id,
        objectName: target.name,
        beforeData,
        afterData,
        changedFields,
        operationNote: `${beforeData.roleType} → ${afterData.roleType}`,
      });
    } else if (changedFields.length > 0) {
      // 其他字段变更，记录账号更新日志
      await writeAuditEvent(tx, {
        actorId: currentUser.id,
        actorType: "USER",
        actorName: currentUser.name,
        module: AUDIT_MODULES.ACCOUNT,
        actionCode: "ACCOUNT_UPDATE",
        actionName: "更新用户信息",
        isSuccess: true,
        objectType: "User",
        objectId: id,
        objectName: target.name,
        beforeData,
        afterData,
        changedFields,
        operationNote: `变更字段: ${changedFields.join(", ")}`,
      });
    }
  });

  revalidateOrganization();
}

/** 删除守卫：作为审批人出现在未删除 KPI 上的审批步骤数（不限步骤状态）。两步查询：步骤表与 KPI 无 relation */
async function countApprovalStepsAsApprover(userId: string) {
  const kpis = await prisma.personalKpi.findMany({ where: { deletedAt: null }, select: { id: true } });
  if (kpis.length === 0) return 0;
  return prisma.personalKpiApprovalStep.count({
    where: { approverId: userId, personalKpiId: { in: kpis.map((kpi) => kpi.id) } },
  });
}

/** 离职交接口径：未完成 KPI（状态非 COMPLETED）上 PENDING/WAITING 且审批人为该用户的步骤 id */
async function findPendingApprovalStepIdsForUser(userId: string): Promise<string[]> {
  const openKpis = await prisma.personalKpi.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" } },
    select: { id: true },
  });
  if (openKpis.length === 0) return [];
  const steps = await prisma.personalKpiApprovalStep.findMany({
    where: {
      approverId: userId,
      status: { in: ["PENDING", "WAITING"] },
      personalKpiId: { in: openKpis.map((kpi) => kpi.id) },
    },
    select: { id: true },
  });
  return steps.map((step) => step.id);
}

export async function deleteUser(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少用户 ID");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new Error("用户不存在");
  if (currentUser.roleType === "DEPARTMENT_MANAGER") {
    await assertDepartmentManagerScope(currentUser, target.orgNodeId);
    if (!managerEditableRoles.includes(target.roleType)) {
      throw new Error("无权删除该用户");
    }
  }

  // 有业务记录则拒绝删除：「删除」仅用于误加/测试账号，有在职历史请走「离职」
  const [
    projectCount, workCount, goalCount, kpiCount, approvalStepCount,
    metricCount, metricSourceCount, assignmentCount, participantCount, decisionResultCount,
  ] = await Promise.all([
    prisma.project.count({ where: { ownerId: id, deletedAt: null } }),
    prisma.quarterlyWork.count({ where: { ownerId: id, deletedAt: null } }),
    prisma.productGoal.count({ where: { ownerId: id, deletedAt: null } }),
    // 个人 KPI 含全部历史（已拍板：有 KPI 记录就不允许删除）
    prisma.personalKpi.count({ where: { userId: id } }),
    countApprovalStepsAsApprover(id),
    prisma.annualGoalMetric.count({ where: { responsibleUserId: id, deletedAt: null } }),
    prisma.annualGoalMetricSource.count({ where: { responsibleUserId: id, deletedAt: null } }),
    prisma.annualGoalMetricAssignment.count({ where: { responsibleUserId: id, deletedAt: null } }),
    prisma.talentReviewParticipant.count({ where: { userId: id } }),
    prisma.talentDecisionEmployeeResult.count({ where: { userId: id } }),
  ]);
  const talentRecordCount = participantCount + decisionResultCount;
  const totalRecords = projectCount + workCount + goalCount + kpiCount + approvalStepCount
    + metricCount + metricSourceCount + assignmentCount + talentRecordCount;
  if (totalRecords > 0) {
    throw new Error(
      `无法删除：该成员名下存在业务记录（项目 ${projectCount} 个、需求 ${workCount} 条、产品目标 ${goalCount} 个、个人 KPI ${kpiCount} 份、待审批步骤 ${approvalStepCount} 条、年度指标/承接 ${metricCount + metricSourceCount + assignmentCount} 项、人才记录 ${talentRecordCount} 条）。「删除」仅用于误加或测试账号，有在职历史请使用「离职」。`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });

    // 记录账号禁用日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ACCOUNT,
      actionCode: AUDIT_ACTION_CODES.ACCOUNT_DISABLE,
      actionName: "禁用用户账号",
      isSuccess: true,
      objectType: "User",
      objectId: id,
      objectName: target.name,
      beforeData: { isActive: target.isActive },
      afterData: { isActive: false },
      operationNote: `原角色: ${target.roleType}`,
    });
  });

  revalidateOrganization();
}

// ── 离职 ──

/** 离职确认框预取：待交接 KPI 审批步骤数 + 可选接收人（同部门在职人员） */
export async function getResignPreview(userId: string) {
  const currentUser = await requireOrgManager();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || !target.isActive || target.deletedAt || target.resignedAt) {
    throw new Error("用户不存在或已离职");
  }
  if (currentUser.roleType === "DEPARTMENT_MANAGER") {
    await assertDepartmentManagerScope(currentUser, target.orgNodeId);
    if (!managerEditableRoles.includes(target.roleType)) {
      throw new Error("无权操作该用户");
    }
  }

  const pendingStepIds = await findPendingApprovalStepIdsForUser(userId);
  if (pendingStepIds.length === 0) {
    return { pendingStepCount: 0, successorOptions: [] as Array<{ id: string; name: string }> };
  }

  const departmentOrgNodeId = await findDepartmentOrgNodeId(target.orgNodeId);
  const descendantIds = departmentOrgNodeId
    ? await prisma.orgClosure.findMany({
        where: { ancestorId: departmentOrgNodeId },
        select: { descendantId: true },
      })
    : [];
  const successorOptions = descendantIds.length === 0
    ? []
    : await prisma.user.findMany({
        where: {
          orgNodeId: { in: descendantIds.map((row) => row.descendantId) },
          isActive: true,
          deletedAt: null,
          resignedAt: null,
          id: { not: userId },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

  return { pendingStepCount: pendingStepIds.length, successorOptions };
}

/**
 * 离职：进入本部门「离职人员」系统组，roleType/职级/title 保留，不能登录。
 * 名下单据改挂离职人员组（原业务组记在 User.originalOrgNodeId/originalOrgName）；
 * 未完成 KPI 的待审批步骤可指定接收人（只接步骤，不接单据负责人）。
 */
export async function resignUser(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  const kpiSuccessorId = (formData.get("kpiSuccessorId") as string) || null;
  if (!id) throw new Error("缺少用户 ID");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || !target.isActive || target.deletedAt || target.resignedAt) {
    throw new Error("用户不存在或已离职");
  }
  if (target.roleType === "ADMIN") throw new Error("系统管理员不能走离职入口");
  if (currentUser.roleType === "DEPARTMENT_MANAGER") {
    await assertDepartmentManagerScope(currentUser, target.orgNodeId);
    if (!managerEditableRoles.includes(target.roleType)) {
      throw new Error("无权操作该用户");
    }
  }

  const departmentOrgNodeId = await findDepartmentOrgNodeId(target.orgNodeId);
  if (!departmentOrgNodeId) throw new Error("用户缺少部门信息");

  const pendingStepIds = await findPendingApprovalStepIdsForUser(id);

  let successor: { id: string; name: string } | null = null;
  if (kpiSuccessorId) {
    if (pendingStepIds.length === 0) throw new Error("该成员没有需要交接的 KPI 审批步骤");
    if (kpiSuccessorId === id) throw new Error("KPI 接收人不能是本人");
    const successorUser = await prisma.user.findUnique({ where: { id: kpiSuccessorId } });
    if (!successorUser || !successorUser.isActive || successorUser.deletedAt || successorUser.resignedAt) {
      throw new Error("KPI 接收人必须是在职人员");
    }
    const successorDepartmentId = await findDepartmentOrgNodeId(successorUser.orgNodeId);
    if (successorDepartmentId !== departmentOrgNodeId) {
      throw new Error("KPI 接收人必须是同部门在职人员");
    }
    successor = { id: successorUser.id, name: successorUser.name };
  }

  // 原业务组只记一次：已记过的不覆盖（如先调组后离职的场景）
  const originalOrgNodeId = target.originalOrgNodeId ?? target.orgNodeId;
  const originalOrgName = target.originalOrgName
    ?? (target.orgNodeId
      ? (await prisma.orgNode.findUnique({ where: { id: target.orgNodeId }, select: { name: true } }))?.name ?? null
      : null);

  await prisma.$transaction(async (tx) => {
    const pool = await ensureResignedPoolNode(tx, departmentOrgNodeId);

    // 名下单据跟着人走：项目/需求/产品目标 + 个人 KPI 改挂离职人员组（年度指标承接留在原组）
    const [project, quarterlyWork, productGoal, kpi] = await Promise.all([
      tx.project.updateMany({
        where: { ownerId: id, deletedAt: null, orgNodeId: { not: pool.id } },
        data: { orgNodeId: pool.id },
      }),
      tx.quarterlyWork.updateMany({
        where: { ownerId: id, deletedAt: null, orgNodeId: { not: pool.id } },
        data: { orgNodeId: pool.id },
      }),
      tx.productGoal.updateMany({
        where: { ownerId: id, deletedAt: null, orgNodeId: { not: pool.id } },
        data: { orgNodeId: pool.id },
      }),
      tx.personalKpi.updateMany({
        where: { userId: id, deletedAt: null, orgNodeId: { not: pool.id } },
        data: { orgNodeId: pool.id },
      }),
    ]);

    if (successor && pendingStepIds.length > 0) {
      await tx.personalKpiApprovalStep.updateMany({
        where: { id: { in: pendingStepIds } },
        data: { approverId: successor.id },
      });
    }

    await tx.user.update({
      where: { id },
      data: {
        isActive: false,
        resignedAt: new Date(),
        orgNodeId: pool.id,
        originalOrgNodeId,
        originalOrgName,
      },
    });

    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ORGANIZATION,
      actionCode: AUDIT_ACTION_CODES.ORG_MEMBER_RESIGN,
      actionName: "成员离职",
      isSuccess: true,
      objectType: "User",
      objectId: id,
      objectName: target.name,
      beforeData: { roleType: target.roleType, orgNodeId: target.orgNodeId, orgName: originalOrgName },
      afterData: { isActive: false, resignedAt: true, orgNodeId: pool.id },
      operationNote:
        `原角色 ${target.roleType}，原小组「${originalOrgName ?? "未分配"}」；`
        + `改挂离职人员组：项目 ${project.count} 个、需求 ${quarterlyWork.count} 条、产品目标 ${productGoal.count} 个、个人 KPI ${kpi.count} 份`
        + (successor ? `；KPI 审批步骤 ${pendingStepIds.length} 条交接给 ${successor.name}` : ""),
    });
  });

  revalidateOrganization();
}

// ── Team CRUD ──

export async function createTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const name = formData.get("name") as string;
  const requestedParentOrgNodeId = (formData.get("parentOrgNodeId") as string) || null;
  const leaderId = (formData.get("leaderId") as string) || null;
  const description = (formData.get("description") as string) || null;
  void description;

  if (!name) throw new Error("小组名称为必填项");
  if (!requestedParentOrgNodeId) throw new Error("请选择上级节点");

  const parentNode = await assertParentOrgNode(requestedParentOrgNodeId, currentUser);
  const departmentOrgNodeId = await findDepartmentOrgNodeId(parentNode.id);
  if (!departmentOrgNodeId) throw new Error("上级节点未绑定部门");

  const teamOrgNodeId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.orgNode.create({
      data: {
        id: teamOrgNodeId,
        name: name.trim(),
        nodeType: "TEAM",
        parentId: parentNode.id,
      },
    });

    await rebuildOrgClosures(tx);

    // 记录组织节点创建日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ORGANIZATION,
      actionCode: AUDIT_ACTION_CODES.ORG_NODE_CREATE,
      actionName: "创建小组",
      isSuccess: true,
      objectType: "Team",
      objectId: teamOrgNodeId,
      objectName: name.trim(),
      afterData: {
        name: name.trim(),
        nodeType: "TEAM",
        parentId: parentNode.id,
      },
    });
  });

  await syncTeamLeader(teamOrgNodeId, leaderId, departmentOrgNodeId);

  revalidateOrganization();
}

export async function updateTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const requestedParentOrgNodeId = (formData.get("parentOrgNodeId") as string) || null;
  const leaderId = (formData.get("leaderId") as string) || null;

  if (!id || !name) throw new Error("缺少必要参数");

  const teamNode = await findTeamNode(id);
  if (!teamNode) throw new Error("小组不存在");
  if (teamNode.isResignedPool) throw new Error("「离职人员」组是系统小组，不能修改");
  await assertDepartmentManagerScope(currentUser, teamNode.id);

  let nextParentOrgNodeId = teamNode.parentId;
  if (requestedParentOrgNodeId) {
    const parentNode = await assertParentOrgNode(requestedParentOrgNodeId, currentUser);
    if (parentNode.id === teamNode.id || await isOrgNodeInSubtree(parentNode.id, teamNode.id)) {
      throw new Error("上级节点不能选择当前小组或其下级节点");
    }
    nextParentOrgNodeId = parentNode.id;
  }

  if (!nextParentOrgNodeId) {
    throw new Error("小组缺少上级节点");
  }

  // 记录变更前的数据
  const beforeData = {
    name: teamNode.name,
    parentId: teamNode.parentId,
  };

  await prisma.$transaction(async (tx) => {
    await tx.orgNode.update({
      where: { id: teamNode.id },
      data: { name: name.trim(), parentId: nextParentOrgNodeId },
    });

    if (nextParentOrgNodeId !== teamNode.parentId) {
      await rebuildOrgClosures(tx);
    }

    // 记录变更后的数据
    const afterData = {
      name: name.trim(),
      parentId: nextParentOrgNodeId,
    };

    // 识别变更的字段
    const changedFields: string[] = [];
    if (beforeData.name !== afterData.name) changedFields.push("name");
    if (beforeData.parentId !== afterData.parentId) changedFields.push("parentId");

    // 记录组织节点更新日志
    if (changedFields.length > 0) {
      await writeAuditEvent(tx, {
        actorId: currentUser.id,
        actorType: "USER",
        actorName: currentUser.name,
        module: AUDIT_MODULES.ORGANIZATION,
        actionCode: AUDIT_ACTION_CODES.ORG_NODE_UPDATE,
        actionName: "更新小组信息",
        isSuccess: true,
        objectType: "Team",
        objectId: id,
        objectName: teamNode.name,
        beforeData,
        afterData,
        changedFields,
        operationNote: `变更字段: ${changedFields.join(", ")}`,
      });
    }
  });

  const departmentOrgNodeId = await findDepartmentOrgNodeId(nextParentOrgNodeId);
  if (!departmentOrgNodeId) throw new Error("上级节点未绑定部门");
  await syncTeamLeader(id, leaderId, departmentOrgNodeId);

  revalidateOrganization();
}

export async function deleteTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少小组 ID");

  const teamNode = await findTeamNode(id);
  if (!teamNode) throw new Error("小组不存在");
  if (teamNode.isResignedPool) throw new Error("「离职人员」组是系统小组，不能删除");
  await assertDepartmentManagerScope(currentUser, teamNode.id);

  const childTeamCount = await prisma.orgNode.count({
    where: { parentId: teamNode.id, nodeType: "TEAM" },
  });
  if (childTeamCount > 0) {
    throw new Error("请先处理下级小组后再删除当前小组");
  }

  // 有成员或任何挂靠时拒绝删除，提示先并入其他小组（不再把成员挪到部门节点）
  const [memberCount, projectCount, workCount, goalCount, kpiCount, assignmentCount, groupBotCount] =
    await Promise.all([
      prisma.user.count({ where: { orgNodeId: teamNode.id, deletedAt: null } }),
      prisma.project.count({ where: { orgNodeId: teamNode.id, deletedAt: null } }),
      prisma.quarterlyWork.count({ where: { orgNodeId: teamNode.id, deletedAt: null } }),
      prisma.productGoal.count({ where: { orgNodeId: teamNode.id, deletedAt: null } }),
      prisma.personalKpi.count({ where: { orgNodeId: teamNode.id, deletedAt: null } }),
      prisma.annualGoalMetricAssignment.count({ where: { teamOrgNodeId: teamNode.id, deletedAt: null } }),
      prisma.notificationGroupBotOrgNode.count({ where: { orgNodeId: teamNode.id } }),
    ]);
  if (groupBotCount > 0) {
    throw new Error("该小组已绑定钉钉群机器人，请先在通知配置中改绑后再删除");
  }
  if (memberCount + projectCount + workCount + goalCount + kpiCount + assignmentCount > 0) {
    throw new Error(
      `小组仍有成员或挂靠（成员 ${memberCount} 人、项目 ${projectCount} 个、需求 ${workCount} 条、产品目标 ${goalCount} 个、个人 KPI ${kpiCount} 份、年度指标承接 ${assignmentCount} 项），请先使用「并入其他小组」`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.orgClosure.deleteMany({ where: { OR: [{ ancestorId: teamNode.id }, { descendantId: teamNode.id }] } });
    await tx.orgNode.delete({ where: { id: teamNode.id } });
    await rebuildOrgClosures(tx);

    // 记录组织节点删除日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ORGANIZATION,
      actionCode: AUDIT_ACTION_CODES.ORG_NODE_DELETE,
      actionName: "删除小组",
      isSuccess: true,
      objectType: "Team",
      objectId: id,
      objectName: teamNode.name,
      beforeData: {
        name: teamNode.name,
        parentId: teamNode.parentId,
        nodeType: teamNode.nodeType,
      },
    });
  });

  revalidateOrganization();
}

// ── 整组并入 ──

/** 并入确认框预取：在职人数、各类挂靠数量、机器人绑定、可并入的目标组 */
export async function getTeamMergePreview(sourceTeamId: string) {
  const currentUser = await requireOrgManager();
  const teamNode = await findTeamNode(sourceTeamId);
  if (!teamNode) throw new Error("小组不存在");
  await assertDepartmentManagerScope(currentUser, teamNode.id);

  const [activeMemberCount, projectCount, quarterlyWorkCount, productGoalCount, kpiCount, assignmentCount, groupBotCount] =
    await Promise.all([
      prisma.user.count({ where: { orgNodeId: sourceTeamId, isActive: true, deletedAt: null } }),
      prisma.project.count({ where: { orgNodeId: sourceTeamId, deletedAt: null } }),
      prisma.quarterlyWork.count({ where: { orgNodeId: sourceTeamId, deletedAt: null } }),
      prisma.productGoal.count({ where: { orgNodeId: sourceTeamId, deletedAt: null } }),
      prisma.personalKpi.count({ where: { orgNodeId: sourceTeamId, deletedAt: null } }),
      prisma.annualGoalMetricAssignment.count({ where: { teamOrgNodeId: sourceTeamId, deletedAt: null } }),
      prisma.notificationGroupBotOrgNode.count({ where: { orgNodeId: sourceTeamId } }),
    ]);

  const departmentOrgNodeId = await findDepartmentOrgNodeId(sourceTeamId);
  const targetOptions = departmentOrgNodeId
    ? await prisma.orgNode.findMany({
        where: { parentId: departmentOrgNodeId, nodeType: "TEAM", isResignedPool: false, id: { not: sourceTeamId } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return {
    teamName: teamNode.name,
    activeMemberCount,
    projectCount,
    quarterlyWorkCount,
    productGoalCount,
    kpiCount,
    assignmentCount,
    hasGroupBotBinding: groupBotCount > 0,
    targetOptions,
  };
}

/**
 * 整组并入：在职成员（组长先降为组员）连同名下单据进入目标组；指标承接、个人 KPI、
 * 审批策略固定节点改挂目标组；权限授予停用；确认源组干净后删除节点。
 */
export async function mergeTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const sourceTeamId = formData.get("sourceTeamId") as string;
  const targetTeamId = formData.get("targetTeamId") as string;
  if (!sourceTeamId || !targetTeamId) throw new Error("缺少必要参数");
  if (sourceTeamId === targetTeamId) throw new Error("不能并入自己");

  const sourceNode = await findTeamNode(sourceTeamId);
  const targetNode = await findTeamNode(targetTeamId);
  if (!sourceNode || !targetNode) throw new Error("小组不存在");
  if (sourceNode.isResignedPool) throw new Error("「离职人员」组不能并入其他小组");
  if (targetNode.isResignedPool) throw new Error("不能并入「离职人员」组");
  await assertDepartmentManagerScope(currentUser, sourceNode.id);

  const sourceDepartmentId = await findDepartmentOrgNodeId(sourceNode.id);
  const targetDepartmentId = await findDepartmentOrgNodeId(targetNode.id);
  if (!sourceDepartmentId || sourceDepartmentId !== targetDepartmentId) {
    throw new Error("只能并入同部门的业务小组");
  }

  const childTeamCount = await prisma.orgNode.count({
    where: { parentId: sourceNode.id, nodeType: "TEAM" },
  });
  if (childTeamCount > 0) throw new Error("请先处理下级小组后再并入");

  const groupBotCount = await prisma.notificationGroupBotOrgNode.count({
    where: { orgNodeId: sourceNode.id },
  });
  if (groupBotCount > 0) {
    throw new Error("该小组已绑定钉钉群机器人，请先在通知配置中改绑后再并入");
  }

  await prisma.$transaction(async (tx) => {
    // 1. 在职成员：组长先降为组员（不把原组长带到目标组当组长），再逐个调组跟随
    const activeMembers = await tx.user.findMany({
      where: { orgNodeId: sourceNode.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, roleType: true },
    });
    const demotedLeaderNames: string[] = [];
    const moved = { projectCount: 0, quarterlyWorkCount: 0, productGoalCount: 0 };
    for (const member of activeMembers) {
      if (member.roleType === "TEAM_LEADER") {
        await tx.user.update({ where: { id: member.id }, data: { roleType: "MEMBER" } });
        demotedLeaderNames.push(member.name);
      }
      const result = await applyUserOrgChange(tx, { userId: member.id, newOrgNodeId: targetNode.id });
      moved.projectCount += result.projectCount;
      moved.quarterlyWorkCount += result.quarterlyWorkCount;
      moved.productGoalCount += result.productGoalCount;
    }

    // 2. 兜底：仍挂在源组、负责人在职的单据改挂目标组；负责人在离职人员组的单据留在那里不并走
    const activeUserIds = new Set(
      (await tx.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true } })).map((user) => user.id),
    );
    const fallbackWhere = { orgNodeId: sourceNode.id, deletedAt: null } as const;
    const [fallbackProject, fallbackWork, fallbackGoal] = await Promise.all([
      tx.project.updateMany({ where: { ...fallbackWhere, ownerId: { in: [...activeUserIds] } }, data: { orgNodeId: targetNode.id } }),
      tx.quarterlyWork.updateMany({ where: { ...fallbackWhere, ownerId: { in: [...activeUserIds] } }, data: { orgNodeId: targetNode.id } }),
      tx.productGoal.updateMany({ where: { ...fallbackWhere, ownerId: { in: [...activeUserIds] } }, data: { orgNodeId: targetNode.id } }),
    ]);
    moved.projectCount += fallbackProject.count;
    moved.quarterlyWorkCount += fallbackWork.count;
    moved.productGoalCount += fallbackGoal.count;

    // 3. 个人 KPI 随组改挂（已拍板口径；审批链走快照字段不受影响）
    const kpiMoved = await tx.personalKpi.updateMany({
      where: { orgNodeId: sourceNode.id, deletedAt: null },
      data: { orgNodeId: targetNode.id },
    });

    // 4. 年度指标承接改挂目标组（责任人不变）
    const assignmentMoved = await tx.annualGoalMetricAssignment.updateMany({
      where: { teamOrgNodeId: sourceNode.id, deletedAt: null },
      data: { teamOrgNodeId: targetNode.id },
    });

    // 5. 审批策略固定节点改指向目标组
    await tx.kpiApprovalPolicyStep.updateMany({
      where: { approvalOrgNodeId: sourceNode.id },
      data: { approvalOrgNodeId: targetNode.id },
    });
    // 关联表有 @@unique：目标已存在则删源行，否则改指向
    const stepOrgRows = await tx.kpiApprovalPolicyStepOrgNode.findMany({
      where: { orgNodeId: sourceNode.id },
      select: { id: true, policyStepId: true },
    });
    for (const row of stepOrgRows) {
      const duplicate = await tx.kpiApprovalPolicyStepOrgNode.findUnique({
        where: { policyStepId_orgNodeId: { policyStepId: row.policyStepId, orgNodeId: targetNode.id } },
        select: { id: true },
      });
      if (duplicate) {
        await tx.kpiApprovalPolicyStepOrgNode.delete({ where: { id: row.id } });
      } else {
        await tx.kpiApprovalPolicyStepOrgNode.update({ where: { id: row.id }, data: { orgNodeId: targetNode.id } });
      }
    }
    const scopeRows = await tx.kpiApprovalPolicyScope.findMany({
      where: { orgNodeId: sourceNode.id },
      select: { id: true, policyId: true },
    });
    for (const row of scopeRows) {
      const duplicate = await tx.kpiApprovalPolicyScope.findUnique({
        where: { policyId_orgNodeId: { policyId: row.policyId, orgNodeId: targetNode.id } },
        select: { id: true },
      });
      if (duplicate) {
        await tx.kpiApprovalPolicyScope.delete({ where: { id: row.id } });
      } else {
        await tx.kpiApprovalPolicyScope.update({ where: { id: row.id }, data: { orgNodeId: targetNode.id } });
      }
    }
    // 注意：进行中的审批步骤（PersonalKpiApprovalStep）快照字段不改，避免审批链中途变化

    // 6. 挂在源组节点上的权限授予停用（目标组使用自己的矩阵，不复制）
    await tx.orgPermissionGrant.updateMany({
      where: { orgNodeId: sourceNode.id, isActive: true },
      data: { isActive: false },
    });

    // 7. 兜底：已软删用户残留的 orgNodeId 一并挪走，保证源组干净
    await tx.user.updateMany({
      where: { orgNodeId: sourceNode.id },
      data: { orgNodeId: targetNode.id },
    });

    // 8. 清零断言：源组不再有任何挂靠，否则整体回滚
    const [
      remainingUsers, remainingProjects, remainingWorks,
      remainingGoals, remainingKpis, remainingAssignments,
    ] = await Promise.all([
      tx.user.count({ where: { orgNodeId: sourceNode.id } }),
      tx.project.count({ where: { orgNodeId: sourceNode.id } }),
      tx.quarterlyWork.count({ where: { orgNodeId: sourceNode.id } }),
      tx.productGoal.count({ where: { orgNodeId: sourceNode.id } }),
      tx.personalKpi.count({ where: { orgNodeId: sourceNode.id } }),
      tx.annualGoalMetricAssignment.count({ where: { teamOrgNodeId: sourceNode.id } }),
    ]);
    const remainingTotal = remainingUsers + remainingProjects + remainingWorks
      + remainingGoals + remainingKpis + remainingAssignments;
    if (remainingTotal > 0) {
      throw new Error(
        `并入后仍有数据挂在原小组（成员 ${remainingUsers}、项目 ${remainingProjects}、需求 ${remainingWorks}、产品目标 ${remainingGoals}、KPI ${remainingKpis}、指标承接 ${remainingAssignments}），操作已回滚，请联系管理员处理`,
      );
    }

    // 9. 删除节点并重建闭包
    await tx.orgClosure.deleteMany({
      where: { OR: [{ ancestorId: sourceNode.id }, { descendantId: sourceNode.id }] },
    });
    await tx.orgNode.delete({ where: { id: sourceNode.id } });
    await rebuildOrgClosures(tx);

    // 10. 审计
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ORGANIZATION,
      actionCode: AUDIT_ACTION_CODES.ORG_TEAM_MERGE,
      actionName: "整组并入",
      isSuccess: true,
      objectType: "Team",
      objectId: sourceNode.id,
      objectName: sourceNode.name,
      beforeData: { name: sourceNode.name, parentId: sourceNode.parentId, memberCount: activeMembers.length },
      afterData: { mergedInto: targetNode.name, targetTeamId: targetNode.id },
      operationNote:
        `「${sourceNode.name}」并入「${targetNode.name}」：成员 ${activeMembers.length} 人`
        + (demotedLeaderNames.length > 0 ? `（组长 ${demotedLeaderNames.join("、")} 已转为组员）` : "")
        + `；项目 ${moved.projectCount} 个、需求 ${moved.quarterlyWorkCount} 条、产品目标 ${moved.productGoalCount} 个、个人 KPI ${kpiMoved.count} 份、指标承接 ${assignmentMoved.count} 项`,
    });
  });

  revalidateOrganization();
}

// ── Department and menu permissions ──

export async function setDepartmentManager(formData: FormData) {
  const currentUser = await requireAdmin();
  const departmentOrgNodeId = formData.get("departmentOrgNodeId") as string;
  const managerId = formData.get("managerId") as string;

  if (!departmentOrgNodeId || !managerId) throw new Error("缺少部门或主管参数");

  const departmentNode = await assertDepartmentExists(departmentOrgNodeId);
  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager || !manager.isActive || manager.roleType === "ADMIN" || manager.orgNodeId !== departmentNode.id) {
    throw new Error("主管必须是当前部门有效非管理员成员");
  }

  const previousManager = await prisma.user.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      roleType: "DEPARTMENT_MANAGER",
      orgNodeId: departmentNode.id,
      id: { not: managerId },
    },
    select: { id: true, name: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: managerId }, data: { roleType: "DEPARTMENT_MANAGER" } });

    if (previousManager) {
      await tx.user.update({
        where: { id: previousManager.id },
        data: { roleType: "MEMBER" },
      });
    }

    // 记录部门负责人变更日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.ORGANIZATION,
      actionCode: AUDIT_ACTION_CODES.ORG_LEADER_CHANGE,
      actionName: "变更部门负责人",
      isSuccess: true,
      objectType: "Department",
      objectId: departmentNode.id,
      objectName: departmentNode.name,
      beforeData: previousManager ? { managerId: previousManager.id, managerName: previousManager.name } : null,
      afterData: { managerId: manager.id, managerName: manager.name },
      operationNote: previousManager
        ? `${previousManager.name} → ${manager.name}`
        : `设置为: ${manager.name}`,
    });
  });

  revalidateOrganization();
}

export async function saveRoleMenuPermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];
  console.log("[saveRoleMenuPermissions] start", {
    userId: currentUser.id,
    roleType: currentUser.roleType,
    scope,
    payloadLength: permissionsValue?.length ?? 0,
  });

  const menus = await prisma.menuPermission.findMany({
    where: { isEnabled: true },
    select: { id: true, path: true, code: true },
  });
  const menuIdSet = new Set(menus.map((menu) => menu.id));
  const requestedCells = parsePermissionCells(permissionsValue, menuIdSet);
  const nextCells = new Map(requestedCells.map((cell) => [`${cell.roleType}:${cell.permissionId}`, cell]));
  const annualGoalsMemberCell = requestedCells.find((cell) => cell.roleType === "MEMBER" && cell.permissionId === menus.find((menu) => menu.code === "annual-goals")?.id);
  console.log("[saveRoleMenuPermissions] parsed", {
    requestedCount: requestedCells.length,
    annualGoalsMemberCell,
  });

  for (const menu of menus) {
    if (["/organization", "/dashboard"].includes(menu.path)) {
      nextCells.set(`ADMIN:${menu.id}`, {
        roleType: "ADMIN",
        permissionId: menu.id,
        allowed: true,
        explicit: true,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const permissionIds = menus.map((menu) => menu.id);

    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "保存菜单权限矩阵",
      objectType: "PermissionMatrix",
      objectName: "菜单权限矩阵",
      operationNote: `范围：${formatPermissionScopeNote(scope)}；权限格 ${nextCells.size} 项`,
    });

    if (scope.scopeType === "SYSTEM") {
      const deleted = await tx.roleMenuPermission.deleteMany({
        where: {
          scopeType: scope.scopeType,
          departmentOrgNodeId: scope.departmentOrgNodeId,
          roleType: { in: validRoles },
          menuPermissionId: { in: permissionIds },
        },
      });
      console.log("[saveRoleMenuPermissions] system delete", deleted);

      if (nextCells.size > 0) {
        const created = await tx.roleMenuPermission.createMany({
          data: [...nextCells.values()].map((cell) => ({
            scopeType: scope.scopeType,
            departmentOrgNodeId: scope.departmentOrgNodeId,
            roleType: cell.roleType,
            menuPermissionId: cell.permissionId,
            allowed: cell.allowed,
          })),
        });
        console.log("[saveRoleMenuPermissions] system create", created);
      }

      return;
    }

    const deleted = await tx.roleMenuPermission.deleteMany({
      where: {
        scopeType: scope.scopeType,
        departmentOrgNodeId: scope.departmentOrgNodeId,
        roleType: { in: validRoles },
        menuPermissionId: { in: permissionIds },
      },
    });
    console.log("[saveRoleMenuPermissions] department delete", deleted);

    const scopedCells = [...nextCells.values()].filter((cell) => cell.explicit);
    if (scopedCells.length > 0) {
      const created = await tx.roleMenuPermission.createMany({
        data: scopedCells.map((cell) => ({
          scopeType: scope.scopeType,
          departmentOrgNodeId: scope.departmentOrgNodeId,
          roleType: cell.roleType,
          menuPermissionId: cell.permissionId,
          allowed: cell.allowed,
        })),
      });
      console.log("[saveRoleMenuPermissions] department create", created);
    }
  });

  revalidateOrganization();
}

export async function saveAnnualGoalRolePermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const validAbilityIds = new Set<OrgPermissionAbilityKey>(annualGoalMatrixPermissionAbilityKeys);

  const requestedCells = parsePermissionCells(permissionsValue, validAbilityIds);
  const orgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : null;

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "保存指标管理权限矩阵",
      objectType: "PermissionMatrix",
      objectName: "指标管理权限矩阵",
      operationNote: `范围：${formatPermissionScopeNote(scope)}；权限格 ${requestedCells.length} 项`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.annualGoal,
        subjectType: "ROLE",
        roleType: { in: permissionRoles },
        abilityKey: { in: annualGoalMatrixPermissionAbilityKeys },
        ...(scope.scopeType === "SYSTEM"
          ? { orgNodeId: null }
          : { orgNodeId }),
      },
    });

    const cellsToPersist = (scope.scopeType === "SYSTEM"
      ? requestedCells
      : requestedCells.filter((cell) => cell.explicit))
      .filter((cell) => cell.allowed);

    if (cellsToPersist.length > 0) {
      await tx.orgPermissionGrant.createMany({
        data: cellsToPersist.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.annualGoal,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: annualGoalPermissionScopeByAbilityRole[cell.permissionId as AnnualGoalAbilityKey][cell.roleType],
          subjectType: "ROLE",
          roleType: cell.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        })),
      });
    }
  });

  revalidateOrganization();
  revalidatePath("/annual-goals");
}

export async function saveKpiRolePermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const validAbilityIds = new Set<OrgPermissionAbilityKey>(kpiOrdinaryPermissionAbilityKeys);

  const requestedCells = parsePermissionCells(permissionsValue, validAbilityIds);
  const orgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : null;

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "保存KPI权限矩阵",
      objectType: "PermissionMatrix",
      objectName: "KPI 权限矩阵",
      operationNote: `范围：${formatPermissionScopeNote(scope)}；权限格 ${requestedCells.length} 项`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.kpi,
        subjectType: "ROLE",
        roleType: { in: permissionRoles },
        abilityKey: { in: kpiOrdinaryPermissionAbilityKeys },
        ...(scope.scopeType === "SYSTEM"
          ? { orgNodeId: null }
          : { orgNodeId }),
      },
    });

    const cellsToPersist = (scope.scopeType === "SYSTEM"
      ? requestedCells
      : requestedCells.filter((cell) => cell.explicit))
      .filter((cell) => cell.allowed);

    if (cellsToPersist.length > 0) {
      await tx.orgPermissionGrant.createMany({
        data: cellsToPersist.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.kpi,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: kpiPermissionScopeByRole[cell.roleType],
          subjectType: "ROLE",
          roleType: cell.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        })),
      });
    }
  });

  revalidateOrganization();
}

/**
 * 通知场景为全系统共享。系统范围写入 ALL + orgNodeId=null；部门范围可覆盖本部门角色默认权限。
 */
export async function saveNotificationRolePermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const validAbilityIds = new Set<OrgPermissionAbilityKey>(notificationOrdinaryPermissionAbilityKeys);
  const requestedCells = parsePermissionCells(permissionsValue, validAbilityIds);
  const orgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : null;

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "保存通知权限矩阵",
      objectType: "PermissionMatrix",
      objectName: "通知权限矩阵",
      operationNote: `范围：${formatPermissionScopeNote(scope)}；权限格 ${requestedCells.length} 项`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.notification,
        subjectType: "ROLE",
        roleType: { in: permissionRoles },
        abilityKey: { in: notificationOrdinaryPermissionAbilityKeys },
        ...(scope.scopeType === "SYSTEM"
          ? { orgNodeId: null, scopeType: "ALL" }
          : { orgNodeId }),
      },
    });

    const cellsToPersist = (scope.scopeType === "SYSTEM"
      ? requestedCells
      : requestedCells.filter((cell) => cell.explicit))
      .filter((cell) => cell.allowed);

    if (cellsToPersist.length > 0) {
      await tx.orgPermissionGrant.createMany({
        data: cellsToPersist.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.notification,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: scope.scopeType === "SYSTEM" ? "ALL" as const : kpiPermissionScopeByRole[cell.roleType],
          subjectType: "ROLE" as const,
          roleType: cell.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        })),
      });
    } else if (scope.scopeType === "SYSTEM") {
      await tx.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.notification,
          abilityKey: "MANAGE_NOTIFICATION_SCENARIO",
          scopeType: "ALL",
          subjectType: "ROLE",
          roleType: "ADMIN",
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });
    }
  });

  revalidateOrganization();
  revalidatePath("/notifications");
}

export async function saveProductManagementRolePermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const validAbilityIds = new Set<OrgPermissionAbilityKey>(productManagementOrdinaryPermissionAbilityKeys);
  const requestedCells = parsePermissionCells(permissionsValue, validAbilityIds);
  const orgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : null;

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "保存产品管理权限矩阵",
      objectType: "PermissionMatrix",
      objectName: "产品管理权限矩阵",
      operationNote: `范围：${formatPermissionScopeNote(scope)}；权限格 ${requestedCells.length} 项`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.productManagement,
        subjectType: "ROLE",
        roleType: { in: permissionRoles },
        abilityKey: { in: productManagementOrdinaryPermissionAbilityKeys },
        ...(scope.scopeType === "SYSTEM"
          ? { orgNodeId: null }
          : { orgNodeId }),
      },
    });

    const cellsToPersist = (scope.scopeType === "SYSTEM"
      ? requestedCells
      : requestedCells.filter((cell) => cell.explicit))
      .filter((cell) => cell.allowed);

    if (cellsToPersist.length > 0) {
      await tx.orgPermissionGrant.createMany({
        data: cellsToPersist.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.productManagement,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: kpiPermissionScopeByRole[cell.roleType],
          subjectType: "ROLE",
          roleType: cell.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        })),
      });
    }
  });

  revalidateOrganization();
  revalidatePath("/quarterly-work");
}

export async function saveTalentRolePermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const validAbilityIds = new Set<OrgPermissionAbilityKey>(talentMatrixPermissionAbilityKeys);
  const requestedCells = parsePermissionCells(permissionsValue, validAbilityIds);
  const orgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : null;

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "保存人才发展权限矩阵",
      objectType: "PermissionMatrix",
      objectName: "人才发展权限矩阵",
      operationNote: `范围：${formatPermissionScopeNote(scope)}；权限格 ${requestedCells.length} 项`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.talent,
        subjectType: "ROLE",
        roleType: { in: permissionRoles },
        abilityKey: { in: talentMatrixPermissionAbilityKeys },
        ...(scope.scopeType === "SYSTEM"
          ? { orgNodeId: null }
          : { orgNodeId }),
      },
    });

    const cellsToPersist = (scope.scopeType === "SYSTEM"
      ? requestedCells
      : requestedCells.filter((cell) => cell.explicit))
      .filter((cell) => cell.allowed);

    if (cellsToPersist.length > 0) {
      await tx.orgPermissionGrant.createMany({
        data: cellsToPersist.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.talent,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: kpiPermissionScopeByRole[cell.roleType],
          subjectType: "ROLE",
          roleType: cell.roleType,
          userId: null,
          orgNodeId,
          isActive: true,
        })),
      });
    }
  });

  revalidateOrganization();
  revalidatePath("/talent");
}

type PermissionMatrixKind = "menu" | "annual-goal" | "kpi" | "notification" | "product-management" | "talent";

async function saveAndSyncPermissionMatrix(
  formData: FormData,
  kind: PermissionMatrixKind,
  mode: PermissionMatrixSyncMode,
) {
  const scope = await resolvePermissionScope(formData);
  if (scope.scopeType !== "SYSTEM") throw new Error("仅系统权限矩阵可同步至所有部门");
  const currentUser = await requireAdmin();

  const expectedConfirmation = mode === "CHANGES" ? "SYNC_PERMISSION_CHANGES" : "SYNC_FULL_PERMISSION_MATRIX";
  if (formData.get("confirmation") !== expectedConfirmation) throw new Error("请完成二次确认后再同步");
  const permissions = formData.get("permissions");
  if (typeof permissions !== "string" || !permissions) throw new Error("权限矩阵不能为空");

  const matrixKindNames: Record<PermissionMatrixKind, string> = {
    menu: "菜单",
    "annual-goal": "指标管理",
    kpi: "KPI",
    notification: "通知",
    "product-management": "产品管理",
    talent: "人才发展",
  };

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: `同步${matrixKindNames[kind]}权限矩阵至全部部门`,
      objectType: "PermissionMatrix",
      objectName: `${matrixKindNames[kind]}权限矩阵`,
      operationNote: `模式：${mode === "CHANGES" ? "仅变更项" : "完整覆盖"}`,
    });

    if (kind === "menu") await syncRoleMenuPermissionMatrix(tx, permissions, mode);
    else if (kind === "annual-goal") await syncAnnualGoalPermissionMatrix(tx, permissions, mode);
    else if (kind === "kpi") await syncKpiPermissionMatrix(tx, permissions, mode);
    else if (kind === "notification") await syncNotificationPermissionMatrix(tx, permissions, mode);
    else if (kind === "talent") await syncTalentPermissionMatrix(tx, permissions, mode);
    else await syncProductManagementPermissionMatrix(tx, permissions, mode);
  });
  revalidateOrganization();
}

export async function saveAndApplyRoleMenuPermissionChangesToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "menu", "CHANGES");
}

export async function saveAndApplyAnnualGoalPermissionChangesToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "annual-goal", "CHANGES");
}

export async function saveAndApplyKpiPermissionChangesToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "kpi", "CHANGES");
}

export async function saveAndApplyRoleMenuPermissionsToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "menu", "FULL");
}

export async function saveAndApplyAnnualGoalPermissionsToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "annual-goal", "FULL");
}

export async function saveAndApplyKpiPermissionsToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "kpi", "FULL");
}

export async function saveAndApplyNotificationPermissionChangesToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "notification", "CHANGES");
}

export async function saveAndApplyNotificationPermissionsToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "notification", "FULL");
}

export async function saveAndApplyProductManagementPermissionChangesToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "product-management", "CHANGES");
}

export async function saveAndApplyProductManagementPermissionsToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "product-management", "FULL");
}

export async function saveAndApplyTalentPermissionChangesToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "talent", "CHANGES");
}

export async function saveAndApplyTalentPermissionsToAllDepartments(formData: FormData) {
  await saveAndSyncPermissionMatrix(formData, "talent", "FULL");
}

function parseRepeatedStrings(formData: FormData, fieldName: string) {
  return [...new Set(
    formData.getAll(fieldName)
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
  )];
}

async function normalizeExplicitGrantOrgNodeIds(orgNodeIds: string[]) {
  if (orgNodeIds.length <= 1) {
    return orgNodeIds;
  }

  const closureRows = await prisma.orgClosure.findMany({
    where: {
      ancestorId: { in: orgNodeIds },
      descendantId: { in: orgNodeIds },
      depth: { gt: 0 },
    },
    select: {
      ancestorId: true,
      descendantId: true,
    },
  });

  const descendantIdSet = new Set(closureRows.map((row) => row.descendantId));
  return orgNodeIds.filter((orgNodeId) => !descendantIdSet.has(orgNodeId));
}

export async function createKpiUserPermissionGrant(formData: FormData) {
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const userIds = parseRepeatedStrings(formData, "userId");
  const abilityKeys = parseRepeatedStrings(formData, "abilityKey") as OrgPermissionAbilityKey[];
  const requestedOrgNodeIds = parseRepeatedStrings(formData, "orgNodeId");
  const grantScopeType = ((formData.get("grantScopeType") as string) || "").trim() as OrgPermissionGrantScopeType;

  if (userIds.length === 0 || abilityKeys.length === 0) {
    throw new Error("请至少选择一个用户和一个能力项");
  }
  if (requestedOrgNodeIds.length === 0) {
    throw new Error("请至少选择一个授权节点");
  }
  if (!["NODE", "SUBTREE"].includes(grantScopeType)) {
    throw new Error("授权范围类型无效");
  }
  const validKpiAbilityKeys = new Set<OrgPermissionAbilityKey>(kpiOrdinaryPermissionAbilityKeys);
  if (abilityKeys.some((abilityKey) => !validKpiAbilityKeys.has(abilityKey))) {
    throw new Error("KPI 权限不存在");
  }

  const targetUsers = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, orgNodeId: true, isActive: true, deletedAt: true },
  });
  if (targetUsers.length !== userIds.length) {
    throw new Error("部分授权用户不存在");
  }
  for (const targetUser of targetUsers) {
    if (!targetUser.isActive || targetUser.deletedAt) {
      throw new Error("授权用户不存在");
    }
    if (scope.scopeType === "DEPARTMENT") {
      const userDepartmentOrgNodeId = await findDepartmentOrgNodeId(targetUser.orgNodeId);
      if (userDepartmentOrgNodeId !== scope.departmentOrgNodeId) {
        throw new Error("授权用户不属于当前部门");
      }
    }
  }

  const normalizedOrgNodeIds = await normalizeExplicitGrantOrgNodeIds(requestedOrgNodeIds);
  const targetNodes = await prisma.orgNode.findMany({
    where: { id: { in: normalizedOrgNodeIds } },
    select: { id: true, nodeType: true },
  });
  if (targetNodes.length !== normalizedOrgNodeIds.length) {
    throw new Error("部分授权节点不存在");
  }

  for (const targetNode of targetNodes) {
    if (!["DEPARTMENT", "TEAM"].includes(targetNode.nodeType)) {
      throw new Error("授权节点不存在");
    }
    if (scope.scopeType === "DEPARTMENT") {
      const nodeDepartmentOrgNodeId = await findDepartmentOrgNodeId(targetNode.id);
      if (nodeDepartmentOrgNodeId !== scope.departmentOrgNodeId) {
        throw new Error("授权节点不属于当前部门");
      }
    }
    await assertDepartmentManagerScope(currentUser, targetNode.id);
  }

  const grants = userIds.flatMap((userId) => abilityKeys.flatMap((abilityKey) => normalizedOrgNodeIds.map((orgNodeId) => ({
    moduleKey: orgPermissionModuleKeys.kpi,
    abilityKey,
    scopeType: grantScopeType,
    subjectType: "USER" as const,
    roleType: null,
    userId,
    orgNodeId,
    isActive: true,
  }))));

  await prisma.$transaction(async (tx) => {
    if (grants.length > 0) {
      await tx.orgPermissionGrant.deleteMany({
        where: {
          OR: grants.map((grant) => ({
            moduleKey: grant.moduleKey,
            abilityKey: grant.abilityKey,
            scopeType: grant.scopeType,
            subjectType: grant.subjectType,
            userId: grant.userId,
            orgNodeId: grant.orgNodeId,
          })),
        },
      });

      await tx.orgPermissionGrant.createMany({
        data: grants,
      });

      // 记录权限授予日志
      await writeAuditEvent(tx, {
        actorId: currentUser.id,
        actorType: "USER",
        actorName: currentUser.name,
        module: AUDIT_MODULES.PERMISSION,
        actionCode: AUDIT_ACTION_CODES.PERMISSION_GRANT,
        actionName: "授予 KPI 权限",
        isSuccess: true,
        batchTotalCount: grants.length,
        batchSuccessCount: grants.length,
        afterData: {
          userCount: userIds.length,
          abilityKeys,
          orgNodeCount: requestedOrgNodeIds.length,
          grantScopeType,
        },
        operationNote: `为 ${userIds.length} 个用户授予 ${abilityKeys.length} 个权限项，涉及 ${requestedOrgNodeIds.length} 个组织节点`,
      });
    }
  });

  revalidateOrganization();
}

async function resolveKpiUserPermissionGrantEditorScope(formData: FormData) {
  const scopeType = formData.get("scopeType");
  if (scopeType === "SYSTEM" || scopeType === "DEPARTMENT") {
    return resolvePermissionScope(formData);
  }

  const id = ((formData.get("id") as string) || "").trim();
  if (!id) {
    throw new Error("缺少授权记录 ID");
  }

  const preview = await prisma.orgPermissionGrant.findUnique({
    where: { id },
    select: { orgNodeId: true },
  });
  if (!preview) {
    throw new Error("显式授权记录不存在");
  }

  if (preview.orgNodeId) {
    const departmentOrgNodeId = await findDepartmentOrgNodeId(preview.orgNodeId);
    if (departmentOrgNodeId) {
      return { scopeType: "DEPARTMENT" as const, departmentOrgNodeId };
    }
  }

  return { scopeType: "SYSTEM" as const, departmentOrgNodeId: "" };
}

export async function deleteKpiUserPermissionGrant(formData: FormData) {
  const id = ((formData.get("id") as string) || "").trim();

  if (!id) {
    throw new Error("缺少授权记录 ID");
  }

  const scope = await resolveKpiUserPermissionGrantEditorScope(formData);
  const currentUser = await requirePermissionEditor(scope);

  const grant = await prisma.orgPermissionGrant.findUnique({
    where: { id },
    select: {
      id: true,
      moduleKey: true,
      abilityKey: true,
      scopeType: true,
      subjectType: true,
      orgNodeId: true,
      userId: true,
    },
  });

  if (!grant || grant.moduleKey !== orgPermissionModuleKeys.kpi || grant.subjectType !== "USER" || !grant.userId) {
    throw new Error("显式授权记录不存在");
  }

  if (grant.orgNodeId) {
    await assertDepartmentManagerScope(currentUser, grant.orgNodeId);
    if (scope.scopeType === "DEPARTMENT") {
      const grantDepartmentOrgNodeId = await findDepartmentOrgNodeId(grant.orgNodeId);
      if (grantDepartmentOrgNodeId !== scope.departmentOrgNodeId) {
        throw new Error("无权删除该显式授权");
      }
    }
  } else if (scope.scopeType !== "SYSTEM") {
    throw new Error("无权删除该显式授权");
  }

  // 获取用户信息用于日志记录
  const targetUser = await prisma.user.findUnique({
    where: { id: grant.userId },
    select: { id: true, name: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.orgPermissionGrant.delete({ where: { id } });

    // 记录权限撤销日志
    await writeAuditEvent(tx, {
      actorId: currentUser.id,
      actorType: "USER",
      actorName: currentUser.name,
      module: AUDIT_MODULES.PERMISSION,
      actionCode: AUDIT_ACTION_CODES.PERMISSION_REVOKE,
      actionName: "撤销 KPI 权限",
      isSuccess: true,
      objectType: "User",
      objectId: grant.userId,
      objectName: targetUser?.name || "未知用户",
      beforeData: {
        abilityKey: grant.abilityKey,
        scopeType: grant.scopeType,
        orgNodeId: grant.orgNodeId,
      },
      operationNote: `撤销能力: ${grant.abilityKey}`,
    });
  });

  revalidateOrganization();
}

export async function applyRoleMenuPermissionToAllDepartments(formData: FormData) {
  const currentUser = await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }
  if (roleType === "ADMIN") {
    throw new Error("系统管理员能力项不可同步至部门");
  }

  const menu = await prisma.menuPermission.findUnique({
    where: { id: permissionId },
    select: { id: true, path: true },
  });
  if (!menu) {
    throw new Error("菜单权限不存在");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "批量同步菜单权限至全部部门",
      objectType: "MenuPermission",
      objectId: permissionId,
      objectName: menu.path,
      operationNote: `角色 ${roleType}：${allowed ? "允许" : "禁止"}；覆盖 ${departments.length} 个部门`,
    });

    await tx.roleMenuPermission.deleteMany({
      where: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        roleType,
        menuPermissionId: permissionId,
      },
    });

    await tx.roleMenuPermission.create({
      data: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        roleType,
        menuPermissionId: permissionId,
        allowed,
      },
    });

    await tx.roleMenuPermission.deleteMany({
      where: {
        scopeType: "DEPARTMENT",
        departmentOrgNodeId: { in: departments.map((department) => department.id) },
        roleType,
        menuPermissionId: permissionId,
      },
    });

    if (departments.length > 0) {
      await tx.roleMenuPermission.createMany({
        data: departments.map((department) => ({
          scopeType: "DEPARTMENT" as const,
          departmentOrgNodeId: department.id,
          roleType,
          menuPermissionId: permissionId,
          allowed,
        })),
      });
    }
  });

  revalidateOrganization();
}

export async function applyAnnualGoalPermissionToAllDepartments(formData: FormData) {
  const currentUser = await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }
  if (roleType === "ADMIN") {
    throw new Error("管理员能力不可批量覆盖");
  }

  if (!new Set<OrgPermissionAbilityKey>(annualGoalMatrixPermissionAbilityKeys).has(permissionId as OrgPermissionAbilityKey)) {
    throw new Error("指标管理权限不存在");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });
  const scopeType = annualGoalPermissionScopeByAbilityRole[permissionId as AnnualGoalAbilityKey][roleType];

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "批量同步指标管理权限至全部部门",
      objectType: "OrgPermissionAbility",
      objectId: permissionId,
      objectName: permissionId,
      operationNote: `角色 ${roleType}：${allowed ? "允许" : "禁止"}；覆盖 ${departments.length} 个部门`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.annualGoal,
        subjectType: "ROLE",
        roleType,
        abilityKey: permissionId as OrgPermissionAbilityKey,
      },
    });

    if (allowed) {
      await tx.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.annualGoal,
          abilityKey: permissionId as OrgPermissionAbilityKey,
          scopeType,
          subjectType: "ROLE",
          roleType,
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });

      if (departments.length > 0) {
        await tx.orgPermissionGrant.createMany({
          data: departments.map((department) => ({
            moduleKey: orgPermissionModuleKeys.annualGoal,
            abilityKey: permissionId as OrgPermissionAbilityKey,
            scopeType,
            subjectType: "ROLE" as const,
            roleType,
            userId: null,
            orgNodeId: department.id,
            isActive: true,
          })),
        });
      }
    }
  });

  revalidateOrganization();
}

export async function applyKpiPermissionToAllDepartments(formData: FormData) {
  const currentUser = await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }
  if (roleType === "ADMIN") {
    throw new Error("系统管理员能力项不可同步至部门");
  }

  if (!new Set<OrgPermissionAbilityKey>(kpiOrdinaryPermissionAbilityKeys).has(permissionId as OrgPermissionAbilityKey)) {
    throw new Error("KPI 权限不存在");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "批量同步KPI权限至全部部门",
      objectType: "OrgPermissionAbility",
      objectId: permissionId,
      objectName: permissionId,
      operationNote: `角色 ${roleType}：${allowed ? "允许" : "禁止"}；覆盖 ${departments.length} 个部门`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.kpi,
        subjectType: "ROLE",
        roleType,
        abilityKey: permissionId as OrgPermissionAbilityKey,
      },
    });

    if (allowed) {
      await tx.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.kpi,
          abilityKey: permissionId as OrgPermissionAbilityKey,
          scopeType: kpiPermissionScopeByRole[roleType],
          subjectType: "ROLE",
          roleType,
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });

      if (departments.length > 0) {
        await tx.orgPermissionGrant.createMany({
          data: departments.map((department) => ({
            moduleKey: orgPermissionModuleKeys.kpi,
            abilityKey: permissionId as OrgPermissionAbilityKey,
            scopeType: kpiPermissionScopeByRole[roleType],
            subjectType: "ROLE",
            roleType,
            userId: null,
            orgNodeId: department.id,
            isActive: true,
          })),
        });
      }
    }
  });

  revalidateOrganization();
}

export async function applyNotificationPermissionToAllDepartments(formData: FormData) {
  const currentUser = await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }

  if (!new Set<OrgPermissionAbilityKey>(notificationOrdinaryPermissionAbilityKeys).has(permissionId as OrgPermissionAbilityKey)) {
    throw new Error("通知权限不存在");
  }

  if (roleType === "ADMIN") {
    throw new Error("管理员能力不可批量覆盖");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "批量同步通知权限至全部部门",
      objectType: "OrgPermissionAbility",
      objectId: permissionId,
      objectName: permissionId,
      operationNote: `角色 ${roleType}：${allowed ? "允许" : "禁止"}；覆盖 ${departments.length} 个部门`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.notification,
        subjectType: "ROLE",
        roleType,
        abilityKey: permissionId as OrgPermissionAbilityKey,
      },
    });

    if (allowed) {
      await tx.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.notification,
          abilityKey: permissionId as OrgPermissionAbilityKey,
          scopeType: "ALL",
          subjectType: "ROLE",
          roleType,
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });

      if (departments.length > 0) {
        await tx.orgPermissionGrant.createMany({
          data: departments.map((department) => ({
            moduleKey: orgPermissionModuleKeys.notification,
            abilityKey: permissionId as OrgPermissionAbilityKey,
            scopeType: kpiPermissionScopeByRole[roleType],
            subjectType: "ROLE" as const,
            roleType,
            userId: null,
            orgNodeId: department.id,
            isActive: true,
          })),
        });
      }
    }
  });

  revalidateOrganization();
  revalidatePath("/notifications");
}

export async function applyProductManagementPermissionToAllDepartments(formData: FormData) {
  const currentUser = await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }

  if (!new Set<OrgPermissionAbilityKey>(productManagementOrdinaryPermissionAbilityKeys).has(permissionId as OrgPermissionAbilityKey)) {
    throw new Error("产品管理权限不存在");
  }

  if (roleType === "ADMIN") {
    throw new Error("管理员能力不可批量覆盖");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "批量同步产品管理权限至全部部门",
      objectType: "OrgPermissionAbility",
      objectId: permissionId,
      objectName: permissionId,
      operationNote: `角色 ${roleType}：${allowed ? "允许" : "禁止"}；覆盖 ${departments.length} 个部门`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.productManagement,
        subjectType: "ROLE",
        roleType,
        abilityKey: permissionId as OrgPermissionAbilityKey,
      },
    });

    if (allowed) {
      await tx.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.productManagement,
          abilityKey: permissionId as OrgPermissionAbilityKey,
          scopeType: kpiPermissionScopeByRole[roleType],
          subjectType: "ROLE",
          roleType,
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });

      if (departments.length > 0) {
        await tx.orgPermissionGrant.createMany({
          data: departments.map((department) => ({
            moduleKey: orgPermissionModuleKeys.productManagement,
            abilityKey: permissionId as OrgPermissionAbilityKey,
            scopeType: kpiPermissionScopeByRole[roleType],
            subjectType: "ROLE" as const,
            roleType,
            userId: null,
            orgNodeId: department.id,
            isActive: true,
          })),
        });
      }
    }
  });

  revalidateOrganization();
  revalidatePath("/quarterly-work");
}

export async function applyTalentPermissionToAllDepartments(formData: FormData) {
  const currentUser = await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }

  if (!new Set<OrgPermissionAbilityKey>(talentMatrixPermissionAbilityKeys).has(permissionId as OrgPermissionAbilityKey)) {
    throw new Error("人才发展权限不存在");
  }

  if (roleType === "ADMIN") {
    throw new Error("管理员能力不可批量覆盖");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "批量同步人才发展权限至全部部门",
      objectType: "OrgPermissionAbility",
      objectId: permissionId,
      objectName: permissionId,
      operationNote: `角色 ${roleType}：${allowed ? "允许" : "禁止"}；覆盖 ${departments.length} 个部门`,
    });

    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.talent,
        subjectType: "ROLE",
        roleType,
        abilityKey: permissionId as OrgPermissionAbilityKey,
      },
    });

    if (allowed) {
      await tx.orgPermissionGrant.create({
        data: {
          moduleKey: orgPermissionModuleKeys.talent,
          abilityKey: permissionId as OrgPermissionAbilityKey,
          scopeType: kpiPermissionScopeByRole[roleType],
          subjectType: "ROLE",
          roleType,
          userId: null,
          orgNodeId: null,
          isActive: true,
        },
      });

      if (departments.length > 0) {
        await tx.orgPermissionGrant.createMany({
          data: departments.map((department) => ({
            moduleKey: orgPermissionModuleKeys.talent,
            abilityKey: permissionId as OrgPermissionAbilityKey,
            scopeType: kpiPermissionScopeByRole[roleType],
            subjectType: "ROLE" as const,
            roleType,
            userId: null,
            orgNodeId: department.id,
            isActive: true,
          })),
        });
      }
    }
  });

  revalidateOrganization();
  revalidatePath("/talent");
}

async function requireKpiApprovalPolicyEditor(policyId: string) {
  const policy = await prisma.kpiApprovalPolicy.findUnique({ where: { id: policyId } });
  if (!policy) throw new Error("审批策略不存在");
  await requirePermissionEditor({
    scopeType: policy.scopeType,
    ...(policy.scopeType === "DEPARTMENT" ? { departmentOrgNodeId: policy.departmentOrgNodeId } : {}),
  });
  return policy;
}

async function assertNoActiveKpiApprovalPolicyConflict(
  scopeType: "SYSTEM" | "DEPARTMENT",
  departmentOrgNodeId: string,
  scopeOrgNodeIds: string[],
  excludeId?: string,
) {
  if (scopeType === "SYSTEM") {
    const conflict = await prisma.kpiApprovalPolicy.findFirst({
      where: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { name: true },
    });
    if (conflict) {
      throw new Error(`已有启用的系统默认策略“${conflict.name}”，请先停用后再启用新策略`);
    }
    return;
  }

  const candidates = await prisma.kpiApprovalPolicy.findMany({
    where: {
      scopeType: "DEPARTMENT",
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, departmentOrgNodeId: true },
  });
  const scopeRows = candidates.length > 0
    ? await prisma.kpiApprovalPolicyScope.findMany({
        where: { policyId: { in: candidates.map((policy) => policy.id) } },
        select: { policyId: true, orgNodeId: true },
      })
    : [];
  const scopeIdsByPolicy = new Map<string, string[]>();
  for (const row of scopeRows) {
    const ids = scopeIdsByPolicy.get(row.policyId) ?? [];
    ids.push(row.orgNodeId);
    scopeIdsByPolicy.set(row.policyId, ids);
  }
  const requestedScopeIds = new Set(scopeOrgNodeIds);
  const conflict = candidates.find((policy) => {
    const configuredIds = scopeIdsByPolicy.get(policy.id) ?? [policy.departmentOrgNodeId];
    return configuredIds.some((orgNodeId) => requestedScopeIds.has(orgNodeId));
  });
  if (conflict) {
    throw new Error(`选中的组织节点已被启用策略“${conflict.name}”使用，同一节点不能同时启用多条审批策略`);
  }
}

async function normalizeApprovalPolicyScopeOrgNodeIds(
  value: FormDataEntryValue | null,
  scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string },
) {
  let scopeOrgNodeIds: string[] = [];
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    scopeOrgNodeIds = [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))];
  } catch {
    throw new Error("策略适用范围数据格式错误");
  }
  if (scope.scopeType === "SYSTEM") return [];
  if (scopeOrgNodeIds.length === 0) throw new Error("部门策略至少需要选择一个适用组织节点");

  const nodes = await prisma.orgNode.findMany({
    where: { id: { in: scopeOrgNodeIds } },
    select: { id: true },
  });
  if (nodes.length !== scopeOrgNodeIds.length) throw new Error("部分策略适用组织节点不存在或已失效");
  for (const orgNodeId of scopeOrgNodeIds) {
    if (!await isOrgNodeInSubtree(orgNodeId, scope.departmentOrgNodeId)) {
      throw new Error("部门策略的适用节点必须属于当前部门");
    }
  }
  return scopeOrgNodeIds;
}

async function normalizeApprovalPolicyStepTargets(
  steps: ReturnType<typeof parseKpiApprovalPolicySteps>,
  scope: { scopeType: "SYSTEM" | "DEPARTMENT"; departmentOrgNodeId: string },
) {
  const fixedNodeIds = [...new Set(steps.flatMap((step) => [
    ...(step.nodeMode === "FIXED_NODE" && step.approvalOrgNodeId ? [step.approvalOrgNodeId] : []),
    ...(step.nodeMode === "ORG_NODE_OWNER" ? step.approvalOrgNodeIds : []),
  ]))];
  const fixedNodes = fixedNodeIds.length > 0
    ? await prisma.orgNode.findMany({
        where: { id: { in: fixedNodeIds } },
        select: { id: true, nodeType: true },
      })
    : [];
  if (fixedNodes.length !== fixedNodeIds.length) {
    throw new Error("部分固定审批节点不存在或已失效");
  }
  const fixedNodeById = new Map(fixedNodes.map((node) => [node.id, node]));
  for (const node of fixedNodes) {
    if (scope.scopeType === "DEPARTMENT"
      && node.nodeType !== "ROOT"
      && !await isOrgNodeInSubtree(node.id, scope.departmentOrgNodeId)) {
      throw new Error("部门策略的固定审批节点必须属于当前部门");
    }
  }
  for (const [stepIndex, step] of steps.entries()) {
    if (step.nodeMode !== "ORG_NODE_OWNER") continue;
    for (let leftIndex = 0; leftIndex < step.approvalOrgNodeIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < step.approvalOrgNodeIds.length; rightIndex += 1) {
        const leftId = step.approvalOrgNodeIds[leftIndex];
        const rightId = step.approvalOrgNodeIds[rightIndex];
        if (!leftId || !rightId) continue;
        if (await isOrgNodeInSubtree(leftId, rightId) || await isOrgNodeInSubtree(rightId, leftId)) {
          throw new Error(`第 ${stepIndex + 1} 个审批步骤不能同时选择存在上下级关系的组织节点`);
        }
      }
    }
  }

  const userIds = [...new Set(steps.flatMap((step) => step.resolverUserId ? [step.resolverUserId] : []))];
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true, deletedAt: null },
      select: { id: true, orgNodeId: true },
    });
    if (users.length !== userIds.length) throw new Error("部分指定审批人不存在或已失效");
    if (scope.scopeType === "DEPARTMENT") {
      for (const user of users) {
        if (await findDepartmentOrgNodeId(user.orgNodeId) !== scope.departmentOrgNodeId) {
          throw new Error("部门策略的指定审批人必须属于当前部门");
        }
      }
    }
  }

  return steps.map((step) => {
    if (step.nodeMode !== "FIXED_NODE" || !step.approvalOrgNodeId) return step;
    const node = fixedNodeById.get(step.approvalOrgNodeId);
    if (!node) throw new Error("固定审批节点不存在或已失效");
    return {
      ...step,
      resolverType: getKpiApprovalResolverTypeForNode(node.nodeType),
    };
  });
}

export async function saveKpiApprovalPolicy(formData: FormData) {
  const scope = await resolvePermissionScope(formData);
  const currentUser = await requirePermissionEditor(scope);
  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "true";
  if (!name) throw new Error("审批策略名称不能为空");
  if (name.length > 100) throw new Error("审批策略名称不能超过 100 个字符");
  const parsedSteps = parseKpiApprovalPolicySteps(String(formData.get("steps") ?? "[]"));
  const steps = await normalizeApprovalPolicyStepTargets(parsedSteps, scope);
  const scopeOrgNodeIds = await normalizeApprovalPolicyScopeOrgNodeIds(
    formData.get("scopeOrgNodeIds"),
    scope,
  );

  if (id) {
    const existing = await requireKpiApprovalPolicyEditor(id);
    if (existing.scopeType !== scope.scopeType || existing.departmentOrgNodeId !== scope.departmentOrgNodeId) {
      throw new Error("不能修改审批策略所属范围");
    }
  }
  if (isActive) {
    await assertNoActiveKpiApprovalPolicyConflict(
      scope.scopeType,
      scope.departmentOrgNodeId,
      scopeOrgNodeIds,
      id ?? undefined,
    );
  }

  await prisma.$transaction(async (tx) => {
    const activeScopeKey = getKpiApprovalPolicyActiveScopeKey(
      scope.scopeType,
      scope.departmentOrgNodeId,
      isActive,
    );
    const policy = id
      ? await tx.kpiApprovalPolicy.update({
          where: { id },
          data: { name, description, isActive, activeScopeKey },
        })
      : await tx.kpiApprovalPolicy.create({
          data: {
            scopeType: scope.scopeType,
            departmentOrgNodeId: scope.departmentOrgNodeId,
            name,
            description,
            isActive,
            activeScopeKey,
          },
        });
    const oldSteps = await tx.kpiApprovalPolicyStep.findMany({
      where: { policyId: policy.id },
      select: { id: true },
    });
    if (oldSteps.length > 0) {
      await tx.kpiApprovalPolicyStepOrgNode.deleteMany({
        where: { policyStepId: { in: oldSteps.map((step) => step.id) } },
      });
    }
    await tx.kpiApprovalPolicyStep.deleteMany({ where: { policyId: policy.id } });
    await tx.kpiApprovalPolicyScope.deleteMany({ where: { policyId: policy.id } });
    if (scopeOrgNodeIds.length > 0) {
      await tx.kpiApprovalPolicyScope.createMany({
        data: scopeOrgNodeIds.map((orgNodeId) => ({ policyId: policy.id, orgNodeId })),
      });
    }
    for (const [index, step] of steps.entries()) {
      const { approvalOrgNodeIds, ...stepData } = step;
      const createdStep = await tx.kpiApprovalPolicyStep.create({
        data: { policyId: policy.id, stepOrder: index + 1, ...stepData },
      });
      if (approvalOrgNodeIds.length > 0) {
        await tx.kpiApprovalPolicyStepOrgNode.createMany({
          data: approvalOrgNodeIds.map((orgNodeId) => ({
            policyStepId: createdStep.id,
            orgNodeId,
          })),
        });
      }
    }

    await writePermissionAuditEvent(tx, currentUser, {
      actionName: id ? "编辑KPI审批策略" : "新建KPI审批策略",
      objectType: "KpiApprovalPolicy",
      objectId: policy.id,
      objectName: name,
      operationNote: `范围：${formatPermissionScopeNote(scope)}；审批步骤 ${steps.length} 级；状态：${isActive ? "启用" : "停用"}`,
    });
  });
  revalidateOrganization();
}

export async function toggleKpiApprovalPolicy(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const policy = await requireKpiApprovalPolicyEditor(id);
  if (!policy.isActive) {
    const scopeRows = await prisma.kpiApprovalPolicyScope.findMany({
      where: { policyId: policy.id },
      select: { orgNodeId: true },
    });
    const scopeOrgNodeIds = policy.scopeType === "DEPARTMENT" && scopeRows.length === 0
      ? [policy.departmentOrgNodeId]
      : scopeRows.map((row) => row.orgNodeId);
    await assertNoActiveKpiApprovalPolicyConflict(
      policy.scopeType,
      policy.departmentOrgNodeId,
      scopeOrgNodeIds,
      policy.id,
    );
  }
  const currentUser = await requireCurrentUser();
  await prisma.$transaction(async (tx) => {
    await tx.kpiApprovalPolicy.update({
      where: { id },
      data: {
        isActive: !policy.isActive,
        activeScopeKey: getKpiApprovalPolicyActiveScopeKey(
          policy.scopeType,
          policy.departmentOrgNodeId,
          !policy.isActive,
        ),
      },
    });
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: policy.isActive ? "停用KPI审批策略" : "启用KPI审批策略",
      objectType: "KpiApprovalPolicy",
      objectId: id,
      objectName: policy.name,
    });
  });
  revalidateOrganization();
}

export async function deleteKpiApprovalPolicy(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const policy = await requireKpiApprovalPolicyEditor(id);
  const currentUser = await requireCurrentUser();
  const usageCount = await prisma.personalKpi.count({ where: { approvalPolicyId: id } });
  if (usageCount > 0) {
    throw new Error("该审批策略已生成 KPI 单据，只能停用，不能删除");
  }
  await prisma.$transaction(async (tx) => {
    const steps = await tx.kpiApprovalPolicyStep.findMany({
      where: { policyId: id },
      select: { id: true },
    });
    if (steps.length > 0) {
      await tx.kpiApprovalPolicyStepOrgNode.deleteMany({
        where: { policyStepId: { in: steps.map((step) => step.id) } },
      });
    }
    await tx.kpiApprovalPolicyStep.deleteMany({ where: { policyId: id } });
    await tx.kpiApprovalPolicyScope.deleteMany({ where: { policyId: id } });
    await tx.kpiApprovalPolicy.delete({ where: { id } });
    await writePermissionAuditEvent(tx, currentUser, {
      actionName: "删除KPI审批策略",
      objectType: "KpiApprovalPolicy",
      objectId: id,
      objectName: policy.name,
    });
  });
  revalidateOrganization();
}
