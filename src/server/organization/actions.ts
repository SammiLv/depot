"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { syncDingTalkOrganization } from "@/server/dingtalk/organization";
import { annualGoalPermissionCodes, annualGoalPermissionDefinitions } from "@/server/organization/annual-goal-permissions";
import { findNearestDepartmentOrgNodeId, isOrgNodeInSubtree } from "@/server/organization/org-tree-utils";
import type { RoleType } from "@prisma/client";

const managerEditableRoles: RoleType[] = ["TEAM_LEADER", "MEMBER"];

async function requireOrgManager() {
  const user = await requireCurrentUser();
  if (user.roleType !== "ADMIN" && user.roleType !== "DEPARTMENT_MANAGER") {
    throw new Error("仅管理员或部门主管可执行此操作");
  }
  return user;
}

async function requireAdmin() {
  const user = await requireCurrentUser();
  if (user.roleType !== "ADMIN") throw new Error("仅管理员可执行此操作");
  return user;
}

function assertManagerRole(roleType: RoleType) {
  if (!managerEditableRoles.includes(roleType)) {
    throw new Error("部门主管只能设置组长或普通成员角色");
  }
}

async function findDepartmentNode(orgNodeId: string) {
  return prisma.orgNode.findFirst({
    where: {
      id: orgNodeId,
      nodeType: "DEPARTMENT",
    },
    select: { id: true, name: true },
  });
}

async function findTeamNode(orgNodeId: string) {
  return prisma.orgNode.findFirst({
    where: {
      id: orgNodeId,
      nodeType: "TEAM",
    },
    select: { id: true, parentId: true, name: true },
  });
}

async function assertDepartmentExists(orgNodeId: string) {
  const departmentNode = await findDepartmentNode(orgNodeId);
  if (!departmentNode) throw new Error("部门不存在");
  return departmentNode;
}

async function assertTeamInDepartment(teamOrgNodeId: string | null, departmentOrgNodeId: string) {
  if (!teamOrgNodeId) return null;
  const teamNode = await findTeamNode(teamOrgNodeId);
  if (!teamNode || teamNode.parentId !== departmentOrgNodeId) {
    throw new Error("小组不属于当前部门");
  }
  return teamNode;
}

async function assertDepartmentManagerScope(currentUser: Awaited<ReturnType<typeof requireOrgManager>>, targetOrgNodeId: string | null | undefined) {
  if (currentUser.roleType !== "DEPARTMENT_MANAGER") return;
  const currentDepartmentOrgNodeId = await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);
  if (!currentDepartmentOrgNodeId || !(await isOrgNodeInSubtree(targetOrgNodeId, currentDepartmentOrgNodeId))) {
    throw new Error("无权管理该对象");
  }
}

async function syncTeamLeader(teamOrgNodeId: string, leaderId: string | null, departmentOrgNodeId: string) {
  if (!leaderId) return;
  const leader = await prisma.user.findUnique({ where: { id: leaderId } });
  const leaderDepartmentOrgNodeId = await findNearestDepartmentOrgNodeId(leader?.orgNodeId);
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

// ── OrgNode helpers ──

export async function updateFromDingTalk() {
  const currentUser = await requireAdmin();
  const result = await syncDingTalkOrganization(currentUser.dingtalkUserId);
  revalidateOrganization();
  return result;
}

// ── User CRUD ──

export async function createUser(formData: FormData) {
  const currentUser = await requireOrgManager();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const mobile = formData.get("mobile") as string;
  const requestedRole = formData.get("roleType") as RoleType;
  const teamOrgNodeId = (formData.get("teamOrgNodeId") as string) || null;
  const title = (formData.get("title") as string) || null;
  const departmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? ((formData.get("departmentOrgNodeId") as string) || await findNearestDepartmentOrgNodeId(currentUser.orgNodeId))
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);

  if (!name || !requestedRole || !departmentOrgNodeId) throw new Error("姓名、角色和部门为必填项");
  if (currentUser.roleType === "DEPARTMENT_MANAGER") assertManagerRole(requestedRole);
  await assertDepartmentExists(departmentOrgNodeId);
  await assertTeamInDepartment(teamOrgNodeId, departmentOrgNodeId);

  await prisma.user.create({
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      mobile: mobile?.trim() || null,
      roleType: requestedRole,
      title: title?.trim() || null,
      orgNodeId: teamOrgNodeId ?? departmentOrgNodeId,
    },
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
    ? await findNearestDepartmentOrgNodeId(target.orgNodeId)
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);
  if (!departmentOrgNodeId) throw new Error("用户缺少部门信息");
  await assertDepartmentExists(departmentOrgNodeId);
  await assertTeamInDepartment(teamOrgNodeId, departmentOrgNodeId);

  await prisma.user.update({
    where: { id },
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      mobile: mobile?.trim() || null,
      roleType: requestedRole,
      title: title?.trim() || null,
      orgNodeId: teamOrgNodeId ?? departmentOrgNodeId,
    },
  });

  revalidateOrganization();
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

  await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  revalidateOrganization();
}

// ── Team CRUD ──

export async function createTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const name = formData.get("name") as string;
  const requestedDepartmentOrgNodeId = (formData.get("departmentOrgNodeId") as string) || null;
  const leaderId = (formData.get("leaderId") as string) || null;
  const description = (formData.get("description") as string) || null;
  const departmentOrgNodeId = currentUser.roleType === "ADMIN"
    ? requestedDepartmentOrgNodeId
    : await findNearestDepartmentOrgNodeId(currentUser.orgNodeId);

  if (!name) throw new Error("小组名称为必填项");
  if (!departmentOrgNodeId) throw new Error("请选择所属部门");

  const departmentNode = await assertDepartmentExists(departmentOrgNodeId);
  const teamOrgNodeId = `org_team_${randomUUID()}`;

  await prisma.$transaction(async (tx) => {
    await tx.orgNode.create({
      data: {
        id: teamOrgNodeId,
        dingtalkDeptId: `__manual_team__${teamOrgNodeId.slice("org_team_".length)}`,
        name: name.trim(),
        nodeType: "TEAM",
        parentId: departmentNode.id,
      },
    });

    const ancestorRows = await tx.orgClosure.findMany({
      where: { descendantId: departmentNode.id },
      select: { ancestorId: true, depth: true },
    });

    await tx.orgClosure.createMany({
      data: [
        { ancestorId: teamOrgNodeId, descendantId: teamOrgNodeId, depth: 0 },
        ...ancestorRows.map((row) => ({
          ancestorId: row.ancestorId,
          descendantId: teamOrgNodeId,
          depth: row.depth + 1,
        })),
      ],
    });
  });

  await syncTeamLeader(teamOrgNodeId, leaderId, departmentOrgNodeId);

  revalidateOrganization();
}

export async function updateTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const leaderId = (formData.get("leaderId") as string) || null;

  if (!id || !name) throw new Error("缺少必要参数");

  const teamNode = await findTeamNode(id);
  if (!teamNode) throw new Error("小组不存在");
  await assertDepartmentManagerScope(currentUser, teamNode.parentId);

  await prisma.orgNode.update({
    where: { id: teamNode.id },
    data: { name: name.trim() },
  });
  await syncTeamLeader(id, leaderId, teamNode.parentId);

  revalidateOrganization();
}

export async function deleteTeam(formData: FormData) {
  const currentUser = await requireOrgManager();
  const id = formData.get("id") as string;
  if (!id) throw new Error("缺少小组 ID");

  const teamNode = await findTeamNode(id);
  if (!teamNode) throw new Error("小组不存在");
  await assertDepartmentManagerScope(currentUser, teamNode.parentId);

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { orgNodeId: teamNode.id },
      data: { orgNodeId: teamNode.parentId },
    });
    await tx.orgClosure.deleteMany({ where: { OR: [{ ancestorId: teamNode.id }, { descendantId: teamNode.id }] } });
    await tx.orgNode.delete({ where: { id: teamNode.id } });
  });

  revalidateOrganization();
}

// ── Department and menu permissions ──

export async function setDepartmentManager(formData: FormData) {
  await requireAdmin();
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
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: managerId }, data: { roleType: "DEPARTMENT_MANAGER" } });

    if (previousManager) {
      await tx.user.update({
        where: { id: previousManager.id },
        data: { roleType: "MEMBER" },
      });
    }
  });

  revalidateOrganization();
}

export async function saveRoleMenuPermissions(formData: FormData) {
  await requireAdmin();
  const permissionsValue = formData.get("permissions") as string;
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  let requestedKeys: unknown;
  try {
    requestedKeys = JSON.parse(permissionsValue || "[]");
  } catch {
    throw new Error("权限数据格式错误");
  }

  if (!Array.isArray(requestedKeys) || requestedKeys.some((key) => typeof key !== "string")) {
    throw new Error("权限数据格式错误");
  }

  const menus = await prisma.menuPermission.findMany({
    where: { isEnabled: true },
    select: { id: true, path: true },
  });
  const menuIdSet = new Set(menus.map((menu) => menu.id));
  const nextKeys = new Set<string>();

  for (const key of requestedKeys) {
    const [roleType, menuPermissionId, extra] = key.split(":");
    if (extra || !validRoles.includes(roleType as RoleType) || !menuIdSet.has(menuPermissionId)) {
      throw new Error("权限数据包含无效项");
    }
    nextKeys.add(`${roleType}:${menuPermissionId}`);
  }

  for (const menu of menus) {
    if (["/organization", "/dashboard"].includes(menu.path)) {
      nextKeys.add(`ADMIN:${menu.id}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.roleMenuPermission.deleteMany({
      where: {
        roleType: { in: validRoles },
        menuPermissionId: { in: [...menuIdSet] },
      },
    });

    if (nextKeys.size > 0) {
      await tx.roleMenuPermission.createMany({
        data: [...nextKeys].map((key) => {
          const [roleType, menuPermissionId] = key.split(":");
          return { roleType: roleType as RoleType, menuPermissionId };
        }),
      });
    }
  });

  revalidateOrganization();
}

export async function saveAnnualGoalRolePermissions(formData: FormData) {
  await requireAdmin();
  const permissionsValue = formData.get("permissions") as string;
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  let requestedKeys: unknown;
  try {
    requestedKeys = JSON.parse(permissionsValue || "[]");
  } catch {
    throw new Error("年度指标权限数据格式错误");
  }

  if (!Array.isArray(requestedKeys) || requestedKeys.some((key) => typeof key !== "string")) {
    throw new Error("年度指标权限数据格式错误");
  }

  await prisma.$transaction(async (tx) => {
    for (const definition of annualGoalPermissionDefinitions) {
      await tx.annualGoalPermission.upsert({
        where: { code: definition.code },
        update: {
          name: definition.name,
          description: definition.description,
          sortOrder: definition.sortOrder,
        },
        create: definition,
      });
    }

    const permissionRows = await tx.annualGoalPermission.findMany({
      where: { code: { in: [...annualGoalPermissionCodes] } },
      select: { id: true },
    });
    const permissionIdSet = new Set(permissionRows.map((row) => row.id));
    const nextKeys = new Set<string>();

    for (const key of requestedKeys) {
      const [roleType, annualGoalPermissionId, extra] = key.split(":");
      if (extra || !validRoles.includes(roleType as RoleType) || !permissionIdSet.has(annualGoalPermissionId)) {
        throw new Error("年度指标权限数据包含无效项");
      }
      nextKeys.add(`${roleType}:${annualGoalPermissionId}`);
    }

    await tx.roleAnnualGoalPermission.deleteMany({
      where: {
        roleType: { in: validRoles },
        annualGoalPermissionId: { in: permissionRows.map((row) => row.id) },
      },
    });

    if (nextKeys.size > 0) {
      await tx.roleAnnualGoalPermission.createMany({
        data: [...nextKeys].map((key) => {
          const [roleType, annualGoalPermissionId] = key.split(":");
          return { roleType: roleType as RoleType, annualGoalPermissionId };
        }),
      });
    }
  });

  revalidateOrganization();
}

