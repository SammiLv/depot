import type { RoleType } from "@prisma/client";

export function getRoleLabel(roleType: RoleType) {
  const labels: Record<RoleType, string> = {
    ADMIN: "初始管理员",
    DEPARTMENT_MANAGER: "部门主管",
    TEAM_LEADER: "组长",
    MEMBER: "普通成员",
  };
  return labels[roleType];
}

export function getDataScopeLabel(roleType: RoleType) {
  const labels: Record<RoleType, string> = {
    ADMIN: "全部数据",
    DEPARTMENT_MANAGER: "本部门全部数据",
    TEAM_LEADER: "本组数据",
    MEMBER: "本人数据",
  };
  return labels[roleType];
}
