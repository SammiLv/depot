"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { createProject, createQuarterlyWork, updateProject, updateQuarterlyWork } from "@/server/quarterly-work/actions";
import type { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { Plus, AlertTriangle, Pencil, X, Check, ChevronsUpDown } from "lucide-react";

type Props = { data: Awaited<ReturnType<typeof getQuarterlyWorkData>> };
type BoardTab = "project" | "board" | "value";
type ColumnStatus = Props["data"]["columns"][number]["status"];
type ProjectStatus = Props["data"]["projectColumns"][number]["status"];
type BoardItem = Props["data"]["columns"][number]["items"][number];
type ProjectBoardItem = Props["data"]["projectColumns"][number]["items"][number];
type TeamTab = "all" | Props["data"]["teamOptions"][number]["id"];
type DepartmentTab = Props["data"]["departments"][number]["id"];

type CreateDialogState = {
  status: ColumnStatus;
  title: string;
  projectId?: string;
} | null;

type EditDialogState = {
  item: BoardItem;
  title: string;
} | null;

type ProjectDialogState = {
  item: ProjectBoardItem;
  title: string;
} | null;

type FormSuccessHandler = (ownerTeamOrgNodeId: Props["data"]["memberOptions"][number]["teamOrgNodeId"] | null) => void;

const columnTitleByStatus: Record<ColumnStatus, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  DELAYED_COMPLETED: "延期",
  COMPLETED: "已完成",
  CLOSED: "关闭",
};

const projectTitleByStatus: Record<ProjectStatus, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CLOSED: "关闭",
};

const editableStatuses: ColumnStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
const editableProjectStatuses: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
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

function renderRequiredLabel(label: string) {
  const trimmedLabel = label.trimEnd();
  if (!trimmedLabel.endsWith("*")) return label;
  return <>{trimmedLabel.slice(0, -1).trimEnd()} <span className="text-destructive">*</span></>;
}

function FormRow({ label, children, align = "start" }: { label: string; children: React.ReactNode; align?: "start" | "center" }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-4">
      <label className={`pt-3 text-sm font-medium ${align === "center" ? "self-center pt-0" : ""}`}>{renderRequiredLabel(label)}</label>
      <div>{children}</div>
    </div>
  );
}

function MemberPicker({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: Array<{ id: string; label: string }>;
  defaultValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedId(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedOption = options.find((option) => option.id === selectedId) ?? options[0] ?? null;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  return (
    <div ref={wrapperRef} className="relative">
      <input type="hidden" name={name} value={selectedOption?.id ?? ""} />
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none"
      >
        <span className={`truncate text-left ${selectedOption ? "text-foreground" : "text-muted-foreground"}`}>
          {selectedOption?.label ?? "请选择负责人"}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-lg border border-border bg-card p-2 shadow-xl">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索成员"
            className="mb-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const active = option.id === selectedOption?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(option.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${active ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"}`}
                  >
                    <span className="truncate">{option.label}</span>
                    {active ? <Check className="ml-2 h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">未找到匹配成员</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuarterlyWorkForm({
  data,
  mode,
  status,
  item,
  defaultProjectId,
  onClose,
  onSuccess,
}: {
  data: Props["data"];
  mode: "create" | "edit";
  status: ColumnStatus;
  item?: BoardItem;
  defaultProjectId?: string;
  onClose: () => void;
  onSuccess: FormSuccessHandler;
}) {
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );
  const statusOptions = useMemo(() => editableStatuses, []);
  const projectOptionById = useMemo(
    () => new Map(data.projectOptions.map((project) => [project.id, project])),
    [data.projectOptions]
  );
  const initialProjectId = item?.projectId ?? defaultProjectId ?? data.projectOptions[0]?.id ?? "";
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const selectedProject = selectedProjectId ? projectOptionById.get(selectedProjectId) ?? null : null;
  const ownerTeamOrgNodeIdByMemberId = useMemo(
    () => new Map(data.memberOptions.map((member) => [member.id, member.teamOrgNodeId ?? null])),
    [data.memberOptions]
  );

  const submitAction = async (fd: FormData) => {
    const nextOwnerId = String(
      fd.get("ownerId")
        ?? item?.ownerId
        ?? selectedProject?.ownerId
        ?? data.currentUserId
        ?? memberOptions[0]?.id
        ?? ""
    );
    if (mode === "edit") {
      await updateQuarterlyWork(fd);
    } else {
      await createQuarterlyWork(fd);
    }
    onSuccess(ownerTeamOrgNodeIdByMemberId.get(nextOwnerId) ?? null);
    onClose();
  };

  return (
    <form action={submitAction}>
      {mode === "edit" ? <input type="hidden" name="workId" value={item?.id ?? ""} /> : null}
      <div className="space-y-4">
        <FormRow label="所属项目" align="center">
          <select
            name="projectId"
            defaultValue={selectedProjectId}
            disabled={mode === "edit"}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:bg-muted"
          >
            {data.projectOptions.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="项目预期收益 *">
          <input type="hidden" name="expectedOutcome" value={item?.expectedOutcome ?? selectedProject?.expectedOutcome ?? ""} />
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">
            <div className="whitespace-pre-wrap break-words">{item?.expectedOutcome ?? selectedProject?.expectedOutcome ?? "-"}</div>
          </div>
        </FormRow>
        <FormRow label="任务名称 *" align="center">
          <input
            name="title"
            required
            defaultValue={item?.title ?? ""}
            placeholder="请输入任务名称"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="负责人 *" align="center">
          <MemberPicker
            name="ownerId"
            options={memberOptions}
            defaultValue={item?.ownerId ?? selectedProject?.ownerId ?? data.currentUserId ?? memberOptions[0]?.id ?? ""}
          />
        </FormRow>
        <FormRow label="本季度任务目标 *">
          <textarea
            name="description"
            required
            defaultValue={item?.description ?? ""}
            rows={4}
            placeholder="请输入本季度任务目标"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="任务状态" align="center">
          <select
            name="status"
            defaultValue={item?.status ?? status}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{columnTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          {mode === "edit" ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {mode === "edit" ? "保存" : "创建"}
        </Button>
      </div>
    </form>
  );
}

function ProjectEditForm({ data, item, onClose }: { data: Props["data"]; item: ProjectBoardItem; onClose: () => void }) {
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );

  const quarterOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [currentYear, currentYear + 1];
    const quarters: { value: string; label: string }[] = [];
    for (const year of years) {
      for (let q = 1; q <= 4; q++) {
        quarters.push({ value: `${year}-Q${q}`, label: `${year} Q${q}` });
      }
    }
    return quarters;
  }, []);

  return (
    <form action={async (fd: FormData) => {
      await updateProject(fd);
      onClose();
    }}>
      <input type="hidden" name="projectId" value={item.id} />
      <div className="space-y-4">
        <FormRow label="项目名称 *" align="center">
          <input
            name="title"
            required
            defaultValue={item.title}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="负责人 *" align="center">
          <MemberPicker
            name="ownerId"
            options={memberOptions}
            defaultValue={item.ownerId}
          />
        </FormRow>
        <FormRow label="规划周期" align="center">
          <div className="flex items-center gap-2">
            <select
              name="startQuarter"
              defaultValue={item.startQuarter ?? ""}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              <option value="">起始季度</option>
              {quarterOptions.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
            <span className="text-muted-foreground">~</span>
            <select
              name="endQuarter"
              defaultValue={item.endQuarter ?? ""}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              <option value="">结束季度</option>
              {quarterOptions.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
        </FormRow>
        <FormRow label="项目描述">
          <textarea
            name="description"
            rows={3}
            defaultValue={item.description ?? ""}
            placeholder="请输入项目描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="预期收益">
          <textarea
            name="expectedOutcome"
            rows={3}
            defaultValue={item.expectedOutcome ?? ""}
            placeholder="请输入项目预期收益"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="项目状态" align="center">
          <select
            name="status"
            required
            defaultValue={item.status}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {editableProjectStatuses.map((option) => (
              <option key={option} value={option}>{projectTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          项目变更为已完成或关闭时，将同步更新其下所有季度工作状态。
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          <Pencil className="h-4 w-4" />
          保存
        </Button>
      </div>
    </form>
  );
}

function ProjectCreateForm({ data, defaultStatus, onClose }: { data: Props["data"]; defaultStatus?: ProjectStatus; onClose: () => void }) {
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );

  const quarterOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [currentYear, currentYear + 1];
    const quarters: { value: string; label: string }[] = [];
    for (const year of years) {
      for (let q = 1; q <= 4; q++) {
        quarters.push({ value: `${year}-Q${q}`, label: `${year} Q${q}` });
      }
    }
    return quarters;
  }, []);

  const validateQuarterRange = (formData: FormData) => {
    const startQuarter = String(formData.get("startQuarter") ?? "").trim();
    const endQuarter = String(formData.get("endQuarter") ?? "").trim();
    if (!startQuarter || !endQuarter) return;
    const [startYear, startQ] = startQuarter.split("-Q");
    const [endYear, endQ] = endQuarter.split("-Q");
    const startValue = Number(startYear) * 10 + Number(startQ);
    const endValue = Number(endYear) * 10 + Number(endQ);
    if (startValue > endValue) {
      throw new Error("起始季度不能晚于结束季度");
    }
  };

  return (
    <form action={async (fd: FormData) => {
      validateQuarterRange(fd);
      await createProject(fd);
      onClose();
    }}>
      <div className="space-y-4">
        <FormRow label="项目名称 *" align="center">
          <input
            name="title"
            required
            placeholder="请输入项目名称"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="负责人 *" align="center">
          <MemberPicker
            name="ownerId"
            options={memberOptions}
            defaultValue={data.currentUserId ?? memberOptions[0]?.id ?? ""}
          />
        </FormRow>
        <FormRow label="规划周期 *" align="center">
          <div className="flex items-center gap-2">
            <select
              name="startQuarter"
              defaultValue=""
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              <option value="">起始季度</option>
              {quarterOptions.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
            <span className="text-muted-foreground">~</span>
            <select
              name="endQuarter"
              defaultValue=""
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              <option value="">结束季度</option>
              {quarterOptions.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
        </FormRow>
        <FormRow label="项目描述 *">
          <textarea
            name="description"
            required
            rows={3}
            placeholder="请输入项目描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="预期收益 *">
          <textarea
            name="expectedOutcome"
            required
            rows={3}
            placeholder="请输入项目预期收益"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="项目状态" align="center">
          <select
            name="status"
            defaultValue={defaultStatus ?? "NOT_STARTED"}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {editableProjectStatuses.map((option) => (
              <option key={option} value={option}>{projectTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          <Plus className="h-4 w-4" />
          创建
        </Button>
      </div>
    </form>
  );
}

export function QuarterlyWorkContent({ data }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<BoardTab>("board");
  const [departmentTab, setDepartmentTab] = useState<DepartmentTab>(data.defaultDepartmentOrgNodeId ?? data.departments[0]?.id ?? "");
  const [teamTab, setTeamTab] = useState<TeamTab>("all");
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null);
  const [editDialog, setEditDialog] = useState<EditDialogState>(null);
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState>(null);
  const [createProjectDialog, setCreateProjectDialog] = useState<ProjectStatus | null>(null);
  const allItems = useMemo(() => data.columns.flatMap((column) => column.items), [data.columns]);
  const teamDepartmentMap = useMemo(
    () => new Map(data.teamOptions.map((team) => [team.id, team.departmentOrgNodeId])),
    [data.teamOptions]
  );
  const filteredTeamOptions = useMemo(
    () => data.teamOptions.filter((team) => team.departmentOrgNodeId === departmentTab),
    [data.teamOptions, departmentTab]
  );
  const teamTabs = useMemo(
    () => departmentTab ? [{ id: "all" as const, name: "全部" }, ...filteredTeamOptions] : [],
    [filteredTeamOptions, departmentTab]
  );
  const belongsToSelectedDepartment = useMemo(
    () => (teamOrgNodeId: string | null, departmentOrgNodeId: string | null) => {
      if (departmentOrgNodeId) {
        return departmentOrgNodeId === departmentTab;
      }
      return Boolean(teamOrgNodeId && teamDepartmentMap.get(teamOrgNodeId) === departmentTab);
    },
    [departmentTab, teamDepartmentMap]
  );
  const handleFormSuccess = (ownerTeamOrgNodeId: Props["data"]["memberOptions"][number]["teamOrgNodeId"] | null) => {
    if (teamTab !== "all" && ownerTeamOrgNodeId !== teamTab) {
      setTeamTab("all");
    }
  };
  const updatePeriodFilters = (nextYear: number, nextQuarter: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    params.set("quarter", String(nextQuarter));
    router.push(`${pathname}?${params.toString()}`);
  };
  const visibleColumns = useMemo(
    () => data.columns.map((column) => ({
      ...column,
      items: column.items.filter((item) => {
        if (!belongsToSelectedDepartment(item.teamOrgNodeId, item.departmentOrgNodeId)) return false;
        return teamTab === "all" ? true : item.teamOrgNodeId === teamTab;
      }),
    })),
    [data.columns, belongsToSelectedDepartment, teamTab]
  );
  const visibleProjectColumns = useMemo(
    () => data.projectColumns.map((column) => ({
      ...column,
      items: column.items.filter((item) => {
        if (!belongsToSelectedDepartment(item.teamOrgNodeId, item.departmentOrgNodeId)) return false;
        return teamTab === "all" ? true : item.teamOrgNodeId === teamTab;
      }),
    })),
    [data.projectColumns, belongsToSelectedDepartment, teamTab]
  );
  const visibleReminders = useMemo(
    () => data.updateReminders.filter((reminder) => {
      const teamOrgNodeId = allItems.find((item) => item.id === reminder.id)?.teamOrgNodeId ?? null;
      const departmentOrgNodeId = allItems.find((item) => item.id === reminder.id)?.departmentOrgNodeId ?? null;
      if (!belongsToSelectedDepartment(teamOrgNodeId, departmentOrgNodeId)) return false;
      return teamTab === "all" ? true : teamOrgNodeId === teamTab;
    }),
    [allItems, data.updateReminders, belongsToSelectedDepartment, teamTab]
  );

  return (
    <>
      <Card className="mb-4 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight">项目管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">按小组规划季度工作 · 月度拆解 · 每周更新进展，延期自动预警；上线后跟踪需求价值</p>
        </div>

        {data.isSystemAdmin ? (
          <div className="px-5 pt-3 flex flex-wrap items-end gap-8 text-sm shrink-0">
            {data.departments.map((department) => (
              <button
                key={department.id}
                type="button"
                onClick={() => {
                  setDepartmentTab(department.id);
                  setTeamTab("all");
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

        <div className={`px-5 pb-4 flex flex-wrap items-center justify-between gap-4 ${teamTabs.length === 0 && !data.isSystemAdmin ? "pt-3" : ""}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex rounded-lg bg-muted p-1">
              {[
                { k: "project" as const, label: "项目看板" },
                { k: "board" as const, label: "任务看板" },
                { k: "value" as const, label: "需求价值跟踪" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  className={`rounded-md px-4 py-1.5 text-sm transition ${
                    tab === t.k ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {data.canCreate && (
              <div className="flex items-center gap-2">
                <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => setCreateProjectDialog("NOT_STARTED")}><Plus className="h-4 w-4" />新增项目</Button>
                <Button className="h-9 rounded-lg px-4 text-sm font-semibold" onClick={() => setCreateDialog({ status: "NOT_STARTED", title: "未启动" })}><Plus className="h-4 w-4" />新增任务</Button>
              </div>
            )}

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
          </div>

          <div className="text-xs text-muted-foreground">
            {tab === "value" ? "需求价值跟踪视图" : tab === "project" ? `当前项目：${data.projectTotalCount} 个` : `当前看板：${data.year} Q${data.quarter}`}
          </div>
        </div>

        <div className="px-5 pb-5 pt-0">
          {tab === "project" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visibleProjectColumns.map((column) => (
                <div key={column.key} className="min-h-[320px] rounded-xl border border-border bg-background p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={column.tone}>{column.title}</Badge>
                      <span className="text-xs text-muted-foreground">{column.items.length}</span>
                    </div>
                    {data.canCreate && (
                      <button
                        type="button"
                        onClick={() => setCreateProjectDialog(column.status)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + 添加
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {column.items.length ? (
                      column.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border bg-muted/50 p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium leading-snug">{item.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.owner}{item.teamName ? ` · ${item.teamName}` : ""}
                                {item.startQuarter && item.endQuarter ? ` · ${item.startQuarter} ~ ${item.endQuarter}` : ""}
                                {item.startQuarter && !item.endQuarter ? ` · ${item.startQuarter} 起` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setCreateDialog({ status: "NOT_STARTED", title: "未启动", projectId: item.id })}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`为${item.title}新增任务`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setProjectDialog({ item, title: column.title })}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`编辑${item.title}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div className="rounded-md bg-background px-2 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px]">任务数</span>
                                <span className="font-medium text-foreground">{item.workCount}</span>
                              </div>
                            </div>
                            <div className="rounded-md bg-background px-2 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px]">未完结季度</span>
                                <span className="font-medium text-foreground">{item.activeQuarterCount}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-xs text-muted-foreground">暂无</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "board" ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {visibleColumns.map((c) => (
                  <div key={c.key} className="min-h-[400px] rounded-xl border border-border bg-background p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={c.tone}>{c.title}</Badge>
                        <span className="text-xs text-muted-foreground">{c.items.length}</span>
                      </div>
                      {data.canCreate && (
                        <button
                          type="button"
                          onClick={() => setCreateDialog({ status: c.status, title: c.title })}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          + 添加
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {c.items.length ? (
                        c.items.map((it) => (
                          <div key={it.id} className="rounded-lg border border-border bg-muted/50 p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium leading-snug">{it.title}</div>
                                <div className="mt-1 text-xs text-muted-foreground">关联项目：{it.projectTitle}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditDialog({ item: it, title: c.title })}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`编辑${it.title}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{it.owner}</span>
                              <span>{it.weeks} 周</span>
                            </div>
                            {it.progress !== undefined && (
                              <div className="mt-2">
                                <Progress value={it.progress} tone={c.key === "delayed" ? "warning" : "primary"} />
                              </div>
                            )}
                            {it.delay && (
                              <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                                <AlertTriangle className="h-3 w-3" />延期 {it.delay} 周
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-muted-foreground">暂无</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {visibleReminders.length > 0 && (
                <Card className="mt-6">
                  <h3 className="mb-3 font-semibold">本周更新提醒</h3>
                  <div className="space-y-2">
                    {visibleReminders.map((r, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">{r.who[0]}</div>
                          <div>
                            <div className="text-sm font-medium">{r.task}</div>
                            <div className="text-xs text-muted-foreground">{r.who}</div>
                          </div>
                        </div>
                        <Badge tone={r.tone}>{r.status}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              对季度工作中已上线需求的<span className="font-medium text-foreground"> 预期收益 vs 实际收益 </span>进行对比与 ROI 跟踪。
              <div className="mt-4">
                <Link href="/value-tracking" className="font-medium text-primary hover:underline">
                  前往需求价值跟踪页面 →
                </Link>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Dialog open={!!createDialog} onClose={() => setCreateDialog(null)} title="新增任务">
        {createDialog && (
          <QuarterlyWorkForm
            data={data}
            mode="create"
            status={createDialog.status}
            defaultProjectId={createDialog.projectId}
            onClose={() => setCreateDialog(null)}
            onSuccess={handleFormSuccess}
          />
        )}
      </Dialog>

      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} title="编辑任务">
        {editDialog && (
          <QuarterlyWorkForm
            data={data}
            mode="edit"
            status={editDialog.item.status}
            item={editDialog.item}
            onClose={() => setEditDialog(null)}
            onSuccess={handleFormSuccess}
          />
        )}
      </Dialog>

      <Dialog open={!!projectDialog} onClose={() => setProjectDialog(null)} title={projectDialog ? `编辑${projectDialog.title}项目` : "编辑项目"}>
        {projectDialog && (
          <ProjectEditForm
            data={data}
            item={projectDialog.item}
            onClose={() => setProjectDialog(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!createProjectDialog} onClose={() => setCreateProjectDialog(null)} title="新增项目">
        {createProjectDialog && (
          <ProjectCreateForm
            data={data}
            defaultStatus={createProjectDialog}
            onClose={() => setCreateProjectDialog(null)}
          />
        )}
      </Dialog>
    </>
  );
}
