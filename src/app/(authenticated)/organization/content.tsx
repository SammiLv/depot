"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, PageHeader } from "@/components/ui-kit";
import { avatarColor } from "@/lib/avatar-color";
import { Plus, Users, X, Check, RefreshCw, Wand2 } from "lucide-react";
import { applyAnnualGoalPermissionToAllDepartments, applyKpiPermissionToAllDepartments, applyRoleMenuPermissionToAllDepartments, createUser, updateUser, deleteUser, createTeam, updateTeam, deleteTeam, setDepartmentManager, saveAnnualGoalRolePermissions, saveKpiRolePermissions, saveRoleMenuPermissions, updateFromDingTalk } from "@/server/organization/actions";

type RoleType = "ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER";

type OrgUser = {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  roleType: RoleType;
  departmentOrgNodeId: string | null;
  teamOrgNodeId: string | null;
  title: string | null;
  isActive: boolean;
};

type OrgTeam = {
  orgNodeId: string;
  departmentOrgNodeId: string;
  name: string;
  leaderId: string | null;
  description: string | null;
};

type OrgDepartment = {
  orgNodeId: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
};

type PermissionScopeType = "SYSTEM" | "DEPARTMENT";

type PermissionCellState = {
  allowed: boolean;
  source: PermissionScopeType;
  inherited: boolean;
  explicit: boolean;
};

type OrgMenu = {
  id: string;
  code: string;
  name: string;
  path: string;
  cells: Record<RoleType, PermissionCellState>;
};

type ScopedAnnualGoalPermission = {
  id: string;
  code: string;
  name: string;
  description: string;
  cells: Record<RoleType, PermissionCellState>;
};

type ScopedKpiPermission = {
  id: string;
  code: string;
  name: string;
  description: string;
  cells: Record<RoleType, PermissionCellState>;
};

type PermissionScopeOption = {
  scopeType: PermissionScopeType;
  departmentOrgNodeId: string;
  label: string;
};

type ApplyAllDialogData = {
  kind: "menu" | "annual-goal" | "kpi";
  permissionId: string;
  permissionName: string;
  roleType: RoleType;
  roleLabel: string;
  allowed: boolean;
};

type Props = {
  currentUser: { id: string; roleType: RoleType };
  users: OrgUser[];
  teams: OrgTeam[];
  teamData: { teamOrgNodeId: string; count: number; leaderName?: string }[];
  departments: OrgDepartment[];
  department: OrgDepartment | null;
  scopeOptions: PermissionScopeOption[];
  initialScope: { scopeType: PermissionScopeType; departmentOrgNodeId: string };
  initialTab: "organization" | "permissions";
  initialPermissionSection: "menu" | "annual-goal" | "kpi";
  menus: OrgMenu[];
  annualGoalPermissions: ScopedAnnualGoalPermission[];
  kpiPermissions: ScopedKpiPermission[];
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
function UserForm({
  user,
  teams,
  departments,
  departmentOrgNodeId,
  roleOptionsForForm,
  canSelectDepartment,
  onClose,
}: {
  user?: OrgUser;
  teams: OrgTeam[];
  departments: OrgDepartment[];
  departmentOrgNodeId: string;
  roleOptionsForForm: RoleType[];
  canSelectDepartment: boolean;
  onClose: () => void;
}) {
  const isEdit = !!user;
  const action = isEdit ? updateUser : createUser;
  const initialDepartmentOrgNodeId = user?.departmentOrgNodeId ?? departmentOrgNodeId ?? departments[0]?.orgNodeId ?? "";
  const [selectedDepartmentOrgNodeId, setSelectedDepartmentOrgNodeId] = useState(initialDepartmentOrgNodeId);
  const availableTeams = teams.filter((team) => team.departmentOrgNodeId === selectedDepartmentOrgNodeId);

  useEffect(() => {
    setSelectedDepartmentOrgNodeId(user?.departmentOrgNodeId ?? departmentOrgNodeId ?? departments[0]?.orgNodeId ?? "");
  }, [user?.departmentOrgNodeId, departmentOrgNodeId, departments]);

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {isEdit && <input type="hidden" name="id" value={user.id} />}
      <input type="hidden" name="departmentOrgNodeId" value={selectedDepartmentOrgNodeId} />
      <div className="space-y-4">
        {canSelectDepartment && (
          <div>
            <label className="block text-sm font-medium mb-1">所属部门 *</label>
            <select
              value={selectedDepartmentOrgNodeId}
              onChange={(event) => setSelectedDepartmentOrgNodeId(event.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
            >
              <option value="">请选择部门</option>
              {departments.map((department) => (
                <option key={department.orgNodeId} value={department.orgNodeId}>{department.name}</option>
              ))}
            </select>
          </div>
        )}
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
            <select name="teamOrgNodeId" defaultValue={user?.teamOrgNodeId ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              <option value="">不分配</option>
              {availableTeams.map((t) => <option key={t.orgNodeId} value={t.orgNodeId}>{t.name}</option>)}
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
function TeamForm({
  team,
  users,
  departments,
  departmentOrgNodeId,
  canSelectDepartment,
  onClose,
}: {
  team?: OrgTeam;
  users: OrgUser[];
  departments: OrgDepartment[];
  departmentOrgNodeId: string;
  canSelectDepartment: boolean;
  onClose: () => void;
}) {
  const isEdit = !!team;
  const action = isEdit ? updateTeam : createTeam;
  const initialDepartmentOrgNodeId = team?.departmentOrgNodeId ?? departmentOrgNodeId ?? departments[0]?.orgNodeId ?? "";
  const [selectedDepartmentOrgNodeId, setSelectedDepartmentOrgNodeId] = useState(initialDepartmentOrgNodeId);
  const availableUsers = users.filter((user) => user.isActive && user.departmentOrgNodeId === selectedDepartmentOrgNodeId);

  useEffect(() => {
    setSelectedDepartmentOrgNodeId(team?.departmentOrgNodeId ?? departmentOrgNodeId ?? departments[0]?.orgNodeId ?? "");
  }, [team?.departmentOrgNodeId, departmentOrgNodeId, departments]);

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {isEdit && <input type="hidden" name="id" value={team.orgNodeId} />}
      <input type="hidden" name="departmentOrgNodeId" value={selectedDepartmentOrgNodeId} />
      <div className="space-y-4">
        {canSelectDepartment && (
          <div>
            <label className="block text-sm font-medium mb-1">所属部门 *</label>
            <select
              value={selectedDepartmentOrgNodeId}
              onChange={(event) => setSelectedDepartmentOrgNodeId(event.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
            >
              <option value="">请选择部门</option>
              {departments.map((department) => (
                <option key={department.orgNodeId} value={department.orgNodeId}>{department.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">小组名称 *</label>
          <input name="name" defaultValue={team?.name ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">组长</label>
          <select name="leaderId" defaultValue={team?.leaderId ?? ""} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
            <option value="">不指定</option>
            {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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

function ApplyAllDepartmentsConfirm({ data, onClose }: { data: ApplyAllDialogData; onClose: () => void }) {
  const action = data.kind === "menu"
    ? applyRoleMenuPermissionToAllDepartments
    : data.kind === "annual-goal"
      ? applyAnnualGoalPermissionToAllDepartments
      : applyKpiPermissionToAllDepartments;

  return (
    <form action={async (fd) => { await action(fd); onClose(); }} className="space-y-4">
      <input type="hidden" name="permissionId" value={data.permissionId} />
      <input type="hidden" name="roleType" value={data.roleType} />
      <input type="hidden" name="allowed" value={String(data.allowed)} />
      <p className="text-sm text-muted-foreground">
        将“{data.permissionName}”中“{data.roleLabel}”的当前系统权限
        <span className="mx-1 font-medium text-foreground">{data.allowed ? "开启" : "关闭"}</span>
        覆盖应用到全部部门。此操作会替换各部门当前该权限的显式配置。
      </p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">确认应用</Button>
      </div>
    </form>
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
  scopeOptions,
  initialScope,
  initialTab,
  initialPermissionSection,
  menus,
  annualGoalPermissions,
  kpiPermissions,
  canManageUsers,
  canManageTeams,
  canManageRolePermissions,
  manageableRoleOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = currentUser.roleType === "ADMIN";
  const countMap = new Map(teamData.map((t) => [t.teamOrgNodeId, t]));
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"organization" | "permissions">(initialTab);
  const [permissionSection, setPermissionSection] = useState<"menu" | "annual-goal" | "kpi">(initialPermissionSection);
  const selectedScope = initialScope;
  const selectedDepartmentOrgNodeId = selectedScope.scopeType === "SYSTEM"
    ? ""
    : initialScope.departmentOrgNodeId || (departments[0]?.orgNodeId ?? department?.orgNodeId ?? "");
  const visibleTeams = selectedScope.scopeType === "SYSTEM"
    ? []
    : teams.filter((team) => team.departmentOrgNodeId === selectedDepartmentOrgNodeId);
  const visibleUsers = selectedScope.scopeType === "SYSTEM"
    ? users.filter((user) => user.roleType === "ADMIN")
    : users.filter((user) => user.departmentOrgNodeId === selectedDepartmentOrgNodeId);
  const permissionRoleOptions = selectedScope.scopeType === "SYSTEM"
    ? roleOptions
    : roleOptions.filter((role) => role.value !== "ADMIN");
  const initialRoleMenuCells = Object.fromEntries(menus.flatMap((menu) => roleOptions.map((role) => [
    `${role.value}:${menu.id}`,
    { ...menu.cells[role.value] },
  ])));
  const [draftRoleMenuCells, setDraftRoleMenuCells] = useState<Record<string, PermissionCellState>>(initialRoleMenuCells);
  const initialAnnualGoalCells = Object.fromEntries(annualGoalPermissions.flatMap((permission) => roleOptions.map((role) => [
    `${role.value}:${permission.id}`,
    { ...permission.cells[role.value] },
  ])));
  const [draftAnnualGoalCells, setDraftAnnualGoalCells] = useState<Record<string, PermissionCellState>>(initialAnnualGoalCells);
  const initialKpiCells = Object.fromEntries(kpiPermissions.flatMap((permission) => roleOptions.map((role) => [
    `${role.value}:${permission.id}`,
    { ...permission.cells[role.value] },
  ])));
  const [draftKpiCells, setDraftKpiCells] = useState<Record<string, PermissionCellState>>(initialKpiCells);
  const draftRoleMenuKeyString = JSON.stringify(draftRoleMenuCells);
  const initialRoleMenuKeyString = JSON.stringify(initialRoleMenuCells);
  const hasRoleMenuChanges = draftRoleMenuKeyString !== initialRoleMenuKeyString;
  const draftAnnualGoalPermissionKeyString = JSON.stringify(draftAnnualGoalCells);
  const initialAnnualGoalPermissionKeyString = JSON.stringify(initialAnnualGoalCells);
  const hasAnnualGoalPermissionChanges = draftAnnualGoalPermissionKeyString !== initialAnnualGoalPermissionKeyString;
  const draftRoleMenuPayload = JSON.stringify(Object.entries(draftRoleMenuCells).map(([key, cell]) => {
    const [roleType, permissionId] = key.split(":");
    return { roleType, permissionId, allowed: cell.allowed, explicit: cell.explicit };
  }));
  const draftAnnualGoalPayload = JSON.stringify(Object.entries(draftAnnualGoalCells).map(([key, cell]) => {
    const [roleType, permissionId] = key.split(":");
    return { roleType, permissionId, allowed: cell.allowed, explicit: cell.explicit };
  }));
  const draftKpiPermissionKeyString = JSON.stringify(draftKpiCells);
  const initialKpiPermissionKeyString = JSON.stringify(initialKpiCells);
  const hasKpiPermissionChanges = draftKpiPermissionKeyString !== initialKpiPermissionKeyString;
  const draftKpiPayload = JSON.stringify(Object.entries(draftKpiCells).map(([key, cell]) => {
    const [roleType, permissionId] = key.split(":");
    return { roleType, permissionId, allowed: cell.allowed, explicit: cell.explicit };
  }));

  useEffect(() => {
    setDraftRoleMenuCells(initialRoleMenuCells);
  }, [initialRoleMenuKeyString]);

  useEffect(() => {
    setDraftAnnualGoalCells(initialAnnualGoalCells);
  }, [initialAnnualGoalPermissionKeyString]);

  useEffect(() => {
    setDraftKpiCells(initialKpiCells);
  }, [initialKpiPermissionKeyString]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, initialScope.scopeType, initialScope.departmentOrgNodeId]);

  useEffect(() => {
    if (initialTab === "organization") {
      return;
    }
    setPermissionSection(initialPermissionSection);
  }, [initialPermissionSection, initialTab, initialScope.scopeType, initialScope.departmentOrgNodeId]);

  function toggleDraftPermission(roleType: RoleType, menu: OrgMenu) {
    if (roleType === "ADMIN" && ["/organization", "/dashboard"].includes(menu.path)) return;
    const key = `${roleType}:${menu.id}`;
    setDraftRoleMenuCells((current) => {
      const cell = current[key];
      const nextAllowed = !cell.allowed;
      return {
        ...current,
        [key]: {
          allowed: nextAllowed,
          source: selectedScope.scopeType,
          explicit: true,
          inherited: false,
        },
      };
    });
  }

  function toggleDraftAnnualGoalPermission(roleType: RoleType, permission: ScopedAnnualGoalPermission) {
    const key = `${roleType}:${permission.id}`;
    setDraftAnnualGoalCells((current) => {
      const cell = current[key];
      const nextAllowed = !cell.allowed;
      return {
        ...current,
        [key]: {
          allowed: nextAllowed,
          source: selectedScope.scopeType,
          explicit: true,
          inherited: false,
        },
      };
    });
  }

  function toggleDraftKpiPermission(roleType: RoleType, permission: ScopedKpiPermission) {
    const key = `${roleType}:${permission.id}`;
    setDraftKpiCells((current) => {
      const cell = current[key];
      const nextAllowed = !cell.allowed;
      return {
        ...current,
        [key]: {
          allowed: nextAllowed,
          source: selectedScope.scopeType,
          explicit: true,
          inherited: false,
        },
      };
    });
  }

  function resetDraftPermissions() {
    setDraftRoleMenuCells(initialRoleMenuCells);
  }

  function resetDraftAnnualGoalPermissions() {
    setDraftAnnualGoalCells(initialAnnualGoalCells);
  }

  function resetDraftKpiPermissions() {
    setDraftKpiCells(initialKpiCells);
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
  const [dialog, setDialog] = useState<{
    type: "user" | "team" | "deleteUser" | "deleteTeam" | "applyAllDepartments";
    data?: OrgUser | OrgTeam | ApplyAllDialogData;
  } | null>(null);

  return (
    <>
      {syncMessage && <div className="mb-4 text-xs text-muted-foreground">{syncMessage}</div>}

      <Card className="mb-4 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight">组织与权限</h1>
          <p className="mt-2 text-sm text-muted-foreground">部门、小组、成员、角色与页面权限管理</p>
        </div>

        <div className="px-5 pt-4">
          <div className="flex flex-wrap gap-10">
            {scopeOptions.map((option) => {
              const active = selectedScope.scopeType === option.scopeType && selectedScope.departmentOrgNodeId === option.departmentOrgNodeId;
              return (
                <button
                  key={`${option.scopeType}:${option.departmentOrgNodeId}`}
                  type="button"
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams.toString());
                    nextParams.set("scope", option.scopeType);
                    nextParams.set("tab", tab);
                    if (tab === "permissions") {
                      nextParams.set("section", permissionSection);
                    } else {
                      nextParams.delete("section");
                    }
                    if (option.scopeType === "DEPARTMENT") {
                      nextParams.set("department", option.departmentOrgNodeId);
                    } else {
                      nextParams.delete("department");
                    }
                    router.push(`/organization?${nextParams.toString()}`);
                  }}
                  className="relative pb-3"
                >
                  <span className={`text-sm font-medium transition ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {option.label}
                  </span>
                  {active ? <span className="absolute left-0 bottom-0 h-0.5 w-10 bg-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pt-3 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-lg bg-muted">
              {[
                { key: "organization", label: "组织" },
                { key: "permissions", label: "权限" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams.toString());
                    nextParams.set("tab", item.key);
                    if (item.key === "permissions") {
                      nextParams.set("section", permissionSection);
                    } else {
                      nextParams.delete("section");
                    }
                    if (selectedScope.scopeType === "SYSTEM") {
                      nextParams.delete("department");
                    }
                    router.push(`/organization?${nextParams.toString()}`);
                  }}
                  className={`px-4 py-1.5 rounded-md text-sm transition ${
                    tab === item.key
                      ? "bg-card text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "organization" && (canManageUsers || canManageTeams || (isAdmin && selectedScope.scopeType === "SYSTEM")) && (
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && selectedScope.scopeType === "SYSTEM" && (
                  <Button variant="outline" onClick={handleDingTalkSync} className="h-9 rounded-lg text-primary border-primary/40" disabled={syncing}>
                    <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "更新中" : "从钉钉更新"}
                  </Button>
                )}
                {canManageTeams && <Button variant="outline" className="h-9 rounded-lg" onClick={() => setDialog({ type: "team" })}><Plus className="w-4 h-4" />新增小组</Button>}
                {canManageUsers && <Button className="h-9 rounded-lg" onClick={() => setDialog({ type: "user" })}><Plus className="w-4 h-4" />新增成员</Button>}
              </div>
            )}
          </div>
        </div>

        {tab === "permissions" ? (
          <>
            <div className="px-5 pt-3 pb-5">
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
              </div>
            </div>

            <div className="px-5 pb-4">
              <div className="inline-flex p-1 rounded-lg bg-muted">
                {[
                  { key: "menu", label: "菜单权限" },
                  { key: "annual-goal", label: "年度指标权限" },
                  { key: "kpi", label: "KPI 权限" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      const nextParams = new URLSearchParams(searchParams.toString());
                      nextParams.set("tab", "permissions");
                      nextParams.set("section", item.key);
                      setPermissionSection(item.key as "menu" | "annual-goal" | "kpi");
                      if (selectedScope.scopeType === "SYSTEM") {
                        nextParams.delete("department");
                      }
                      router.push(`/organization?${nextParams.toString()}`);
                    }}
                    className={`px-4 py-1.5 rounded-md text-sm transition ${
                      permissionSection === item.key
                        ? "bg-card text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {permissionSection === "menu" ? (
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">菜单权限</h3>
                    {canManageRolePermissions && hasRoleMenuChanges && <div className="text-xs text-warning mt-1">有未保存的权限调整</div>}
                  </div>
                  {canManageRolePermissions && (
                    <form action={saveRoleMenuPermissions} className="flex gap-2">
                      <input type="hidden" name="scopeType" value={selectedScope.scopeType} />
                      <input type="hidden" name="departmentOrgNodeId" value={selectedScope.departmentOrgNodeId} />
                      <input type="hidden" name="permissions" value={draftRoleMenuPayload} />
                      <button type="button" disabled={!hasRoleMenuChanges} onClick={resetDraftPermissions} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all border border-border bg-card hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed">取消</button>
                      <button type="submit" disabled={!hasRoleMenuChanges} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">保存</button>
                    </form>
                  )}
                </div>
                <div className="overflow-x-auto mb-2">
                  <table className="w-full min-w-[960px] table-fixed text-xs">
                    <colgroup>
                      <col className="w-[220px]" />
                      {permissionRoleOptions.map((role) => <col key={role.value} className="w-20" />)}
                    </colgroup>
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 font-medium">菜单</th>
                        {permissionRoleOptions.map((role) => <th key={role.value} className="py-2 font-medium text-center align-middle">{role.label.slice(0, 2)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {menus.map((menu) => (
                        <tr key={menu.id} className="border-t border-border">
                          <td className="py-0 pr-4 align-middle">
                            <div className="min-h-[72px] flex flex-col justify-center">
                              <div className="font-medium break-words">{menu.name}</div>
                              <div className="text-[10px] text-muted-foreground break-all">{menu.path}</div>
                            </div>
                          </td>
                          {permissionRoleOptions.map((role) => {
                            const cell = draftRoleMenuCells[`${role.value}:${menu.id}`];
                            const enabled = cell?.allowed ?? false;
                            const locked = role.value === "ADMIN" && ["/organization", "/dashboard"].includes(menu.path);
                            const inherited = cell?.inherited;
                            return (
                              <td key={role.value} className="py-0 text-center align-middle">
                                <div className="group relative min-h-[72px] flex items-center justify-center gap-1">
                                  {canManageRolePermissions ? (
                                    <button type="button" disabled={locked} onClick={() => toggleDraftPermission(role.value, menu)} className={`inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} ${inherited ? "ring-1 ring-warning/50" : ""} ${locked ? "opacity-60 cursor-not-allowed" : "hover:ring-1 hover:ring-ring"}`} title={locked ? "核心入口不可移除" : inherited ? "当前继承自系统，点击后转为显式配置" : "调整后需点击保存生效"}>
                                      {enabled && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                  ) : (
                                    <span className={`inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{enabled && <Check className="w-3.5 h-3.5" />}</span>
                                  )}
                                  {isAdmin && selectedScope.scopeType === "SYSTEM" && !locked && (
                                    <button
                                      type="button"
                                      onClick={() => setDialog({
                                        type: "applyAllDepartments",
                                        data: {
                                          kind: "menu",
                                          permissionId: menu.id,
                                          permissionName: menu.name,
                                          roleType: role.value,
                                          roleLabel: role.label,
                                          allowed: enabled,
                                        },
                                      })}
                                      className="absolute left-[calc(50%+18px)] top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm transition hover:text-foreground group-hover:inline-flex"
                                      title="按当前系统值覆盖到全部部门"
                                    >
                                      <Wand2 className="w-3 h-3" />
                                    </button>
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
              </div>
            ) : permissionSection === "annual-goal" ? (
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">年度指标权限</h3>
                    {canManageRolePermissions && hasAnnualGoalPermissionChanges && <div className="text-xs text-warning mt-1">有未保存的年度指标权限调整</div>}
                  </div>
                  {canManageRolePermissions && (
                    <form action={saveAnnualGoalRolePermissions} className="flex gap-2">
                      <input type="hidden" name="scopeType" value={selectedScope.scopeType} />
                      <input type="hidden" name="departmentOrgNodeId" value={selectedScope.departmentOrgNodeId} />
                      <input type="hidden" name="permissions" value={draftAnnualGoalPayload} />
                      <button type="button" disabled={!hasAnnualGoalPermissionChanges} onClick={resetDraftAnnualGoalPermissions} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all border border-border bg-card hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed">取消</button>
                      <button type="submit" disabled={!hasAnnualGoalPermissionChanges} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">保存</button>
                    </form>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] table-fixed text-xs">
                    <colgroup>
                      <col className="w-[220px]" />
                      {permissionRoleOptions.map((role) => <col key={role.value} className="w-20" />)}
                    </colgroup>
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 font-medium">能力项</th>
                        {permissionRoleOptions.map((role) => <th key={role.value} className="py-2 font-medium text-center align-middle">{role.label.slice(0, 2)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {annualGoalPermissions.map((permission) => (
                        <tr key={permission.id} className="border-t border-border">
                          <td className="py-0 pr-4 align-middle">
                            <div className="min-h-[72px] flex flex-col justify-center">
                              <div className="font-medium break-words">{permission.name}</div>
                              <div className="text-[10px] text-muted-foreground break-all">{permission.description}</div>
                            </div>
                          </td>
                          {permissionRoleOptions.map((role) => {
                            const cell = draftAnnualGoalCells[`${role.value}:${permission.id}`];
                            const enabled = cell?.allowed ?? false;
                            const inherited = cell?.inherited;
                            return (
                              <td key={role.value} className="py-0 text-center align-middle">
                                <div className="group relative min-h-[72px] flex items-center justify-center gap-1">
                                  {canManageRolePermissions ? (
                                    <button type="button" onClick={() => toggleDraftAnnualGoalPermission(role.value, permission)} className={`inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} ${inherited ? "ring-1 ring-warning/50" : ""} hover:ring-1 hover:ring-ring`} title={inherited ? "当前继承自系统，点击后转为显式配置" : "调整后需点击保存生效"}>
                                      {enabled && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                  ) : (
                                    <span className={`inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{enabled && <Check className="w-3.5 h-3.5" />}</span>
                                  )}
                                  {isAdmin && selectedScope.scopeType === "SYSTEM" && (
                                    <button
                                      type="button"
                                      onClick={() => setDialog({
                                        type: "applyAllDepartments",
                                        data: {
                                          kind: "annual-goal",
                                          permissionId: permission.id,
                                          permissionName: permission.name,
                                          roleType: role.value,
                                          roleLabel: role.label,
                                          allowed: enabled,
                                        },
                                      })}
                                      className="absolute left-[calc(50%+18px)] top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm transition hover:text-foreground group-hover:inline-flex"
                                      title="按当前系统值覆盖到全部部门"
                                    >
                                      <Wand2 className="w-3 h-3" />
                                    </button>
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
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">KPI 权限</h3>
                    {canManageRolePermissions && hasKpiPermissionChanges && <div className="text-xs text-warning mt-1">有未保存的 KPI 权限调整</div>}
                  </div>
                  {canManageRolePermissions && (
                    <form action={saveKpiRolePermissions} className="flex gap-2">
                      <input type="hidden" name="scopeType" value={selectedScope.scopeType} />
                      <input type="hidden" name="departmentOrgNodeId" value={selectedScope.departmentOrgNodeId} />
                      <input type="hidden" name="permissions" value={draftKpiPayload} />
                      <button type="button" disabled={!hasKpiPermissionChanges} onClick={resetDraftKpiPermissions} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all border border-border bg-card hover:bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed">取消</button>
                      <button type="submit" disabled={!hasKpiPermissionChanges} className="h-8 px-3 text-xs inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">保存</button>
                    </form>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] table-fixed text-xs">
                    <colgroup>
                      <col className="w-[220px]" />
                      {permissionRoleOptions.map((role) => <col key={role.value} className="w-20" />)}
                    </colgroup>
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 font-medium">能力项</th>
                        {permissionRoleOptions.map((role) => <th key={role.value} className="py-2 font-medium text-center align-middle">{role.label.slice(0, 2)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {kpiPermissions.map((permission) => (
                      <tr key={permission.id} className="border-t border-border">
                        <td className="py-0 pr-4 align-middle">
                          <div className="min-h-[72px] flex flex-col justify-center">
                            <div className="font-medium break-words">{permission.name}</div>
                            <div className="text-[10px] text-muted-foreground break-all">{permission.description}</div>
                          </div>
                        </td>
                        {permissionRoleOptions.map((role) => {
                          const cell = draftKpiCells[`${role.value}:${permission.id}`];
                          const enabled = cell?.allowed ?? false;
                          const inherited = cell?.inherited;
                          return (
                            <td key={role.value} className="py-0 text-center align-middle">
                              <div className="group relative min-h-[72px] flex items-center justify-center gap-1">
                                {canManageRolePermissions ? (
                                  <button type="button" onClick={() => toggleDraftKpiPermission(role.value, permission)} className={`inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} ${inherited ? "ring-1 ring-warning/50" : ""} hover:ring-1 hover:ring-ring`} title={inherited ? "当前继承自系统，点击后转为显式配置" : "调整后需点击保存生效"}>
                                    {enabled && <Check className="w-3.5 h-3.5" />}
                                  </button>
                                ) : (
                                  <span className={`inline-flex w-6 h-6 items-center justify-center rounded ${enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{enabled && <Check className="w-3.5 h-3.5" />}</span>
                                )}
                                {isAdmin && selectedScope.scopeType === "SYSTEM" && (
                                  <button
                                    type="button"
                                    onClick={() => setDialog({
                                      type: "applyAllDepartments",
                                      data: {
                                        kind: "kpi",
                                        permissionId: permission.id,
                                        permissionName: permission.name,
                                        roleType: role.value,
                                        roleLabel: role.label,
                                        allowed: enabled,
                                      },
                                    })}
                                    className="absolute left-[calc(50%+18px)] top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm transition hover:text-foreground group-hover:inline-flex"
                                    title="按当前系统值覆盖到全部部门"
                                  >
                                    <Wand2 className="w-3 h-3" />
                                  </button>
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
            </div>
            )}
          </>
        ) : selectedScope.scopeType === "SYSTEM" ? (
          <>
            <div className="border-b border-border px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />成员列表</h3>
              <span className="text-xs text-muted-foreground">共 {visibleUsers.length} 人</span>
            </div>
            <table className="w-full">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">姓名</th>
                  <th className="px-5 py-3 font-medium">职务</th>
                  <th className="px-5 py-3 font-medium">角色</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/30 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full text-white text-xs flex items-center justify-center ${avatarColor(u.name)}`}>{u.name.charAt(0)}</div>
                        <span className="text-sm font-medium">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{u.title ?? "—"}</td>
                    <td className="px-5 py-3"><Badge tone={roleBadgeTone(u.roleType)}>{getRoleLabel(u.roleType)}</Badge></td>
                    <td className="px-5 py-3 text-right text-xs">
                      {canManageUsers && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setDialog({ type: "user", data: u })} className="text-primary hover:underline">编辑</button>
                          <button onClick={() => setDialog({ type: "deleteUser", data: u })} className="text-destructive hover:underline">删除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            {department && (
              <div className="px-5 pt-2 pb-4">
                <div className="w-full rounded-xl bg-muted/40 px-4 py-3 text-sm">
                  <div className="text-xs text-muted-foreground">{department.name}</div>
                  <div className="font-medium mt-1">当前主管：{department.managerName ?? "未设置"}</div>
                  {isAdmin && (
                    <form action={setDepartmentManager} className="mt-3 flex gap-2">
                      <input type="hidden" name="departmentOrgNodeId" value={department.orgNodeId} />
                      <select name="managerId" defaultValue={department.managerId ?? ""} className="min-w-0 flex-1 h-9 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-ring">
                        <option value="">选择主管</option>
                        {users.filter((u) => u.roleType !== "ADMIN").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <Button type="submit" variant="outline" className="h-9 px-3 text-xs">保存</Button>
                    </form>
                  )}
                </div>
              </div>
            )}

            <div className="border-b border-border px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold">组长列表</h3>
              <span className="text-xs text-muted-foreground">共 {visibleTeams.length} 个小组</span>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2 xl:grid-cols-4">
              {visibleTeams.map((team, i) => {
                const info = countMap.get(team.orgNodeId);
                const tone = toneCycle[i % toneCycle.length];
                return (
                  <div key={team.orgNodeId} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">{team.name}</h4>
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
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border px-5 py-3 flex items-center justify-between">
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
                  const teamName = u.teamOrgNodeId ? teams.find((t) => t.orgNodeId === u.teamOrgNodeId)?.name : null;
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
                        {canManageUsers && u.roleType !== "ADMIN" && !(currentUser.roleType === "DEPARTMENT_MANAGER" && !["TEAM_LEADER", "MEMBER"].includes(u.roleType)) && (
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
          </>
        )}
      </Card>
      <Dialog open={dialog?.type === "user"} onClose={() => setDialog(null)} title={dialog?.data ? "编辑成员" : "新增成员"}>
        <UserForm
          user={dialog?.data as OrgUser | undefined}
          teams={teams}
          departments={departments}
          departmentOrgNodeId={selectedDepartmentOrgNodeId || departments[0]?.orgNodeId || ""}
          roleOptionsForForm={manageableRoleOptions}
          canSelectDepartment={isAdmin && selectedScope.scopeType === "SYSTEM"}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog open={dialog?.type === "team"} onClose={() => setDialog(null)} title={dialog?.data ? "编辑小组" : "新增小组"}>
        <TeamForm
          team={dialog?.data as OrgTeam | undefined}
          users={users}
          departments={departments}
          departmentOrgNodeId={selectedDepartmentOrgNodeId || departments[0]?.orgNodeId || ""}
          canSelectDepartment={isAdmin && selectedScope.scopeType === "SYSTEM"}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog open={dialog?.type === "applyAllDepartments"} onClose={() => setDialog(null)} title="应用到全部部门">
        <ApplyAllDepartmentsConfirm data={dialog?.data as ApplyAllDialogData} onClose={() => setDialog(null)} />
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
            fd.set("id", (dialog?.data as OrgTeam).orgNodeId);
            await deleteTeam(fd);
          }}
          onClose={() => setDialog(null)}
        />
      </Dialog>
    </>
  );
}
