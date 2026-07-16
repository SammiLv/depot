"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Progress, avatarColor } from "@/components/ui-kit";
import { downloadKpiTemplateCsv, importKpiTemplates, initializeQuarterlyKpis, updateKpiTemplate, createKpiTemplate, toggleKpiTemplateActive, deletePersonalKpi } from "@/server/kpi/actions";
import { Search, Upload, X, GripVertical } from "lucide-react";
import type { getKpiData } from "@/server/kpi/kpi-query";


type Props = { data: Awaited<ReturnType<typeof getKpiData>> };
type SectionTab = "quarterly-kpi" | "kpi-template";
type TeamTab = "all" | Props["data"]["teamOptions"][number]["id"];
type TemplateRow = Props["data"]["templateRows"][number];

type TeamTabOption = { id: TeamTab; name: string };

type InitializationResult = Awaited<ReturnType<typeof initializeQuarterlyKpis>>;
type TemplateImportResult = Awaited<ReturnType<typeof importKpiTemplates>>;
type TemplateUpdateResult = Awaited<ReturnType<typeof updateKpiTemplate>>;
type TemplateCreateResult = Awaited<ReturnType<typeof createKpiTemplate>>;
type QuarterlyKpiRow = Props["data"]["rows"][number];

type QuarterOption = {
  value: number;
  label: string;
};

function getQuarterlyKpiActionLabel(row: QuarterlyKpiRow) {
  if (row.availableActions.canSelfReview) {
    return "自评";
  }
  if (row.availableActions.canLeaderScore) {
    return "组长评";
  }
  if (row.availableActions.canManagerScore) {
    return "主管评";
  }
  if (row.availableActions.canFinalReview) {
    return "最终确认";
  }
  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function TemplateList({
  rows,
  canManageKpiTemplate,
  canToggleKpiTemplate,
  onView,
  onEdit,
  onToggleActive,
}: {
  rows: TemplateRow[];
  canManageKpiTemplate: boolean;
  canToggleKpiTemplate: boolean;
  onView: (row: TemplateRow) => void;
  onEdit: (row: TemplateRow) => void;
  onToggleActive: (row: TemplateRow) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="min-w-[1380px] w-full table-auto">
        <colgroup>
          <col className="w-[220px]" />
          <col className="w-[120px]" />
          <col className="w-[320px]" />
          <col className="w-[90px]" />
          <col className="w-[150px]" />
          <col className="w-[120px]" />
          <col className="w-[150px]" />
          <col className="w-[260px]" />
        </colgroup>
        <thead className="bg-muted/30">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-5 py-3 font-medium">模板名称</th>
            <th className="px-5 py-3 font-medium whitespace-nowrap">创建人</th>
            <th className="px-5 py-3 font-medium">适用范围</th>
            <th className="px-5 py-3 font-medium whitespace-nowrap">状态</th>
            <th className="px-5 py-3 font-medium whitespace-nowrap">创建时间</th>
            <th className="px-5 py-3 font-medium whitespace-nowrap">最后更新</th>
            <th className="px-5 py-3 font-medium whitespace-nowrap">最后更新时间</th>
            <th className="px-5 py-3 text-right font-medium whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-border transition hover:bg-muted/20 align-top">
                <td className="px-5 py-4 text-sm font-medium break-words">{row.name}</td>
                <td className="px-5 py-4 text-sm text-muted-foreground whitespace-nowrap">{row.createdByName}</td>
                <td className="px-5 py-4 text-sm text-muted-foreground break-words">{row.scopeName}</td>
                <td className="px-5 py-4 text-sm whitespace-nowrap">
                  <Badge tone={row.isActive ? "success" : "default"}>{row.isActive ? "启用" : "禁用"}</Badge>
                </td>
                <td className="px-5 py-4 text-sm text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                <td className="px-5 py-4 text-sm text-muted-foreground whitespace-nowrap">{row.updatedByName}</td>
                <td className="px-5 py-4 text-sm text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(row.updatedAt)}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                    <button type="button" className="text-primary hover:underline" onClick={() => onView(row)}>查看</button>
                    {canManageKpiTemplate ? <button type="button" className="text-primary hover:underline" onClick={() => onEdit(row)}>编辑</button> : null}
                    {canToggleKpiTemplate ? <button type="button" className="text-primary hover:underline" onClick={() => void onToggleActive(row)}>{row.isActive ? "禁用" : "启用"}</button> : null}
                    {canManageKpiTemplate ? <button type="button" className="text-destructive hover:underline" disabled>删除</button> : null}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">暂无 KPI 模板</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function QuarterlyKpiDeleteConfirm({ row, onClose, onComplete }: { row: QuarterlyKpiRow; onClose: () => void; onComplete: () => void }) {
  async function handleDelete() {
    try {
      await deletePersonalKpi(row.id);
      onComplete();
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除季度 KPI 失败");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除成员「{row.userName}」的季度 KPI？删除后该成员本季度的 KPI 数据将被移除，且无法恢复。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button className="!bg-destructive hover:!bg-destructive/90" onClick={() => void handleDelete()}>确认删除</Button>
      </div>
    </div>
  );
}

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className={`fixed inset-0 z-50 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-4xl border-l border-border bg-card shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function TemplateDetailDrawer({ row }: { row: TemplateRow }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">模板名称</div>
          <div className="mt-1 text-sm font-medium">{row.name}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">适用范围</div>
          <div className="mt-1 text-sm font-medium">{row.scopeName}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">创建人</div>
          <div className="mt-1 text-sm font-medium">{row.createdByName}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">创建时间</div>
          <div className="mt-1 text-sm font-medium">{formatDateTime(row.createdAt)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">最后更新</div>
          <div className="mt-1 text-sm font-medium">{row.updatedByName}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">最后更新时间</div>
          <div className="mt-1 text-sm font-medium">{formatDateTime(row.updatedAt)}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">模板说明</div>
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          {row.description || "暂无模板说明"}
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-medium">模板项</div>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">指标项</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">分值</th>
                <th className="px-4 py-3 font-medium">评分标准</th>
              </tr>
            </thead>
            <tbody>
              {row.items.map((item: TemplateRow["items"][number]) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{item.score}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">{item.scoringStandard || item.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function buildTemplateScopeOptions(
  data: Props["data"],
  departmentOrgNodeId: string,
  options?: {
    currentTemplateId?: string;
    preserveTeamIds?: string[];
    preserveMemberIds?: string[];
  }
) {
  const preserveTeamIdSet = new Set(options?.preserveTeamIds ?? []);
  const preserveMemberIdSet = new Set(options?.preserveMemberIds ?? []);
  const activeTemplates = data.templateRows.filter(
    (template) => template.isActive && template.id !== options?.currentTemplateId
  );
  const occupiedTeamIdSet = new Set(activeTemplates.flatMap((template) => template.scopeTeamIds));
  const occupiedMemberIdSet = new Set(activeTemplates.flatMap((template) => template.scopeUserIds));
  const departmentTeams = data.teamOptions.filter((team) => team.departmentOrgNodeId === departmentOrgNodeId);
  const departmentMembers = data.memberOptions.filter(
    (member) => member.teamOrgNodeId && departmentTeams.some((team) => team.id === member.teamOrgNodeId)
  );
  const memberOptions = departmentMembers
    .filter((member) => !occupiedMemberIdSet.has(member.id) || preserveMemberIdSet.has(member.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      orgNodeId: member.orgNodeId ?? null,
      teamOrgNodeId: member.teamOrgNodeId ?? null,
    }));
  const teamOptions = departmentTeams
    .filter((team) => {
      if (preserveTeamIdSet.has(team.id)) {
        return true;
      }
      if (occupiedTeamIdSet.has(team.id)) {
        return false;
      }
      const teamMembers = departmentMembers.filter((member) => member.orgNodeId === team.id);
      if (teamMembers.length === 0) {
        return false;
      }
      return teamMembers.every((member) => !occupiedMemberIdSet.has(member.id) || preserveMemberIdSet.has(member.id));
    })
    .map((team) => ({ id: team.id, name: team.name }));

  return { teamOptions, memberOptions };
}

function CreateTemplateDrawer({
  data,
  departmentOrgNodeId,
  onClose,
  onComplete,
}: {
  data: Props["data"];
  departmentOrgNodeId: string;
  onClose: () => void;
  onComplete: (result: TemplateCreateResult) => void;
}) {
  const [draftItems, setDraftItems] = useState([
    { id: "new-0", name: "", score: "0", description: "", scoringStandard: "" },
  ]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const nextDraftItemIdRef = useRef(1);
  const scopeOptions = useMemo(
    () => buildTemplateScopeOptions(data, departmentOrgNodeId),
    [data, departmentOrgNodeId]
  );
  const availableMemberOptions = scopeOptions.memberOptions.filter((member) => {
    if (selectedMemberIds.includes(member.id)) {
      return false;
    }
    if (member.teamOrgNodeId && selectedTeamIds.includes(member.teamOrgNodeId)) {
      return false;
    }
    return true;
  });
  const availableTeamOptions = scopeOptions.teamOptions.filter((team) => {
    if (selectedTeamIds.includes(team.id)) {
      return false;
    }
    return availableMemberOptions.some((member) => member.teamOrgNodeId === team.id);
  });
  const filteredTeamOptions = availableTeamOptions.filter((team) =>
    team.name.toLowerCase().includes(teamSearch.trim().toLowerCase())
  );
  const filteredMemberOptions = availableMemberOptions.filter((member) =>
    member.name.toLowerCase().includes(memberSearch.trim().toLowerCase())
  );
  const selectedScopes = [
    ...selectedTeamIds.map((teamId) => ({
      type: "team" as const,
      id: teamId,
      label: scopeOptions.teamOptions.find((team) => team.id === teamId)?.name ?? "",
    })),
    ...selectedMemberIds.map((memberId) => ({
      type: "member" as const,
      id: memberId,
      label: scopeOptions.memberOptions.find((member) => member.id === memberId)?.name ?? "",
    })),
  ].filter((scope) => scope.label);
  const totalScore = draftItems.reduce((sum, item) => {
    const score = Number.parseFloat(String(item.score ?? ""));
    return sum + (Number.isFinite(score) ? score : 0);
  }, 0);
  const isTotalScoreExceeded = totalScore > 110;

  const moveDraftItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setDraftItems((currentItems) => moveArrayItem(currentItems, fromIndex, toIndex));
  };

  return (
    <>
      {(showTeamDropdown || showMemberDropdown) ? (
        <button
          type="button"
          aria-label="关闭适用范围下拉"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => {
            setShowTeamDropdown(false);
            setShowMemberDropdown(false);
          }}
        />
      ) : null}
      <form
      action={async (formData) => {
        try {
          setErrorMessage(null);
          const result = await createKpiTemplate(formData);
          onComplete(result);
          onClose();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "模板创建失败，请稍后重试");
        }
      }}
      className="space-y-6"
    >
      <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
      {selectedTeamIds.map((teamId) => <input key={teamId} type="hidden" name="scopeTeamOrgNodeId" value={teamId} />)}
      {selectedMemberIds.map((memberId) => <input key={memberId} type="hidden" name="scopeUserId" value={memberId} />)}

      {errorMessage ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMessage}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">模板名称 *</label>
          <input name="name" required className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">适用小组</label>
          <div className="relative z-20">
            <button
              type="button"
              onClick={() => {
                setShowTeamDropdown((current) => !current);
                setShowMemberDropdown(false);
              }}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm"
            >
              <span className="truncate text-left">{selectedTeamIds.length ? `已选 ${selectedTeamIds.length} 个小组` : "请选择小组"}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {showTeamDropdown ? (
              <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-card p-2 shadow-lg">
                <input
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="搜索小组"
                  className="mb-2 block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredTeamOptions.length ? filteredTeamOptions.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        setSelectedTeamIds((current) => current.includes(team.id) ? current : [...current, team.id]);
                        setSelectedMemberIds((current) => current.filter((memberId) => {
                          const member = scopeOptions.memberOptions.find((item) => item.id === memberId);
                          return member?.teamOrgNodeId !== team.id;
                        }));
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span>{team.name}</span>
                      <span className="text-primary">添加</span>
                    </button>
                  )) : <div className="px-3 py-2 text-sm text-muted-foreground">暂无可选小组</div>}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">适用成员</label>
          <div className="relative z-20">
            <button
              type="button"
              onClick={() => {
                setShowMemberDropdown((current) => !current);
                setShowTeamDropdown(false);
              }}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm"
            >
              <span className="truncate text-left">{selectedMemberIds.length ? `已选 ${selectedMemberIds.length} 个成员` : "请选择成员"}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {showMemberDropdown ? (
              <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-card p-2 shadow-lg">
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="搜索成员"
                  className="mb-2 block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredMemberOptions.length ? filteredMemberOptions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setSelectedMemberIds((current) => current.includes(member.id) ? current : [...current, member.id]);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span>{member.name}</span>
                      <span className="text-primary">添加</span>
                    </button>
                  )) : <div className="px-3 py-2 text-sm text-muted-foreground">暂无可选成员</div>}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">已选适用范围</label>
          <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            {selectedScopes.length ? selectedScopes.map((scope) => (
              <button
                key={`${scope.type}-${scope.id}`}
                type="button"
                onClick={() => {
                  if (scope.type === "team") {
                    setSelectedTeamIds((current) => current.filter((teamId) => teamId !== scope.id));
                    return;
                  }
                  setSelectedMemberIds((current) => current.filter((memberId) => memberId !== scope.id));
                }}
                className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 hover:bg-muted/80"
              >
                <span>{scope.label}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            )) : <span className="text-muted-foreground">请先选择小组或成员</span>}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">模板说明</label>
          <textarea name="description" rows={3} className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">模板项</div>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg"
            onClick={() =>
              setDraftItems([
                ...draftItems,
                { id: `new-${nextDraftItemIdRef.current++}`, name: "", score: "0", description: "", scoringStandard: "" },
              ])
            }
          >
            添加指标项
          </Button>
        </div>
        <div className="mb-2 text-xs text-muted-foreground">拖拽左侧拖动手柄可调整指标项顺序</div>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full table-fixed">
            <thead className="bg-muted/40 text-left text-sm text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-3 font-medium whitespace-nowrap"></th>
                <th className="w-[22%] px-4 py-3 font-medium whitespace-nowrap">指标项</th>
                <th className="w-[12%] px-4 py-3 font-medium whitespace-nowrap">分值</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">评分标准</th>
                <th className="w-24 px-4 py-3 text-right font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {draftItems.map((item, index) => (
                <tr
                  key={item.id}
                  className={`border-t border-border align-top ${draggingItemId === item.id ? "bg-muted/50" : ""} ${dragOverItemId === item.id ? "border-t-primary" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggingItemId && draggingItemId !== item.id) setDragOverItemId(item.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromIndex = draftItems.findIndex((draftItem) => draftItem.id === draggingItemId);
                    moveDraftItem(fromIndex, index);
                    setDraggingItemId(null);
                    setDragOverItemId(null);
                  }}
                >
                  <td className="px-3 py-3 align-middle">
                    <button
                      type="button"
                      draggable
                      onDragStart={() => {
                        setDraggingItemId(item.id);
                        setDragOverItemId(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingItemId(null);
                        setDragOverItemId(null);
                      }}
                      className="flex h-10 w-8 cursor-grab items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      name="itemName"
                      value={item.name ?? ""}
                      onChange={(event) => {
                        const nextItems = [...draftItems];
                        nextItems[index] = { ...nextItems[index], name: event.target.value };
                        setDraftItems(nextItems);
                      }}
                      required
                      className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      name="itemScore"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.score ?? ""}
                      onChange={(event) => {
                        const nextItems = [...draftItems];
                        nextItems[index] = { ...nextItems[index], score: event.target.value };
                        setDraftItems(nextItems);
                      }}
                      required
                      className="block h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <textarea
                      name="itemScoringStandard"
                      value={item.scoringStandard ?? ""}
                      onChange={(event) => {
                        const nextItems = [...draftItems];
                        nextItems[index] = { ...nextItems[index], scoringStandard: event.target.value };
                        setDraftItems(nextItems);
                      }}
                      rows={3}
                      required
                      className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input type="hidden" name="itemDescription" value={item.description} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDraftItems(draftItems.filter((_, itemIndex) => itemIndex !== index))}
                      className="text-sm font-medium text-destructive hover:text-destructive/80"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td className="px-3 py-3"></td>
                <td className="px-4 py-3 text-sm font-medium text-muted-foreground">总分</td>
                <td className={`px-4 py-3 text-sm font-semibold tabular-nums whitespace-nowrap ${isTotalScoreExceeded ? "text-destructive" : ""}`}>{totalScore}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">上限 110 分</td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="sticky bottom-[-1.5rem] mt-6 flex justify-end gap-3 border-t border-border bg-card px-6 py-4">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">创建模板</Button>
      </div>
    </form>
    </>
  );
}

function TemplateEditDrawer({
  row,
  data,
  onClose,
  onComplete,
}: {
  row: TemplateRow;
  data: Props["data"];
  onClose: () => void;
  onComplete: (result: TemplateUpdateResult) => void;
}) {
  const [draftItems, setDraftItems] = useState(
    row.items.map((item) => ({
      id: item.id,
      name: item.name,
      score: item.score?.toString() ?? "0",
      description: item.description ?? "",
      scoringStandard: item.scoringStandard ?? "",
    }))
  );
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(row.scopeTeamIds ?? []);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(row.scopeUserIds ?? []);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const nextDraftItemIdRef = useRef(draftItems.length);
  const scopeOptions = useMemo(
    () => buildTemplateScopeOptions(data, row.departmentOrgNodeId, {
      currentTemplateId: row.id,
      preserveTeamIds: row.scopeTeamIds,
      preserveMemberIds: row.scopeUserIds,
    }),
    [data, row.departmentOrgNodeId, row.id, row.scopeTeamIds, row.scopeUserIds]
  );
  const availableMemberOptions = scopeOptions.memberOptions.filter((member) => {
    if (selectedMemberIds.includes(member.id)) {
      return false;
    }
    if (member.teamOrgNodeId && selectedTeamIds.includes(member.teamOrgNodeId)) {
      return false;
    }
    return true;
  });
  const availableTeamOptions = scopeOptions.teamOptions.filter((team) => {
    if (selectedTeamIds.includes(team.id)) {
      return false;
    }
    return availableMemberOptions.some((member) => member.teamOrgNodeId === team.id);
  });
  const filteredTeamOptions = availableTeamOptions.filter((team) =>
    team.name.toLowerCase().includes(teamSearch.trim().toLowerCase())
  );
  const filteredMemberOptions = availableMemberOptions.filter((member) =>
    member.name.toLowerCase().includes(memberSearch.trim().toLowerCase())
  );
  const selectedScopes = [
    ...selectedTeamIds.map((teamId) => ({
      type: "team" as const,
      id: teamId,
      label: scopeOptions.teamOptions.find((team) => team.id === teamId)?.name ?? "",
    })),
    ...selectedMemberIds.map((memberId) => ({
      type: "member" as const,
      id: memberId,
      label: scopeOptions.memberOptions.find((member) => member.id === memberId)?.name ?? "",
    })),
  ].filter((scope) => scope.label);

  const totalScore = draftItems.reduce((sum, item) => {
    const score = Number.parseFloat(String(item.score ?? ""));
    return sum + (Number.isFinite(score) ? score : 0);
  }, 0);
  const isTotalScoreExceeded = totalScore > 110;

  const moveDraftItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setDraftItems((currentItems) => moveArrayItem(currentItems, fromIndex, toIndex));
  };

  return (
    <>
      {(showTeamDropdown || showMemberDropdown) ? (
        <button
          type="button"
          aria-label="关闭适用范围下拉"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => {
            setShowTeamDropdown(false);
            setShowMemberDropdown(false);
          }}
        />
      ) : null}
      <form
        action={async (formData) => {
          try {
            setErrorMessage(null);
            const result = await updateKpiTemplate(formData);
            onComplete(result);
            onClose();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "模板更新失败，请稍后重试");
          }
        }}
        className="flex h-full flex-col"
      >
        <div className="space-y-6">
          <input type="hidden" name="templateId" value={row.id} />
          {selectedTeamIds.map((teamId) => <input key={teamId} type="hidden" name="scopeTeamOrgNodeId" value={teamId} />)}
          {selectedMemberIds.map((memberId) => <input key={memberId} type="hidden" name="scopeUserId" value={memberId} />)}

          {errorMessage ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">模板名称 *</label>
            <input
              name="name"
              defaultValue={row.name}
              required
              className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">适用小组</label>
            <div className="relative z-20">
              <button
                type="button"
                onClick={() => {
                  setShowTeamDropdown((current) => !current);
                  setShowMemberDropdown(false);
                }}
                className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm"
              >
                <span className="truncate text-left">{selectedTeamIds.length ? `已选 ${selectedTeamIds.length} 个小组` : "请选择小组"}</span>
                <span className="text-muted-foreground">▾</span>
              </button>
              {showTeamDropdown ? (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-card p-2 shadow-lg">
                  <input
                    value={teamSearch}
                    onChange={(event) => setTeamSearch(event.target.value)}
                    placeholder="搜索小组"
                    className="mb-2 block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {filteredTeamOptions.length ? filteredTeamOptions.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => {
                          setSelectedTeamIds((current) => current.includes(team.id) ? current : [...current, team.id]);
                          setSelectedMemberIds((current) => current.filter((memberId) => {
                            const member = scopeOptions.memberOptions.find((item) => item.id === memberId);
                            return member?.teamOrgNodeId !== team.id;
                          }));
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
                      >
                        <span>{team.name}</span>
                        <span className="text-primary">添加</span>
                      </button>
                    )) : <div className="px-3 py-2 text-sm text-muted-foreground">暂无可选小组</div>}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">适用成员</label>
            <div className="relative z-20">
              <button
                type="button"
                onClick={() => {
                  setShowMemberDropdown((current) => !current);
                  setShowTeamDropdown(false);
                }}
                className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm"
              >
                <span className="truncate text-left">{selectedMemberIds.length ? `已选 ${selectedMemberIds.length} 个成员` : "请选择成员"}</span>
                <span className="text-muted-foreground">▾</span>
              </button>
              {showMemberDropdown ? (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-card p-2 shadow-lg">
                  <input
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="搜索成员"
                    className="mb-2 block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {filteredMemberOptions.length ? filteredMemberOptions.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setSelectedMemberIds((current) => current.includes(member.id) ? current : [...current, member.id]);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
                      >
                        <span>{member.name}</span>
                        <span className="text-primary">添加</span>
                      </button>
                    )) : <div className="px-3 py-2 text-sm text-muted-foreground">暂无可选成员</div>}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">已选适用范围</label>
            <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {selectedScopes.length ? selectedScopes.map((scope) => (
                <button
                  key={`${scope.type}-${scope.id}`}
                  type="button"
                  onClick={() => {
                    if (scope.type === "team") {
                      setSelectedTeamIds((current) => current.filter((teamId) => teamId !== scope.id));
                      return;
                    }
                    setSelectedMemberIds((current) => current.filter((memberId) => memberId !== scope.id));
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 hover:bg-muted/80"
                >
                  <span>{scope.label}</span>
                  <span className="text-muted-foreground">×</span>
                </button>
              )) : <span className="text-muted-foreground">请先选择小组或成员</span>}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">模板说明</label>
            <textarea
              name="description"
              defaultValue={row.description || ""}
              rows={3}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">模板项</div>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg"
              onClick={() =>
                setDraftItems([
                  ...draftItems,
                  {
                    id: `new-${nextDraftItemIdRef.current++}`,
                    name: "",
                    score: "0",
                    description: "",
                    scoringStandard: "",
                  },
                ])
              }
            >
              添加指标项
            </Button>
          </div>
          <div className="mb-2 text-xs text-muted-foreground">拖拽左侧拖动手柄可调整指标项顺序</div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed">
              <thead className="bg-muted/40 text-left text-sm text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-3 font-medium whitespace-nowrap"></th>
                  <th className="w-[22%] px-4 py-3 font-medium whitespace-nowrap">指标项</th>
                  <th className="w-[12%] px-4 py-3 font-medium whitespace-nowrap">分值</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">评分标准</th>
                  <th className="w-24 px-4 py-3 text-right font-medium whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {draftItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`border-t border-border align-top ${draggingItemId === item.id ? "bg-muted/50" : ""} ${dragOverItemId === item.id ? "border-t-primary" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggingItemId && draggingItemId !== item.id) {
                        setDragOverItemId(item.id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const fromIndex = draftItems.findIndex((draftItem) => draftItem.id === draggingItemId);
                      moveDraftItem(fromIndex, index);
                      setDraggingItemId(null);
                      setDragOverItemId(null);
                    }}
                  >
                    <td className="px-3 py-3 align-middle">
                      <button
                        type="button"
                        draggable
                        onDragStart={() => {
                          setDraggingItemId(item.id);
                          setDragOverItemId(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggingItemId(null);
                          setDragOverItemId(null);
                        }}
                        className="flex h-10 w-8 cursor-grab items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        aria-label={`拖拽调整${item.name || `第${index + 1}项`}顺序`}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        name="itemName"
                        value={item.name ?? ""}
                        onChange={(event) => {
                          const nextItems = [...draftItems];
                          nextItems[index] = { ...nextItems[index], name: event.target.value };
                          setDraftItems(nextItems);
                        }}
                        required
                        className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        name="itemScore"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.score ?? ""}
                        onChange={(event) => {
                          const nextItems = [...draftItems];
                          nextItems[index] = { ...nextItems[index], score: event.target.value };
                          setDraftItems(nextItems);
                        }}
                        required
                        className="block h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        name="itemScoringStandard"
                        value={item.scoringStandard ?? ""}
                        onChange={(event) => {
                          const nextItems = [...draftItems];
                          nextItems[index] = { ...nextItems[index], scoringStandard: event.target.value };
                          setDraftItems(nextItems);
                        }}
                        rows={3}
                        required
                        className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <input type="hidden" name="itemDescription" value={item.description ?? ""} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDraftItems(draftItems.filter((_, itemIndex) => itemIndex !== index))}
                        className="text-sm font-medium text-destructive hover:text-destructive/80"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-3 py-3"></td>
                  <td className="px-4 py-3 text-sm font-medium text-muted-foreground">总分</td>
                  <td className={`px-4 py-3 text-sm font-semibold tabular-nums whitespace-nowrap ${isTotalScoreExceeded ? "text-destructive" : ""}`}>
                    {totalScore}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">上限 110 分</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        </div>

        <div className="sticky bottom-[-1.5rem] mt-6 flex justify-end gap-3 border-t border-border bg-card px-6 py-4">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">保存修改</Button>
        </div>
      </form>
    </>
  );
}

function InitializeForm({
  year,
  defaultQuarter,
  quarterOptions,
  onClose,
  onComplete,
}: {
  year: number;
  defaultQuarter: number;
  quarterOptions: QuarterOption[];
  onClose: () => void;
  onComplete: (result: InitializationResult) => void;
}) {
  const [selectedQuarter, setSelectedQuarter] = useState(String(defaultQuarter));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        try {
          setErrorMessage(null);
          const result = await initializeQuarterlyKpis(formData);
          onComplete(result);
          onClose();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "维护 KPI 失败");
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="year" value={year} />
      {errorMessage ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-sm font-medium">季度 *</label>
        <select
          name="quarter"
          value={selectedQuarter}
          onChange={(event) => setSelectedQuarter(event.target.value)}
          className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        >
          {quarterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">
        将按启用中的模板适用范围，为 {year} {quarterOptions.find((option) => String(option.value) === selectedQuarter)?.label ?? `Q${selectedQuarter}`} 批量维护个人 KPI 单据，并将模板项复制到独立单据表中。
      </p>
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
        <div>一人只会创建一份季度 KPI 单据</div>
        <div>已存在单据的成员会自动跳过</div>
        <div>未命中启用模板的成员不会建单</div>
        <div>维护后模板再修改，也不会影响已生成单据</div>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">确定</Button>
      </div>
    </form>
  );
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function TemplateImportForm({
  departmentOptions,
  defaultDepartmentOrgNodeId,
  canSelectAnyDepartment,
  onClose,
  onComplete,
}: {
  departmentOptions: Props["data"]["departmentOptions"];
  defaultDepartmentOrgNodeId: string;
  canSelectAnyDepartment: boolean;
  onClose: () => void;
  onComplete: (result: TemplateImportResult) => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        try {
          setErrorMessage(null);
          const result = await importKpiTemplates(formData);
          onComplete(result);
          onClose();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "导入失败，请检查模板内容后重试");
        }
      }}
      className="space-y-4"
    >
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
        <div>请先下载 Excel 模板，在 Excel 或 WPS 中填写后再上传。</div>
        <div>模板列固定为：指标项*、评分标准*、分值*。</div>
        <div>其中指标项、评分标准、分值为必填。</div>
        <div>如果你直接在 Excel 中编辑，请不要改动表头顺序。</div>
      </div>
      {errorMessage ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-sm font-medium">所属部门 *</label>
        <select
          name="departmentOrgNodeId"
          defaultValue={defaultDepartmentOrgNodeId}
          disabled={!canSelectAnyDepartment}
          className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted"
        >
          {departmentOptions.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">上传模板文件 *</label>
        <input
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
        />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="h-9 rounded-lg"><Upload className="h-4 w-4" />导入模板</Button>
      </div>
    </form>
  );
}

export function KpiContent({ data }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const errorMessage = searchParams.get("error");
  const [dismissedErrorMessage, setDismissedErrorMessage] = useState<string | null>(null);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [templateImportResult, setTemplateImportResult] = useState<TemplateImportResult | null>(null);
  const [departmentTab, setDepartmentTab] = useState(data.defaultDepartmentOrgNodeId);
  const [teamTab, setTeamTab] = useState<TeamTab | null>(null);
  const [sectionTab, setSectionTab] = useState<SectionTab>("quarterly-kpi");
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [deleteQuarterlyKpiRow, setDeleteQuarterlyKpiRow] = useState<QuarterlyKpiRow | null>(null);
  const [templateDrawerMode, setTemplateDrawerMode] = useState<"view" | "edit" | null>(null);
  const quarterOptions = useMemo<QuarterOption[]>(
    () => [1, 2, 3, 4].map((quarter) => ({ value: quarter, label: `Q${quarter}` })),
    []
  );

  useEffect(() => {
    if (errorMessage && errorMessage !== dismissedErrorMessage) {
      window.alert(errorMessage);
      setDismissedErrorMessage(errorMessage);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("error");
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [dismissedErrorMessage, errorMessage, pathname, router, searchParams]);
  const filteredTeamOptions = useMemo(
    () => data.teamOptions.filter((team) => team.departmentOrgNodeId === departmentTab),
    [data.teamOptions, departmentTab]
  );
  const canManageKpi = data.permissions.canManageKpi;
  const canManageKpiTemplate = data.permissions.canManageKpiTemplate;
  const canToggleKpiTemplate = data.permissions.canToggleKpiTemplate;

  function updatePeriodFilters(nextYear: number, nextQuarter: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    params.set("quarter", String(nextQuarter));
    router.push(`${pathname}?${params.toString()}`);
  }
  const showAllTeamTab = useMemo(
    () => data.departmentAllTabOrgNodeIds.includes(departmentTab),
    [data.departmentAllTabOrgNodeIds, departmentTab]
  );
  const teamTabs = useMemo<TeamTabOption[]>(
    () => showAllTeamTab
      ? [{ id: "all", name: "全部" }, ...filteredTeamOptions]
      : filteredTeamOptions,
    [filteredTeamOptions, showAllTeamTab]
  );
  const defaultTeamTab = useMemo<TeamTab | null>(() => {
    if (teamTabs.length === 0) {
      return null;
    }
    return showAllTeamTab ? "all" : (teamTabs[0]?.id ?? null);
  }, [showAllTeamTab, teamTabs]);

  useEffect(() => {
    if (!data.hasAnyViewPermission) {
      setTeamTab(null);
      return;
    }
    if (teamTabs.length === 0) {
      setTeamTab(null);
      return;
    }
    if (!teamTab) {
      setTeamTab(defaultTeamTab);
      return;
    }
    const teamTabExists = teamTabs.some((team) => team.id === teamTab);
    if (!teamTabExists) {
      setTeamTab(defaultTeamTab);
    }
  }, [data.hasAnyViewPermission, defaultTeamTab, teamTab, teamTabs]);

  const rows = useMemo(
    () => data.rows.filter((row) => {
      if (row.departmentOrgNodeId !== departmentTab) return false;
      if (showAllTeamTab && teamTab === "all") return true;
      return teamTab ? row.teamOrgNodeId === teamTab : false;
    }),
    [data.rows, departmentTab, showAllTeamTab, teamTab]
  );
  const scopedMemberCount = useMemo(() => {
    const visibleMembers = data.memberOptions.filter((member) => {
      if (member.departmentOrgNodeId !== departmentTab) return false;
      if (showAllTeamTab && teamTab === "all") return true;
      return teamTab ? member.teamOrgNodeId === teamTab : false;
    });
    return visibleMembers.length;
  }, [data.memberOptions, departmentTab, showAllTeamTab, teamTab]);
  const scopedStages = useMemo(() => ([
    { label: "初始化", count: rows.filter((row) => row.stageKey === "DRAFT").length },
    { label: "自评", count: rows.filter((row) => row.stageKey === "PENDING_SELF_REVIEW").length },
    { label: "组长评", count: rows.filter((row) => row.stageKey === "PENDING_LEADER_SCORE").length },
    { label: "主管评", count: rows.filter((row) => row.stageKey === "PENDING_MANAGER_SCORE").length },
    { label: "终审", count: rows.filter((row) => row.stageKey === "PENDING_FINAL_REVIEW").length },
    { label: "已完成", count: rows.filter((row) => row.stageKey === "COMPLETED").length },
  ]), [rows]);
  const templateRows = useMemo(
    () => data.templateRows.filter((row) => {
      if (row.departmentOrgNodeId !== departmentTab) return false;
      if (showAllTeamTab && teamTab === "all") return true;
      if (!teamTab) return false;
      if (row.scopeDepartmentOrgNodeIds.includes(departmentTab)) return false;
      return row.groupTeamIds.includes(teamTab);
    }),
    [data.templateRows, departmentTab, showAllTeamTab, teamTab]
  );

  async function handleDownloadTemplate() {
    const formData = new FormData();
    formData.set("departmentOrgNodeId", departmentTab);
    const { fileName, content } = await downloadKpiTemplateCsv(formData);
    const blob = base64ToBlob(
      content,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const showDepartmentTabs = data.canSelectAnyDepartment && data.departmentOptions.length > 1;

  return (
    <>
      <Card className="mb-4 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight">KPI管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">按模板规则批量维护季度 KPI 单据，并进入自评、组长评分、主管评分流程</p>
        </div>

        {showDepartmentTabs ? (
          <div className="px-5 pt-3 flex flex-wrap items-end gap-8 text-sm shrink-0">
            {data.departmentOptions.map((department) => (
              <button
                key={department.id}
                type="button"
                onClick={() => {
                  setDepartmentTab(department.id);
                  const nextTeamOptions = data.teamOptions.filter((team) => team.departmentOrgNodeId === department.id);
                  const nextShowAllTeamTab = data.departmentAllTabOrgNodeIds.includes(department.id);
                  setTeamTab(nextShowAllTeamTab ? "all" : (nextTeamOptions[0]?.id ?? null));
                }}
                className={`pb-3 border-b-2 transition ${
                  departmentTab === department.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {department.name}
              </button>
            ))}
          </div>
        ) : null}

        {teamTabs.length > 0 ? (
          <div className="px-5 pt-3 pb-4 flex flex-wrap items-center gap-2">
            {teamTabs.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setTeamTab(team.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${teamTab === team.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              >
                {team.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className={`px-5 pb-4 flex flex-wrap items-center gap-4 ${teamTabs.length === 0 && !showDepartmentTabs ? "pt-3" : ""}`}>
          <div className="inline-flex rounded-lg bg-muted p-1">
            {[
              { key: "quarterly-kpi" as const, label: "季度KPI" },
              { key: "kpi-template" as const, label: "KPI模板" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSectionTab(tab.key)}
                className={`h-9 rounded-lg px-4 text-sm transition ${
                  sectionTab === tab.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {sectionTab === "quarterly-kpi" ? (
              canManageKpi ? <Button className="h-9 rounded-lg" onClick={() => setShowInitDialog(true)}>初始化季度KPI</Button> : null
            ) : canManageKpiTemplate ? (
              <>
                <Button variant="outline" className="h-9 rounded-lg" onClick={handleDownloadTemplate}>下载模板</Button>
                {canManageKpiTemplate ? <Button variant="outline" className="h-9 rounded-lg" onClick={() => setShowImportDialog(true)}><Upload className="w-4 h-4" />导入模板</Button> : null}
                {canManageKpiTemplate ? <Button className="h-9 rounded-lg" onClick={() => setShowCreateDrawer(true)}>新建模板</Button> : null}
              </>
            ) : null}
          </div>

          {sectionTab === "quarterly-kpi" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                <select
                  value={String(data.year)}
                  onChange={(event) => updatePeriodFilters(Number.parseInt(event.target.value, 10), data.quarter)}
                  className="h-full bg-transparent outline-none"
                >
                  {data.availableYears.map((year) => (
                    <option key={year} value={year}>{year} 年</option>
                  ))}
                </select>
              </label>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                <select
                  value={String(data.quarter)}
                  onChange={(event) => updatePeriodFilters(data.year, Number.parseInt(event.target.value, 10))}
                  className="h-full bg-transparent outline-none"
                >
                  {data.availableQuarters.map((quarter) => (
                    <option key={quarter} value={quarter}>Q{quarter}季度</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="ml-auto text-xs text-muted-foreground">
            {sectionTab === "quarterly-kpi"
              ? `当前看板：${data.year} Q${data.quarter}`
              : `当前模板部门：${data.departmentOptions.find((department) => department.id === departmentTab)?.name ?? "—"}`}
          </div>
        </div>

        {sectionTab === "kpi-template" && templateImportResult ? (
          <div className="px-5 pb-4">
            <Card className="border-success/20 bg-success/5">
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{templateImportResult.departmentName}模板导入成功</span>
                  <Badge tone="success">已成功导入 {templateImportResult.importedTemplateCount} 个模板</Badge>
                  <Badge tone="info">{templateImportResult.importedItemCount} 个模板项</Badge>
                  <Badge tone="primary">{templateImportResult.importedAssignmentCount} 条分配规则</Badge>
                  <button
                    className="ml-auto text-xs text-primary hover:underline"
                    onClick={() => {
                      setTemplateImportResult(null);
                      router.refresh();
                    }}
                  >
                    刷新数据
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">已导入模板名称：</div>
                  <div className="flex flex-wrap gap-2">
                    {templateImportResult.importedTemplateNames.map((templateName) => (
                      <Badge key={templateName} tone="success">{templateName}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {sectionTab === "quarterly-kpi" ? (
          <div className="px-5 pb-5 space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">流程进度</h3>
                <span className="text-xs text-muted-foreground">共 {scopedMemberCount} 人，已生成 {rows.length} 份 KPI</span>
              </div>
              <div className="flex items-center gap-2">
                {scopedStages.map((s, i) => {
                  const totalCount = Math.max(scopedMemberCount, 1);
                  return (
                    <div key={s.label} className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(s.count / totalCount) * 100}%` }} />
                        </div>
                        {i < scopedStages.length - 1 ? <div className="w-2" /> : null}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                        <span className="text-sm font-semibold tabular-nums">{s.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input placeholder="搜索成员" className="h-9 w-full rounded-lg bg-muted pl-9 pr-3 text-sm focus:outline-none" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>小组：</span>
                  <button className="rounded-md bg-primary/10 px-2 py-1 text-primary">{teamTab === "all" ? "全部" : teamTabs.find((team) => team.id === teamTab)?.name ?? "全部"}</button>
                </div>
              </div>
              <table className="w-full">
                <thead className="bg-muted/40">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-5 py-3 font-medium">成员</th>
                    <th className="px-5 py-3 font-medium">小组</th>
                    <th className="px-5 py-3 font-medium">KPI 数</th>
                    <th className="px-5 py-3 font-medium">阶段</th>
                    <th className="w-48 px-5 py-3 font-medium">完成度</th>
                    <th className="px-5 py-3 font-medium">得分</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-border transition hover:bg-muted/30">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${avatarColor(r.userName)}`}>{r.userName[0]}</div>
                            <span className="text-sm font-medium">{r.userName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{r.teamName}</td>
                        <td className="px-5 py-3 text-sm tabular-nums">{r.itemCount}</td>
                        <td className="px-5 py-3"><Badge tone={r.tone}>{r.status}</Badge></td>
                        <td className="px-5 py-3"><Progress value={r.progress} tone={r.tone === "warning" ? "warning" : r.tone === "success" ? "success" : "primary"} /></td>
                        <td className="px-5 py-3 text-sm font-semibold tabular-nums">{r.score}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Link href={`/kpi/${r.id}?mode=view`} className="text-sm text-primary hover:underline">查看</Link>
                            {getQuarterlyKpiActionLabel(r) ? (
                              <Link href={`/kpi/${r.id}`} className="text-sm text-primary hover:underline">
                                {getQuarterlyKpiActionLabel(r)}
                              </Link>
                            ) : null}
                            {canManageKpi ? (
                              <button
                                className="text-sm text-destructive hover:underline"
                                onClick={() => setDeleteQuarterlyKpiRow(r)}
                              >
                                删除
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">暂无 KPI 数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <TemplateList
              rows={templateRows}
              canManageKpiTemplate={canManageKpiTemplate}
              canToggleKpiTemplate={canToggleKpiTemplate}
              onView={(row) => {
                setSelectedTemplate(row);
                setTemplateDrawerMode("view");
              }}
              onEdit={(row) => {
                setSelectedTemplate(row);
                setTemplateDrawerMode("edit");
              }}
              onToggleActive={async (row) => {
                try {
                  await toggleKpiTemplateActive(row.id);
                  router.refresh();
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "切换模板状态失败");
                }
              }}
            />
          </div>
        )}
      </Card>

      <Drawer
        open={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        title="新建 KPI 模板"
      >
        {showCreateDrawer ? (
          <CreateTemplateDrawer
            data={data}
            departmentOrgNodeId={departmentTab}
            onClose={() => setShowCreateDrawer(false)}
            onComplete={() => {
              setShowCreateDrawer(false);
              router.refresh();
            }}
          />
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(selectedTemplate && templateDrawerMode)}
        onClose={() => {
          setSelectedTemplate(null);
          setTemplateDrawerMode(null);
        }}
        title={templateDrawerMode === "edit" ? "编辑 KPI 模板" : "查看 KPI 模板"}
      >
        {selectedTemplate && templateDrawerMode === "view" ? <TemplateDetailDrawer row={selectedTemplate} /> : null}
        {selectedTemplate && templateDrawerMode === "edit" ? (
          <TemplateEditDrawer
            row={selectedTemplate}
            data={data}
            onClose={() => {
              setSelectedTemplate(null);
              setTemplateDrawerMode(null);
            }}
            onComplete={() => {
              router.refresh();
            }}
          />
        ) : null}
      </Drawer>

      <Dialog open={showImportDialog} onClose={() => setShowImportDialog(false)} title="导入 KPI 模板">
        <TemplateImportForm
          departmentOptions={data.departmentOptions}
          defaultDepartmentOrgNodeId={departmentTab}
          canSelectAnyDepartment={data.canSelectAnyDepartment}
          onClose={() => setShowImportDialog(false)}
          onComplete={(result) => {
            setTemplateImportResult(result);
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog open={showInitDialog} onClose={() => setShowInitDialog(false)} title="维护KPI">
        <InitializeForm
          year={data.year}
          defaultQuarter={data.quarter}
          quarterOptions={quarterOptions}
          onClose={() => setShowInitDialog(false)}
          onComplete={() => {
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog
        open={Boolean(deleteQuarterlyKpiRow)}
        onClose={() => setDeleteQuarterlyKpiRow(null)}
        title="删除季度 KPI"
      >
        {deleteQuarterlyKpiRow ? (
          <QuarterlyKpiDeleteConfirm
            row={deleteQuarterlyKpiRow}
            onClose={() => setDeleteQuarterlyKpiRow(null)}
            onComplete={() => {
              setDeleteQuarterlyKpiRow(null);
              router.refresh();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
