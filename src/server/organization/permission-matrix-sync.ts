import type { OrgPermissionAbilityKey, Prisma, RoleType } from "@prisma/client";
import { annualGoalPermissionCodes, annualGoalPermissionDefinitions } from "./annual-goal-permissions";
import {
  kpiOrdinaryPermissionAbilityKeys,
  notificationOrdinaryPermissionAbilityKeys,
  productManagementOrdinaryPermissionAbilityKeys,
  talentMatrixPermissionAbilityKeys,
  orgPermissionModuleKeys,
} from "@/server/permissions/permission-constants";

export const permissionMatrixRoles: RoleType[] = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"];

export type PermissionMatrixSyncMode = "CHANGES" | "FULL";
export type NormalizedPermissionCell = {
  roleType: RoleType;
  permissionId: string;
  allowed: boolean;
};

type SyncSummary = {
  mode: PermissionMatrixSyncMode;
  departmentCount: number;
  roleCount: number;
  permissionCount: number;
  changedCellCount: number;
  syncedCellCount: number;
};

const kpiScopeByRole = {
  ADMIN: "ALL",
  DEPARTMENT_MANAGER: "SUBTREE",
  TEAM_LEADER: "NODE",
  MEMBER: "SELF",
} as const;

export function parseCompletePermissionMatrix(raw: string, validPermissionIds: readonly string[]) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("权限矩阵格式不正确");
  }
  if (!Array.isArray(value)) throw new Error("权限矩阵格式不正确");

  const validIdSet = new Set(validPermissionIds);
  const expectedCount = permissionMatrixRoles.length * validPermissionIds.length;
  const cells = new Map<string, NormalizedPermissionCell>();

  for (const item of value) {
    if (!item || typeof item !== "object") throw new Error("权限矩阵包含无效单元格");
    const row = item as Record<string, unknown>;
    const roleType = row.roleType as RoleType;
    const permissionId = row.permissionId;
    if (!permissionMatrixRoles.includes(roleType) || typeof permissionId !== "string" || !validIdSet.has(permissionId) || typeof row.allowed !== "boolean") {
      throw new Error("权限矩阵包含无效单元格");
    }
    const key = `${roleType}:${permissionId}`;
    if (cells.has(key)) throw new Error("权限矩阵包含重复单元格");
    cells.set(key, { roleType, permissionId, allowed: row.allowed });
  }

  if (cells.size !== expectedCount) throw new Error("权限矩阵不完整，请刷新页面后重试");
  return [...cells.values()];
}

function changedCells(current: Map<string, boolean>, next: NormalizedPermissionCell[]) {
  return next.filter((cell) => (current.get(`${cell.roleType}:${cell.permissionId}`) ?? false) !== cell.allowed);
}

function departmentSyncTargets(targets: NormalizedPermissionCell[]) {
  return targets.filter((cell) => cell.roleType !== "ADMIN");
}

function summary(mode: PermissionMatrixSyncMode, departments: number, permissions: number, changes: NormalizedPermissionCell[], syncTargets: NormalizedPermissionCell[]): SyncSummary {
  const nonAdminChanges = changes.filter((cell) => cell.roleType !== "ADMIN");
  return {
    mode,
    departmentCount: departments,
    roleCount: permissionMatrixRoles.length,
    permissionCount: permissions,
    changedCellCount: nonAdminChanges.length,
    syncedCellCount: departments * syncTargets.length,
  };
}

export async function syncRoleMenuPermissionMatrix(tx: Prisma.TransactionClient, raw: string, mode: PermissionMatrixSyncMode) {
  const menus = await tx.menuPermission.findMany({ where: { isEnabled: true }, select: { id: true, path: true } });
  const cells = parseCompletePermissionMatrix(raw, menus.map((menu) => menu.id));
  const coreIds = new Set(menus.filter((menu) => ["/organization", "/dashboard"].includes(menu.path)).map((menu) => menu.id));
  for (const cell of cells) if (cell.roleType === "ADMIN" && coreIds.has(cell.permissionId)) cell.allowed = true;

  const currentRows = await tx.roleMenuPermission.findMany({
    where: { scopeType: "SYSTEM", departmentOrgNodeId: "", roleType: { in: permissionMatrixRoles }, menuPermissionId: { in: menus.map((menu) => menu.id) } },
    select: { roleType: true, menuPermissionId: true, allowed: true },
  });
  const changes = changedCells(new Map(currentRows.map((row) => [`${row.roleType}:${row.menuPermissionId}`, row.allowed])), cells);
  const departments = await tx.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  await tx.roleMenuPermission.deleteMany({ where: { scopeType: "SYSTEM", departmentOrgNodeId: "", roleType: { in: permissionMatrixRoles }, menuPermissionId: { in: menus.map((menu) => menu.id) } } });
  if (cells.length) await tx.roleMenuPermission.createMany({ data: cells.map((cell) => ({ scopeType: "SYSTEM", departmentOrgNodeId: "", roleType: cell.roleType, menuPermissionId: cell.permissionId, allowed: cell.allowed })) });

  const targets = departmentSyncTargets(mode === "FULL" ? cells : changes);
  if (departments.length && targets.length) {
    await tx.roleMenuPermission.deleteMany({ where: { scopeType: "DEPARTMENT", departmentOrgNodeId: { in: departments.map((department) => department.id) }, OR: targets.map((cell) => ({ roleType: cell.roleType, menuPermissionId: cell.permissionId })) } });
    await tx.roleMenuPermission.createMany({ data: departments.flatMap((department) => targets.map((cell) => ({ scopeType: "DEPARTMENT" as const, departmentOrgNodeId: department.id, roleType: cell.roleType, menuPermissionId: cell.permissionId, allowed: cell.allowed }))) });
  }
  return summary(mode, departments.length, menus.length, changes, targets);
}

export async function syncAnnualGoalPermissionMatrix(tx: Prisma.TransactionClient, raw: string, mode: PermissionMatrixSyncMode) {
  for (const definition of annualGoalPermissionDefinitions) {
    await tx.annualGoalPermission.upsert({ where: { code: definition.code }, update: { name: definition.name, description: definition.description, sortOrder: definition.sortOrder }, create: definition });
  }
  const permissions = await tx.annualGoalPermission.findMany({ where: { code: { in: [...annualGoalPermissionCodes] } }, select: { id: true } });
  const cells = parseCompletePermissionMatrix(raw, permissions.map((permission) => permission.id));
  const currentRows = await tx.roleAnnualGoalPermission.findMany({ where: { scopeType: "SYSTEM", departmentOrgNodeId: "", roleType: { in: permissionMatrixRoles }, annualGoalPermissionId: { in: permissions.map((permission) => permission.id) } }, select: { roleType: true, annualGoalPermissionId: true, allowed: true } });
  const changes = changedCells(new Map(currentRows.map((row) => [`${row.roleType}:${row.annualGoalPermissionId}`, row.allowed])), cells);
  const departments = await tx.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  await tx.roleAnnualGoalPermission.deleteMany({ where: { scopeType: "SYSTEM", departmentOrgNodeId: "", roleType: { in: permissionMatrixRoles }, annualGoalPermissionId: { in: permissions.map((permission) => permission.id) } } });
  if (cells.length) await tx.roleAnnualGoalPermission.createMany({ data: cells.map((cell) => ({ scopeType: "SYSTEM", departmentOrgNodeId: "", roleType: cell.roleType, annualGoalPermissionId: cell.permissionId, allowed: cell.allowed })) });
  const targets = departmentSyncTargets(mode === "FULL" ? cells : changes);
  if (departments.length && targets.length) {
    await tx.roleAnnualGoalPermission.deleteMany({ where: { scopeType: "DEPARTMENT", departmentOrgNodeId: { in: departments.map((department) => department.id) }, OR: targets.map((cell) => ({ roleType: cell.roleType, annualGoalPermissionId: cell.permissionId })) } });
    await tx.roleAnnualGoalPermission.createMany({ data: departments.flatMap((department) => targets.map((cell) => ({ scopeType: "DEPARTMENT" as const, departmentOrgNodeId: department.id, roleType: cell.roleType, annualGoalPermissionId: cell.permissionId, allowed: cell.allowed }))) });
  }
  return summary(mode, departments.length, permissions.length, changes, targets);
}

export async function syncKpiPermissionMatrix(tx: Prisma.TransactionClient, raw: string, mode: PermissionMatrixSyncMode) {
  const abilityIds = [...kpiOrdinaryPermissionAbilityKeys];
  const cells = parseCompletePermissionMatrix(raw, abilityIds);
  const currentRows = await tx.orgPermissionGrant.findMany({ where: { moduleKey: orgPermissionModuleKeys.kpi, subjectType: "ROLE", orgNodeId: null, roleType: { in: permissionMatrixRoles }, abilityKey: { in: abilityIds } }, select: { roleType: true, abilityKey: true, isActive: true } });
  const changes = changedCells(new Map(currentRows.filter((row) => row.roleType).map((row) => [`${row.roleType}:${row.abilityKey}`, row.isActive])), cells);
  const departments = await tx.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  await tx.orgPermissionGrant.deleteMany({ where: { moduleKey: orgPermissionModuleKeys.kpi, subjectType: "ROLE", orgNodeId: null, roleType: { in: permissionMatrixRoles }, abilityKey: { in: abilityIds } } });
  const enabledSystem = cells.filter((cell) => cell.allowed);
  if (enabledSystem.length) await tx.orgPermissionGrant.createMany({ data: enabledSystem.map((cell) => ({ moduleKey: orgPermissionModuleKeys.kpi, abilityKey: cell.permissionId as OrgPermissionAbilityKey, scopeType: kpiScopeByRole[cell.roleType], subjectType: "ROLE", roleType: cell.roleType, userId: null, orgNodeId: null, isActive: true })) });

  const targets = departmentSyncTargets(mode === "FULL" ? cells : changes);
  if (departments.length && targets.length) {
    await tx.orgPermissionGrant.deleteMany({ where: { moduleKey: orgPermissionModuleKeys.kpi, subjectType: "ROLE", orgNodeId: { in: departments.map((department) => department.id) }, OR: targets.map((cell) => ({ roleType: cell.roleType, abilityKey: cell.permissionId as OrgPermissionAbilityKey })) } });
    const enabledTargets = targets.filter((cell) => cell.allowed);
    if (enabledTargets.length) await tx.orgPermissionGrant.createMany({ data: departments.flatMap((department) => enabledTargets.map((cell) => ({ moduleKey: orgPermissionModuleKeys.kpi, abilityKey: cell.permissionId as OrgPermissionAbilityKey, scopeType: kpiScopeByRole[cell.roleType], subjectType: "ROLE" as const, roleType: cell.roleType, userId: null, orgNodeId: department.id, isActive: true }))) });
  }
  return summary(mode, departments.length, abilityIds.length, changes, targets);
}

export async function syncNotificationPermissionMatrix(tx: Prisma.TransactionClient, raw: string, mode: PermissionMatrixSyncMode) {
  const abilityIds = [...notificationOrdinaryPermissionAbilityKeys];
  const cells = parseCompletePermissionMatrix(raw, abilityIds);

  const currentRows = await tx.orgPermissionGrant.findMany({
    where: {
      moduleKey: orgPermissionModuleKeys.notification,
      subjectType: "ROLE",
      orgNodeId: null,
      scopeType: "ALL",
      roleType: { in: permissionMatrixRoles },
      abilityKey: { in: abilityIds },
    },
    select: { roleType: true, abilityKey: true, isActive: true },
  });
  const changes = changedCells(new Map(currentRows.filter((row) => row.roleType).map((row) => [`${row.roleType}:${row.abilityKey}`, row.isActive])), cells);
  const departments = await tx.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  await tx.orgPermissionGrant.deleteMany({
    where: {
      moduleKey: orgPermissionModuleKeys.notification,
      subjectType: "ROLE",
      orgNodeId: null,
      scopeType: "ALL",
      roleType: { in: permissionMatrixRoles },
      abilityKey: { in: abilityIds },
    },
  });
  const enabledSystem = cells.filter((cell) => cell.allowed);
  if (enabledSystem.length) {
    await tx.orgPermissionGrant.createMany({
      data: enabledSystem.map((cell) => ({
        moduleKey: orgPermissionModuleKeys.notification,
        abilityKey: cell.permissionId as OrgPermissionAbilityKey,
        scopeType: "ALL" as const,
        subjectType: "ROLE" as const,
        roleType: cell.roleType,
        userId: null,
        orgNodeId: null,
        isActive: true,
      })),
    });
  }

  const targets = departmentSyncTargets(mode === "FULL" ? cells : changes);
  if (departments.length && targets.length) {
    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.notification,
        subjectType: "ROLE",
        orgNodeId: { in: departments.map((department) => department.id) },
        OR: targets.map((cell) => ({ roleType: cell.roleType, abilityKey: cell.permissionId as OrgPermissionAbilityKey })),
      },
    });
    const enabledTargets = targets.filter((cell) => cell.allowed);
    if (enabledTargets.length) {
      await tx.orgPermissionGrant.createMany({
        data: departments.flatMap((department) => enabledTargets.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.notification,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: kpiScopeByRole[cell.roleType],
          subjectType: "ROLE" as const,
          roleType: cell.roleType,
          userId: null,
          orgNodeId: department.id,
          isActive: true,
        }))),
      });
    }
  }
  return summary(mode, departments.length, abilityIds.length, changes, targets);
}

export async function syncTalentPermissionMatrix(tx: Prisma.TransactionClient, raw: string, mode: PermissionMatrixSyncMode) {
  const abilityIds = [...talentMatrixPermissionAbilityKeys];
  const cells = parseCompletePermissionMatrix(raw, abilityIds);
  const currentRows = await tx.orgPermissionGrant.findMany({
    where: {
      moduleKey: orgPermissionModuleKeys.talent,
      subjectType: "ROLE",
      orgNodeId: null,
      roleType: { in: permissionMatrixRoles },
      abilityKey: { in: abilityIds },
    },
    select: { roleType: true, abilityKey: true, isActive: true },
  });
  const changes = changedCells(new Map(currentRows.filter((row) => row.roleType).map((row) => [`${row.roleType}:${row.abilityKey}`, row.isActive])), cells);
  const departments = await tx.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  await tx.orgPermissionGrant.deleteMany({
    where: {
      moduleKey: orgPermissionModuleKeys.talent,
      subjectType: "ROLE",
      orgNodeId: null,
      roleType: { in: permissionMatrixRoles },
      abilityKey: { in: abilityIds },
    },
  });
  const enabledSystem = cells.filter((cell) => cell.allowed);
  if (enabledSystem.length) {
    await tx.orgPermissionGrant.createMany({
      data: enabledSystem.map((cell) => ({
        moduleKey: orgPermissionModuleKeys.talent,
        abilityKey: cell.permissionId as OrgPermissionAbilityKey,
        scopeType: kpiScopeByRole[cell.roleType],
        subjectType: "ROLE" as const,
        roleType: cell.roleType,
        userId: null,
        orgNodeId: null,
        isActive: true,
      })),
    });
  }

  const targets = departmentSyncTargets(mode === "FULL" ? cells : changes);
  if (departments.length && targets.length) {
    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.talent,
        subjectType: "ROLE",
        orgNodeId: { in: departments.map((department) => department.id) },
        OR: targets.map((cell) => ({ roleType: cell.roleType, abilityKey: cell.permissionId as OrgPermissionAbilityKey })),
      },
    });
    const enabledTargets = targets.filter((cell) => cell.allowed);
    if (enabledTargets.length) {
      await tx.orgPermissionGrant.createMany({
        data: departments.flatMap((department) => enabledTargets.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.talent,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: kpiScopeByRole[cell.roleType],
          subjectType: "ROLE" as const,
          roleType: cell.roleType,
          userId: null,
          orgNodeId: department.id,
          isActive: true,
        }))),
      });
    }
  }
  return summary(mode, departments.length, abilityIds.length, changes, targets);
}

export async function syncProductManagementPermissionMatrix(tx: Prisma.TransactionClient, raw: string, mode: PermissionMatrixSyncMode) {
  const abilityIds = [...productManagementOrdinaryPermissionAbilityKeys];
  const cells = parseCompletePermissionMatrix(raw, abilityIds);
  const currentRows = await tx.orgPermissionGrant.findMany({
    where: {
      moduleKey: orgPermissionModuleKeys.productManagement,
      subjectType: "ROLE",
      orgNodeId: null,
      roleType: { in: permissionMatrixRoles },
      abilityKey: { in: abilityIds },
    },
    select: { roleType: true, abilityKey: true, isActive: true },
  });
  const changes = changedCells(new Map(currentRows.filter((row) => row.roleType).map((row) => [`${row.roleType}:${row.abilityKey}`, row.isActive])), cells);
  const departments = await tx.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true } });

  await tx.orgPermissionGrant.deleteMany({
    where: {
      moduleKey: orgPermissionModuleKeys.productManagement,
      subjectType: "ROLE",
      orgNodeId: null,
      roleType: { in: permissionMatrixRoles },
      abilityKey: { in: abilityIds },
    },
  });
  const enabledSystem = cells.filter((cell) => cell.allowed);
  if (enabledSystem.length) {
    await tx.orgPermissionGrant.createMany({
      data: enabledSystem.map((cell) => ({
        moduleKey: orgPermissionModuleKeys.productManagement,
        abilityKey: cell.permissionId as OrgPermissionAbilityKey,
        scopeType: kpiScopeByRole[cell.roleType],
        subjectType: "ROLE" as const,
        roleType: cell.roleType,
        userId: null,
        orgNodeId: null,
        isActive: true,
      })),
    });
  }

  const targets = departmentSyncTargets(mode === "FULL" ? cells : changes);
  if (departments.length && targets.length) {
    await tx.orgPermissionGrant.deleteMany({
      where: {
        moduleKey: orgPermissionModuleKeys.productManagement,
        subjectType: "ROLE",
        orgNodeId: { in: departments.map((department) => department.id) },
        OR: targets.map((cell) => ({ roleType: cell.roleType, abilityKey: cell.permissionId as OrgPermissionAbilityKey })),
      },
    });
    const enabledTargets = targets.filter((cell) => cell.allowed);
    if (enabledTargets.length) {
      await tx.orgPermissionGrant.createMany({
        data: departments.flatMap((department) => enabledTargets.map((cell) => ({
          moduleKey: orgPermissionModuleKeys.productManagement,
          abilityKey: cell.permissionId as OrgPermissionAbilityKey,
          scopeType: kpiScopeByRole[cell.roleType],
          subjectType: "ROLE" as const,
          roleType: cell.roleType,
          userId: null,
          orgNodeId: department.id,
          isActive: true,
        }))),
      });
    }
  }
  return summary(mode, departments.length, abilityIds.length, changes, targets);
}
