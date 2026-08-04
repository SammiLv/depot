"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui-kit";
import { avatarColor } from "@/lib/avatar-color";
import { Plus, Users, X, Check, RefreshCw, Wand2, ChevronRight, ChevronDown, Building2, FolderTree, Search } from "lucide-react";
import { applyAnnualGoalPermissionToAllDepartments, applyKpiPermissionToAllDepartments, applyRoleMenuPermissionToAllDepartments, createDepartment, createKpiUserPermissionGrant, createUser, updateUser, deleteKpiUserPermissionGrant, deleteUser, createTeam, updateTeam, deleteTeam, setDepartmentManager, saveAnnualGoalRolePermissions, saveKpiRolePermissions, saveRoleMenuPermissions, updateFromDingTalk, saveKpiApprovalPolicy, toggleKpiApprovalPolicy, deleteKpiApprovalPolicy, saveAndApplyRoleMenuPermissionChangesToAllDepartments, saveAndApplyAnnualGoalPermissionChangesToAllDepartments, saveAndApplyKpiPermissionChangesToAllDepartments, saveAndApplyRoleMenuPermissionsToAllDepartments, saveAndApplyAnnualGoalPermissionsToAllDepartments, saveAndApplyKpiPermissionsToAllDepartments } from "@/server/organization/actions";
import {
  buildKpiApprovalOrgTreeIndex,
  getKpiApprovalOrgNodeIdsAtDepth,
  selectKpiApprovalOrgNodes,
} from "@/lib/kpi-approval-org-tree";
import {
  getPermissionSelectionState,
  countPermissionValueChanges,
  setPermissionCellsAllowed,
  type PermissionSelectionState,
} from "@/lib/permission-matrix";
import type { OrganizationEntityNode, OrganizationHierarchyNode, OrganizationPersonNode } from "./page";

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
  parentOrgNodeId: string;
  parentName: string;
  name: string;
  leaderId: string | null;
  description: string | null;
};

type TeamParentOption = {
  orgNodeId: string;
  name: string;
  nodeType: "DEPARTMENT" | "TEAM";
  departmentOrgNodeId: string;
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

type KpiUserPermissionGrant = {
  id: string;
  userId: string;
  userName: string;
  abilityKey: string;
  abilityName: string;
  scopeType: "SELF" | "NODE" | "SUBTREE" | "ALL";
  orgNodeId: string | null;
  orgNodeName: string | null;
};

type KpiApprovalPolicy = {
  id: string;
  scopeType: PermissionScopeType;
  departmentOrgNodeId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  inherited: boolean;
  scopeOrgNodeIds: string[];
  steps: Array<{
    id: string;
    label: string;
    nodeMode: "CURRENT_TEAM" | "CURRENT_DEPARTMENT" | "FIXED_NODE" | "NONE" | "ORG_NODE_OWNER" | "CASCADE_TO_DEPARTMENT" | null;
    approvalOrgNodeId: string | null;
    approvalOrgNodeIds: string[];
    ancestorDepth: number | null;
    resolverType: "TEAM_LEADER" | "DEPARTMENT_MANAGER" | "ADMIN" | "EXPLICIT_USER";
    resolverUserId: string | null;
    skipIfSelf: boolean;
    skipIfDuplicateApprover: boolean;
    allowSkipWhenNoApprover: boolean;
  }>;
};

type ApprovalOrgNodeOption = {
  id: string;
  name: string;
  nodeType: "ROOT" | "DEPARTMENT" | "TEAM";
  parentId: string | null;
  departmentOrgNodeId: string | null;
  path: string;
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

type PermissionMatrixSyncDialogData = {
  kind: "menu" | "annual-goal" | "kpi";
  mode: "CHANGES" | "FULL";
  moduleName: string;
  permissions: string;
  departmentCount: number;
  roleCount: number;
  permissionCount: number;
  changeCount: number;
  changedItems: Array<{
    roleLabel: string;
    permissionName: string;
    beforeAllowed: boolean;
    afterAllowed: boolean;
  }>;
};

type Props = {
  currentUser: { id: string; roleType: RoleType };
  users: OrgUser[];
  teams: OrgTeam[];
  departments: OrgDepartment[];
  teamParentOptions: TeamParentOption[];
  approvalOrgNodes: ApprovalOrgNodeOption[];
  scopeOptions: PermissionScopeOption[];
  initialScope: { scopeType: PermissionScopeType; departmentOrgNodeId: string };
  initialTab: "organization" | "permissions";
  initialPermissionSection: "menu" | "annual-goal" | "kpi" | "approval-policy";
  scopeViews: Record<string, {
    department: OrgDepartment | null;
    organizationHierarchyRoot: OrganizationEntityNode | null;
    menus: OrgMenu[];
    annualGoalPermissions: ScopedAnnualGoalPermission[];
    kpiPermissions: ScopedKpiPermission[];
    kpiUserPermissionGrants: KpiUserPermissionGrant[];
    kpiApprovalPolicies: KpiApprovalPolicy[];
  }>;
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

function buildPermissionCellKeys(roleTypes: readonly RoleType[], permissionIds: readonly string[]) {
  return roleTypes.flatMap((roleType) => permissionIds.map((permissionId) => `${roleType}:${permissionId}`));
}

function buildPermissionChangedItems(
  initialCells: Record<string, PermissionCellState>,
  draftCells: Record<string, PermissionCellState>,
  permissions: readonly { id: string; name: string }[],
) {
  return roleOptions.flatMap((role) => permissions.flatMap((permission) => {
    const key = `${role.value}:${permission.id}`;
    const beforeAllowed = initialCells[key]?.allowed ?? false;
    const afterAllowed = draftCells[key]?.allowed ?? false;
    return beforeAllowed === afterAllowed ? [] : [{
      roleLabel: role.label,
      permissionName: permission.name,
      beforeAllowed,
      afterAllowed,
    }];
  }));
}

function PermissionBulkCheckbox({
  state,
  label,
  onToggle,
}: {
  state: PermissionSelectionState;
  label: string;
  onToggle: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = state === "mixed";
  }, [state]);

  return (
    <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 text-foreground" title={`${state === "checked" ? "清空" : "全选"}${label}`}>
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={state === "checked"}
        onChange={onToggle}
        className="h-3.5 w-3.5 cursor-pointer accent-primary"
        aria-label={`${state === "checked" ? "清空" : "全选"}${label}`}
      />
      <span>{label}</span>
    </label>
  );
}

function renderRequiredLabel(label: string) {
  const trimmedLabel = label.trimEnd();
  if (!trimmedLabel.endsWith("*")) return label;
  return <>{trimmedLabel.slice(0, -1).trimEnd()} <span className="text-destructive">*</span></>;
}

function getGrantScopeLabel(scopeType: KpiUserPermissionGrant["scopeType"]) {
  switch (scopeType) {
    case "NODE":
      return "当前节点";
    case "SUBTREE":
      return "当前节点及下级";
    case "ALL":
      return "全部";
    default:
      return "本人";
  }
}

type KpiApprovalPolicyStepDraft = Omit<KpiApprovalPolicy["steps"][number], "id">;

type SearchableSelectOption = {
  value: string;
  label: string;
};

function SearchableSelect({
  value,
  options,
  searchPlaceholder,
  emptyLabel,
  onChange,
}: {
  value: string;
  options: SearchableSelectOption[];
  searchPlaceholder: string;
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedSearch))
    : options;

  useEffect(() => {
    if (!open) return;
    const closeWhenClickingOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${open ? "z-50" : "z-0"}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 text-left text-sm transition ${open ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-ring"}`}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? emptyLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[260px] rounded-xl border border-border bg-card p-2 shadow-xl">
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 h-9 w-full rounded-lg border border-primary bg-background px-3 text-sm outline-none ring-2 ring-primary/10"
          />
          <div role="listbox" className="max-h-56 space-y-1 overflow-y-auto">
            {filteredOptions.length > 0 ? filteredOptions.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value || "automatic"}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setSearch("");
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${selected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                >
                  <span>{option.label}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            }) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getApprovalResolverTypeForNode(nodeType: ApprovalOrgNodeOption["nodeType"]): KpiApprovalPolicyStepDraft["resolverType"] {
  if (nodeType === "TEAM") return "TEAM_LEADER";
  if (nodeType === "DEPARTMENT") return "DEPARTMENT_MANAGER";
  return "ADMIN";
}

function getApprovalNodeSelectValue(step: KpiApprovalPolicyStepDraft) {
  if (step.nodeMode === "ORG_NODE_OWNER" || step.nodeMode === "CASCADE_TO_DEPARTMENT") return step.nodeMode;
  return "ORG_NODE_OWNER";
}

function getApprovalNodeLabel(step: KpiApprovalPolicyStepDraft, orgNodeById: Map<string, ApprovalOrgNodeOption>) {
  if (step.nodeMode === "ORG_NODE_OWNER") {
    const labels = step.approvalOrgNodeIds.map((id) => orgNodeById.get(id)?.path ?? "已失效节点");
    return labels.length > 0 ? `组织节点负责人：${labels.join("、")}` : "组织节点负责人（未选节点）";
  }
  if (step.nodeMode === "CASCADE_TO_DEPARTMENT") return "逐级审批至部门";
  if (step.nodeMode === "CURRENT_TEAM") return "跟随员工当前团队";
  if (step.nodeMode === "CURRENT_DEPARTMENT") return "跟随员工所属部门";
  if (step.nodeMode === "FIXED_NODE") return step.approvalOrgNodeId
    ? orgNodeById.get(step.approvalOrgNodeId)?.path ?? "固定组织节点已失效"
    : "未选择固定组织节点";
  if (step.nodeMode === "NONE") return "不使用组织节点";
  if (step.resolverType === "TEAM_LEADER") return "历史规则：自动查找组长";
  if (step.resolverType === "DEPARTMENT_MANAGER") return "历史规则：自动查找部门主管";
  if (step.resolverType === "ADMIN") return "历史规则：系统管理员";
  return "不使用组织节点";
}

function getAutomaticApproverLabel(step: KpiApprovalPolicyStepDraft, orgNodeById: Map<string, ApprovalOrgNodeOption>) {
  if (step.nodeMode === "ORG_NODE_OWNER") return "自动匹配：命中组织节点的负责人";
  if (step.nodeMode === "CASCADE_TO_DEPARTMENT") return "自动匹配：逐级负责人，截止到部门";
  if (step.nodeMode === "CURRENT_TEAM") return "自动匹配：员工当前团队组长";
  if (step.nodeMode === "CURRENT_DEPARTMENT") return "自动匹配：员工所属部门主管";
  if (step.nodeMode === "FIXED_NODE" && step.approvalOrgNodeId) {
    const node = orgNodeById.get(step.approvalOrgNodeId);
    if (!node) return "自动匹配：组织节点管理人";
    if (node.nodeType === "TEAM") return `自动匹配：${node.name}组长`;
    if (node.nodeType === "DEPARTMENT") return `自动匹配：${node.name}部门主管`;
    return "自动匹配：系统管理员";
  }
  return "请选择审批人";
}

function normalizeApprovalStepForEditor(
  step: KpiApprovalPolicy["steps"][number],
  rootOrgNodeId: string | null,
): KpiApprovalPolicyStepDraft {
  if (step.nodeMode === "ORG_NODE_OWNER") return { ...step };
  if (step.nodeMode === "CASCADE_TO_DEPARTMENT") return { ...step, resolverUserId: null };
  const legacyNodeIds = step.approvalOrgNodeId
    ? [step.approvalOrgNodeId]
    : step.resolverType === "ADMIN" && rootOrgNodeId ? [rootOrgNodeId] : [];
  return {
    ...step,
    nodeMode: legacyNodeIds.length > 0 ? "ORG_NODE_OWNER" : "CASCADE_TO_DEPARTMENT",
    approvalOrgNodeId: null,
    approvalOrgNodeIds: legacyNodeIds,
    ancestorDepth: null,
    resolverType: "TEAM_LEADER",
  };
}

function KpiApprovalOrgTreeSelector({
  nodes,
  scopeRootId,
  selectedIds,
  onChange,
}: {
  nodes: ApprovalOrgNodeOption[];
  scopeRootId: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const tree = useMemo(() => buildKpiApprovalOrgTreeIndex(nodes, scopeRootId), [nodes, scopeRootId]);
  const initialDepth = Math.min(1, tree.maxDepth);
  const [batchDepth, setBatchDepth] = useState(initialDepth);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(
    [...tree.depthById.entries()]
      .filter(([, depth]) => depth < initialDepth)
      .map(([nodeId]) => nodeId)
  ));
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const nextDepth = Math.min(1, tree.maxDepth);
    setBatchDepth(nextDepth);
    setExpandedIds(new Set(
      [...tree.depthById.entries()]
        .filter(([, depth]) => depth < nextDepth)
        .map(([nodeId]) => nodeId)
    ));
    setSearch("");
    setFeedback("");
  }, [scopeRootId, tree.maxDepth]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const searchVisibleIds = useMemo(() => {
    if (!normalizedSearch) return null;
    const visibleIds = new Set<string>();
    for (const node of nodes) {
      if (!`${node.name} ${node.path}`.toLocaleLowerCase().includes(normalizedSearch)) continue;
      let currentId: string | null = node.id;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        visibleIds.add(currentId);
        currentId = tree.treeParentById.get(currentId) ?? null;
      }
    }
    return visibleIds;
  }, [nodes, normalizedSearch, tree.treeParentById]);

  const currentLevelIds = getKpiApprovalOrgNodeIdsAtDepth(tree, batchDepth);

  function setExpandedToDepth(depth: number) {
    const normalizedDepth = Math.max(0, Math.min(depth, tree.maxDepth));
    setBatchDepth(normalizedDepth);
    setExpandedIds(new Set(
      [...tree.depthById.entries()]
        .filter(([, nodeDepth]) => nodeDepth < normalizedDepth)
        .map(([nodeId]) => nodeId)
    ));
  }

  function applySelection(label: string, requestedIds: string[]) {
    const result = selectKpiApprovalOrgNodes(selectedIds, requestedIds, tree);
    onChange(result.selectedIds);
    setFeedback(result.removedIds.length > 0
      ? `${label}：已选 ${requestedIds.length} 个节点，并自动取消 ${result.removedIds.length} 个同路径冲突节点。`
      : `${label}：已选 ${requestedIds.length} 个节点。`);
  }

  function toggleNode(nodeId: string) {
    if (selectedIds.includes(nodeId)) {
      onChange(selectedIds.filter((id) => id !== nodeId));
      setFeedback("已取消 1 个节点。");
      return;
    }
    applySelection("节点选择", [nodeId]);
  }

  function renderNode(node: ApprovalOrgNodeOption, depth: number): React.ReactNode {
    if (searchVisibleIds && !searchVisibleIds.has(node.id)) return null;
    const children = tree.childrenById.get(node.id) ?? [];
    const visibleChildren = searchVisibleIds
      ? children.filter((child) => searchVisibleIds.has(child.id))
      : children;
    const expanded = normalizedSearch ? visibleChildren.length > 0 : expandedIds.has(node.id);
    const selected = selectedIds.includes(node.id);
    const insideScope = tree.scopeNodeIds.has(node.id);
    const typeLabel = node.nodeType === "ROOT" ? "公司" : node.nodeType === "DEPARTMENT" ? "部门" : "小组";

    return (
      <div key={node.id}>
        <div
          className={`group flex min-h-9 items-center gap-2 rounded-lg pr-2 text-sm transition ${selected ? "bg-primary/10" : "hover:bg-background"}`}
          style={{ paddingLeft: `${Math.min(depth, 8) * 20 + 8}px` }}
        >
          <button
            type="button"
            aria-label={children.length > 0 ? (expanded ? `收起${node.name}` : `展开${node.name}`) : `${node.name}无下级节点`}
            disabled={children.length === 0 || Boolean(normalizedSearch)}
            onClick={() => setExpandedIds((current) => {
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            })}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${children.length > 0 ? "text-muted-foreground hover:bg-muted" : "text-transparent"}`}
          >
            {children.length > 0 ? (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <ChevronRight className="h-4 w-4" />}
          </button>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleNode(node.id)}
            aria-label={`选择${node.path}`}
          />
          <button type="button" onClick={() => toggleNode(node.id)} className="min-w-0 flex-1 truncate py-2 text-left">
            {node.name}
          </button>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${node.nodeType === "ROOT" ? "bg-primary/10 text-primary" : node.nodeType === "DEPARTMENT" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground"}`}>
            {typeLabel}
          </span>
          {!insideScope ? <span className="shrink-0 text-[11px] text-muted-foreground">公共节点</span> : null}
        </div>
        {expanded && visibleChildren.length > 0 ? (
          <div className="relative">
            {visibleChildren.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="kpi-approval-org-tree">
      <div className="text-xs font-medium">选择本步参与审批的组织节点</div>

      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-xs">
        <label className="relative block w-56 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索组织节点"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </label>
        <button type="button" onClick={() => setExpandedToDepth(tree.maxDepth)} className="shrink-0 rounded-md px-2.5 py-2 text-primary hover:bg-primary/10">展开全部</button>
        <button type="button" onClick={() => setExpandedToDepth(0)} className="shrink-0 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-muted">收起全部</button>
        <button type="button" onClick={() => { onChange([]); setFeedback("已清空本步骤选择。"); }} className="shrink-0 rounded-md px-2.5 py-2 text-destructive hover:bg-destructive/10">清空已选</button>
        <button type="button" disabled={batchDepth === tree.maxDepth} onClick={() => setExpandedToDepth(batchDepth + 1)} className="shrink-0 rounded-md px-2.5 py-2 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-40">展开下一层</button>
        <button type="button" disabled={batchDepth === 0} onClick={() => setExpandedToDepth(batchDepth - 1)} className="shrink-0 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">收起一层</button>
        <button type="button" onClick={() => applySelection(`全选第 ${batchDepth} 层`, currentLevelIds)} className="shrink-0 rounded-md px-2.5 py-2 text-primary hover:bg-primary/10">全选当前层</button>
        <button type="button" onClick={() => { onChange(selectedIds.filter((id) => !currentLevelIds.includes(id))); setFeedback(`已清空第 ${batchDepth} 层选择。`); }} className="shrink-0 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-muted">清空当前层</button>
      </div>

      {feedback ? <div role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">{feedback}</div> : null}

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/15 p-2">
        {tree.roots.map((root) => renderNode(root, 0))}
        {searchVisibleIds?.size === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的组织节点</div> : null}
      </div>
      <div className="text-xs text-muted-foreground">同一步不能同时选择存在上下级关系的节点；新选择会自动取消同一路径上的冲突节点。</div>
    </div>
  );
}

// ── Dialog component ──
function Dialog({
  open,
  onClose,
  title,
  children,
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  panelClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl ${panelClassName ?? "max-w-lg"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
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
            <label className="block text-sm font-medium mb-1">{renderRequiredLabel("所属部门 *")}</label>
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
          <label className="block text-sm font-medium mb-1">{renderRequiredLabel("姓名 *")}</label>
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
            <label className="block text-sm font-medium mb-1">{renderRequiredLabel("角色 *")}</label>
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

function DepartmentForm({ users, onClose }: { users: OrgUser[]; onClose: () => void }) {
  const availableUsers = users.filter((user) => user.isActive && user.roleType !== "ADMIN");

  return (
    <form action={async (fd) => { await createDepartment(fd); onClose(); }}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{renderRequiredLabel("部门名称 *")}</label>
          <input name="name" required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">部门主管</label>
          <select name="managerId" defaultValue="" className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
            <option value="">暂不设置</option>
            {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}{user.title ? ` · ${user.title}` : ""}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">创建</Button>
      </div>
    </form>
  );
}

// ── Team form ──
function TeamForm({
  team,
  users,
  departments,
  teamParentOptions,
  departmentOrgNodeId,
  canSelectDepartment,
  onClose,
}: {
  team?: OrgTeam;
  users: OrgUser[];
  departments: OrgDepartment[];
  teamParentOptions: TeamParentOption[];
  departmentOrgNodeId: string;
  canSelectDepartment: boolean;
  onClose: () => void;
}) {
  const isEdit = !!team;
  const action = isEdit ? updateTeam : createTeam;
  const initialDepartmentOrgNodeId = team?.departmentOrgNodeId ?? departmentOrgNodeId ?? departments[0]?.orgNodeId ?? "";
  const [selectedDepartmentOrgNodeId, setSelectedDepartmentOrgNodeId] = useState(initialDepartmentOrgNodeId);
  const availableParentOptions = teamParentOptions.filter((option) => option.departmentOrgNodeId === selectedDepartmentOrgNodeId && option.orgNodeId !== team?.orgNodeId);
  const [selectedParentOrgNodeId, setSelectedParentOrgNodeId] = useState(team?.parentOrgNodeId ?? availableParentOptions[0]?.orgNodeId ?? selectedDepartmentOrgNodeId);
  const availableUsers = users.filter((user) => user.isActive && user.departmentOrgNodeId === selectedDepartmentOrgNodeId);

  useEffect(() => {
    const nextDepartmentOrgNodeId = team?.departmentOrgNodeId ?? departmentOrgNodeId ?? departments[0]?.orgNodeId ?? "";
    setSelectedDepartmentOrgNodeId(nextDepartmentOrgNodeId);
  }, [team?.departmentOrgNodeId, departmentOrgNodeId, departments]);

  useEffect(() => {
    const nextParentOptions = teamParentOptions.filter((option) => option.departmentOrgNodeId === selectedDepartmentOrgNodeId && option.orgNodeId !== team?.orgNodeId);
    const nextParentOrgNodeId = team?.parentOrgNodeId && nextParentOptions.some((option) => option.orgNodeId === team.parentOrgNodeId)
      ? team.parentOrgNodeId
      : nextParentOptions[0]?.orgNodeId ?? selectedDepartmentOrgNodeId;
    setSelectedParentOrgNodeId(nextParentOrgNodeId);
  }, [team?.orgNodeId, team?.parentOrgNodeId, teamParentOptions, selectedDepartmentOrgNodeId]);

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {isEdit && <input type="hidden" name="id" value={team.orgNodeId} />}
      <input type="hidden" name="parentOrgNodeId" value={selectedParentOrgNodeId} />
      <div className="space-y-4">
        {canSelectDepartment && (
          <div>
            <label className="block text-sm font-medium mb-1">{renderRequiredLabel("所属部门 *")}</label>
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
          <label className="block text-sm font-medium mb-1">{renderRequiredLabel("上级节点 *")}</label>
          <select
            value={selectedParentOrgNodeId}
            onChange={(event) => setSelectedParentOrgNodeId(event.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
          >
            <option value="">请选择上级节点</option>
            {availableParentOptions.map((option) => (
              <option key={option.orgNodeId} value={option.orgNodeId}>{option.name}{option.nodeType === "TEAM" ? " · 小组" : " · 部门"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{renderRequiredLabel("小组名称 *")}</label>
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

function KpiUserPermissionGrantForm({
  users,
  teamParentOptions,
  scopeType,
  departmentOrgNodeId,
  permissions,
  onClose,
}: {
  users: OrgUser[];
  teamParentOptions: TeamParentOption[];
  scopeType: PermissionScopeType;
  departmentOrgNodeId: string;
  permissions: ScopedKpiPermission[];
  onClose: () => void;
}) {
  const userOptions = users
    .filter((user) => user.isActive && (scopeType === "SYSTEM" || user.departmentOrgNodeId === departmentOrgNodeId))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
    .map((user) => ({
      id: user.id,
      label: user.title ? `${user.name} · ${user.title}` : user.name,
    }));
  const abilityOptions = permissions.map((permission) => ({
    id: permission.id,
    label: permission.name,
  }));
  const nodeOptions = teamParentOptions
    .filter((option) => scopeType === "SYSTEM" || option.departmentOrgNodeId === departmentOrgNodeId)
    .map((option) => ({
      id: option.orgNodeId,
      label: `${option.name}${option.nodeType === "TEAM" ? " · 小组" : " · 部门"}`,
    }));

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedAbilityKeys, setSelectedAbilityKeys] = useState<string[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [grantScopeType, setGrantScopeType] = useState<"NODE" | "SUBTREE">("SUBTREE");
  const [userSearch, setUserSearch] = useState("");
  const [abilitySearch, setAbilitySearch] = useState("");
  const [nodeSearch, setNodeSearch] = useState("");

  const filteredUserOptions = userOptions.filter((option) =>
    option.label.toLowerCase().includes(userSearch.trim().toLowerCase())
  );
  const filteredAbilityOptions = abilityOptions.filter((option) =>
    option.label.toLowerCase().includes(abilitySearch.trim().toLowerCase())
  );
  const filteredNodeOptions = nodeOptions.filter((option) =>
    option.label.toLowerCase().includes(nodeSearch.trim().toLowerCase())
  );

  function toggleSelection(value: string, selectedValues: string[], setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>) {
    setSelectedValues((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  return (
    <form action={async (fd) => { await createKpiUserPermissionGrant(fd); onClose(); }} className="space-y-6">
      <input type="hidden" name="scopeType" value={scopeType} />
      <input type="hidden" name="departmentOrgNodeId" value={scopeType === "DEPARTMENT" ? departmentOrgNodeId : ""} />
      <input type="hidden" name="grantScopeType" value={grantScopeType} />
      {selectedUserIds.map((userId) => <input key={userId} type="hidden" name="userId" value={userId} />)}
      {selectedAbilityKeys.map((abilityKey) => <input key={abilityKey} type="hidden" name="abilityKey" value={abilityKey} />)}
      {selectedNodeIds.map((orgNodeId) => <input key={orgNodeId} type="hidden" name="orgNodeId" value={orgNodeId} />)}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium">授权用户 *</label>
          <input
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="搜索用户"
            className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-background">
            {filteredUserOptions.length ? filteredUserOptions.map((option) => {
              const checked = selectedUserIds.includes(option.id);
              return (
                <label key={option.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelection(option.id, selectedUserIds, setSelectedUserIds)}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </label>
              );
            }) : <div className="px-3 py-6 text-sm text-muted-foreground">暂无可选用户</div>}
          </div>
          <div className="text-xs text-muted-foreground">已选 {selectedUserIds.length} 个用户</div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">能力项 *</label>
          <input
            value={abilitySearch}
            onChange={(event) => setAbilitySearch(event.target.value)}
            placeholder="搜索能力项"
            className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-background">
            {filteredAbilityOptions.length ? filteredAbilityOptions.map((option) => {
              const checked = selectedAbilityKeys.includes(option.id);
              return (
                <label key={option.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelection(option.id, selectedAbilityKeys, setSelectedAbilityKeys)}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </label>
              );
            }) : <div className="px-3 py-6 text-sm text-muted-foreground">暂无可选能力项</div>}
          </div>
          <div className="text-xs text-muted-foreground">已选 {selectedAbilityKeys.length} 个能力项</div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="block text-sm font-medium">授权节点 *</label>
          <input
            value={nodeSearch}
            onChange={(event) => setNodeSearch(event.target.value)}
            placeholder="搜索部门或小组"
            className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          />
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-background">
            {filteredNodeOptions.length ? filteredNodeOptions.map((option) => {
              const checked = selectedNodeIds.includes(option.id);
              return (
                <label key={option.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelection(option.id, selectedNodeIds, setSelectedNodeIds)}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </label>
              );
            }) : <div className="px-3 py-6 text-sm text-muted-foreground">暂无可选节点</div>}
          </div>
          <div className="text-xs text-muted-foreground">已选 {selectedNodeIds.length} 个节点</div>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">授权范围 *</label>
          <select
            value={grantScopeType}
            onChange={(event) => setGrantScopeType(event.target.value as "NODE" | "SUBTREE")}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:border-ring"
          >
            <option value="NODE">当前节点</option>
            <option value="SUBTREE">当前节点及下级</option>
          </select>
          <div className="mt-2 text-xs text-muted-foreground">所选范围会统一作用到当前已选节点集合。</div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button
          type="submit"
          disabled={selectedUserIds.length === 0 || selectedAbilityKeys.length === 0 || selectedNodeIds.length === 0}
        >
          新增授权
        </Button>
      </div>
    </form>
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

function PermissionMatrixSyncConfirm({ data, onClose }: { data: PermissionMatrixSyncDialogData; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changesActions = {
    menu: saveAndApplyRoleMenuPermissionChangesToAllDepartments,
    "annual-goal": saveAndApplyAnnualGoalPermissionChangesToAllDepartments,
    kpi: saveAndApplyKpiPermissionChangesToAllDepartments,
  };
  const fullActions = {
    menu: saveAndApplyRoleMenuPermissionsToAllDepartments,
    "annual-goal": saveAndApplyAnnualGoalPermissionsToAllDepartments,
    kpi: saveAndApplyKpiPermissionsToAllDepartments,
  };
  const action = data.mode === "CHANGES" ? changesActions[data.kind] : fullActions[data.kind];
  return (
    <form action={async (formData) => {
      if (pending) return;
      setPending(true);
      setError(null);
      try {
        await action(formData);
        onClose();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "同步失败，请稍后重试");
      } finally {
        setPending(false);
      }
    }} className="space-y-4">
      <input type="hidden" name="scopeType" value="SYSTEM" />
      <input type="hidden" name="departmentOrgNodeId" value="" />
      <input type="hidden" name="permissions" value={data.permissions} />
      <input type="hidden" name="confirmation" value={data.mode === "CHANGES" ? "SYNC_PERMISSION_CHANGES" : "SYNC_FULL_PERMISSION_MATRIX"} />
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
        <div className="font-medium text-foreground">这是高风险批量操作，请确认影响范围</div>
        {data.mode === "CHANGES" ? (
          <div className="mt-3 space-y-3">
            <dl className="grid gap-2 text-muted-foreground sm:grid-cols-2">
              <div><dt className="inline">本次变更：</dt><dd className="inline font-medium text-foreground">{data.changeCount} 项</dd></div>
            </dl>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-warning/30 bg-background/70 p-3">
              {data.changedItems.map((item, index) => (
                <div key={`${item.roleLabel}:${item.permissionName}:${index}`} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                  <div><span className="text-muted-foreground">角色 + 能力项：</span><span className="font-medium text-foreground">{item.roleLabel} + {item.permissionName}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.beforeAllowed ? "开启" : "关闭"} → <span className="font-medium text-foreground">{item.afterAllowed ? "开启" : "关闭"}</span></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
              <div><dt className="inline">权限模块：</dt><dd className="inline text-foreground">{data.moduleName}</dd></div>
              <div><dt className="inline">现有部门：</dt><dd className="inline text-foreground">{data.departmentCount} 个</dd></div>
              <div><dt className="inline">角色：</dt><dd className="inline text-foreground">{data.roleCount} 个</dd></div>
              <div><dt className="inline">能力项：</dt><dd className="inline text-foreground">{data.permissionCount} 个</dd></div>
            </dl>
            {data.changedItems.length > 0 ? (
              <div className="space-y-2">
                <div className="text-muted-foreground">本次变更：<span className="font-medium text-foreground">{data.changedItems.length} 项</span></div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-warning/30 bg-background/70 p-3">
                  {data.changedItems.map((item, index) => (
                    <div key={`${item.roleLabel}:${item.permissionName}:${index}`} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                      <div><span className="text-muted-foreground">角色 + 能力项：</span><span className="font-medium text-foreground">{item.roleLabel} + {item.permissionName}</span></div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.beforeAllowed ? "开启" : "关闭"} → <span className="font-medium text-foreground">{item.afterAllowed ? "开启" : "关闭"}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {data.mode === "CHANGES"
          ? "系统将先保存当前系统矩阵，并把以上变更同步到所有部门；其他权限保留各部门现有配置。"
          : "系统将保存当前系统矩阵，并把以上变更同步到所有部门；各部门在本模块中的独立角色配置将被替换。"}
      </p>
      {error ? <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button>
        <Button type="submit" disabled={pending}>{pending ? "同步中…" : data.mode === "CHANGES" ? "确认同步本次变更" : "确认完整覆盖所有部门"}</Button>
      </div>
    </form>
  );
}

function PermissionMatrixSaveActions({
  saveAction,
  scopeType,
  departmentOrgNodeId,
  permissions,
  hasChanges,
  valueChangeCount,
  reset,
  onSync,
}: {
  saveAction: (formData: FormData) => Promise<void>;
  scopeType: PermissionScopeType;
  departmentOrgNodeId: string;
  permissions: string;
  hasChanges: boolean;
  valueChangeCount: number;
  reset: () => void;
  onSync: (mode: "CHANGES" | "FULL") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {scopeType === "SYSTEM" ? (
        <>
          <button type="button" disabled={valueChangeCount === 0} onClick={() => onSync("CHANGES")} className="inline-flex h-9 items-center justify-center rounded-lg border border-warning/50 bg-card px-4 text-sm font-medium text-warning transition-all hover:bg-warning/10 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">保存并同步本次变更</button>
          <button type="button" onClick={() => onSync("FULL")} className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive/40 bg-card px-4 text-sm font-medium text-destructive transition-all hover:bg-destructive/10 active:scale-[0.99]">完整同步至所有部门</button>
        </>
      ) : null}
      <form action={saveAction} className="flex gap-2">
        <input type="hidden" name="scopeType" value={scopeType} />
        <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
        <input type="hidden" name="permissions" value={permissions} />
        <button type="button" disabled={!hasChanges} onClick={reset} className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">取消</button>
        <button type="submit" disabled={!hasChanges} className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">保存</button>
      </form>
    </div>
  );
}

function buildInitialExpandedState(root: OrganizationEntityNode | null) {
  const nextState: Record<string, boolean> = {};
  if (!root) return nextState;

  nextState[root.id] = true;
  for (const child of root.children) {
    if (child.nodeType !== "PERSON") {
      nextState[child.id] = true;
    }
  }

  return nextState;
}

function flattenHierarchyRows(root: OrganizationEntityNode | null, expandedState?: Record<string, boolean>) {
  const rows: Array<{ node: OrganizationHierarchyNode; depth: number }> = [];
  if (!root) return rows;

  function visit(node: OrganizationHierarchyNode, depth: number, parentExpanded: boolean) {
    if (!parentExpanded) return;
    rows.push({ node, depth });
    if (node.nodeType === "PERSON") return;

    const isExpanded = expandedState ? (expandedState[node.id] ?? false) : true;
    node.children.forEach((child) => visit(child, depth + 1, isExpanded));
  }

  visit(root, 0, true);
  return rows;
}

function OrganizationListRow({
  node,
  depth,
  expandedState,
  onToggle,
  canManageTeams,
  canManageUsers,
  currentUserRoleType,
  onEditTeam,
  onDeleteTeam,
  onEditUser,
  onDeleteUser,
}: {
  node: OrganizationHierarchyNode;
  depth: number;
  expandedState: Record<string, boolean>;
  onToggle: (nodeId: string) => void;
  canManageTeams: boolean;
  canManageUsers: boolean;
  currentUserRoleType: RoleType;
  onEditTeam: (team: OrgTeam) => void;
  onDeleteTeam: (team: OrgTeam) => void;
  onEditUser: (user: OrgUser) => void;
  onDeleteUser: (user: OrgUser) => void;
}) {
  const isPerson = node.nodeType === "PERSON";
  const canManagePerson = isPerson && canManageUsers && node.roleType !== "ADMIN" && !(currentUserRoleType === "DEPARTMENT_MANAGER" && !["TEAM_LEADER", "MEMBER"].includes(node.roleType));
  const entityNode = isPerson ? null : node;
  const isLeafTeam = entityNode?.nodeType === "TEAM" && !entityNode.children.some((child) => child.nodeType !== "PERSON");
  const hasChildren = entityNode ? entityNode.children.length > 0 : false;
  const isExpanded = entityNode ? (expandedState[entityNode.id] ?? false) : false;

  return (
    <div className="flex items-center gap-3 border-t border-border px-5 py-4 hover:bg-muted/20 transition">
      <div style={{ width: `${depth * 28}px`, flexShrink: 0 }} />
      {isPerson ? null : (
        <button
          type="button"
          onClick={() => hasChildren ? onToggle(entityNode!.id) : undefined}
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${hasChildren ? "text-muted-foreground hover:bg-muted" : "text-transparent cursor-default"}`}
          aria-label={hasChildren ? (isExpanded ? "收起节点" : "展开节点") : "无子节点"}
        >
          {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <ChevronRight className="w-4 h-4" />}
        </button>
      )}
      {isPerson ? null : (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {entityNode?.nodeType === "DEPARTMENT" ? <Building2 className="w-5 h-5" /> : <FolderTree className="w-5 h-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{node.name}</span>
          {isPerson ? <Badge tone={roleBadgeTone(node.roleType)}>{getRoleLabel(node.roleType)}</Badge> : <Badge tone={entityNode?.nodeType === "DEPARTMENT" ? "primary" : "info"}>{entityNode?.directMemberCount ?? 0} 人</Badge>}
        </div>
        {isPerson ? (
          <div className="mt-1 text-xs text-muted-foreground">{node.title ?? "未设置职务"}</div>
        ) : null}
      </div>
      {entityNode?.nodeType === "TEAM" && entityNode.team && canManageTeams ? (
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button type="button" onClick={() => onEditTeam(entityNode.team!)} className="text-primary hover:underline">编辑</button>
          {isLeafTeam ? (
            <button type="button" onClick={() => onDeleteTeam(entityNode.team!)} className="text-destructive hover:underline">删除</button>
          ) : (
            <span className="text-muted-foreground">请先处理下级小组</span>
          )}
        </div>
      ) : null}
      {isPerson && canManagePerson ? (
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button type="button" onClick={() => onEditUser(node as unknown as OrgUser)} className="text-primary hover:underline">编辑</button>
          <button type="button" onClick={() => onDeleteUser(node as unknown as OrgUser)} className="text-destructive hover:underline">删除</button>
        </div>
      ) : null}
    </div>
  );
}

function OrganizationMindMapNodeView({
  node,
  expandedState,
  onToggle,
}: {
  node: OrganizationHierarchyNode;
  expandedState: Record<string, boolean>;
  onToggle: (nodeId: string) => void;
}) {
  if (node.nodeType === "PERSON") {
    return (
      <div className="flex min-w-[180px] max-w-[240px] items-center gap-2 px-2 py-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{node.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {node.title ? <span>{node.title}</span> : null}
            <Badge tone={roleBadgeTone(node.roleType)}>{getRoleLabel(node.roleType)}</Badge>
          </div>
        </div>
      </div>
    );
  }

  const isExpanded = expandedState[node.id] ?? false;
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex items-center gap-8 min-w-max">
      <button
        type="button"
        onClick={() => hasChildren ? onToggle(node.id) : undefined}
        className={`flex min-w-[280px] max-w-[340px] items-center gap-3 px-3 py-3 text-left transition ${hasChildren ? "hover:bg-muted/30 rounded-2xl" : "cursor-default"}`}
        aria-label={hasChildren ? (isExpanded ? "收起节点" : "展开节点") : "无子节点"}
      >
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${hasChildren ? "text-muted-foreground" : "text-transparent"}`}>
          {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
          {node.nodeType === "DEPARTMENT" ? <Building2 className="w-5 h-5" /> : <FolderTree className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold">{node.name}</span>
            <Badge tone={node.nodeType === "DEPARTMENT" ? "primary" : "info"}>{node.directMemberCount} 人</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {node.nodeType === "DEPARTMENT" ? `${node.directMemberCount}人` : `${node.directMemberCount}人`}
          </div>
        </div>
      </button>

      {hasChildren && isExpanded ? (
        <div className="relative pl-8">
          <div className="absolute left-3 top-6 bottom-6 w-px bg-border/70" />
          <div className="space-y-5">
            {node.children.map((child) => (
              <div key={child.id} className="relative flex items-center gap-8">
                <div className="absolute -left-5 top-1/2 h-px w-5 bg-border/70" />
                <OrganizationMindMapNodeView
                  node={child}
                  expandedState={expandedState}
                  onToggle={onToggle}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiApprovalPolicyForm({
  policy,
  scope,
  users,
  approvalOrgNodes,
  onClose,
}: {
  policy?: KpiApprovalPolicy;
  scope: { scopeType: PermissionScopeType; departmentOrgNodeId: string };
  users: OrgUser[];
  approvalOrgNodes: ApprovalOrgNodeOption[];
  onClose: () => void;
}) {
  const scopeSelectableOrgNodes = approvalOrgNodes.filter((node) => scope.scopeType === "SYSTEM"
    || node.departmentOrgNodeId === scope.departmentOrgNodeId);
  const approvalStepOrgNodes = approvalOrgNodes.filter((node) => scope.scopeType === "SYSTEM"
    || node.nodeType === "ROOT"
    || node.departmentOrgNodeId === scope.departmentOrgNodeId);
  const orgNodeById = new Map(approvalOrgNodes.map((node) => [node.id, node]));
  const rootOrgNodeId = approvalStepOrgNodes.find((node) => node.nodeType === "ROOT")?.id ?? null;
  const selectableUsers = users.filter((user) => scope.scopeType === "SYSTEM"
    || user.departmentOrgNodeId === scope.departmentOrgNodeId);
  const [scopeOrgNodeIds, setScopeOrgNodeIds] = useState<string[]>(() => {
    if (scope.scopeType === "SYSTEM") return [];
    if (policy?.scopeOrgNodeIds.length) return policy.scopeOrgNodeIds;
    return scope.departmentOrgNodeId ? [scope.departmentOrgNodeId] : [];
  });
  const [steps, setSteps] = useState<KpiApprovalPolicyStepDraft[]>(() => policy?.steps.map((step) => (
    normalizeApprovalStepForEditor(step, rootOrgNodeId)
  )) ?? [{
    label: "逐级审批至部门",
    nodeMode: "CASCADE_TO_DEPARTMENT" as const,
    approvalOrgNodeId: null as string | null,
    approvalOrgNodeIds: [] as string[],
    ancestorDepth: null as number | null,
    resolverType: "TEAM_LEADER" as const,
    resolverUserId: null as string | null,
    skipIfSelf: true,
    skipIfDuplicateApprover: true,
    allowSkipWhenNoApprover: false,
  }]);

  return (
    <form action={async (formData) => { await saveKpiApprovalPolicy(formData); onClose(); }} className="space-y-4">
      <input type="hidden" name="id" value={policy?.id ?? ""} />
      <input type="hidden" name="scopeType" value={scope.scopeType} />
      <input type="hidden" name="departmentOrgNodeId" value={scope.departmentOrgNodeId} />
      <input type="hidden" name="scopeOrgNodeIds" value={JSON.stringify(scopeOrgNodeIds)} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <div>
        <label className="mb-1 block text-sm font-medium">策略名称</label>
        <input name="name" required defaultValue={policy?.name ?? ""} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">说明</label>
        <textarea name="description" defaultValue={policy?.description ?? ""} className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" value="true" defaultChecked={policy?.isActive ?? false} />
        保存后立即启用
      </label>
      {scope.scopeType === "DEPARTMENT" ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div>
            <div className="text-sm font-medium">策略适用范围</div>
            <div className="mt-1 text-xs text-muted-foreground">可选择当前部门内的一个或多个组织节点，并自动包含其下级。员工同时命中多条策略时，使用最接近员工的那条。</div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/30 p-2">
            {scopeSelectableOrgNodes.map((node) => (
              <label key={node.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background">
                <input
                  type="checkbox"
                  checked={scopeOrgNodeIds.includes(node.id)}
                  onChange={(event) => setScopeOrgNodeIds((ids) => event.target.checked
                    ? [...ids, node.id]
                    : ids.filter((id) => id !== node.id))}
                />
                <span>{node.path}</span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <span className="font-medium">策略适用范围：</span>系统默认（兜底策略）。仅在员工没有命中任何部门或子组织策略时使用。
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">审批步骤</div>
          <Button type="button" variant="outline" className="h-8" onClick={() => setSteps((rows) => [...rows, {
            label: `审批步骤 ${rows.length + 1}`,
            nodeMode: "CASCADE_TO_DEPARTMENT",
            approvalOrgNodeId: null,
            approvalOrgNodeIds: [],
            ancestorDepth: null,
            resolverType: "TEAM_LEADER",
            resolverUserId: null,
            skipIfSelf: true,
            skipIfDuplicateApprover: true,
            allowSkipWhenNoApprover: false,
          }])}><Plus className="h-3.5 w-3.5" />增加步骤</Button>
        </div>
        {steps.map((step, index) => (
          <div key={index} className="rounded-xl border border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">第 {index + 1} 步</span>
              {steps.length > 1 ? <button type="button" className="text-xs text-destructive" onClick={() => setSteps((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>删除</button> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">审批步骤名称</span>
                <input required value={step.label} onChange={(event) => setSteps((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" placeholder="例如：采购1组组长审批" />
              </label>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">审批节点</span>
                <SearchableSelect
                  value={getApprovalNodeSelectValue(step)}
                  options={[
                    { value: "ORG_NODE_OWNER", label: "组织节点负责人" },
                    { value: "CASCADE_TO_DEPARTMENT", label: "逐级审批至部门" },
                  ]}
                  searchPlaceholder="搜索审批节点"
                  emptyLabel="暂无匹配的审批节点"
                  onChange={(value) => {
                    setSteps((rows) => rows.map((row, rowIndex) => {
                      if (rowIndex !== index) return row;
                      if (value === "CASCADE_TO_DEPARTMENT") return { ...row, nodeMode: "CASCADE_TO_DEPARTMENT", approvalOrgNodeId: null, approvalOrgNodeIds: [], ancestorDepth: null, resolverType: "TEAM_LEADER", resolverUserId: null };
                      return { ...row, nodeMode: "ORG_NODE_OWNER", approvalOrgNodeId: null, ancestorDepth: null, resolverType: "TEAM_LEADER" };
                    }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">审批人（{step.nodeMode === "CASCADE_TO_DEPARTMENT" ? "自动匹配" : "可选"}）</span>
                {step.nodeMode === "CASCADE_TO_DEPARTMENT" ? (
                  <div className="flex h-9 w-full cursor-not-allowed items-center rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground">
                    {getAutomaticApproverLabel(step, orgNodeById)}
                  </div>
                ) : (
                  <SearchableSelect
                    value={step.resolverUserId ?? ""}
                    options={[
                      { value: "", label: getAutomaticApproverLabel(step, orgNodeById) },
                      ...selectableUsers.map((user) => ({ value: user.id, label: `指定审批人：${user.name}` })),
                    ]}
                    searchPlaceholder="搜索审批人"
                    emptyLabel="暂无匹配的审批人"
                    onChange={(value) => setSteps((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, resolverUserId: value || null } : row))}
                  />
                )}
              </div>
            </div>
            {step.nodeMode === "ORG_NODE_OWNER" ? (
              <div className="mt-3 rounded-xl bg-muted/25 p-3">
                <KpiApprovalOrgTreeSelector
                  nodes={approvalStepOrgNodes}
                  scopeRootId={scope.scopeType === "SYSTEM" ? rootOrgNodeId : scope.departmentOrgNodeId}
                  selectedIds={step.approvalOrgNodeIds}
                  onChange={(approvalOrgNodeIds) => setSteps((rows) => rows.map((row, rowIndex) => rowIndex === index
                    ? { ...row, approvalOrgNodeIds }
                    : row))}
                />
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-muted/25 p-3 text-xs text-muted-foreground">从员工直属组织开始，每一级负责人依次审批，到所属部门为止，不会自动审批到公司级。</div>
            )}
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              {[
                ["skipIfSelf", "跳过本人"],
                ["skipIfDuplicateApprover", "去重审批人"],
                ["allowSkipWhenNoApprover", "无人时允许跳过"],
              ].map(([field, label]) => (
                <label key={field} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={Boolean(step[field as keyof typeof step])} onChange={(event) => setSteps((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: event.target.checked } : row))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">保存策略</Button>
      </div>
    </form>
  );
}

// ── Main content ──
export function OrgContent({
  currentUser,
  users,
  teams,
  departments,
  teamParentOptions,
  approvalOrgNodes,
  scopeOptions,
  initialScope,
  initialTab,
  initialPermissionSection,
  scopeViews,
  canManageUsers,
  canManageTeams,
  canManageRolePermissions,
  manageableRoleOptions,
}: Props) {
  const isAdmin = currentUser.roleType === "ADMIN";
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"organization" | "permissions">(initialTab);
  const [permissionSection, setPermissionSection] = useState<"menu" | "annual-goal" | "kpi" | "approval-policy">(initialPermissionSection);
  const [organizationViewMode, setOrganizationViewMode] = useState<"list" | "tree">("tree");
  const [selectedScope, setSelectedScope] = useState(initialScope);
  const selectedScopeKey = `${selectedScope.scopeType}:${selectedScope.departmentOrgNodeId}`;
  const selectedScopeView = scopeViews[selectedScopeKey] ?? scopeViews[`${initialScope.scopeType}:${initialScope.departmentOrgNodeId}`];
  const {
    department,
    organizationHierarchyRoot,
    menus,
    annualGoalPermissions,
    kpiPermissions,
    kpiUserPermissionGrants,
    kpiApprovalPolicies,
  } = selectedScopeView;
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Record<string, boolean>>(() => buildInitialExpandedState(organizationHierarchyRoot));
  const selectedDepartmentOrgNodeId = selectedScope.scopeType === "SYSTEM"
    ? ""
    : selectedScope.departmentOrgNodeId || (departments[0]?.orgNodeId ?? department?.orgNodeId ?? "");
  const visibleTeams = selectedScope.scopeType === "SYSTEM"
    ? teams
    : teams.filter((team) => team.departmentOrgNodeId === selectedDepartmentOrgNodeId);
  const visibleUsers = selectedScope.scopeType === "SYSTEM"
    ? users
    : users.filter((user) => user.departmentOrgNodeId === selectedDepartmentOrgNodeId);
  const permissionRoleOptions = selectedScope.scopeType === "SYSTEM"
    ? roleOptions
    : roleOptions.filter((role) => role.value !== "ADMIN");
  const approvalOrgNodeById = new Map(approvalOrgNodes.map((node) => [node.id, node]));
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
  const visibleRoleTypes = permissionRoleOptions.map((role) => role.value);
  const menuPermissionIds = menus.map((menu) => menu.id);
  const annualGoalPermissionIds = annualGoalPermissions.map((permission) => permission.id);
  const kpiPermissionIds = kpiPermissions.map((permission) => permission.id);
  const roleMenuCellKeys = buildPermissionCellKeys(visibleRoleTypes, menuPermissionIds);
  const annualGoalCellKeys = buildPermissionCellKeys(visibleRoleTypes, annualGoalPermissionIds);
  const kpiCellKeys = buildPermissionCellKeys(visibleRoleTypes, kpiPermissionIds);
  const lockedRoleMenuCellKeys = new Set(menus
    .filter((menu) => ["/organization", "/dashboard"].includes(menu.path))
    .map((menu) => `ADMIN:${menu.id}`));
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
  const roleMenuValueChangeCount = countPermissionValueChanges(initialRoleMenuCells, draftRoleMenuCells);
  const annualGoalValueChangeCount = countPermissionValueChanges(initialAnnualGoalCells, draftAnnualGoalCells);
  const kpiValueChangeCount = countPermissionValueChanges(initialKpiCells, draftKpiCells);
  const roleMenuChangedItems = buildPermissionChangedItems(initialRoleMenuCells, draftRoleMenuCells, menus);
  const annualGoalChangedItems = buildPermissionChangedItems(initialAnnualGoalCells, draftAnnualGoalCells, annualGoalPermissions);
  const kpiChangedItems = buildPermissionChangedItems(initialKpiCells, draftKpiCells, kpiPermissions);
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
    setExpandedTreeNodes(buildInitialExpandedState(organizationHierarchyRoot));
  }, [organizationHierarchyRoot, selectedDepartmentOrgNodeId]);

  const organizationListRows = flattenHierarchyRows(organizationHierarchyRoot, expandedTreeNodes);

  function toggleTreeNode(orgNodeId: string) {
    setExpandedTreeNodes((current) => ({
      ...current,
      [orgNodeId]: !current[orgNodeId],
    }));
  }

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

  function toggleRoleMenuCells(targetKeys: readonly string[]) {
    setDraftRoleMenuCells((current) => setPermissionCellsAllowed(
      current,
      targetKeys,
      getPermissionSelectionState(current, targetKeys, lockedRoleMenuCellKeys) !== "checked",
      selectedScope.scopeType,
      lockedRoleMenuCellKeys,
    ));
  }

  function toggleAnnualGoalCells(targetKeys: readonly string[]) {
    setDraftAnnualGoalCells((current) => setPermissionCellsAllowed(
      current,
      targetKeys,
      getPermissionSelectionState(current, targetKeys) !== "checked",
      selectedScope.scopeType,
    ));
  }

  function toggleKpiCells(targetKeys: readonly string[]) {
    setDraftKpiCells((current) => setPermissionCellsAllowed(
      current,
      targetKeys,
      getPermissionSelectionState(current, targetKeys) !== "checked",
      selectedScope.scopeType,
    ));
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

  function openPermissionMatrixSync(
    kind: PermissionMatrixSyncDialogData["kind"],
    mode: PermissionMatrixSyncDialogData["mode"],
    moduleName: string,
    permissions: string,
    permissionCount: number,
    changeCount: number,
    changedItems: PermissionMatrixSyncDialogData["changedItems"],
  ) {
    setDialog({
      type: "permissionMatrixSync",
      data: {
        kind,
        mode,
        moduleName,
        permissions,
        departmentCount: departments.length,
        roleCount: roleOptions.length,
        permissionCount,
        changeCount,
        changedItems,
      },
    });
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
    type: "department" | "user" | "team" | "deleteUser" | "deleteTeam" | "applyAllDepartments" | "permissionMatrixSync" | "kpiUserPermission" | "deleteKpiUserPermissionGrant" | "kpiApprovalPolicy" | "deleteKpiApprovalPolicy";
    data?: OrgUser | OrgTeam | ApplyAllDialogData | PermissionMatrixSyncDialogData | KpiUserPermissionGrant | KpiApprovalPolicy;
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
                    setSelectedScope({
                      scopeType: option.scopeType,
                      departmentOrgNodeId: option.departmentOrgNodeId,
                    });
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
                  onClick={() => setTab(item.key as "organization" | "permissions")}
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
                {isAdmin && selectedScope.scopeType === "SYSTEM" && (
                  <Button variant="outline" className="h-9 rounded-lg" onClick={() => setDialog({ type: "department" })}><Plus className="w-4 h-4" />新增部门</Button>
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
                  { key: "approval-policy", label: "KPI 审批策略" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setPermissionSection(item.key as "menu" | "annual-goal" | "kpi" | "approval-policy");
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
                    <PermissionMatrixSaveActions
                      saveAction={saveRoleMenuPermissions}
                      scopeType={selectedScope.scopeType}
                      departmentOrgNodeId={selectedScope.departmentOrgNodeId}
                      permissions={draftRoleMenuPayload}
                      hasChanges={hasRoleMenuChanges}
                      valueChangeCount={roleMenuValueChangeCount}
                      reset={resetDraftPermissions}
                      onSync={(mode) => openPermissionMatrixSync("menu", mode, "菜单权限", draftRoleMenuPayload, menus.length, roleMenuValueChangeCount, roleMenuChangedItems)}
                    />
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
                        <th className="py-2 font-medium">
                          {canManageRolePermissions ? (
                            <PermissionBulkCheckbox
                              state={getPermissionSelectionState(draftRoleMenuCells, roleMenuCellKeys, lockedRoleMenuCellKeys)}
                              label="菜单"
                              onToggle={() => toggleRoleMenuCells(roleMenuCellKeys)}
                            />
                          ) : "菜单"}
                        </th>
                        {permissionRoleOptions.map((role) => {
                          const roleCellKeys = buildPermissionCellKeys([role.value], menuPermissionIds);
                          return (
                            <th key={role.value} className="py-2 font-medium text-center align-middle">
                              {canManageRolePermissions ? (
                                <PermissionBulkCheckbox
                                  state={getPermissionSelectionState(draftRoleMenuCells, roleCellKeys, lockedRoleMenuCellKeys)}
                                  label={role.label}
                                  onToggle={() => toggleRoleMenuCells(roleCellKeys)}
                                />
                              ) : role.label}
                            </th>
                          );
                        })}
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
                    <PermissionMatrixSaveActions
                      saveAction={saveAnnualGoalRolePermissions}
                      scopeType={selectedScope.scopeType}
                      departmentOrgNodeId={selectedScope.departmentOrgNodeId}
                      permissions={draftAnnualGoalPayload}
                      hasChanges={hasAnnualGoalPermissionChanges}
                      valueChangeCount={annualGoalValueChangeCount}
                      reset={resetDraftAnnualGoalPermissions}
                      onSync={(mode) => openPermissionMatrixSync("annual-goal", mode, "年度指标权限", draftAnnualGoalPayload, annualGoalPermissions.length, annualGoalValueChangeCount, annualGoalChangedItems)}
                    />
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
                        <th className="py-2 font-medium">
                          {canManageRolePermissions ? (
                            <PermissionBulkCheckbox
                              state={getPermissionSelectionState(draftAnnualGoalCells, annualGoalCellKeys)}
                              label="能力项"
                              onToggle={() => toggleAnnualGoalCells(annualGoalCellKeys)}
                            />
                          ) : "能力项"}
                        </th>
                        {permissionRoleOptions.map((role) => {
                          const roleCellKeys = buildPermissionCellKeys([role.value], annualGoalPermissionIds);
                          return (
                            <th key={role.value} className="py-2 font-medium text-center align-middle">
                              {canManageRolePermissions ? (
                                <PermissionBulkCheckbox
                                  state={getPermissionSelectionState(draftAnnualGoalCells, roleCellKeys)}
                                  label={role.label}
                                  onToggle={() => toggleAnnualGoalCells(roleCellKeys)}
                                />
                              ) : role.label}
                            </th>
                          );
                        })}
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
            ) : permissionSection === "kpi" ? (
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">角色默认权限</h3>
                    {canManageRolePermissions && hasKpiPermissionChanges && <div className="text-xs text-warning mt-1">有未保存的 KPI 权限调整</div>}
                  </div>
                  {canManageRolePermissions && (
                    <PermissionMatrixSaveActions
                      saveAction={saveKpiRolePermissions}
                      scopeType={selectedScope.scopeType}
                      departmentOrgNodeId={selectedScope.departmentOrgNodeId}
                      permissions={draftKpiPayload}
                      hasChanges={hasKpiPermissionChanges}
                      valueChangeCount={kpiValueChangeCount}
                      reset={resetDraftKpiPermissions}
                      onSync={(mode) => openPermissionMatrixSync("kpi", mode, "KPI 权限", draftKpiPayload, kpiPermissions.length, kpiValueChangeCount, kpiChangedItems)}
                    />
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
                        <th className="py-2 font-medium">
                          {canManageRolePermissions ? (
                            <PermissionBulkCheckbox
                              state={getPermissionSelectionState(draftKpiCells, kpiCellKeys)}
                              label="能力项"
                              onToggle={() => toggleKpiCells(kpiCellKeys)}
                            />
                          ) : "能力项"}
                        </th>
                        {permissionRoleOptions.map((role) => {
                          const roleCellKeys = buildPermissionCellKeys([role.value], kpiPermissionIds);
                          return (
                            <th key={role.value} className="py-2 font-medium text-center align-middle">
                              {canManageRolePermissions ? (
                                <PermissionBulkCheckbox
                                  state={getPermissionSelectionState(draftKpiCells, roleCellKeys)}
                                  label={role.label}
                                  onToggle={() => toggleKpiCells(roleCellKeys)}
                                />
                              ) : role.label}
                            </th>
                          );
                        })}
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

                <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-medium">用户显式授权</h4>
                      <div className="mt-1 text-xs text-muted-foreground">为具体用户追加跨节点查看或操作权限，不影响角色默认权限。</div>
                    </div>
                    {canManageRolePermissions ? (
                      <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => setDialog({ type: "kpiUserPermission" })}>
                        <Plus className="w-4 h-4" />新增授权
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {kpiUserPermissionGrants.length ? (
                      <table className="w-full min-w-[760px] table-fixed text-xs">
                        <colgroup>
                          <col className="w-[180px]" />
                          <col className="w-[180px]" />
                          <col className="w-[140px]" />
                          <col className="w-[180px]" />
                          <col className="w-[100px]" />
                        </colgroup>
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="py-2 font-medium">用户</th>
                            <th className="py-2 font-medium">能力项</th>
                            <th className="py-2 font-medium">范围</th>
                            <th className="py-2 font-medium">节点</th>
                            <th className="py-2 font-medium text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpiUserPermissionGrants.map((grant) => (
                            <tr key={grant.id} className="border-t border-border">
                              <td className="py-3 pr-4">{grant.userName}</td>
                              <td className="py-3 pr-4">{grant.abilityName}</td>
                              <td className="py-3 pr-4">{getGrantScopeLabel(grant.scopeType)}</td>
                              <td className="py-3 pr-4">{grant.scopeType === "ALL" ? "全部" : (grant.orgNodeName ?? "—")}</td>
                              <td className="py-3 text-right">
                                {canManageRolePermissions ? (
                                  <button type="button" onClick={() => setDialog({ type: "deleteKpiUserPermissionGrant", data: grant })} className="text-destructive hover:underline">删除</button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        当前范围暂无显式授权
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">KPI 审批策略</h3>
                    <div className="mt-1 text-xs text-muted-foreground">每份 KPI 只命中一条策略：最接近员工的组织范围优先，未命中时回退到系统默认。</div>
                  </div>
                  {canManageRolePermissions ? (
                    <Button type="button" className="h-9 rounded-lg" onClick={() => setDialog({ type: "kpiApprovalPolicy" })}>
                      <Plus className="h-4 w-4" />新增策略
                    </Button>
                  ) : null}
                </div>
                <div>
                  {kpiApprovalPolicies.length ? (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <th className="w-[16%] px-4 py-3 font-medium">策略名称</th>
                            <th className="w-[14%] px-4 py-3 font-medium">说明</th>
                            <th className="w-[20%] px-4 py-3 font-medium">适用范围</th>
                            <th className="w-[30%] px-4 py-3 font-medium">审批步骤</th>
                            <th className="w-[9%] px-4 py-3 font-medium">状态</th>
                            <th className="w-[11%] px-4 py-3 text-right font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpiApprovalPolicies.map((policy) => (
                            <tr key={policy.id} className={`border-t border-border align-top ${policy.inherited ? "bg-muted/20" : "bg-card"}`}>
                              <td className="px-4 py-4 font-medium">{policy.name}</td>
                              <td className="px-4 py-4 text-xs leading-5 text-muted-foreground">{policy.description || "暂无说明"}</td>
                              <td className="px-4 py-4 text-xs leading-5 text-muted-foreground">
                                {policy.scopeType === "SYSTEM"
                                  ? "系统默认（兜底策略）"
                                  : (policy.scopeOrgNodeIds.length > 0
                                    ? policy.scopeOrgNodeIds.map((id) => approvalOrgNodeById.get(id)?.path ?? "节点已失效").join("、")
                                    : approvalOrgNodeById.get(policy.departmentOrgNodeId)?.path ?? "历史部门范围")}
                              </td>
                              <td className="px-4 py-3">
                                {policy.steps.length > 0 ? (
                                  <div className="divide-y divide-border/70">
                                    {policy.steps.map((step, index) => (
                                      <div key={step.id} className="py-2 first:pt-0 last:pb-0">
                                        <div className="text-xs font-medium">{index + 1}. {step.label}</div>
                                        <div className="mt-1 text-xs leading-5 text-muted-foreground">审批节点：{getApprovalNodeLabel(step, approvalOrgNodeById)}</div>
                                        <div className="text-xs leading-5 text-muted-foreground">
                                          审批人：{step.resolverUserId
                                            ? `指定审批人：${users.find((user) => user.id === step.resolverUserId)?.name ?? "用户已失效"}`
                                            : getAutomaticApproverLabel(step, approvalOrgNodeById)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">暂无步骤</span>}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-col items-start gap-2">
                                  <Badge tone={policy.isActive ? "success" : "default"}>{policy.isActive ? "已启用" : "已停用"}</Badge>
                                  {policy.inherited ? <Badge tone="info">系统继承</Badge> : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                {!policy.inherited && canManageRolePermissions ? (
                                  <div className="flex justify-end gap-3 text-xs">
                                    <button type="button" className="hover:underline" onClick={() => setDialog({ type: "kpiApprovalPolicy", data: policy })}>编辑</button>
                                    <form action={toggleKpiApprovalPolicy}>
                                      <input type="hidden" name="id" value={policy.id} />
                                      <button type="submit" className="hover:underline">{policy.isActive ? "停用" : "启用"}</button>
                                    </form>
                                    <button type="button" className="text-destructive hover:underline" onClick={() => setDialog({ type: "deleteKpiApprovalPolicy", data: policy })}>删除</button>
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">当前范围暂无审批策略，将继续使用兼容审批链。</div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {department && selectedScope.scopeType === "DEPARTMENT" ? (
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
            ) : null}

            <div className="border-b border-border px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">组织架构</h3>
                <div className="text-xs text-muted-foreground mt-1">共 {visibleTeams.length} 个小组 · {visibleUsers.length} 位成员</div>
              </div>
              <div className="inline-flex rounded-lg bg-muted p-1">
                {[
                  { key: "list" as const, label: "列表视图" },
                  { key: "tree" as const, label: "树状视图" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setOrganizationViewMode(item.key)}
                    className={`h-9 rounded-lg px-4 text-sm transition ${organizationViewMode === item.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {organizationViewMode === "list" ? (
              <div className="divide-y divide-border">
                {organizationListRows.length ? (
                  organizationListRows.map(({ node, depth }) => (
                    <OrganizationListRow
                      key={node.id}
                      node={node}
                      depth={depth}
                      expandedState={expandedTreeNodes}
                      onToggle={toggleTreeNode}
                      canManageTeams={canManageTeams}
                      canManageUsers={canManageUsers}
                      currentUserRoleType={currentUser.roleType}
                      onEditTeam={(team) => setDialog({ type: "team", data: team })}
                      onDeleteTeam={(team) => setDialog({ type: "deleteTeam", data: team })}
                      onEditUser={(user) => setDialog({ type: "user", data: user })}
                      onDeleteUser={(user) => setDialog({ type: "deleteUser", data: user })}
                    />
                  ))
                ) : (
                  <div className="px-5 py-12 text-center text-sm text-muted-foreground">当前范围暂无组织节点</div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto p-5">
                {organizationHierarchyRoot ? (
                  <div className="min-w-max pr-8">
                    <OrganizationMindMapNodeView
                      node={organizationHierarchyRoot}
                      expandedState={expandedTreeNodes}
                      onToggle={toggleTreeNode}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    当前范围暂无组织节点
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>
      <Dialog open={dialog?.type === "department"} onClose={() => setDialog(null)} title="新增部门">
        <DepartmentForm users={users} onClose={() => setDialog(null)} />
      </Dialog>

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
          teamParentOptions={teamParentOptions}
          departmentOrgNodeId={selectedDepartmentOrgNodeId || departments[0]?.orgNodeId || ""}
          canSelectDepartment={isAdmin && selectedScope.scopeType === "SYSTEM"}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog open={dialog?.type === "applyAllDepartments"} onClose={() => setDialog(null)} title="应用到全部部门">
        <ApplyAllDepartmentsConfirm data={dialog?.data as ApplyAllDialogData} onClose={() => setDialog(null)} />
      </Dialog>

      <Dialog
        open={dialog?.type === "permissionMatrixSync"}
        onClose={() => setDialog(null)}
        title={(dialog?.data as PermissionMatrixSyncDialogData | undefined)?.mode === "FULL" ? "完整同步至所有部门" : "保存并同步本次变更"}
      >
        <PermissionMatrixSyncConfirm data={dialog?.data as PermissionMatrixSyncDialogData} onClose={() => setDialog(null)} />
      </Dialog>

      <Dialog
        open={dialog?.type === "kpiUserPermission"}
        onClose={() => setDialog(null)}
        title="新增显式授权"
        panelClassName="max-w-4xl"
      >
        <KpiUserPermissionGrantForm
          users={users}
          teamParentOptions={teamParentOptions}
          scopeType={selectedScope.scopeType}
          departmentOrgNodeId={selectedDepartmentOrgNodeId}
          permissions={kpiPermissions}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog open={dialog?.type === "deleteKpiUserPermissionGrant"} onClose={() => setDialog(null)} title="删除显式授权">
        <DeleteConfirm
          message={`确定要删除成员 "${(dialog?.data as KpiUserPermissionGrant | undefined)?.userName ?? ""}" 的“${(dialog?.data as KpiUserPermissionGrant | undefined)?.abilityName ?? ""}”显式授权吗？`}
          action={async () => {
            const fd = new FormData();
            fd.set("id", (dialog?.data as KpiUserPermissionGrant).id);
            await deleteKpiUserPermissionGrant(fd);
          }}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog
        open={dialog?.type === "kpiApprovalPolicy"}
        onClose={() => setDialog(null)}
        title={dialog?.data ? "编辑 KPI 审批策略" : "新增 KPI 审批策略"}
        panelClassName="max-w-4xl"
      >
        <KpiApprovalPolicyForm
          policy={dialog?.data as KpiApprovalPolicy | undefined}
          scope={selectedScope}
          users={users}
          approvalOrgNodes={approvalOrgNodes}
          onClose={() => setDialog(null)}
        />
      </Dialog>

      <Dialog open={dialog?.type === "deleteKpiApprovalPolicy"} onClose={() => setDialog(null)} title="删除审批策略">
        <DeleteConfirm
          message={`确定要删除审批策略“${(dialog?.data as KpiApprovalPolicy | undefined)?.name ?? ""}”吗？已生成 KPI 单据的策略不能删除。`}
          action={async () => {
            const fd = new FormData();
            fd.set("id", (dialog?.data as KpiApprovalPolicy).id);
            await deleteKpiApprovalPolicy(fd);
          }}
          onClose={() => setDialog(null)}
        />
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
