"use client";

import { useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui-kit";
import { avatarColor } from "@/lib/avatar-color";
import { Plus, Users, X, Check, RefreshCw } from "lucide-react";
import { createUser, updateUser, deleteUser, createTeam, updateTeam, deleteTeam, setDepartmentManager, saveAnnualGoalRolePermissions, saveRoleMenuPermissions, updateFromDingTalk } from "@/server/organization/actions";

type RoleType = "ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER";

type OrgUser = {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  roleType: RoleType;
  departmentId: string | null;
  teamId: string | null;
  title: string | null;
  isActive: boolean;
};

type OrgTeam = {
  id: string;
  departmentId: string;
  name: string;
  leaderId: string | null;
  description: string | null;
};

type OrgDepartment = {
  id: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
};

type OrgMenu = {
  id: string;
  code: string;
  name: string;
  path: string;
};

type AnnualGoalPermission = {
  id: string;
  code: string;
  name: string;
  description: string;
};

type Props = {
  currentUser: { id: string; roleType: RoleType };
  users: OrgUser[];
  teams: OrgTeam[];
  teamData: { teamId: string; count: number; leaderName?: string }[];
  departments: OrgDepartment[];
  department: OrgDepartment | null;
  menus: OrgMenu[];
  roleMenuPermissions: { roleType: RoleType; menuPermissionId: string }[];
  annualGoalPermissions: AnnualGoalPermission[];
  roleAnnualGoalPermissions: { roleType: RoleType; annualGoalPermissionId: string }[];
  canManageUsers: boolean;
  canManageTeams: boolean;
  canManageRolePermissions: boolean;
  manageableRoleOptions: RoleType[];
};

function roleBadgeTone(roleType: string) {
  switch (roleType) {
    case "ADMIN": return "brand" as const;
    case "DEPARTMENT_MANAGER": return "primary" as const;
    case "TEAM_LEADER": return "info" as const;
    default: return "default" as const;
  }
}

const roleOptions: { value: RoleType; label: string }[] = [
  { value: "ADMIN", label: "初始管理员" },
  { value: "DEPARTMENT_MANAGER", label: "部门主管" },
  { value: "TEAM_LEADER", label: "组长" },
  { value: "MEMBER", label: "普通成员" },
];

function getRoleLabel(roleType: RoleType) {
  return roleOptions.find((r) => r.value === roleType)?.label ?? roleType;
}

const toneCycle: Array<"primary" | "info" | "brand" | "success"> = ["primary", "info", "brand", "success"];

// ── Dialog component ──
function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── User form ──
function UserForm({ user, teams, departmentId, roleOptionsForForm, onClose }: { user?: OrgUser; teams: OrgTeam[]; departmentId: string; roleOptionsForForm: RoleType[]; onClose: () => void }) {
  const isEdit = !!user;
  const action = isEdit ? updateUser : createUser;

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {isEdit && <input type="hidden" name="id" value={user.id} />}
      <input type="hidden" name="departmentId" value={departmentId} />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">姓名 *</label>
          <input name="name" defaultValue={user?.name ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">邮箱</label>
            <input name="email" defaultValue={user?.email ?? ""} type="email" className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">手机号</label>
            <input name="mobile" defaultValue={user?.mobile ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">角色 *</label>
            <select name="roleType" defaultValue={user?.roleType ?? "MEMBER"} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              {roleOptions.filter((r) => roleOptionsForForm.includes(r.value)).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">小组</label>
            <select name="teamId" defaultValue={user?.teamId ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              <option value="">不分配</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">职务</label>
          <input name="title" defaultValue={user?.title ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">{isEdit ? "保存" : "创建"}</Button>
      </div>
    </form>
  );
}

// ── Team form ──
function TeamForm({ team, users, departmentId, onClose }: { team?: OrgTeam; users: OrgUser[]; departmentId: string; onClose: () => void }) {
  const isEdit = !!team;
  const action = isEdit ? updateTeam : createTeam;

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {isEdit && <input type="hidden" name="id" value={team.id} />}
      <input type="hidden" name="departmentId" value={departmentId} />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">小组名称 *</label>
          <input name="name" defaultValue={team?.name ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">组长</label>
          <select name="leaderId" defaultValue={team?.leaderId ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
            <option value="">不指定</option>
            {users.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <input name="description" defaultValue={team?.description ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">{isEdit ? "保存" : "创建"}</Button>
      </div>
    </form>
  );
}

// ── Delete confirm ──
function DeleteConfirm({ message, action, onClose }: { message: string; action: () => Promise<void>; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={async () => { await action(); onClose(); }} className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
      </div>
    </div>
  );
}

// ── Main content ──
export function OrgContent({
  currentUser,
  users,
  teams,
  teamData,
  departments,
  department,
  menus,
  roleMenuPermissions,
  annualGoalPermissions,
  roleAnnualGoalPermissions,
  canManageUsers,
  canManageTeams,
  canManageRolePermissions,
  manageableRoleOptions,
}: Props) {
  const isAdmin = currentUser.roleType === "ADMIN";
  const countMap = new Map(teamData.map((t) => [t.teamId, t]));
  const initialRoleMenuKeys = roleMenuPermissions.map((p) => `${p.roleType}:${p.menuPermissionId}`).sort();
  const initialRoleMenuKeyString = initialRoleMenuKeys.join("|");
  const [draftRoleMenuKeys, setDraftRoleMenuKeys] = useState(() => new Set(initialRoleMenuKeys));
  const initialAnnualGoalPermissionKeys = roleAnnualGoalPermissions.map((p) => `${p.roleType}:${p.annualGoalPermissionId}`).sort();
  const initialAnnualGoalPermissionKeyString = initialAnnualGoalPermissionKeys.join("|");
  const [draftAnnualGoalPermissionKeys, setDraftAnnualGoalPermissionKeys] = useState(() => new Set(initialAnnualGoalPermissionKeys));
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"organization" | "permissions">("organization");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departments[0]?.id ?? department?.id ?? "");
  const draftRoleMenuKeyString = [...draftRoleMenuKeys].sort().join("|");
  const hasRoleMenuChanges = draftRoleMenuKeyString !== initialRoleMenuKeyString;
  const draftAnnualGoalPermissionKeyString = [...draftAnnualGoalPermissionKeys].sort().join("|");
  const hasAnnualGoalPermissionChanges = draftAnnualGoalPermissionKeyString !== initialAnnualGoalPermissionKeyString;
  const visibleTeams = teams.filter((team) => team.departmentId === selectedDepartmentId);
  const visibleUsers = users.filter((user) => user.departmentId === selectedDepartmentId);
  const selectedDepartment = departments.find((item) => item.id === selectedDepartmentId) ?? department;

  function toggleDraftPermission(roleType: RoleType, menu: OrgMenu) {
    if (roleType === "ADMIN" && ["/organization", "/dashboard"].includes(menu.path)) return;
    const key = `${roleType}:${menu.id}`;
    setDraftRoleMenuKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleDraftAnnualGoalPermission(roleType: RoleType, permission: AnnualGoalPermission) {
    const key = `${roleType}:${permission.id}`;
    setDraftAnnualGoalPermissionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function resetDraftPermissions() {
    setDraftRoleMenuKeys(new Set(initialRoleMenuKeys));
  }

  function resetDraftAnnualGoalPermissions() {
    setDraftAnnualGoalPermissionKeys(new Set(initialAnnualGoalPermissionKeys));
  }

  async function handleDingTalkSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await updateFromDingTalk();
      setSyncMessage(`已从钉钉更新：${result.departmentName}，${result.teams} 个小组，${result.users} 位成员`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "从钉钉更新失败");
    } finally {
      setSyncing(false);
    }
  }

  // Dialog states
  const [dialog, setDialog] = useState<{ type: "user" | "team" | "deleteUser" | "deleteTeam"; data?: OrgUser | OrgTeam } | null>(null);

  return (
    <>
      <PageHeader
        title="组织与权限"
        description="部门、小组、成员、角色与页面权限管理"
        action={
          canManageUsers && tab === "organization" && (
            <div className="flex gap-2">
              {isAdmin && (
                <Button variant="outline" onClick={handleDingTalkSync} className="text-primary border-primary/40" disabled={syncing}>
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "更新中" : "从钉钉更新"}
                </Button>
              )}
              <Button onClick={() => setDialog({ type: "team" })}><Plus className="w-4 h-4" />新增小组</Button>
              <Button onClick={() => setDialog({ type: "user" })}><Plus className="w-4 h-4" />新增成员</Button>
            </div>
          )
        }
      />
      {syncMessage && <div className="-mt-3 mb-4 text-xs text-muted-foreground">{syncMessage}</div>}

      <div className="mb-4 rounded-xl bg-card border border-border p-5 shadow-sm">
        <div className="inline-flex p-1 rounded-lg bg-muted">
          {[
            { key: "organization", label: "组织" },
            { key: "permissions", label: "权限" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key as "organization" | "permissions")}
              className={`px-4 py-1.5 rounded-md text-sm transition ${
                tab === item.key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "organization" ? (
        <>
          <div className="mb-4 rounded-xl bg-card border border-border p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {departments.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedDepartmentId(item.id)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    selectedDepartmentId === item.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            {visibleTeams.map((team, i) => {
              const info = countMap.get(team.id);
              const tone = toneCycle[i % toneCycle.length];
              return (
                <Card key={team.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{team.name}</h3>
                    <Badge tone={tone}>{info?.count ?? 0} 人</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-8 h-8 rounded-full text-white text-xs flex items-center justify-center ${avatarColor(info?.leaderName ?? team.name)}`}>
                      {(info?.leaderName ?? team.name).charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{info?.leaderName ?? "未指定"}</div>
                      <div className="text-xs text-muted-foreground">组长</div>
                    </div>
                    {canManageTeams && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setDialog({ type: "team", data: team })} className="text-xs text-muted-foreground hover:text-foreground px-1">编辑</button>
                        <button onClick={() => setDialog({ type: "deleteTeam", data: team })} className="text-xs text-destructive hover:underline px-1">删除</button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />成员列表</h3>
              <span className="text-xs text-muted-foreground">共 {visibleUsers.length} 人</span>
            </div>
            <table className="w-full">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">姓名</th>
                  <th className="px-5 py-3 font-medium">小组</th>
                  <th className="px-5 py-3 font-medium">职务</th>
                  <th className="px-5 py-3 font-medium">角色</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => {
                  const teamName = u.teamId ? teams.find((t) => t.id === u.teamId)?.name : null;
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full text-white text-xs flex items-center justify-center ${avatarColor(u.name)}`}>{u.name.charAt(0)}</div>
                          <span className="text-sm font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{teamName ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{u.title ?? "—"}</td>
                      <td className="px-5 py-3"><Badge tone={roleBadgeTone(u.roleType)}>{getRoleLabel(u.roleType)}</Badge></td>
                      <td className="px-5 py-3 text-right text-xs">
                        {canManageUsers && !(currentUser.roleType === "DEPARTMENT_MANAGER" && !["TEAM_LEADER", "MEMBER"].includes(u.roleType)) && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setDialog({ type: "user", data: u })} className="text-primary hover:underline">编辑</button>
                            <button onClick={() => setDialog({ type: "deleteUser", data: u })} className="text-destructive hover:underline">删除</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold mb-3">角色说明</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {[
                  { r: "初始管理员", d: "可配置组织、菜单与页面权限", tone: "brand" as const },
                  { r: "部门主管", d: `${department?.name ?? "本部门"}负责人角色，可按页面单独授权`, tone: "primary" as const },
                  { r: "组长", d: "小组负责人角色，可按页面单独授权", tone: "info" as const },
                  { r: "普通成员", d: "普通成员角色，可按页面单独授权", tone: "default" as const },
                ].map((r) => (
                  <div key={r.r} className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5">
                    <Badge tone={r.tone}>{r.r}</Badge>
                    <span>{r.d}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-auto lg:min-w-[360px] rounded-xl bg-muted/40 px-4 py-3 text-sm">
              <div className="text-xs text-muted-foreground">{department?.name ?? "未设置部门"}</div>
              <div className="font-medium mt-1">当前主管：{department?.managerName ?? "未设置"}</div>
              {isAdmin && department && (
                <form action={setDepartmentManager} className="mt-3 flex gap-2">
                  <input type="hidden" name="departmentId" value={department.id} />
                  <select name="managerId" defaultValue={department.managerId ?? ""} className="min-w-0 flex-1 h-9 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-ring">
                    <option value="">选择主管</option>
                    {users.filter((u) => u.roleType !== "ADMIN").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <Button type="submit" variant="outline" className="h-9 px-3 text-xs">保存</Button>
                </form>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 mb-3">
            <div>
              <h3 className="font-semibold">菜单权限</h3>
              {canManageRolePermissions && hasRoleMenuChanges && <div className="text-xs text-warning mt-1">有未保存的权限调整</div>}
            </div>
            {canManageRolePermissions && (
              <form action={async (fd) => { await saveRoleMenuPermissions(fd); }} className="flex gap-2">
                <input type="hidden" name="permissions" value={JSON.stringify([...draftRoleMenuKeys])} />
                <button type="button" disabled={!hasRoleMenuChanges} onClick={resetDraftPermissions} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all border border-border bg-card hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed">取消</button>
                <button type="submit" disabled={!hasRoleMenuChanges} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">保存</button>
              </form>
            )}
          </div>
          <div className="overflow-x-auto mb-2">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-auto" />
                {roleOptions.map((role) => <col key={role.value} className="w-20" />)}
              </colgroup>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 font-medium">菜单</th>
                  {roleOptions.map((role) => <th key={role.value} className="py-2 font-medium text-center align-middle">{role.label.slice(0, 2)}</th>)}
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <tr key={menu.id} className="border-t border-border">
                    <td className="py-0 pr-2 align-middle">
                      <div className="min-h-[72px] flex flex-col justify-center">
                        <div className="font-medium">{menu.name}</div>
                        <div className="text-[10px] text-muted-foreground">{menu.path}</div>
                      </div>
                    </td>
                    {roleOptions.map((role) => {
                      const enabled = draftRoleMenuKeys.has(`${role.value}:${menu.id}`);
                      const locked = role.value === "ADMIN" && ["/organization", "/dashboard"].includes(menu.path);
                      return (
                        <td key={role.value} className="py-0 text-right align-middle">
                          <div className="min-h-[72px] flex items-center justify-end">
                            {canManageRolePermissions ? (
                              <button type="button" disabled={locked} onClick={() => toggleDraftPermission(role.value, menu)} className={`mx-auto inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} ${locked ? "opacity-60 cursor-not-allowed" : "hover:ring-1 hover:ring-ring"}`} title={locked ? "核心入口不可移除" : "调整后需点击保存生效"}>
                                {enabled && <Check className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <span className={`mx-auto inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{enabled && <Check className="w-3.5 h-3.5" />}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-6 mb-3">
            <div>
              <h3 className="font-semibold">年度指标权限</h3>
              {canManageRolePermissions && hasAnnualGoalPermissionChanges && <div className="text-xs text-warning mt-1">有未保存的年度指标权限调整</div>}
            </div>
            {canManageRolePermissions && (
              <form action={async (fd) => { await saveAnnualGoalRolePermissions(fd); }} className="flex gap-2">
                <input type="hidden" name="permissions" value={JSON.stringify([...draftAnnualGoalPermissionKeys])} />
                <button type="button" disabled={!hasAnnualGoalPermissionChanges} onClick={resetDraftAnnualGoalPermissions} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all border border-border bg-card hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed">取消</button>
                <button type="submit" disabled={!hasAnnualGoalPermissionChanges} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">保存</button>
              </form>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-auto" />
                {roleOptions.map((role) => <col key={role.value} className="w-20" />)}
              </colgroup>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 font-medium">能力项</th>
                  {roleOptions.map((role) => <th key={role.value} className="py-2 font-medium text-center align-middle">{role.label.slice(0, 2)}</th>)}
                </tr>
              </thead>
              <tbody>
                {annualGoalPermissions.map((permission) => (
                  <tr key={permission.id} className="border-t border-border">
                    <td className="py-0 pr-2 align-middle">
                      <div className="min-h-[72px] flex flex-col justify-center">
                        <div className="font-medium">{permission.name}</div>
                        <div className="text-[10px] text-muted-foreground">{permission.description}</div>
                      </div>
                    </td>
                    {roleOptions.map((role) => {
                      const enabled = draftAnnualGoalPermissionKeys.has(`${role.value}:${permission.id}`);
                      return (
                        <td key={role.value} className="py-0 text-right align-middle">
                          <div className="min-h-[72px] flex items-center justify-end">
                            {canManageRolePermissions ? (
                              <button type="button" onClick={() => toggleDraftAnnualGoalPermission(role.value, permission)} className={`mx-auto inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} hover:ring-1 hover:ring-ring`} title="调整后需点击保存生效">
                                {enabled && <Check className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <span className={`mx-auto inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{enabled && <Check className="w-3.5 h-3.5" />}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Dialogs ── */}
      <Dialog open={dialog?.type === "user"} onClose={() => setDialog(null)} title={dialog?.data ? "编辑成员" : "新增成员"}>
        <UserForm user={dialog?.data as OrgUser | undefined} teams={visibleTeams} departmentId={selectedDepartmentId} roleOptionsForForm={manageableRoleOptions} onClose={() => setDialog(null)} />
      </Dialog>

      <Dialog open={dialog?.type === "team"} onClose={() => setDialog(null)} title={dialog?.data ? "编辑小组" : "新增小组"}>
        <TeamForm team={dialog?.data as OrgTeam | undefined} users={visibleUsers} departmentId={selectedDepartmentId} onClose={() => setDialog(null)} />
      </Dialog>

      <Dialog open={dialog?.type === "deleteUser"} onClose={() => setDialog(null)} title="删除成员">
        <DeleteConfirm
          message={`确定要删除成员 "${(dialog?.data as OrgUser)?.name}" 吗？此操作将软删除该用户。`}
          action={async () => {
            const fd = new FormData();
            fd.set("id", (dialog?.data as OrgUser).id);
            await deleteUser(fd);
          }}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog open={dialog?.type === "deleteTeam"} onClose={() => setDialog(null)} title="删除小组">
        <DeleteConfirm
          message={`确定要删除小组 "${(dialog?.data as OrgTeam)?.name}" 吗？该组成员将被取消分配。`}
          action={async () => {
            const fd = new FormData();
            fd.set("id", (dialog?.data as OrgTeam).id);
            await deleteTeam(fd);
          }}
          onClose={() => setDialog(null)}
        />
      </Dialog>
    </>
  );
}
