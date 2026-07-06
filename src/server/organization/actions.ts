"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { requireCurrentUser } from "@/server/auth/current-user";
import { syncDingTalkOrganization } from "@/server/dingtalk/organization";
import { annualGoalPermissionCodes, annualGoalPermissionDefinitions, getScopedAnnualGoalPermissionMatrix, type PermissionScopeInput } from "@/server/organization/annual-goal-permissions";
import { isOrgNodeInSubtree } from "@/server/organization/org-tree-utils";
import { kpiAbilityKeys, manageableRoleTypes, orgPermissionModuleKeys } from "@/server/permissions/permission-constants";
import { getActivePermissionGrants } from "@/server/permissions/permission-query";
import type { OrgNodeType, OrgPermissionAbilityKey, OrgPermissionGrantScopeType, RoleType } from "@prisma/client";

const managerEditableRoles: RoleType[] = ["TEAM_LEADER", "MEMBER"];
const permissionRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];
const kpiPermissionScopeByRole: Record<RoleType, OrgPermissionGrantScopeType> = {
  ADMIN: "ALL",
  DEPARTMENT_MANAGER: "SUBTREE",
  TEAM_LEADER: "NODE",
  MEMBER: "SELF",
};
const kpiPermissionLabels: Record<OrgPermissionAbilityKey, string> = {
  VIEW_KPI: "查看 KPI",
  INITIALIZE_KPI: "维护KPI",
  VIEW_KPI_TEMPLATE: "查看 KPI 模板",
  MANAGE_KPI_TEMPLATE: "维护 KPI 模板",
  TOGGLE_KPI_TEMPLATE: "启用/禁用 KPI 模板",
  SCORE_SELF: "自评",
  SCORE_LEADER: "组长评分",
  SCORE_MANAGER: "主管评分",
  SCORE_FINAL: "终审",
};

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

function assertManagerRole(roleType: RoleType) {
  if (!managerEditableRoles.includes(roleType)) {
    throw new Error("部门主管只能设置组长或普通成员角色");
  }
}

async function findDepartmentOrgNodeId(orgNodeId: string | null | undefined) {
  if (!orgNodeId) return null;
  const orgNode = await prisma.orgNode.findUnique({
    where: { id: orgNodeId },
    select: { id: true, nodeType: true, parentId: true },
  });
  if (!orgNode) return null;
  if (orgNode.nodeType === "DEPARTMENT") return orgNode.id;
  if (orgNode.nodeType === "TEAM") return orgNode.parentId;
  return null;
}

async function assertOrgNodeType(orgNodeId: string, nodeType: OrgNodeType) {
  const orgNode = await prisma.orgNode.findUnique({
    where: { id: orgNodeId },
    select: { id: true, parentId: true, nodeType: true, name: true },
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
  if (!teamNode || teamNode.parentId !== departmentOrgNodeId) {
    throw new Error("小组不属于当前部门");
  }
  return teamNode;
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
    ? ((formData.get("departmentOrgNodeId") as string) || await findDepartmentOrgNodeId(currentUser.orgNodeId))
    : await findDepartmentOrgNodeId(currentUser.orgNodeId);

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
    ? await findDepartmentOrgNodeId(target.orgNodeId)
    : await findDepartmentOrgNodeId(currentUser.orgNodeId);
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
    : await findDepartmentOrgNodeId(currentUser.orgNodeId);

  if (!name) throw new Error("小组名称为必填项");
  if (!departmentOrgNodeId) throw new Error("请选择所属部门");

  const departmentNode = await assertDepartmentExists(departmentOrgNodeId);
  const teamOrgNodeId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.orgNode.create({
      data: {
        id: teamOrgNodeId,
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
  if (!teamNode.parentId) throw new Error("小组未绑定所属部门");
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
  await requirePermissionEditor(scope);
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

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
    const requestedCells = parsePermissionCells(permissionsValue, permissionIdSet);

    await tx.roleAnnualGoalPermission.deleteMany({
      where: {
        scopeType: scope.scopeType,
        departmentOrgNodeId: scope.departmentOrgNodeId,
        roleType: { in: validRoles },
        annualGoalPermissionId: { in: permissionRows.map((row) => row.id) },
      },
    });

    const cellsToPersist = scope.scopeType === "SYSTEM"
      ? requestedCells
      : requestedCells.filter((cell) => cell.explicit);

    if (cellsToPersist.length > 0) {
      await tx.roleAnnualGoalPermission.createMany({
        data: cellsToPersist.map((cell) => ({
          scopeType: scope.scopeType,
          departmentOrgNodeId: scope.departmentOrgNodeId,
          roleType: cell.roleType,
          annualGoalPermissionId: cell.permissionId,
          allowed: cell.allowed,
        })),
      });
    }
  });

  revalidateOrganization();
}

export async function saveKpiRolePermissions(formData: FormData) {
  const permissionsValue = formData.get("permissions") as string;
  const scope = await resolvePermissionScope(formData);
  await requirePermissionEditor(scope);
  const validAbilityIds = new Set<OrgPermissionAbilityKey>(Object.values(kpiAbilityKeys));

  const requestedCells = parsePermissionCells(permissionsValue, validAbilityIds);
  const orgNodeId = scope.scopeType === "DEPARTMENT" ? scope.departmentOrgNodeId : null;

  await prisma.$transaction(async (tx) => {
    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.kpi,
        roleType: { in: permissionRoles },
        abilityKey: { in: Object.values(kpiAbilityKeys) },
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
          roleType: cell.roleType,
          orgNodeId,
          isActive: true,
        })),
      });
    }
  });

  revalidateOrganization();
}

export async function applyRoleMenuPermissionToAllDepartments(formData: FormData) {
  await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }

  const menu = await prisma.menuPermission.findUnique({
    where: { id: permissionId },
    select: { id: true, path: true },
  });
  if (!menu) {
    throw new Error("菜单权限不存在");
  }
  if (roleType === "ADMIN" && ["/organization", "/dashboard"].includes(menu.path)) {
    throw new Error("核心入口不可批量覆盖");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
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
  await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }

  const permission = await prisma.annualGoalPermission.findUnique({
    where: { id: permissionId },
    select: { id: true },
  });
  if (!permission) {
    throw new Error("年度指标权限不存在");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.roleAnnualGoalPermission.deleteMany({
      where: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        roleType,
        annualGoalPermissionId: permissionId,
      },
    });

    await tx.roleAnnualGoalPermission.create({
      data: {
        scopeType: "SYSTEM",
        departmentOrgNodeId: "",
        roleType,
        annualGoalPermissionId: permissionId,
        allowed,
      },
    });

    await tx.roleAnnualGoalPermission.deleteMany({
      where: {
        scopeType: "DEPARTMENT",
        departmentOrgNodeId: { in: departments.map((department) => department.id) },
        roleType,
        annualGoalPermissionId: permissionId,
      },
    });

    if (departments.length > 0) {
      await tx.roleAnnualGoalPermission.createMany({
        data: departments.map((department) => ({
          scopeType: "DEPARTMENT" as const,
          departmentOrgNodeId: department.id,
          roleType,
          annualGoalPermissionId: permissionId,
          allowed,
        })),
      });
    }
  });

  revalidateOrganization();
}

export async function applyKpiPermissionToAllDepartments(formData: FormData) {
  await requireAdmin();
  const permissionId = formData.get("permissionId") as string;
  const roleType = formData.get("roleType") as RoleType;
  const allowed = formData.get("allowed") === "true";
  const validRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

  if (!permissionId || !validRoles.includes(roleType)) {
    throw new Error("缺少必要参数");
  }

  if (!new Set<OrgPermissionAbilityKey>(Object.values(kpiAbilityKeys)).has(permissionId as OrgPermissionAbilityKey)) {
    throw new Error("KPI 权限不存在");
  }

  const departments = await prisma.orgNode.findMany({
    where: { nodeType: "DEPARTMENT" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.kpi,
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
          roleType,
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
            roleType,
            orgNodeId: department.id,
            isActive: true,
          })),
        });
      }
    }
  });

  revalidateOrganization();
}

