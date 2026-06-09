import type { RoleType } from "@prisma/client";

type DataScopeInput = {
  id: string;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
};

export function getRoleLabel(roleType: RoleType) {
  const labels: Record<RoleType, string> = {
    ADMIN: "初始管理员",
    DEPARTMENT_MANAGER: "部门主管",
    TEAM_LEADER: "组长",
    MEMBER: "普通成员",
  };

  return labels[roleType];
}

export function getDataScopeLabel(user: DataScopeInput) {
  const labels: Record<RoleType, string> = {
    ADMIN: "全部数据",
    DEPARTMENT_MANAGER: "产品部全部数据",
    TEAM_LEADER: "本组数据",
    MEMBER: "本人数据",
  };

  return labels[user.roleType];
}

export function getUserWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER" && user.departmentId) {
    return { departmentId: user.departmentId, deletedAt: null };
  }

  if (user.roleType === "TEAM_LEADER" && user.teamId) {
    return { teamId: user.teamId, deletedAt: null };
  }

  return { id: user.id, deletedAt: null };
}

export function getTeamWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return {};
  }

  if (user.roleType === "DEPARTMENT_MANAGER" && user.departmentId) {
    return { departmentId: user.departmentId };
  }

  if (user.teamId) {
    return { id: user.teamId };
  }

  return { id: "__no_team__" };
}

export function getAnnualPlanWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER" && user.departmentId) {
    return { departmentId: user.departmentId, deletedAt: null };
  }

  if (user.roleType === "TEAM_LEADER" && user.teamId) {
    return { teamId: user.teamId, deletedAt: null };
  }

  if (user.teamId) {
    return { teamId: user.teamId, deletedAt: null };
  }

  return { id: "__no_annual_plan__", deletedAt: null };
}

export function getOwnerWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER" && user.departmentId) {
    return { departmentId: user.departmentId, deletedAt: null };
  }

  if (user.roleType === "TEAM_LEADER" && user.teamId) {
    return { teamId: user.teamId, deletedAt: null };
  }

  if (user.teamId) {
    return { teamId: user.teamId, deletedAt: null };
  }

  return { ownerId: user.id, deletedAt: null };
}

export function getKpiWhereByScope(user: DataScopeInput) {
  if (user.roleType === "ADMIN") {
    return { deletedAt: null };
  }

  if (user.roleType === "DEPARTMENT_MANAGER") {
    return { deletedAt: null };
  }

  if (user.roleType === "TEAM_LEADER" && user.teamId) {
    return { teamId: user.teamId, deletedAt: null };
  }

  return { userId: user.id, deletedAt: null };
}
