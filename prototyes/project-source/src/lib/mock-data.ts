export type RoleType = "ADMIN" | "MANAGER" | "LEADER" | "MEMBER";

export interface MockUser {
  id: string;
  name: string;
  role: RoleType;
  roleLabel: string;
  team: string;
  title: string;
  avatar: string;
}

export const mockUsers: MockUser[] = [
  { id: "u1", name: "陈思远", role: "ADMIN", roleLabel: "初始管理员", team: "—", title: "系统管理员", avatar: "陈" },
  { id: "u2", name: "李文博", role: "MANAGER", roleLabel: "部门主管", team: "产品部", title: "产品部主管", avatar: "李" },
  { id: "u3", name: "王梓涵", role: "LEADER", roleLabel: "组长", team: "B端组", title: "B端组组长", avatar: "王" },
  { id: "u4", name: "刘亦菲", role: "LEADER", roleLabel: "组长", team: "C端组", title: "C端组组长", avatar: "刘" },
  { id: "u5", name: "赵晨曦", role: "LEADER", roleLabel: "组长", team: "设计组", title: "设计组组长", avatar: "赵" },
  { id: "u6", name: "孙宇航", role: "LEADER", roleLabel: "组长", team: "采购组", title: "采购组组长", avatar: "孙" },
  { id: "u7", name: "周明轩", role: "MEMBER", roleLabel: "普通成员", team: "B端组", title: "高级产品经理", avatar: "周" },
  { id: "u8", name: "吴雨桐", role: "MEMBER", roleLabel: "普通成员", team: "C端组", title: "产品经理", avatar: "吴" },
  { id: "u9", name: "郑雅琪", role: "MEMBER", roleLabel: "普通成员", team: "设计组", title: "高级设计师", avatar: "郑" },
];

export const teams = ["采购组", "B端组", "C端组", "设计组"];
