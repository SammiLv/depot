"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { createProductGoal, createProject, createQuarterlyWork, createValueTrack, deleteProductGoal, deleteProject, deleteQuarterlyWork, deleteValueTrack, updateProductGoal, updateProject, updateQuarterlyWork, updateValueTrack } from "@/server/quarterly-work/actions";
import type { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { Plus, AlertTriangle, Pencil, X, Check, ChevronsUpDown, Trash2 } from "lucide-react";

type Props = { data: Awaited<ReturnType<typeof getQuarterlyWorkData>> };
type BoardTab = "goal" | "project" | "board" | "value";
type ViewMode = "card" | "list";
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

type ValueTrackDialogState = Props["data"]["valueTrackItems"][number] | null;
type ValueTrackDeleteState = Props["data"]["valueTrackItems"][number] | null;
type ProductGoalDialogState = Props["data"]["productGoalColumns"][number]["items"][number] | null;
type ProductGoalDeleteState = Props["data"]["productGoalColumns"][number]["items"][number] | null;
type ProjectDeleteState = Props["data"]["projectColumns"][number]["items"][number] | null;
type BoardDeleteState = Props["data"]["columns"][number]["items"][number] | null;
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
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1}月` })),
    []
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
        <FormRow label="任务周期" align="center">
          <div className="flex items-center gap-2">
            <select
              name="startMonth"
              defaultValue={String(item?.startMonth ?? (new Date().getMonth() + 1))}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="text-muted-foreground">~</span>
            <select
              name="endMonth"
              defaultValue={String(item?.endMonth ?? item?.startMonth ?? (new Date().getMonth() + 1))}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </FormRow>
        <FormRow label="任务目标 *">
          <textarea
            name="description"
            required
            defaultValue={item?.description ?? ""}
            rows={4}
            placeholder="请输入任务目标"
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
  const [errorMessage, setErrorMessage] = useState("");

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
    <form onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        await updateProject(formData);
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存项目失败");
      }
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
        <FormRow label="工作量(人天)" align="center">
          <input
            name="workloadPersonDay"
            type="number"
            step="0.1"
            defaultValue={item.workloadPersonDay ?? ""}
            placeholder="请输入工作量"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="其他成本">
          <textarea
            name="otherCost"
            rows={2}
            defaultValue={item.otherCost ?? ""}
            placeholder="请输入其他成本"
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
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
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

function ProjectCreateForm({ data, defaultStatus, defaultProductGoalId, onClose }: { data: Props["data"]; defaultStatus?: ProjectStatus; defaultProductGoalId?: string; onClose: () => void }) {
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );
  const [errorMessage, setErrorMessage] = useState("");

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
    if (!startQuarter) {
      throw new Error("起始季度为必填项");
    }
    if (!endQuarter) {
      throw new Error("结束季度为必填项");
    }
    const [startYear, startQ] = startQuarter.split("-Q");
    const [endYear, endQ] = endQuarter.split("-Q");
    const startValue = Number(startYear) * 10 + Number(startQ);
    const endValue = Number(endYear) * 10 + Number(endQ);
    if (startValue > endValue) {
      throw new Error("起始季度不能晚于结束季度");
    }
  };

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        validateQuarterRange(formData);
        await createProject(formData);
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "创建项目失败");
      }
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
        <FormRow label="产品目标" align="center">
          <select
            name="productGoalId"
            defaultValue={defaultProductGoalId ?? ""}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            <option value="">请选择产品目标</option>
            {data.productGoalOptions.map((goal) => (
              <option key={goal.id} value={goal.id}>{goal.year} · {goal.title}</option>
            ))}
          </select>
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
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
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

function formatTrackedAtLabel(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTimeLabel(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatQuarterRange(startQuarter: string | null | undefined, endQuarter: string | null | undefined) {
  if (startQuarter && endQuarter) {
    return `${startQuarter} ~ ${endQuarter}`;
  }
  if (startQuarter) {
    return `${startQuarter} 起`;
  }
  if (endQuarter) {
    return endQuarter;
  }
  return "—";
}

function formatMonthRange(startMonth: number | null | undefined, endMonth: number | null | undefined) {
  if (startMonth && endMonth) {
    return `${startMonth}月 ~ ${endMonth}月`;
  }
  if (startMonth) {
    return `${startMonth}月`;
  }
  if (endMonth) {
    return `${endMonth}月`;
  }
  return "—";
}

function ProductGoalCreateForm({ data, onClose }: { data: Props["data"]; onClose: () => void }) {
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1, currentYear + 2];
  }, []);

  return (
    <form action={async (fd: FormData) => {
      await createProductGoal(fd);
      onClose();
    }}>
      <div className="space-y-4">
        <FormRow label="产品目标名称 *" align="center">
          <input
            name="title"
            required
            placeholder="请输入产品目标名称"
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
        <FormRow label="年份 *" align="center">
          <select
            name="year"
            defaultValue={String(data.year)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year} 年</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="产品目标描述 *">
          <textarea
            name="description"
            required
            rows={3}
            placeholder="请输入产品目标描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="预期收益 *">
          <textarea
            name="expectedOutcome"
            required
            rows={3}
            placeholder="请输入预期收益"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="产品目标状态" align="center">
          <select
            name="status"
            defaultValue="NOT_STARTED"
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

function ValueTrackCreateForm({ data, defaultProjectId, onClose }: { data: Props["data"]; defaultProjectId?: string; onClose: () => void }) {
  const completedProjectMap = useMemo(
    () => new Map(data.completedProjectOptions.map((project) => [project.id, project])),
    [data.completedProjectOptions]
  );
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? data.completedProjectOptions[0]?.id ?? "");
  const selectedProject = selectedProjectId ? completedProjectMap.get(selectedProjectId) ?? null : null;

  return (
    <form action={async (fd: FormData) => {
      await createValueTrack(fd);
      onClose();
    }}>
      <div className="space-y-4">
        <FormRow label="项目 *" align="center">
          <select
            name="projectId"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {data.completedProjectOptions.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="项目完成时间" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{formatDateTimeLabel(selectedProject?.completedAt)}</div>
        </FormRow>
        <FormRow label="预期收益">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground whitespace-pre-wrap break-words">{selectedProject?.expectedOutcome ?? "-"}</div>
        </FormRow>
        <FormRow label="工作量(人天)" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{selectedProject?.workloadPersonDay ?? "-"}</div>
        </FormRow>
        <FormRow label="其他成本">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground whitespace-pre-wrap break-words">{selectedProject?.otherCost ?? "-"}</div>
        </FormRow>
        <FormRow label="实际收益">
          <div className="space-y-2">
            <textarea
              name="actualValue"
              rows={2}
              defaultValue={selectedProject?.actualValue ?? ""}
              placeholder="请输入实际收益"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            />
            <div className="text-xs text-muted-foreground">本次修改会覆盖上次保存的内容</div>
          </div>
        </FormRow>
        <FormRow label="跟踪结果描述 *">
          <textarea
            name="trackingResult"
            required
            rows={3}
            placeholder="请输入跟踪结果描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="价值判断 *" align="center">
          <select
            name="valueJudgement"
            defaultValue="观测中"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            <option value="不达预期">不达预期</option>
            <option value="观测中">观测中</option>
            <option value="已达预期">已达预期</option>
          </select>
        </FormRow>
        <FormRow label="后续优化">
          <textarea
            name="followUpOptimization"
            rows={3}
            placeholder="请输入后续优化"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
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

function ValueTrackEditForm({ item, onClose }: { item: Props["data"]["valueTrackItems"][number]; onClose: () => void }) {
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        await updateValueTrack(formData);
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存价值跟踪失败");
      }
    }}>
      <input type="hidden" name="trackId" value={item.id} />
      <div className="space-y-4">
        <FormRow label="项目" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{item.projectTitle}</div>
        </FormRow>
        <FormRow label="实际收益">
          <textarea
            name="actualValue"
            rows={2}
            defaultValue={item.actualValue ?? ""}
            placeholder="请输入实际收益"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="价值判断 *" align="center">
          <select
            name="valueJudgement"
            defaultValue={item.valueJudgement ?? "观测中"}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            <option value="不达预期">不达预期</option>
            <option value="观测中">观测中</option>
            <option value="已达预期">已达预期</option>
          </select>
        </FormRow>
        <FormRow label="跟踪结果描述 *">
          <textarea
            name="trackingResult"
            required
            rows={3}
            defaultValue={item.trackingResult}
            placeholder="请输入跟踪结果描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="后续优化">
          <textarea
            name="followUpOptimization"
            rows={3}
            defaultValue={item.followUpOptimization ?? ""}
            placeholder="请输入后续优化"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
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

function ProductGoalEditForm({ item, data, onClose }: { item: Props["data"]["productGoalColumns"][number]["items"][number]; data: Props["data"]; onClose: () => void }) {
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );
  const [errorMessage, setErrorMessage] = useState("");
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1, currentYear + 2];
  }, []);

  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        await updateProductGoal(formData);
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存产品目标失败");
      }
    }}>
      <input type="hidden" name="productGoalId" value={item.id} />
      <div className="space-y-4">
        <FormRow label="产品目标名称 *" align="center">
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
        <FormRow label="年份 *" align="center">
          <select
            name="year"
            defaultValue={String(item.year)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year} 年</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="产品目标描述 *">
          <textarea
            name="description"
            required
            rows={3}
            defaultValue={item.description ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="预期收益 *">
          <textarea
            name="expectedOutcome"
            required
            rows={3}
            defaultValue={item.expectedOutcome ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="产品目标状态" align="center">
          <select
            name="status"
            defaultValue={item.status}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {editableProjectStatuses.map((option) => (
              <option key={option} value={option}>{projectTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
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

function ValueTrackDeleteForm({ item, onClose }: { item: Props["data"]["valueTrackItems"][number]; onClose: () => void }) {
  return (
    <form action={async (formData: FormData) => {
      await deleteValueTrack(formData);
      onClose();
    }}>
      <input type="hidden" name="trackId" value={item.id} />
      <div className="space-y-4">
        <p className="text-sm text-foreground">确定删除这条价值跟踪记录吗？</p>
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          项目：{item.projectTitle}
          <br />
          跟踪时间：{formatTrackedAtLabel(item.trackedAt)}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      </div>
    </form>
  );
}

function ProductGoalDeleteForm({ item, onClose }: { item: Props["data"]["productGoalColumns"][number]["items"][number]; onClose: () => void }) {
  return (
    <form action={async (formData: FormData) => {
      await deleteProductGoal(formData);
      onClose();
    }}>
      <input type="hidden" name="productGoalId" value={item.id} />
      <div className="space-y-4">
        <p className="text-sm text-foreground">确定删除这个产品目标吗？</p>
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          产品目标：{item.title}
          <br />
          负责人：{item.owner}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      </div>
    </form>
  );
}

function ProjectDeleteForm({ item, onClose }: { item: Props["data"]["projectColumns"][number]["items"][number]; onClose: () => void }) {
  return (
    <form action={async (formData: FormData) => {
      await deleteProject(formData);
      onClose();
    }}>
      <input type="hidden" name="projectId" value={item.id} />
      <div className="space-y-4">
        <p className="text-sm text-foreground">确定删除这个项目吗？</p>
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          项目：{item.title}
          <br />
          负责人：{item.owner}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      </div>
    </form>
  );
}

function QuarterlyWorkDeleteForm({ item, onClose }: { item: Props["data"]["columns"][number]["items"][number]; onClose: () => void }) {
  return (
    <form action={async (formData: FormData) => {
      await deleteQuarterlyWork(formData);
      onClose();
    }}>
      <input type="hidden" name="workId" value={item.id} />
      <div className="space-y-4">
        <p className="text-sm text-foreground">确定删除这个任务吗？</p>
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          任务：{item.title}
          <br />
          所属项目：{item.projectTitle}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
        <Button type="submit" className="rounded-lg">
          <Trash2 className="h-4 w-4" />
          删除
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
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [departmentTab, setDepartmentTab] = useState<DepartmentTab>(data.defaultDepartmentOrgNodeId ?? data.departments[0]?.id ?? "");
  const [teamTab, setTeamTab] = useState<TeamTab>("all");
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null);
  const [editDialog, setEditDialog] = useState<EditDialogState>(null);
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState>(null);
  const [createProductGoalDialog, setCreateProductGoalDialog] = useState(false);
  const [createValueTrackDialog, setCreateValueTrackDialog] = useState(false);
  const [createValueTrackProjectId, setCreateValueTrackProjectId] = useState<string | null>(null);
  const [valueTrackDialog, setValueTrackDialog] = useState<ValueTrackDialogState>(null);
  const [valueTrackDeleteDialog, setValueTrackDeleteDialog] = useState<ValueTrackDeleteState>(null);
  const [productGoalDialog, setProductGoalDialog] = useState<ProductGoalDialogState>(null);
  const [productGoalDeleteDialog, setProductGoalDeleteDialog] = useState<ProductGoalDeleteState>(null);
  const [projectDeleteDialog, setProjectDeleteDialog] = useState<ProjectDeleteState>(null);
  const [boardDeleteDialog, setBoardDeleteDialog] = useState<BoardDeleteState>(null);
  const [createProjectDialog, setCreateProjectDialog] = useState<ProjectStatus | null>(null);
  const [createProjectProductGoalId, setCreateProjectProductGoalId] = useState<string | null>(null);
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
  const updatePeriodFilters = (nextYear: number, nextQuarter: string | number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    params.set("quarter", String(nextQuarter));
    router.push(`${pathname}?${params.toString()}`);
  };
  const visibleColumns = useMemo(
    () => data.columns.map((column) => ({
      ...column,
      items: column.items.filter((item: Props["data"]["columns"][number]["items"][number]) => {
        if (!belongsToSelectedDepartment(item.teamOrgNodeId, item.departmentOrgNodeId)) return false;
        return teamTab === "all" ? true : item.teamOrgNodeId === teamTab;
      }),
    })),
    [data.columns, belongsToSelectedDepartment, teamTab]
  );
  const visibleProjectColumns = useMemo(
    () => data.projectColumns.map((column) => ({
      ...column,
      items: column.items.filter((item: Props["data"]["projectColumns"][number]["items"][number]) => {
        if (!belongsToSelectedDepartment(item.teamOrgNodeId, item.departmentOrgNodeId)) return false;
        return teamTab === "all" ? true : item.teamOrgNodeId === teamTab;
      }),
    })),
    [data.projectColumns, belongsToSelectedDepartment, teamTab]
  );
  const visibleProductGoalColumns = useMemo(
    () => data.productGoalColumns.map((column) => ({
      ...column,
      items: column.items.filter((item: Props["data"]["productGoalColumns"][number]["items"][number]) => {
        if (!belongsToSelectedDepartment(item.teamOrgNodeId, item.departmentOrgNodeId)) return false;
        return teamTab === "all" ? true : item.teamOrgNodeId === teamTab;
      }),
    })),
    [data.productGoalColumns, belongsToSelectedDepartment, teamTab]
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
          <h1 className="text-3xl font-semibold tracking-tight">产品管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">按小组规划年度产品目标、季度工作 · 月度拆解 · 每周更新进展，延期自动预警；上线后跟踪需求价值</p>
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
                { k: "goal" as const, label: "产品目标" },
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
                <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => setCreateProductGoalDialog(true)}><Plus className="h-4 w-4" />新增产品目标</Button>
                <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => setCreateProjectDialog("NOT_STARTED")}><Plus className="h-4 w-4" />新增项目</Button>
                <Button className="h-9 rounded-lg px-4 text-sm font-semibold" onClick={() => setCreateDialog({ status: "NOT_STARTED", title: "未启动" })}><Plus className="h-4 w-4" />新增任务</Button>
                <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => {
                  setCreateValueTrackProjectId(null);
                  setCreateValueTrackDialog(true);
                }}><Plus className="h-4 w-4" />新增价值跟踪</Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                <select
                  value={String(data.year)}
                  onChange={(event) => updatePeriodFilters(Number.parseInt(event.target.value, 10), data.quarter === "all" ? "all" : data.quarter)}
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
                  onChange={(event) => updatePeriodFilters(data.year, event.target.value === "all" ? "all" : Number.parseInt(event.target.value, 10))}
                  className="h-full bg-transparent outline-none"
                >
                  <option value="all">全部</option>
                  {data.availableQuarters.map((quarter) => (
                    <option key={quarter} value={quarter}>Q{quarter}季度</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="inline-flex rounded-lg bg-muted p-1">
            {[
              { key: "card" as const, label: "卡片" },
              { key: "list" as const, label: "列表" },
            ].map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setViewMode(mode.key)}
                className={`rounded-md px-4 py-1.5 text-sm transition ${viewMode === mode.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5 pt-0">
          {tab === "goal" ? (
            viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visibleProductGoalColumns.map((column: Props["data"]["productGoalColumns"][number]) => (
                <div key={column.key} className="min-h-[320px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={column.tone}>{column.title}</Badge>
                      <span className="text-xs text-muted-foreground">{column.items.length}</span>
                    </div>
                    {data.canCreate && (
                      <button
                        type="button"
                        onClick={() => setCreateProductGoalDialog(true)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + 添加
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {column.items.length ? (
                      column.items.map((item: Props["data"]["productGoalColumns"][number]["items"][number]) => (
                        <div key={item.id} className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium leading-snug">{item.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.owner}{item.teamName ? ` · ${item.teamName}` : ""} · {item.year} 年
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setCreateProjectProductGoalId(item.id);
                                  setCreateProjectDialog("NOT_STARTED");
                                }}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`为${item.title}新增项目`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setProductGoalDialog(item)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`编辑${item.title}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-muted-foreground">
                            <span className="text-[11px]">预期收益：</span>
                            <span className="font-medium text-foreground">{item.expectedOutcome || "-"}</span>
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
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.2fr_0.9fr_90px_1.3fr_1.3fr_0.9fr_1fr_1fr_120px] gap-4 text-xs text-muted-foreground">
                  <div>产品目标名称</div>
                  <div>负责人</div>
                  <div>年份</div>
                  <div>产品目标描述</div>
                  <div>预期收益</div>
                  <div>产品目标状态</div>
                  <div>创建时间</div>
                  <div>完成时间</div>
                  <div className="text-right">操作</div>
                </div>
                <div className="divide-y divide-border">
                  {visibleProductGoalColumns.flatMap((column) => column.items).length ? (
                    visibleProductGoalColumns.flatMap((column) => column.items).map((item) => (
                      <div key={item.id} className="px-5 py-4 grid grid-cols-[1.2fr_0.9fr_90px_1.3fr_1.3fr_0.9fr_1fr_1fr_120px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                        <div className="font-medium text-foreground break-words">{item.title}</div>
                        <div className="text-muted-foreground break-words">{item.owner}</div>
                        <div className="text-muted-foreground">{item.year}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.description || "—"}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.expectedOutcome || "—"}</div>
                        <div className="text-muted-foreground">{projectTitleByStatus[item.status]}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.createdAt)}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.completedAt)}</div>
                        <div className="text-right">
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              onClick={() => setProductGoalDialog(item)}
                              className="text-primary hover:underline"
                              aria-label={`编辑${item.title}`}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => setProductGoalDeleteDialog(item)}
                              className="text-destructive hover:underline"
                              aria-label={`删除${item.title}`}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无产品目标数据</div>
                  )}
                </div>
              </div>
            )
          ) : tab === "project" ? (
            viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visibleProjectColumns.map((column: Props["data"]["projectColumns"][number]) => (
                <div key={column.key} className="min-h-[320px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
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
                      column.items.map((item: Props["data"]["projectColumns"][number]["items"][number]) => (
                        <div key={item.id} className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
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
                          <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                            <div>
                              <span className="text-[11px]">总任务数：</span>
                              <span className="font-medium text-foreground">{item.workCount}</span>
                            </div>
                            <div>
                              <span className="text-[11px]">未完成任务数：</span>
                              <span className="font-medium text-foreground">{item.activeQuarterCount}</span>
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
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.2fr_1fr_0.9fr_1fr_1.2fr_110px_1fr_1fr_0.9fr_0.9fr_1fr_1fr_140px] gap-4 text-xs text-muted-foreground">
                  <div>项目名称</div>
                  <div>所属产品目标</div>
                  <div>负责人</div>
                  <div>规划周期</div>
                  <div>预期收益</div>
                  <div>工作量(人天)</div>
                  <div>其他成本</div>
                  <div>实际收益</div>
                  <div>价值判断</div>
                  <div>项目状态</div>
                  <div>创建时间</div>
                  <div>完成时间</div>
                  <div className="text-right">操作</div>
                </div>
                <div className="divide-y divide-border">
                  {visibleProjectColumns.flatMap((column) => column.items).length ? (
                    visibleProjectColumns.flatMap((column) => column.items).map((item) => (
                      <div key={item.id} className="px-5 py-4 grid grid-cols-[1.2fr_1fr_0.9fr_1fr_1.2fr_110px_1fr_1fr_0.9fr_0.9fr_1fr_1fr_140px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                        <div className="font-medium text-foreground break-words">{item.title}</div>
                        <div className="text-muted-foreground break-words">{item.productGoalTitle || "—"}</div>
                        <div className="text-muted-foreground break-words">{item.owner}</div>
                        <div className="text-muted-foreground">{formatQuarterRange(item.startQuarter, item.endQuarter)}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.expectedOutcome || "—"}</div>
                        <div className="text-muted-foreground">{item.workloadPersonDay ?? "—"}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.otherCost || "—"}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.actualValue || "—"}</div>
                        <div className="text-muted-foreground">{item.valueJudgement || "—"}</div>
                        <div className="text-muted-foreground">{projectTitleByStatus[item.status]}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.createdAt)}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.completedAt)}</div>
                        <div className="text-right">
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              onClick={() => setProjectDialog({ item, title: projectTitleByStatus[item.status] })}
                              className="text-primary hover:underline"
                              aria-label={`编辑${item.title}`}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => setProjectDeleteDialog(item)}
                              className="text-destructive hover:underline"
                              aria-label={`删除${item.title}`}
                            >
                              删除
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCreateValueTrackProjectId(item.id);
                                setCreateValueTrackDialog(true);
                              }}
                              disabled={item.status !== "COMPLETED"}
                              className="text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                              aria-label={`为${item.title}新增价值跟踪`}
                            >
                              价值跟踪
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无项目数据</div>
                  )}
                </div>
              </div>
            )
          ) : tab === "board" ? (
            viewMode === "card" ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {visibleColumns.map((c) => (
                  <div key={c.key} className="min-h-[400px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
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
                          <div key={it.id} className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
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
                              <span className={it.remainingWeeksLabel?.startsWith("超期") ? "text-destructive" : "text-muted-foreground"}>{it.remainingWeeksLabel ?? "—"}</span>
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
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.1fr_1fr_0.9fr_0.9fr_1.2fr_0.9fr_1fr_1fr_120px] gap-4 text-xs text-muted-foreground">
                  <div>任务名称</div>
                  <div>所属项目</div>
                  <div>负责人</div>
                  <div>任务周期</div>
                  <div>任务目标</div>
                  <div>任务状态</div>
                  <div>创建时间</div>
                  <div>完成时间</div>
                  <div className="text-right">操作</div>
                </div>
                <div className="divide-y divide-border">
                  {visibleColumns.flatMap((column) => column.items).length ? (
                    visibleColumns.flatMap((column) => column.items).map((item) => (
                      <div key={item.id} className="px-5 py-4 grid grid-cols-[1.1fr_1fr_0.9fr_0.9fr_1.2fr_0.9fr_1fr_1fr_120px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                        <div className="font-medium text-foreground break-words">{item.title}</div>
                        <div className="text-muted-foreground break-words">{item.projectTitle}</div>
                        <div className="text-muted-foreground break-words">{item.owner}</div>
                        <div className="text-muted-foreground">{formatMonthRange(item.startMonth, item.endMonth)}</div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.description || "—"}</div>
                        <div className="text-muted-foreground">{columnTitleByStatus[item.status]}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.createdAt)}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.completedAt)}</div>
                        <div className="text-right">
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              onClick={() => setEditDialog({ item, title: columnTitleByStatus[item.status] })}
                              className="text-primary hover:underline"
                              aria-label={`编辑${item.title}`}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => setBoardDeleteDialog(item)}
                              className="text-destructive hover:underline"
                              aria-label={`删除${item.title}`}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无任务数据</div>
                  )}
                </div>
              </div>
            )
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                { key: "观测中", label: "观测中", tone: "default" as const },
                { key: "不达预期", label: "不达预期", tone: "warning" as const },
                { key: "已达预期", label: "已达预期", tone: "success" as const },
              ].map((column) => {
                const items = data.valueTrackItems.filter((item) => item.valueJudgement === column.key);
                return (
                  <div key={column.key} className="min-h-[320px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={column.tone}>{column.label}</Badge>
                        <span className="text-xs text-muted-foreground">{items.length}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {items.length ? (
                        items.map((item: Props["data"]["valueTrackItems"][number]) => (
                          <div key={item.id} className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium leading-snug">{item.projectTitle}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{item.owner} · {formatTrackedAtLabel(item.trackedAt)}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setValueTrackDialog(item)}
                                  className="rounded-md p-1 hover:bg-background hover:text-foreground"
                                  aria-label={`编辑${item.projectTitle}的价值跟踪`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setValueTrackDeleteDialog(item)}
                                  className="rounded-md p-1 hover:bg-background hover:text-destructive"
                                  aria-label={`删除${item.projectTitle}的价值跟踪`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                              <div>
                                <span className="text-[11px]">跟踪结果：</span>
                                <span className="text-foreground whitespace-pre-wrap break-words">{item.trackingResult}</span>
                              </div>
                              <div>
                                <span className="text-[11px]">后续优化：</span>
                                <span className="text-foreground whitespace-pre-wrap break-words">{item.followUpOptimization || "—"}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-muted-foreground">暂无</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.2fr_0.9fr_1fr_1.6fr_1.6fr_120px] gap-4 text-xs text-muted-foreground">
                <div>项目</div>
                <div>负责人</div>
                <div>跟踪时间</div>
                <div>跟踪结果</div>
                <div>后续优化</div>
                <div className="text-right">操作</div>
              </div>
              <div className="divide-y divide-border">
                {data.valueTrackItems.length ? (
                  data.valueTrackItems.map((item: Props["data"]["valueTrackItems"][number]) => (
                    <div key={item.id} className="px-5 py-4 grid grid-cols-[1.2fr_0.9fr_1fr_1.6fr_1.6fr_120px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                      <div className="font-medium text-foreground break-words">{item.projectTitle}</div>
                      <div className="text-muted-foreground break-words">{item.owner}</div>
                      <div className="text-muted-foreground">{formatTrackedAtLabel(item.trackedAt)}</div>
                      <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.trackingResult}</div>
                      <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.followUpOptimization || "—"}</div>
                      <div className="text-right">
                        <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => setValueTrackDialog(item)}
                            className="text-primary hover:underline"
                            aria-label={`编辑${item.projectTitle}的价值跟踪`}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => setValueTrackDeleteDialog(item)}
                            className="text-destructive hover:underline"
                            aria-label={`删除${item.projectTitle}的价值跟踪`}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无需求价值跟踪数据</div>
                )}
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

      <Dialog open={createProductGoalDialog} onClose={() => setCreateProductGoalDialog(false)} title="新增产品目标">
        {createProductGoalDialog ? (
          <ProductGoalCreateForm
            data={data}
            onClose={() => setCreateProductGoalDialog(false)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!productGoalDialog} onClose={() => setProductGoalDialog(null)} title="编辑产品目标">
        {productGoalDialog ? (
          <ProductGoalEditForm
            item={productGoalDialog}
            data={data}
            onClose={() => setProductGoalDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!productGoalDeleteDialog} onClose={() => setProductGoalDeleteDialog(null)} title="删除产品目标">
        {productGoalDeleteDialog ? (
          <ProductGoalDeleteForm
            item={productGoalDeleteDialog}
            onClose={() => setProductGoalDeleteDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={createValueTrackDialog} onClose={() => {
        setCreateValueTrackDialog(false);
        setCreateValueTrackProjectId(null);
      }} title="新增价值跟踪">
        {createValueTrackDialog ? (
          <ValueTrackCreateForm
            data={data}
            defaultProjectId={createValueTrackProjectId ?? undefined}
            onClose={() => {
              setCreateValueTrackDialog(false);
              setCreateValueTrackProjectId(null);
            }}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!valueTrackDialog} onClose={() => setValueTrackDialog(null)} title="编辑价值跟踪">
        {valueTrackDialog ? (
          <ValueTrackEditForm
            item={valueTrackDialog}
            onClose={() => setValueTrackDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!valueTrackDeleteDialog} onClose={() => setValueTrackDeleteDialog(null)} title="删除价值跟踪">
        {valueTrackDeleteDialog ? (
          <ValueTrackDeleteForm
            item={valueTrackDeleteDialog}
            onClose={() => setValueTrackDeleteDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!projectDeleteDialog} onClose={() => setProjectDeleteDialog(null)} title="删除项目">
        {projectDeleteDialog ? (
          <ProjectDeleteForm
            item={projectDeleteDialog}
            onClose={() => setProjectDeleteDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!boardDeleteDialog} onClose={() => setBoardDeleteDialog(null)} title="删除任务">
        {boardDeleteDialog ? (
          <QuarterlyWorkDeleteForm
            item={boardDeleteDialog}
            onClose={() => setBoardDeleteDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!createProjectDialog} onClose={() => {
        setCreateProjectDialog(null);
        setCreateProjectProductGoalId(null);
      }} title="新增项目">
        {createProjectDialog && (
          <ProjectCreateForm
            data={data}
            defaultStatus={createProjectDialog}
            defaultProductGoalId={createProjectProductGoalId ?? undefined}
            onClose={() => {
              setCreateProjectDialog(null);
              setCreateProjectProductGoalId(null);
            }}
          />
        )}
      </Dialog>
    </>
  );
}
