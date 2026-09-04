"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Progress } from "@/components/ui-kit";
import { createProductGoal, createProject, createQuarterlyWork, createValueTrack, deleteProductGoal, deleteProject, deleteQuarterlyWork, deleteValueTrack, updateProductGoal, updateProject, updateProjectValue, updateQuarterlyWork, updateValueTrack } from "@/server/quarterly-work/actions";
import type { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { matchesDepartmentAndTeamScope } from "@/server/quarterly-work/quarterly-work-period-filters";
import {
  VALUE_JUDGEMENT_BELOW_EXPECTATION,
  VALUE_JUDGEMENTS,
  VALUE_TRACK_STATUS_COMPLETED,
  VALUE_TRACK_STATUS_NOT_OBSERVED,
  VALUE_TRACK_STATUS_OBSERVING,
  VALUE_TRACK_STATUSES,
  isValueJudgement,
} from "@/server/quarterly-work/value-track-constants";
import { TASK_RESULTS } from "@/server/quarterly-work/task-result-constants";
import { OPERATION_LOG_TARGET_TYPE_LABELS, type OperationLogTargetType } from "@/server/quarterly-work/operation-log-constants";
import { runServerAction } from "@/lib/run-server-action";
import { Plus, AlertTriangle, Pencil, X, Check, ChevronsUpDown, Trash2, Search, ScrollText, ChevronDown } from "lucide-react";

type Props = { data: Awaited<ReturnType<typeof getQuarterlyWorkData>> };
type BoardTab = "goal" | "project" | "board" | "value" | "log";
type ViewMode = "card" | "list";
type WorkspaceStatus = Props["data"]["workspaceFilters"]["status"];
type ColumnStatus = Props["data"]["columns"][number]["status"];
type ProjectStatus = Props["data"]["projectColumns"][number]["status"];
type BoardItem = Props["data"]["columns"][number]["items"][number];
type ProjectBoardItem = Props["data"]["projectColumns"][number]["items"][number];
type ProjectWorkspaceItem = Props["data"]["projectWorkspaceItems"][number];
type ProjectWorkspaceTaskItem = ProjectWorkspaceItem["tasks"][number];
type ProjectWorkspaceValueTrackItem = ProjectWorkspaceItem["valueTracks"][number];
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
type ValueOverviewDialogState = Props["data"]["valueOverviewItems"][number] | null;
type ProductGoalDialogState = Props["data"]["productGoalColumns"][number]["items"][number] | null;
type ProductGoalDeleteState = Props["data"]["productGoalColumns"][number]["items"][number] | null;
type ProjectDeleteState = Props["data"]["projectColumns"][number]["items"][number] | Props["data"]["valueOverviewItems"][number] | null;
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
  LAUNCHED: "已上线",
  COMPLETED: "已完成",
  CLOSED: "关闭",
};

const projectStatusTagClass: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-[#F5F5F5] text-[#181818]",
  IN_PROGRESS: "bg-[#E8F2FF] text-[#3069F9]",
  LAUNCHED: "bg-[#E8FFEA] text-[#00B42A]",
  COMPLETED: "bg-[#E8FFEA] text-[#00B42A]",
  CLOSED: "bg-[#FFECE8] text-[#F53F3F]",
};

function valueTrackStatusClass(status: string) {
  if (status === VALUE_TRACK_STATUS_OBSERVING) return "text-[#3069F9]";
  if (status === VALUE_TRACK_STATUS_COMPLETED) return "text-[#00B42A]";
  return "text-[#181818]";
}

function emptyMetricText(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function valueJudgementLabel(value: string | null | undefined) {
  if (!value?.trim()) return "-";
  if (value === "超出预期") return "超预期";
  return value;
}

function valueJudgementTone(value: string | null | undefined) {
  if (value === "超出预期") {
    return { box: "bg-[#F2FDF4]", text: "text-[#00B42A]" };
  }
  if (value === "已达预期") {
    return { box: "bg-[#EBFAFC]", text: "text-[#3069F9]" };
  }
  if (value === "未达预期") {
    return { box: "bg-[#FFECEB]", text: "text-[#F53F3F]" };
  }
  return { box: "bg-[#F5F6F8]", text: "text-[#3D3D3D]" };
}

const editableStatuses: ColumnStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
const editableProjectStatuses: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "LAUNCHED", "COMPLETED", "CLOSED"];
const workspaceStatusTabs: Array<{ key: WorkspaceStatus; label: string }> = [
  { key: "all", label: "全部项目" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "NOT_STARTED", label: "未启动" },
  { key: "LAUNCHED", label: "已上线" },
  { key: "COMPLETED", label: "已完成" },
  { key: "CLOSED", label: "关闭" },
  { key: "DELAYED", label: "延期" },
];
const workspaceEntityTabs = [
  { key: "goal", label: "目标" },
  { key: "project", label: "项目" },
  { key: "task", label: "任务" },
  { key: "value", label: "价值跟踪" },
] as const;
type WorkspaceEntityTab = (typeof workspaceEntityTabs)[number]["key"];
const goalStatusFilters = [
  { key: "all", label: "全部" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "NOT_STARTED", label: "未启动" },
  { key: "COMPLETED", label: "已完成" },
  { key: "CLOSED", label: "关闭" },
] as const;
type GoalStatusFilter = (typeof goalStatusFilters)[number]["key"];
const projectStatusFilters = [
  { key: "all", label: "全部" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "DELAYED", label: "延期" },
  { key: "LAUNCHED", label: "已上线" },
  { key: "NOT_STARTED", label: "未启动" },
  { key: "COMPLETED", label: "已完成" },
  { key: "CLOSED", label: "关闭" },
] as const;
const taskStatusFilters = [
  { key: "all", label: "全部" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "DELAYED", label: "延期" },
  { key: "NOT_STARTED", label: "未启动" },
  { key: "COMPLETED", label: "已完成" },
  { key: "CLOSED", label: "关闭" },
] as const;
type TaskStatusFilter = (typeof taskStatusFilters)[number]["key"];
const valueStatusFilters = [
  { key: "all", label: "全部" },
  { key: "观测中", label: "观测中" },
  { key: "未观测", label: "未观测" },
  { key: "已完成", label: "已完成" },
] as const;
type ValueStatusFilter = (typeof valueStatusFilters)[number]["key"];
const valueJudgementFilterOptions = [
  { value: "", label: "价值判断" },
  { value: "超出预期", label: "超预期" },
  { value: "已达预期", label: "已达预期" },
  { value: "未达预期", label: "未达预期" },
];
const goalCardStatusLabel: Record<ProjectStatus, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  LAUNCHED: "已上线",
  COMPLETED: "完成",
  CLOSED: "关闭",
};
const goalCardStatusClass: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-[#F5F5F5] text-[#777777]",
  IN_PROGRESS: "bg-[#E8F2FF] text-[#3069F9]",
  LAUNCHED: "bg-[#E8FFEA] text-[#00B42A]",
  COMPLETED: "bg-[#E8FFEA] text-[#00B42A]",
  CLOSED: "bg-[#FFECE8] text-[#F53F3F]",
};
const valueOverviewCardColumns = [
  { key: "未观测", label: "未观测", tone: "default" as const },
  { key: "观测中", label: "观测中", tone: "primary" as const },
  { key: "未达预期", label: "未达预期", tone: "warning" as const },
  { key: "已完成", label: "已完成", tone: "success" as const },
] as const;

function matchesValueOverviewColumn(
  item: { valueTrackStatus: string; valueJudgement: string | null },
  columnKey: (typeof valueOverviewCardColumns)[number]["key"],
) {
  if (columnKey === "未观测") return item.valueTrackStatus === VALUE_TRACK_STATUS_NOT_OBSERVED;
  if (columnKey === "观测中") {
    return item.valueTrackStatus === VALUE_TRACK_STATUS_OBSERVING && item.valueJudgement !== VALUE_JUDGEMENT_BELOW_EXPECTATION;
  }
  if (columnKey === "未达预期") {
    return item.valueJudgement === VALUE_JUDGEMENT_BELOW_EXPECTATION && item.valueTrackStatus !== VALUE_TRACK_STATUS_COMPLETED;
  }
  return item.valueTrackStatus === VALUE_TRACK_STATUS_COMPLETED;
}
const projectListGridClass =
  "grid-cols-[minmax(0,1.05fr)_minmax(0,0.78fr)_minmax(0,0.52fr)_minmax(0,0.58fr)_minmax(0,1.08fr)_minmax(0,0.46fr)_minmax(0,0.48fr)_minmax(0,0.56fr)_minmax(0,0.56fr)_minmax(88px,0.62fr)]";
const projectTreeRowClass =
  "grid grid-cols-[minmax(0,1fr)_88px_100px_80px_72px_160px_96px_100px] gap-6 px-4";
const goalListRowClass =
  "grid grid-cols-[minmax(160px,1.1fr)_72px_48px_minmax(160px,1.2fr)_minmax(180px,1.3fr)_72px_96px_96px_88px] gap-6";
const goalStickyNameShadow =
  "after:pointer-events-none after:absolute after:top-0 after:right-0 after:h-full after:w-8 after:translate-x-full after:content-[''] after:shadow-[inset_10px_0_8px_-8px_rgba(0,0,0,0.15)]";
const goalStickyActionShadow =
  "before:pointer-events-none before:absolute before:top-0 before:left-0 before:h-full before:w-8 before:-translate-x-full before:content-[''] before:shadow-[inset_-10px_0_8px_-8px_rgba(0,0,0,0.15)]";
const goalStickyNameClass =
  "sticky left-0 z-10 self-stretch overflow-visible bg-white pl-4 -my-3 py-3";
const goalStickyActionClass =
  "sticky right-0 z-10 self-stretch overflow-visible bg-white pr-4 -my-3 py-3";
const valueListRowClass =
  "grid grid-cols-[minmax(140px,1.2fr)_72px_88px_88px_minmax(140px,1.2fr)_minmax(100px,1fr)_72px_72px_72px_96px_96px] gap-6";
const taskListRowClass =
  "grid grid-cols-[minmax(140px,1.2fr)_minmax(100px,1fr)_minmax(140px,1.2fr)_72px_104px_72px_72px_160px_96px_88px] gap-6";

function formatListQuarterRange(startQuarter: string | null | undefined, endQuarter: string | null | undefined) {
  if (startQuarter && endQuarter) {
    return startQuarter === endQuarter ? startQuarter : `${startQuarter}~ ${endQuarter}`;
  }
  return formatCompactQuarterRange(startQuarter, endQuarter);
}

function taskListStatusTagClass(task: ProjectWorkspaceTaskItem) {
  if (task.status === "COMPLETED") return "bg-[#E8FFEA] text-[#00B42A]";
  if (task.status === "IN_PROGRESS") return "bg-[#E8F2FF] text-[#3069F9]";
  if (task.status === "DELAYED_COMPLETED") return "bg-[#FFF7E8] text-[#FF7D00]";
  if (task.status === "CLOSED") return "bg-[#FFECE8] text-[#F53F3F]";
  return "bg-[#F5F5F5] text-[#181818]";
}

function valueTrackListStatusTagClass(status: string) {
  if (status === VALUE_TRACK_STATUS_OBSERVING) return "bg-[#E8F2FF] text-[#3069F9]";
  if (status === VALUE_TRACK_STATUS_COMPLETED) return "bg-[#E8FFEA] text-[#00B42A]";
  return "bg-[#F5F5F5] text-[#181818]";
}

function valueJudgementTagClass(value: string | null | undefined) {
  if (value === "超出预期") return "bg-[#E8FFEA] text-[#00B42A]";
  if (value === "已达预期") return "bg-[#E8F2FF] text-[#3069F9]";
  if (value === "未达预期") return "bg-[#FFECEB] text-[#F53F3F]";
  return "";
}

type MemberOption = Props["data"]["memberOptions"][number];
type MemberPickerOption = MemberOption & { label: string };

function memberBelongsToDepartment(
  member: MemberOption,
  departmentTab: string,
  teamDepartmentMap: Map<string, string>,
) {
  if (member.departmentOrgNodeId) {
    return member.departmentOrgNodeId === departmentTab;
  }
  return Boolean(member.teamOrgNodeId && teamDepartmentMap.get(member.teamOrgNodeId) === departmentTab);
}

function buildMemberPickerOptions(members: MemberOption[]): MemberPickerOption[] {
  return members.map((member) => ({
    ...member,
    label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
  }));
}

function resolveMemberOptionsForForm(
  allMembers: MemberOption[],
  departmentTab: string,
  teamDepartmentMap: Map<string, string>,
  currentOwnerId?: string | null,
) {
  const filtered = allMembers.filter((member) => memberBelongsToDepartment(member, departmentTab, teamDepartmentMap));
  if (currentOwnerId && !filtered.some((member) => member.id === currentOwnerId)) {
    const current = allMembers.find((member) => member.id === currentOwnerId);
    if (current) {
      return buildMemberPickerOptions([...filtered, current]);
    }
  }
  return buildMemberPickerOptions(filtered);
}

function resolveDefaultOwnerId(memberOptions: MemberPickerOption[], ...preferredOwnerIds: Array<string | null | undefined>) {
  for (const preferredOwnerId of preferredOwnerIds) {
    if (preferredOwnerId && memberOptions.some((member) => member.id === preferredOwnerId)) {
      return preferredOwnerId;
    }
  }
  return memberOptions[0]?.id ?? "";
}

function Dialog({
  open,
  onClose,
  title,
  children,
  stickyLayout = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  stickyLayout?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl ${
          stickyLayout
            ? "grid h-[min(90vh,max-content)] max-h-[90vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
            : "max-h-[90vh] overflow-y-auto"
        }`}
      >
        <div
          className={`flex shrink-0 items-center justify-between ${
            stickyLayout
              ? "border-b border-border px-6 py-4"
              : "sticky top-0 z-10 rounded-t-2xl bg-card px-6 pt-6 pb-5"
          }`}
        >
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {stickyLayout ? (
          <div className="min-h-0 overflow-hidden px-6 pb-6 pt-4">{children}</div>
        ) : (
          <div className="px-6 pb-6">{children}</div>
        )}
      </div>
    </div>
  );
}

function matchesFuzzySearch(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return text.toLowerCase().includes(normalizedQuery);
}

type OperationLogItem = Props["data"]["operationLogs"][number];

function OperationLogDialog({
  logs,
  targetTitle,
  onClose,
}: {
  logs: OperationLogItem[];
  targetTitle: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title={`操作日志：${targetTitle}`}>
      {logs.length ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[0.8fr_0.7fr_1fr_2fr] gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <div>操作人</div>
            <div>操作内容</div>
            <div>时间</div>
            <div>操作备注</div>
          </div>
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="grid grid-cols-[0.8fr_0.7fr_1fr_2fr] gap-3 px-4 py-3 text-sm">
                <div className="text-muted-foreground">{log.operator}</div>
                <div className="text-muted-foreground">{log.action}</div>
                <div className="text-muted-foreground">{formatDateTimeLabel(log.createdAt)}</div>
                <div className="whitespace-pre-wrap break-words text-foreground">{log.remark || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-muted-foreground">暂无操作日志</div>
      )}
    </Dialog>
  );
}

function BoardSearchBar({
  title,
  placeholder,
  inputValue,
  onInputChange,
  appliedQuery,
  onSearch,
  onClear,
}: {
  title: string;
  placeholder: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  appliedQuery: string;
  onSearch: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={placeholder}
            className="h-9 w-64 rounded-lg bg-muted pl-9 pr-3 text-sm focus:outline-none"
          />
        </div>
        <Button type="submit" variant="outline" className="h-9 rounded-lg">搜索</Button>
        {appliedQuery ? (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            清除
          </button>
        ) : null}
      </form>
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

const stickyDialogFormClassName = "grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden";

function StickyFormScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 overflow-y-auto pr-1">
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function StickyFormFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border bg-card pt-4">{children}</div>
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
    const timer = window.setTimeout(() => setSelectedId(defaultValue), 0);
    return () => window.clearTimeout(timer);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => setQuery(""), 0);
      return () => window.clearTimeout(timer);
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
        <div className={`absolute z-50 mt-2 w-full ${dropdownPanelEnterClass}`}>
          <div className={`${dropdownPanelEnterBodyClass} rounded-lg border border-border bg-card p-2 shadow-xl`}>
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
        </div>
      ) : null}
    </div>
  );
}

function ProjectPicker({
  name,
  options,
  defaultValue,
  onChange,
}: {
  name: string;
  options: Array<{ id: string; label: string }>;
  defaultValue: string;
  onChange?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedId(defaultValue), 0);
    return () => window.clearTimeout(timer);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => setQuery(""), 0);
      return () => window.clearTimeout(timer);
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
          {selectedOption?.label ?? "请选择项目"}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className={`absolute z-50 mt-2 w-full ${dropdownPanelEnterClass}`}>
          <div className={`${dropdownPanelEnterBodyClass} rounded-lg border border-border bg-card p-2 shadow-xl`}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目"
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
                      onChange?.(option.id);
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
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">未找到匹配项目</div>
            )}
          </div>
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
  departmentOrgNodeId,
  memberOptions,
  onClose,
  onSuccess,
  stickyLayout = false,
}: {
  data: Props["data"];
  mode: "create" | "edit";
  status: ColumnStatus;
  item?: BoardItem;
  defaultProjectId?: string;
  departmentOrgNodeId: string;
  memberOptions: MemberPickerOption[];
  onClose: () => void;
  onSuccess: FormSuccessHandler;
  stickyLayout?: boolean;
}) {
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `${index + 1}月` })),
    []
  );
  const statusOptions = useMemo(() => editableStatuses, []);
  const projectOptionById = useMemo(
    () => new Map(data.projectOptions.map((project) => [project.id, project])),
    [data.projectOptions]
  );
  const projectPickerOptions = useMemo(
    () => data.projectOptions.map((project) => ({ id: project.id, label: project.title })),
    [data.projectOptions]
  );
  const initialProjectId = item?.projectId ?? defaultProjectId ?? data.projectOptions[0]?.id ?? "";
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const selectedProject = selectedProjectId ? projectOptionById.get(selectedProjectId) ?? null : null;
  const [workStatus, setWorkStatus] = useState<ColumnStatus>(
    item?.status ?? (editableStatuses.includes(status) ? status : "NOT_STARTED")
  );
  const executionSummaryRequired = workStatus === "COMPLETED";
  const taskResultRequired = workStatus === "COMPLETED";
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
      await runServerAction(() => updateQuarterlyWork(fd));
    } else {
      await runServerAction(() => createQuarterlyWork(fd));
    }
    onSuccess(ownerTeamOrgNodeIdByMemberId.get(nextOwnerId) ?? null);
    onClose();
  };

  const formFields = (
    <>
        <FormRow label="所属项目" align="center">
          <ProjectPicker
            name="projectId"
            options={projectPickerOptions}
            defaultValue={selectedProjectId}
            onChange={setSelectedProjectId}
          />
        </FormRow>
        <FormRow label="项目预期收益 *">
          <input type="hidden" name="expectedOutcome" value={selectedProject?.expectedOutcome ?? item?.expectedOutcome ?? ""} />
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">
            <div className="whitespace-pre-wrap break-words">{selectedProject?.expectedOutcome ?? item?.expectedOutcome ?? "-"}</div>
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
            defaultValue={resolveDefaultOwnerId(
              memberOptions,
              item?.ownerId,
              selectedProject?.ownerId,
              data.currentUserId,
            )}
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
        <FormRow label="是否需要开发 *" align="center">
          <select
            name="needsDevelopment"
            required
            defaultValue={item?.needsDevelopment === true ? "true" : item?.needsDevelopment === false ? "false" : ""}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            <option value="" disabled>请选择是否需要开发</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </FormRow>
        <FormRow label="任务描述">
          <textarea
            name="taskDescription"
            rows={3}
            defaultValue={item?.taskDescription ?? ""}
            placeholder="请输入任务描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
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
        <FormRow label={workStatus === "COMPLETED" ? "工作量(人天) *" : "工作量(人天)"} align="center">
          <input
            name="workloadPersonDay"
            type="number"
            step="0.1"
            min="0"
            required={workStatus === "COMPLETED"}
            defaultValue={item?.workloadPersonDay ?? ""}
            placeholder="请输入工作量"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="任务状态" align="center">
          <select
            name="status"
            required
            value={workStatus}
            onChange={(event) => setWorkStatus(event.target.value as ColumnStatus)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{columnTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label={taskResultRequired ? "任务结果 *" : "任务结果"} align="center">
          <select
            name="taskResult"
            required={taskResultRequired}
            defaultValue={item?.taskResult ?? ""}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            <option value="" disabled>请选择任务结果</option>
            {TASK_RESULTS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </FormRow>
        {workStatus === "COMPLETED" ? (
          <FormRow label="完成时间 *" align="center">
            <input
              name="completedAt"
              type="datetime-local"
              required
              defaultValue={toDateTimeLocalValue(item?.completedAt)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            />
          </FormRow>
        ) : null}
        <FormRow label={executionSummaryRequired ? "任务执行概况 *" : "任务执行概况"}>
          <textarea
            name="executionSummary"
            rows={3}
            required={executionSummaryRequired}
            defaultValue={item?.executionSummary ?? ""}
            placeholder="请输入任务最终执行情况的描述"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
    </>
  );

  const formActions = (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
      <Button type="submit" className="rounded-lg">
        {mode === "edit" ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {mode === "edit" ? "保存" : "创建"}
      </Button>
    </div>
  );

  return (
    <form action={submitAction} className={stickyLayout ? stickyDialogFormClassName : undefined}>
      <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
      {mode === "edit" ? <input type="hidden" name="workId" value={item?.id ?? ""} /> : null}
      {stickyLayout ? (
        <>
          <StickyFormScroll>{formFields}</StickyFormScroll>
          <StickyFormFooter>{formActions}</StickyFormFooter>
        </>
      ) : (
        <>
          <div className="space-y-4">{formFields}</div>
          <div className="mt-6">{formActions}</div>
        </>
      )}
    </form>
  );
}

function validateSelectedProductGoalIds(formData: FormData) {
  const productGoalIds = formData.getAll("productGoalIds").map((value) => String(value).trim()).filter(Boolean);
  if (!productGoalIds.length) {
    throw new Error("产品目标为必填项，请至少选择一个");
  }
}

function ProductGoalMultiPicker({
  options,
  defaultSelectedIds = [],
}: {
  options: Array<{ id: string; title: string; year: number }>;
  defaultSelectedIds?: string[];
}) {
  const [selectedIds, setSelectedIds] = useState(defaultSelectedIds);

  const toggleSelection = (goalId: string) => {
    setSelectedIds((current) => (
      current.includes(goalId)
        ? current.filter((id) => id !== goalId)
        : [...current, goalId]
    ));
  };

  return (
    <div className="space-y-2">
      {selectedIds.map((goalId) => (
        <input key={goalId} type="hidden" name="productGoalIds" value={goalId} />
      ))}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
        {options.length ? options.map((goal) => (
          <label
            key={goal.id}
            className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(goal.id)}
              onChange={() => toggleSelection(goal.id)}
            />
            <span className="min-w-0 flex-1 break-words">{goal.year} · {goal.title}</span>
          </label>
        )) : (
          <div className="px-3 py-4 text-sm text-muted-foreground">暂无可选产品目标</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">已选 {selectedIds.length} 个，至少选择 1 个</div>
    </div>
  );
}

function ProjectEditForm({
  data,
  item,
  productGoalOptions,
  departmentOrgNodeId,
  memberOptions,
  onClose,
}: {
  data: Props["data"];
  item: ProjectBoardItem;
  productGoalOptions: Array<{ id: string; title: string; year: number }>;
  departmentOrgNodeId: string;
  memberOptions: MemberPickerOption[];
  onClose: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>(item.status);
  // 状态切换为已上线/已完成时，把新出现的必填时间字段滚动到可视区域，
  // 避免字段出现在滚动区折叠线以下导致用户看不到
  const launchedAtRowRef = useRef<HTMLDivElement>(null);
  const completedAtRowRef = useRef<HTMLDivElement>(null);
  const prevProjectStatusRef = useRef(projectStatus);
  useEffect(() => {
    if (prevProjectStatusRef.current === projectStatus) return;
    prevProjectStatusRef.current = projectStatus;
    const target = projectStatus === "LAUNCHED"
      ? launchedAtRowRef.current
      : projectStatus === "COMPLETED"
        ? completedAtRowRef.current
        : null;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [projectStatus]);
  const workloadRequired = projectStatus === "LAUNCHED" || projectStatus === "COMPLETED";
  const taskWorkloadSum = useMemo(
    () => data.columns.flatMap((column) => column.items).reduce((sum, work) => {
      if (work.projectId === item.id && work.workloadPersonDay !== null && work.workloadPersonDay !== undefined) {
        return sum + work.workloadPersonDay;
      }
      return sum;
    }, 0),
    [data.columns, item.id],
  );
  const [workloadPersonDay, setWorkloadPersonDay] = useState<string>(() => {
    if (item.workloadPersonDay !== null && item.workloadPersonDay !== undefined) return String(item.workloadPersonDay);
    const rounded = Math.round(taskWorkloadSum * 10) / 10;
    return rounded > 0 ? String(rounded) : "";
  });

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
    <form
      className={stickyDialogFormClassName}
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        try {
          setErrorMessage("");
          validateSelectedProductGoalIds(formData);
          await runServerAction(() => updateProject(formData));
          onClose();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "保存项目失败");
        }
      }}
    >
      <input type="hidden" name="projectId" value={item.id} />
      <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
      <StickyFormScroll>
        <FormRow label="项目名称 *" align="center">
          <input
            name="title"
            required
            defaultValue={item.title}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="产品目标 *">
          <ProductGoalMultiPicker
            options={productGoalOptions}
            defaultSelectedIds={item.productGoalIds}
          />
        </FormRow>
        <FormRow label="负责人 *" align="center">
          <MemberPicker
            name="ownerId"
            options={memberOptions}
            defaultValue={resolveDefaultOwnerId(memberOptions, item.ownerId)}
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
        <FormRow label={workloadRequired ? "工作量(人天) *" : "工作量(人天)"} align="center">
          <input
            name="workloadPersonDay"
            type="number"
            step="0.1"
            min="0"
            required={workloadRequired}
            value={workloadPersonDay}
            onChange={(event) => setWorkloadPersonDay(event.target.value)}
            placeholder="请输入工作量"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
          <div className="mt-1 text-xs text-muted-foreground">任务工作量合计：{taskWorkloadSum > 0 ? taskWorkloadSum : "—"}</div>
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
            value={projectStatus}
            onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {editableProjectStatuses.map((option) => (
              <option key={option} value={option}>{projectTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
        {projectStatus === "COMPLETED" ? (
          <div ref={completedAtRowRef}>
            <FormRow label="完成时间 *" align="center">
              <input
                name="completedAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(item.completedAt)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
              />
            </FormRow>
          </div>
        ) : null}
        {projectStatus === "LAUNCHED" ? (
          <div ref={launchedAtRowRef}>
            <FormRow label="上线时间 *" align="center">
              <input
                name="launchedAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(item.launchedAt)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
              />
            </FormRow>
          </div>
        ) : null}
      </StickyFormScroll>
      <StickyFormFooter>
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          项目变更为已完成或关闭时，将同步更新其下所有任务状态，且不再有价值跟踪等后续事项。
        </div>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">
            <Pencil className="h-4 w-4" />
            保存
          </Button>
        </div>
      </StickyFormFooter>
    </form>
  );
}

function ProjectCreateForm({
  data,
  productGoalOptions,
  departmentOrgNodeId,
  memberOptions,
  defaultStatus,
  defaultProductGoalIds,
  onClose,
}: {
  data: Props["data"];
  productGoalOptions: Array<{ id: string; title: string; year: number }>;
  departmentOrgNodeId: string;
  memberOptions: MemberPickerOption[];
  defaultStatus?: ProjectStatus;
  defaultProductGoalIds?: string[];
  onClose: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const [createProjectStatus, setCreateProjectStatus] = useState<ProjectStatus>(defaultStatus ?? "NOT_STARTED");
  // 状态切换为已上线/已完成时，把新出现的必填时间字段滚动到可视区域
  const launchedAtRowRef = useRef<HTMLDivElement>(null);
  const completedAtRowRef = useRef<HTMLDivElement>(null);
  const prevCreateProjectStatusRef = useRef(createProjectStatus);
  useEffect(() => {
    if (prevCreateProjectStatusRef.current === createProjectStatus) return;
    prevCreateProjectStatusRef.current = createProjectStatus;
    const target = createProjectStatus === "LAUNCHED"
      ? launchedAtRowRef.current
      : createProjectStatus === "COMPLETED"
        ? completedAtRowRef.current
        : null;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [createProjectStatus]);
  const createWorkloadRequired = createProjectStatus === "LAUNCHED" || createProjectStatus === "COMPLETED";

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
    <form
      className={stickyDialogFormClassName}
      onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        validateQuarterRange(formData);
        validateSelectedProductGoalIds(formData);
        await runServerAction(() => createProject(formData));
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "创建项目失败");
      }
    }}>
      <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
      <StickyFormScroll>
        <FormRow label="项目名称 *" align="center">
          <input
            name="title"
            required
            placeholder="请输入项目名称"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="产品目标 *">
          <ProductGoalMultiPicker
            options={productGoalOptions}
            defaultSelectedIds={defaultProductGoalIds ?? []}
          />
        </FormRow>
        <FormRow label="负责人 *" align="center">
          <MemberPicker
            name="ownerId"
            options={memberOptions}
            defaultValue={resolveDefaultOwnerId(memberOptions, data.currentUserId)}
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
        <FormRow label={createWorkloadRequired ? "工作量(人天) *" : "工作量(人天)"} align="center">
          <input
            name="workloadPersonDay"
            type="number"
            step="0.1"
            min="0"
            required={createWorkloadRequired}
            placeholder="请输入工作量"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <FormRow label="项目状态" align="center">
          <select
            name="status"
            required
            value={createProjectStatus}
            onChange={(event) => setCreateProjectStatus(event.target.value as ProjectStatus)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {editableProjectStatuses.map((option) => (
              <option key={option} value={option}>{projectTitleByStatus[option]}</option>
            ))}
          </select>
        </FormRow>
        {createProjectStatus === "COMPLETED" ? (
          <div ref={completedAtRowRef}>
            <FormRow label="完成时间 *" align="center">
              <input
                name="completedAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(null)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
              />
            </FormRow>
          </div>
        ) : null}
        {createProjectStatus === "LAUNCHED" ? (
          <div ref={launchedAtRowRef}>
            <FormRow label="上线时间 *" align="center">
              <input
                name="launchedAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(null)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
              />
            </FormRow>
          </div>
        ) : null}
      </StickyFormScroll>
      <StickyFormFooter>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">
            <Plus className="h-4 w-4" />
            创建
          </Button>
        </div>
      </StickyFormFooter>
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

function toDateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatCompactQuarterRange(startQuarter: string | null | undefined, endQuarter: string | null | undefined) {
  if (startQuarter && endQuarter) {
    return startQuarter === endQuarter ? startQuarter : `${startQuarter}~${endQuarter}`;
  }

  if (startQuarter) {
    return `${startQuarter} 起`;
  }
  if (endQuarter) {
    return endQuarter;
  }
  return "—";
}

function ProjectQuarterRangeLabel({
  startQuarter,
  endQuarter,
}: {
  startQuarter: string | null;
  endQuarter: string | null;
}) {
  if (startQuarter && endQuarter) {
    return (
      <div className="min-w-0 leading-snug text-muted-foreground">
        <div className="break-words">{startQuarter}</div>
        <div className="break-words">~ {endQuarter}</div>
      </div>
    );
  }
  return <div className="min-w-0 break-words text-muted-foreground">{formatQuarterRange(startQuarter, endQuarter)}</div>;
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

function ProductGoalCreateForm({
  data,
  departmentOrgNodeId,
  memberOptions,
  onClose,
}: {
  data: Props["data"];
  departmentOrgNodeId: string;
  memberOptions: MemberPickerOption[];
  onClose: () => void;
}) {
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1, currentYear + 2];
  }, []);

  return (
    <form action={async (fd: FormData) => {
      await runServerAction(() => createProductGoal(fd));
      onClose();
    }}>
      <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
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
            defaultValue={resolveDefaultOwnerId(memberOptions, data.currentUserId)}
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

function ValueTrackStatusFields({
  defaultStatus,
  defaultJudgement,
}: {
  defaultStatus?: string | null;
  defaultJudgement?: string | null;
}) {
  const [status, setStatus] = useState(defaultStatus || VALUE_TRACK_STATUS_OBSERVING);
  const showJudgement = status !== VALUE_TRACK_STATUS_NOT_OBSERVED;

  return (
    <>
      <FormRow label="跟踪状态 *" align="center">
        <select
          name="valueTrackStatus"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
        >
          {VALUE_TRACK_STATUSES.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </FormRow>
      {showJudgement ? (
        <FormRow label="价值判断 *" align="center">
          <select
            name="valueJudgement"
            defaultValue={isValueJudgement(defaultJudgement) ? defaultJudgement : ""}
            required
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            <option value="" disabled>请选择价值判断</option>
            {VALUE_JUDGEMENTS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </FormRow>
      ) : null}
    </>
  );
}

function ValueTrackCreateForm({ data, defaultProjectId, onClose }: { data: Props["data"]; defaultProjectId?: string; onClose: () => void }) {
  const router = useRouter();
  const launchedProjectMap = useMemo(
    () => new Map(data.launchedProjectOptions.map((project) => [project.id, project])),
    [data.launchedProjectOptions]
  );
  const projectPickerOptions = useMemo(
    () => data.launchedProjectOptions.map((project) => ({ id: project.id, label: project.title })),
    [data.launchedProjectOptions]
  );
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? data.launchedProjectOptions[0]?.id ?? "");
  const selectedProject = selectedProjectId ? launchedProjectMap.get(selectedProjectId) ?? null : null;

  return (
    <form
      className={stickyDialogFormClassName}
      action={async (fd: FormData) => {
      await runServerAction(() => createValueTrack(fd));
      router.refresh();
      onClose();
    }}>
      <StickyFormScroll>
        <FormRow label="项目 *" align="center">
          <ProjectPicker
            name="projectId"
            options={projectPickerOptions}
            defaultValue={selectedProjectId}
            onChange={setSelectedProjectId}
          />
        </FormRow>
        <FormRow label="项目上线时间" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{formatDateTimeLabel(selectedProject?.launchedAt)}</div>
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
        <ValueTrackStatusFields
          key={selectedProjectId}
          defaultStatus={selectedProject?.valueTrackStatus === VALUE_TRACK_STATUS_COMPLETED ? VALUE_TRACK_STATUS_COMPLETED : VALUE_TRACK_STATUS_OBSERVING}
          defaultJudgement={selectedProject?.valueJudgement}
        />
        <FormRow label="后续优化">
          <textarea
            name="followUpOptimization"
            rows={3}
            placeholder="请输入后续优化"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
      </StickyFormScroll>
      <StickyFormFooter>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">
            <Plus className="h-4 w-4" />
            创建
          </Button>
        </div>
      </StickyFormFooter>
    </form>
  );
}

function ValueOverviewEditForm({
  item,
  onClose,
}: {
  item: Props["data"]["valueOverviewItems"][number];
  onClose: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <form
      className={stickyDialogFormClassName}
      onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        await runServerAction(() => updateProjectValue(formData));
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存项目价值失败");
      }
    }}>
      <input type="hidden" name="projectId" value={item.id} />
      <StickyFormScroll>
        <FormRow label="项目名称" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{item.title}</div>
        </FormRow>
        <FormRow label="负责人" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{item.owner}</div>
        </FormRow>
        <FormRow label="上线时间" align="center">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground">{formatDateTimeLabel(item.launchedAt)}</div>
        </FormRow>
        <FormRow label="预期收益">
          <div className="min-h-[24px] w-full px-1 py-2 text-sm text-foreground whitespace-pre-wrap break-words">{item.expectedOutcome || "—"}</div>
        </FormRow>
        <FormRow label="工作量(人天) *" align="center">
          <input
            name="workloadPersonDay"
            type="number"
            step="0.1"
            min="0"
            required
            defaultValue={item.workloadPersonDay ?? ""}
            placeholder="请输入工作量(人天)"
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
        <FormRow label="实际收益">
          <textarea
            name="actualValue"
            rows={2}
            defaultValue={item.actualValue ?? ""}
            placeholder="请输入实际收益"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </FormRow>
        <ValueTrackStatusFields
          defaultStatus={item.valueTrackStatus}
          defaultJudgement={item.valueJudgement}
        />
      </StickyFormScroll>
      <StickyFormFooter>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">
            <Pencil className="h-4 w-4" />
            保存
          </Button>
        </div>
      </StickyFormFooter>
    </form>
  );
}

function ValueTrackEditForm({ item, onClose }: { item: Props["data"]["valueTrackItems"][number]; onClose: () => void }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <form
      className={stickyDialogFormClassName}
      onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        await runServerAction(() => updateValueTrack(formData));
        router.refresh();
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存价值跟踪失败");
      }
    }}>
      <input type="hidden" name="trackId" value={item.id} />
      <StickyFormScroll>
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
        <ValueTrackStatusFields
          defaultStatus={item.valueTrackStatus}
          defaultJudgement={item.valueJudgement}
        />
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
      </StickyFormScroll>
      <StickyFormFooter>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">
            <Pencil className="h-4 w-4" />
            保存
          </Button>
        </div>
      </StickyFormFooter>
    </form>
  );
}

function ProductGoalEditForm({
  item,
  departmentOrgNodeId,
  memberOptions,
  onClose,
}: {
  item: Props["data"]["productGoalColumns"][number]["items"][number];
  departmentOrgNodeId: string;
  memberOptions: MemberPickerOption[];
  onClose: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1, currentYear + 2];
  }, []);

  return (
    <form
      className={stickyDialogFormClassName}
      onSubmit={async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        setErrorMessage("");
        await runServerAction(() => updateProductGoal(formData));
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存产品目标失败");
      }
    }}>
      <input type="hidden" name="productGoalId" value={item.id} />
      <input type="hidden" name="departmentOrgNodeId" value={departmentOrgNodeId} />
      <StickyFormScroll>
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
            defaultValue={resolveDefaultOwnerId(memberOptions, item.ownerId)}
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
      </StickyFormScroll>
      <StickyFormFooter>
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose}>取消</Button>
          <Button type="submit" className="rounded-lg">
            <Pencil className="h-4 w-4" />
            保存
          </Button>
        </div>
      </StickyFormFooter>
    </form>
  );
}

function ValueTrackDeleteForm({ item, onClose }: { item: Props["data"]["valueTrackItems"][number]; onClose: () => void }) {
  const router = useRouter();
  return (
    <form action={async (formData: FormData) => {
      await runServerAction(() => deleteValueTrack(formData));
      router.refresh();
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
      await runServerAction(() => deleteProductGoal(formData));
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

function ProjectDeleteForm({ item, onClose }: { item: NonNullable<ProjectDeleteState>; onClose: () => void }) {
  return (
    <form action={async (formData: FormData) => {
      await runServerAction(() => deleteProject(formData));
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
      await runServerAction(() => deleteQuarterlyWork(formData));
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

function CountdownTag({ label, overdue }: { label: string | null; overdue: boolean }) {
  if (!label) {
    return null;
  }

  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-light leading-[18px] ${overdue ? "bg-[#FFF7E8] text-[#FF7D00]" : "bg-[#E8FFEA] text-[#00B42A]"}`}>
      {label}
    </span>
  );
}

function taskMatchesStatusFilter(task: ProjectWorkspaceTaskItem, filter: TaskStatusFilter): boolean {
  if (filter === "all") return true;
  // 延期：仅「进行中 + 已逾期」
  if (filter === "DELAYED") return task.status === "IN_PROGRESS" && task.isOverdue;
  if (filter === "COMPLETED") return task.status === "COMPLETED";
  if (filter === "CLOSED") return task.status === "CLOSED";
  if (filter === "IN_PROGRESS") return task.status === "IN_PROGRESS";
  if (filter === "NOT_STARTED") return task.status === "NOT_STARTED";
  return false;
}

function getRemainingWeeks(task: ProjectWorkspaceTaskItem) {
  const planEndDate = task.endDate
    ? new Date(task.endDate)
    : task.endMonth
      ? new Date(task.year, task.endMonth, 0)
      : null;
  if (!planEndDate || Number.isNaN(planEndDate.getTime())) return null;
  const diffDays = (planEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.round((diffDays / 7) * 10) / 10;
}

type TaskCardTone = "gray" | "green" | "blue" | "orange" | "red";

function getTaskCardTone(task: ProjectWorkspaceTaskItem): TaskCardTone {
  if (task.status === "COMPLETED") return "green";

  const weeks = getRemainingWeeks(task);
  const overdue = task.isOverdue || (weeks != null && weeks < 0);
  if (task.status === "DELAYED_COMPLETED" || overdue) return "red";

  if (task.status === "IN_PROGRESS") {
    if (weeks != null && weeks >= 0 && weeks <= 2) return "orange";
    return "blue";
  }

  return "gray";
}

function getTaskCardSortRank(task: ProjectWorkspaceTaskItem) {
  const tone = getTaskCardTone(task);
  if (tone === "red") return 0;
  if (tone === "orange") return 1;
  if (tone === "blue") return 2;
  if (tone === "green") return 4;
  if (task.status === "CLOSED") return 5;
  return 3;
}

function sortTaskCards(tasks: ProjectWorkspaceTaskItem[]) {
  return [...tasks].sort((a, b) => getTaskCardSortRank(a) - getTaskCardSortRank(b));
}

function projectTaskCardSurface(tone: TaskCardTone, unstartedClass: string) {
  if (tone === "green") {
    return "bg-[linear-gradient(180deg,#EAFAEB_0%,#F5FFF7_30%,#ffffff_100%)]";
  }
  if (tone === "blue") {
    return "bg-[linear-gradient(180deg,#E9F9FB_0%,#F5FEFF_30%,#ffffff_100%)]";
  }
  if (tone === "orange") {
    return "bg-[linear-gradient(180deg,#FFEEE4_0%,#FFF9F5_30%,#ffffff_100%)]";
  }
  if (tone === "red") {
    return "bg-[linear-gradient(180deg,#FFE4E4_0%,#FFF7F5_30%,#ffffff_100%)]";
  }
  return unstartedClass;
}

function EmptyProjectSection({
  title,
  description,
  buttonLabel,
  canCreate,
  onCreate,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center gap-2">
      <img src="/icons/empty-no-statistics.png" alt="" width={80} height={80} className="h-20 w-20" />
      <div className="flex w-full flex-col items-center gap-1">
        <div className="text-base font-medium leading-[30px] text-[#181818]">{title}</div>
        <div className="text-center text-xs leading-[18px] text-[#777777]">{description}</div>
      </div>
      {canCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="h-8 rounded-md bg-[#0655FE] px-4 text-sm leading-[22px] text-white hover:opacity-90"
        >
          {buttonLabel}
        </button>
      ) : null}
    </div>
  );
}

function ProjectTaskCard({
  task,
  canEdit,
  onEdit,
  onDelete,
  unstartedClass = "bg-[#FAFAFA]",
}: {
  task: ProjectWorkspaceTaskItem;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  unstartedClass?: string;
}) {
  const completed = task.status === "COMPLETED";
  const tone = getTaskCardTone(task);
  const description = task.taskDescription || task.description || task.expectedOutcome;
  const periodClass = tone === "red" ? "text-[#F53F3F]" : tone === "orange" ? "text-[#FF7D00]" : "text-[#181818]";
  const remain = task.remainingWeeksLabel;
  const remainOverdue = Boolean(remain?.startsWith("逾期"));

  return (
    <div className={`flex h-fit w-full flex-col gap-2 rounded-xl p-4 ${projectTaskCardSurface(tone, unstartedClass)}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium leading-[22px] text-[#181818]">
          {task.title}
        </div>
        {canEdit ? (
          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="group flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3.5px] bg-white/65 hover:bg-[#E8F2FF]"
              aria-label={`编辑${task.title}`}
            >
              <img src="/icons/edit-outlined.png" alt="" width={14} height={14} className="h-3.5 w-3.5 group-hover:hidden" />
              <img src="/icons/edit-outlined-blue.png" alt="" width={14} height={14} className="hidden h-3.5 w-3.5 group-hover:block" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3.5px] bg-white/65 hover:bg-[#FFECE8]"
              aria-label={`删除${task.title}`}
            >
              <img src="/icons/delete-outlined.png" alt="" width={14} height={14} className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="whitespace-pre-wrap text-sm leading-[22px] text-[#777777]">
          {description}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0655FE] text-[8px] font-semibold leading-[10px] text-white">
            {task.owner.slice(0, 1)}
          </span>
          <span className="text-sm font-light leading-[22px] text-[#181818]">{task.owner}</span>
        </div>
        <div className="flex items-center gap-2">
          <img
            src={tone === "red" ? "/icons/task-period-danger.png" : tone === "orange" ? "/icons/task-period-warning.png" : "/icons/project-period.png"}
            alt=""
            width={16}
            height={16}
            className="h-4 w-4"
          />
          <span className={`text-sm font-light leading-[22px] ${periodClass}`}>{task.periodLabel}</span>
          {remain ? (
            <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-light leading-[18px] ${remainOverdue ? "bg-[#FFECE8] text-[#F53F3F]" : "bg-[#FFF7E8] text-[#FF7D00]"}`}>
              {remain}
            </span>
          ) : null}
        </div>
        {completed && task.workloadPersonDay != null ? (
          <div className="flex items-center gap-1">
            <img src="/icons/task-workload.svg" alt="" width={16} height={16} className="h-4 w-4" />
            <span className="text-sm font-light leading-[22px] text-[#181818]">{task.workloadPersonDay}人天</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function splitIntoColumns<T>(items: T[], columnCount: number) {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function subscribeWorkspaceCardColumns(onChange: () => void) {
  const xxlQuery = window.matchMedia("(min-width: 1440px)");
  const xlQuery = window.matchMedia("(min-width: 1280px)");
  const mdQuery = window.matchMedia("(min-width: 768px)");
  xxlQuery.addEventListener("change", onChange);
  xlQuery.addEventListener("change", onChange);
  mdQuery.addEventListener("change", onChange);
  return () => {
    xxlQuery.removeEventListener("change", onChange);
    xlQuery.removeEventListener("change", onChange);
    mdQuery.removeEventListener("change", onChange);
  };
}

function getWorkspaceCardColumnCount() {
  if (window.matchMedia("(min-width: 1440px)").matches) return 4;
  if (window.matchMedia("(min-width: 1280px)").matches) return 3;
  if (window.matchMedia("(min-width: 768px)").matches) return 2;
  return 1;
}

function useWorkspaceCardColumnCount() {
  return useSyncExternalStore(subscribeWorkspaceCardColumns, getWorkspaceCardColumnCount, () => 3);
}

function TaskMasonryGrid({
  tasks,
  canEdit,
  onEditTask,
  onDeleteTask,
}: {
  tasks: ProjectWorkspaceTaskItem[];
  canEdit: boolean;
  onEditTask: (task: ProjectWorkspaceTaskItem) => void;
  onDeleteTask: (task: ProjectWorkspaceTaskItem) => void;
}) {
  const columnCount = useWorkspaceCardColumnCount();
  const columns = useMemo(() => splitIntoColumns(sortTaskCards(tasks), columnCount), [columnCount, tasks]);

  return (
    <div className="flex items-start gap-4">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-4">
          {column.map((task) => (
            <ProjectTaskCard
              key={task.id}
              task={task}
              canEdit={canEdit}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task)}
              unstartedClass="bg-white"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ProjectValueTrackCard({
  track,
  canEdit,
  onEdit,
  onDelete,
}: {
  track: ProjectWorkspaceValueTrackItem;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const followUp = formatValueTrackFollowUp(track.followUpOptimization);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[#FAFAFA] p-4">
      <div className="flex h-[22px] items-center gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium leading-[22px] text-[#181818]">{track.periodLabel}</div>
        {canEdit ? (
          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="group flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3.5px] bg-white hover:bg-[#E8F2FF]"
              aria-label={`编辑${track.periodLabel}跟踪过程`}
            >
              <img src="/icons/edit-outlined.png" alt="" width={14} height={14} className="h-3.5 w-3.5 group-hover:hidden" />
              <img src="/icons/edit-outlined-blue.png" alt="" width={14} height={14} className="hidden h-3.5 w-3.5 group-hover:block" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3.5px] bg-white hover:bg-[#FFECE8]"
              aria-label={`删除${track.periodLabel}跟踪过程`}
            >
              <img src="/icons/delete-outlined.png" alt="" width={14} height={14} className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <p className="whitespace-pre-wrap text-sm leading-[22px] text-[#777777]">{track.trackingResult}</p>
        {followUp ? (
          <p className="whitespace-pre-wrap text-sm leading-[22px] text-[#777777]">{followUp}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0655FE] text-[8px] font-semibold leading-[10px] text-white">
          {track.owner.slice(0, 1)}
        </span>
        <span className="text-sm font-light leading-[22px] text-[#181818]">{track.owner}</span>
      </div>
    </div>
  );
}

const CREATE_MENU_WIDTH = 164;
const CREATE_MENU_VIEWPORT_MARGIN = 16;
const FILTER_MENU_MAX_WIDTH = 380;
const FILTER_MENU_ITEM_X_PADDING = 28;
const dropdownPanelEnterClass = "dropdown-panel-enter";
const dropdownPanelEnterBodyClass = "dropdown-panel-enter-body";

function measureFilterMenuWidth(labels: string[], minWidth: number) {
  const maxAllowed = Math.min(
    FILTER_MENU_MAX_WIDTH,
    typeof window === "undefined" ? FILTER_MENU_MAX_WIDTH : window.innerWidth - CREATE_MENU_VIEWPORT_MARGIN * 2,
  );
  if (typeof document === "undefined") {
    return Math.min(maxAllowed, Math.max(minWidth, CREATE_MENU_WIDTH));
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return Math.min(maxAllowed, Math.max(minWidth, CREATE_MENU_WIDTH));
  }
  context.font = `14px ${getComputedStyle(document.body).fontFamily}`;
  let contentWidth = 0;
  for (const label of labels) {
    contentWidth = Math.max(contentWidth, context.measureText(label).width);
  }
  return Math.min(maxAllowed, Math.max(minWidth, Math.ceil(contentWidth + FILTER_MENU_ITEM_X_PADDING)));
}
const CREATE_MENU_OFFSET_X = -16;
const CREATE_MENU_OFFSET_Y = 4;

function ProjectValuePanel({
  project,
  canCreateValueTrack,
  canManageProjectAndValueTracking,
  onCreateValueTrack,
  onEditValueTrack,
  onDeleteValueTrack,
  onEditValueOverview,
}: {
  project: ProjectWorkspaceItem;
  canCreateValueTrack: boolean;
  canManageProjectAndValueTracking: boolean;
  onCreateValueTrack: () => void;
  onEditValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
  onDeleteValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
  onEditValueOverview?: () => void;
}) {
  const judgementTone = valueJudgementTone(project.valueTrackSummary.judgement);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex h-[22px] items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal leading-[22px] text-[#3D3D3D]">跟踪状态</span>
            <span className={`text-sm font-medium leading-[22px] ${valueTrackStatusClass(project.valueTrackSummary.status)}`}>
              {project.valueTrackSummary.status}
            </span>
          </div>
          {onEditValueOverview && canManageProjectAndValueTracking ? (
            <button
              type="button"
              onClick={onEditValueOverview}
              className="group flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3.5px] bg-[#F5F5F5] hover:bg-[#E8F2FF]"
              aria-label="编辑项目价值"
            >
              <img src="/icons/edit-outlined.png" alt="" width={14} height={14} className="h-3.5 w-3.5 group-hover:hidden" />
              <img src="/icons/edit-outlined-blue.png" alt="" width={14} height={14} className="hidden h-3.5 w-3.5 group-hover:block" />
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className={`flex h-[85px] flex-col gap-1 rounded-lg px-2 py-2 ${judgementTone.box}`}>
            <div className="text-xs leading-[18px] text-[#3D3D3D]">价值判断</div>
            <div className={`text-sm font-medium leading-[22px] ${judgementTone.text}`}>
              {valueJudgementLabel(project.valueTrackSummary.judgement)}
            </div>
          </div>
          <div className="flex h-[85px] flex-col gap-1 rounded-lg bg-[#F5F6F8] px-2 py-2">
            <div className="text-xs leading-[18px] text-[#3D3D3D]">实际收益</div>
            <div className="line-clamp-2 text-sm font-medium leading-[22px] text-[#3D3D3D]">
              {emptyMetricText(project.valueTrackSummary.actualValue)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex h-[22px] shrink-0 items-center gap-2">
          <span className="shrink-0 text-sm leading-[22px] text-[#3D3D3D]">跟踪过程</span>
          <span className="h-px min-w-0 flex-1 bg-[#F0F0F0]" />
        </div>
        {project.valueTracks.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex flex-col gap-4 pb-4">
              {project.valueTracks.map((track) => (
                <ProjectValueTrackCard
                  key={track.id}
                  track={track}
                  canEdit={canManageProjectAndValueTracking}
                  onEdit={() => onEditValueTrack(track)}
                  onDelete={() => onDeleteValueTrack(track)}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyProjectSection
            title="暂无跟踪过程"
            description="需求上线后，记得要记录跟踪过程！"
            buttonLabel="去创建"
            canCreate={canCreateValueTrack}
            onCreate={onCreateValueTrack}
          />
        )}
      </div>
    </div>
  );
}

function ValueHomeCard({
  project,
  canCreateValueTrack,
  canManageProjectAndValueTracking,
  onCreateValueTrack,
  onEditValueTrack,
  onDeleteValueTrack,
  onEditValueOverview,
}: {
  project: ProjectWorkspaceItem;
  canCreateValueTrack: boolean;
  canManageProjectAndValueTracking: boolean;
  onCreateValueTrack: () => void;
  onEditValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
  onDeleteValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
  onEditValueOverview: () => void;
}) {
  return (
    <article className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-xl bg-white">
      <div className="shrink-0 px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-base font-medium leading-6 text-[#181818]">{project.title}</div>
          <div className="flex h-6 shrink-0 items-center gap-2">
            {canCreateValueTrack ? (
              <button
                type="button"
                aria-label={`为${project.title}新增价值跟踪`}
                onClick={onCreateValueTrack}
                className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[4px] p-0 leading-none hover:opacity-80"
              >
                <img src="/icons/add-task.png" alt="" width={24} height={24} className="block h-6 w-6" />
              </button>
            ) : null}
            {canManageProjectAndValueTracking ? (
              <button
                type="button"
                aria-label={`编辑${project.title}的项目价值`}
                onClick={onEditValueOverview}
                className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[#FAFAFA] hover:bg-[#E8F2FF]"
              >
                <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
                <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
        <ProjectValuePanel
          project={project}
          canCreateValueTrack={canCreateValueTrack}
          canManageProjectAndValueTracking={canManageProjectAndValueTracking}
          onCreateValueTrack={onCreateValueTrack}
          onEditValueTrack={onEditValueTrack}
          onDeleteValueTrack={onDeleteValueTrack}
        />
      </div>
    </article>
  );
}

function ProjectCreateMenu({
  canCreateTask,
  canCreateValueTrack,
  onCreateTask,
  onCreateValueTrack,
}: {
  canCreateTask: boolean;
  canCreateValueTrack: boolean;
  onCreateTask: () => void;
  onCreateValueTrack: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateOpen = (next: boolean) => {
    setOpen(next);
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = wrapperRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const maxLeft = window.innerWidth - CREATE_MENU_VIEWPORT_MARGIN - CREATE_MENU_WIDTH;
      const preferredLeft = rect.left + CREATE_MENU_OFFSET_X;
      const left = Math.max(CREATE_MENU_VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft));

      setMenuPosition({
        top: rect.bottom + CREATE_MENU_OFFSET_Y,
        left,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      updateOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") updateOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!canCreateTask && !canCreateValueTrack) return null;

  const menu = open && menuPosition ? (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: menuPosition.top, left: menuPosition.left, width: CREATE_MENU_WIDTH }}
      className={`fixed z-50 ${dropdownPanelEnterClass}`}
    >
      <div className={`${dropdownPanelEnterBodyClass} flex flex-col gap-0.5 rounded-lg bg-white p-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.12)]`}>
      {canCreateTask ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            updateOpen(false);
            onCreateTask();
          }}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm leading-[22px] text-[#181818] hover:bg-[#F5F5F5]"
        >
          <img src="/icons/create-task.svg" alt="" width={16} height={16} className="h-4 w-4" />
          创建任务
        </button>
      ) : null}
      {canCreateValueTrack ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            updateOpen(false);
            onCreateValueTrack();
          }}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm leading-[22px] text-[#181818] hover:bg-[#F5F5F5]"
        >
          <img src="/icons/create-value-track.svg" alt="" width={16} height={16} className="h-4 w-4" />
          创建价值跟踪过程
        </button>
      ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className="flex h-6 w-6 shrink-0 items-center justify-center">
      <button
        type="button"
        aria-label="创建"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => updateOpen(!open)}
        className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[4px] p-0 leading-none hover:opacity-80"
      >
        <img src="/icons/add-task.png" alt="" width={24} height={24} className="block h-6 w-6" />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

function ProjectCard({
  project,
  canCreateTask,
  canCreateValueTrack,
  canManageProjectAndValueTracking,
  canManageProductTask,
  onCreateTask,
  onCreateValueTrack,
  onEditProject,
  onDeleteProject,
  onEditTask,
  onDeleteTask,
  onEditValueTrack,
  onDeleteValueTrack,
  onEditValueOverview,
}: {
  project: ProjectWorkspaceItem;
  canCreateTask: boolean;
  canCreateValueTrack: boolean;
  canManageProjectAndValueTracking: boolean;
  canManageProductTask: boolean;
  onCreateTask: () => void;
  onCreateValueTrack: () => void;
  onEditProject: () => void;
  onDeleteProject: () => void;
  onEditTask: (task: ProjectWorkspaceTaskItem) => void;
  onDeleteTask: (task: ProjectWorkspaceTaskItem) => void;
  onEditValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
  onDeleteValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
  onEditValueOverview: () => void;
}) {
  const [panel, setPanel] = useState<"task" | "value">("task");

  return (
    <article className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border-0 bg-white">
      <div className="shrink-0 bg-white px-4 pt-4">
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 text-base font-medium leading-6 text-[#181818]">{project.title}</div>
              <div className="relative flex h-6 shrink-0 items-center gap-2">
                <ProjectCreateMenu
                  canCreateTask={canCreateTask}
                  canCreateValueTrack={canCreateValueTrack}
                  onCreateTask={onCreateTask}
                  onCreateValueTrack={onCreateValueTrack}
                />
                {canManageProjectAndValueTracking ? (
                  <>
                    <button
                      type="button"
                      aria-label="编辑项目"
                      onClick={onEditProject}
                      className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[#FAFAFA] hover:bg-[#E8F2FF]"
                    >
                      <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
                      <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
                    </button>
                    <button
                      type="button"
                      aria-label="删除项目"
                      onClick={onDeleteProject}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[#FAFAFA] hover:bg-[#FFECE8]"
                    >
                      <img src="/icons/delete-outlined.png" alt="" width={16} height={16} className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <p className="line-clamp-2 text-xs leading-[18px] text-[#777777]">
              {project.description || project.expectedOutcome || "暂无项目说明"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0655FE] text-[8px] font-medium leading-[10px] text-white">
                {project.owner.slice(0, 1)}
              </span>
              <span className="text-xs font-medium leading-[18px] text-[#777777]">{project.owner}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 text-xs font-medium leading-[18px] text-[#777777]">
                <img src="/icons/project-period.png" alt="" width={16} height={16} className="h-4 w-4" />
                <span>{formatCompactQuarterRange(project.startQuarter, project.endQuarter)}</span>
              </div>
              {project.remainingWeeksLabel ? (
                <span
                  className={`inline-flex h-5 items-center rounded-full px-2 text-xs leading-[18px] ${project.remainingWeeksLabel.startsWith("逾期") ? "bg-[#FFECE8] text-[#F53F3F]" : "bg-[#FFF7E8] text-[#FF7D00]"}`}
                >
                  {project.remainingWeeksLabel}
                </span>
              ) : null}
              <span
                className={`inline-flex h-5 items-center rounded-[2px] px-2 text-xs leading-[18px] ${projectStatusTagClass[project.status]}`}
              >
                {projectTitleByStatus[project.status]}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {project.productGoals.length ? (
              project.productGoals.slice(0, 2).map((goal) => (
                <span key={goal.id} className="rounded bg-[#F5F5F5] px-2 py-[3px] text-xs leading-[18px] text-[#181818]">
                  {goal.title}
                </span>
              ))
            ) : (
              <span className="rounded bg-[#FFECE8] px-2 py-[3px] text-xs leading-[18px] text-[#F53F3F]">未关联目标</span>
            )}
          </div>
        </div>
        <div className="h-px w-[288px] bg-[#F0F0F0]" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white px-4 pt-4 pb-0">
        <div className="relative mb-3 grid h-8 shrink-0 grid-cols-2 rounded-[6px] bg-[#F5F5F5] p-1 text-sm">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 left-1 h-6 w-[calc(50%-4px)] rounded bg-white transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ transform: panel === "value" ? "translateX(100%)" : "translateX(0)" }}
          />
          {[
            { key: "task" as const, label: "任务" },
            { key: "value" as const, label: "价值跟踪" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPanel(item.key)}
              className={`relative z-10 px-3 text-sm leading-6 transition-colors duration-200 ${
                panel === item.key ? "text-[#3069F9]" : "text-[#181818] hover:text-[#3069F9]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {panel === "task" ? (
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {project.tasks.length ? (
              <div className="flex flex-col gap-4 pb-4">
                {sortTaskCards(project.tasks).map((task) => (
                  <ProjectTaskCard
                    key={task.id}
                    task={task}
                    canEdit={canManageProductTask}
                    onEdit={() => onEditTask(task)}
                    onDelete={() => onDeleteTask(task)}
                  />
                ))}
              </div>
            ) : (
              <EmptyProjectSection
                title="暂未创建任务"
                description="创建任务，开始你的工作吧！"
                buttonLabel="去创建"
                canCreate={canCreateTask}
                onCreate={onCreateTask}
              />
            )}
          </div>
        ) : (
          <ProjectValuePanel
            project={project}
            canCreateValueTrack={canCreateValueTrack}
            canManageProjectAndValueTracking={canManageProjectAndValueTracking}
            onCreateValueTrack={onCreateValueTrack}
            onEditValueTrack={onEditValueTrack}
            onDeleteValueTrack={onDeleteValueTrack}
            onEditValueOverview={onEditValueOverview}
          />
        )}
      </div>
    </article>
  );
}

const PROJECT_TREE_COLLAPSE_MS = 300;

function ProjectTreeCollapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let innerFrame = 0;
      const frame = window.requestAnimationFrame(() => {
        innerFrame = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(frame);
        window.cancelAnimationFrame(innerFrame);
      };
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), PROJECT_TREE_COLLAPSE_MS);
    return () => window.clearTimeout(timeout);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ gridTemplateRows: visible ? "1fr" : "0fr" }}
    >
      <div className={`min-h-0 overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${visible ? "opacity-100" : "opacity-0"}`}>{children}</div>
    </div>
  );
}

function ListStatusTag({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex h-6 items-center rounded px-2 text-xs leading-[18px] ${className}`}>
      {label}
    </span>
  );
}

function formatValueTrackFollowUp(value: string | null | undefined) {
  if (!value?.trim()) return null;
  return value.startsWith("后续优化") ? value : `后续优化：${value}`;
}

function shortQuarterFromPeriodLabel(periodLabel: string) {
  const matched = periodLabel.match(/Q[1-4]/i);
  return matched ? matched[0].toUpperCase() : periodLabel;
}

function ProjectTreeChildRow({
  title,
  description,
  extraDescription,
  descriptionClassName = "mt-0.5 line-clamp-2 text-xs leading-[18px] text-[#777777]",
  meta,
  indent = true,
  statusLabel,
  statusClassName,
  owner,
  workload,
  period,
  remainLabel,
  remainClassName,
  completedAt,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
}: {
  title: string;
  description?: string | null;
  extraDescription?: string | null;
  descriptionClassName?: string;
  meta?: ReactNode;
  indent?: boolean;
  statusLabel: string;
  statusClassName: string;
  owner: string;
  workload?: number | null;
  period: string;
  remainLabel?: string | null;
  remainClassName?: string;
  completedAt?: Date | string | null;
  canEdit: boolean;
  onEdit: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className={`${projectTreeRowClass} items-center border-b border-[#F2F3F5] bg-white py-3`}>
      <div className={`min-w-0 ${indent ? "col-span-2 pl-[60px]" : ""}`}>
        <div className="text-sm font-medium leading-[22px] text-[#181818]">{title}</div>
        {description ? (
          <p className={descriptionClassName}>{description}</p>
        ) : null}
        {extraDescription ? (
          <p className={descriptionClassName}>{extraDescription}</p>
        ) : null}
      </div>
      {meta ? <div className="min-w-0">{meta}</div> : null}
      <div className="text-sm leading-[22px] text-[#4B4B4B]">{owner}</div>
      <div className="text-sm leading-[22px] text-[#4B4B4B]">{workload ?? "-"}</div>
      <div>
        <ListStatusTag label={statusLabel} className={statusClassName} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm leading-[22px] text-[#4B4B4B]">
        <span>{period}</span>
        {remainLabel && remainClassName ? (
          <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs leading-[18px] ${remainClassName}`}>
            {remainLabel}
          </span>
        ) : null}
      </div>
      <div className="text-sm leading-[22px] text-[#4B4B4B]">{formatDateTimeLabel(completedAt)}</div>
      <div className="flex items-center justify-end gap-3">
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
            aria-label={`编辑${title}`}
          >
            <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
            <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
          </button>
        ) : null}
        {canDelete && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#FFECE8]"
            aria-label={`删除${title}`}
          >
            <img src="/icons/delete-outlined.png" alt="" width={16} height={16} className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProjectExpandedPanel({
  project,
  activePanel,
  canCreateTask,
  canCreateValueTrack,
  canManageProjectAndValueTracking,
  canManageProductTask,
  onSwitchPanel,
  onCreateTask,
  onCreateValueTrack,
  onEditTask,
  onDeleteTask,
  onEditValueTrack,
}: {
  project: ProjectWorkspaceItem;
  activePanel: Props["data"]["workspaceFilters"]["projectPanel"];
  canCreateTask: boolean;
  canCreateValueTrack: boolean;
  canManageProjectAndValueTracking: boolean;
  canManageProductTask: boolean;
  onSwitchPanel: (panel: Props["data"]["workspaceFilters"]["projectPanel"]) => void;
  onCreateTask: () => void;
  onCreateValueTrack: () => void;
  onEditTask: (task: ProjectWorkspaceTaskItem) => void;
  onDeleteTask: (task: ProjectWorkspaceTaskItem) => void;
  onEditValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
}) {
  const showingTasks = activePanel !== "value";
  const judgementTone = valueJudgementTone(project.valueTrackSummary.judgement);

  return (
    <div className="bg-white">
      <div className="px-4 py-2 pl-[74px]">
        <div className="relative grid h-8 w-[330px] grid-cols-2 rounded-[6px] bg-[#F5F5F5] p-1 text-sm">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 left-1 h-6 w-[calc(50%-4px)] rounded bg-white transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ transform: showingTasks ? "translateX(0)" : "translateX(100%)" }}
          />
          {[
            { key: "task" as const, label: "任务" },
            { key: "value" as const, label: "价值跟踪" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSwitchPanel(item.key)}
              className={`relative z-10 px-3 text-sm leading-6 transition-colors duration-200 ${
                (item.key === "value" ? !showingTasks : showingTasks) ? "text-[#3069F9]" : "text-[#181818] hover:text-[#3069F9]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {showingTasks ? (
        project.tasks.length ? (
          <div>
            {project.tasks.map((task) => {
              const remain = task.remainingWeeksLabel;
              const remainOverdue = Boolean(remain?.startsWith("逾期"));
              return (
                <ProjectTreeChildRow
                  key={task.id}
                  title={task.title}
                  description={task.taskDescription || task.description || task.expectedOutcome}
                  statusLabel={columnTitleByStatus[task.status]}
                  statusClassName={taskListStatusTagClass(task)}
                  owner={task.owner}
                  workload={task.workloadPersonDay}
                  period={task.periodLabel}
                  remainLabel={remain}
                  remainClassName={remainOverdue ? "bg-[#FFECE8] text-[#F53F3F]" : "bg-[#FFF7E8] text-[#FF7D00]"}
                  completedAt={task.completedAt}
                  canEdit={canManageProductTask}
                  onEdit={() => onEditTask(task)}
                  canDelete={canManageProductTask}
                  onDelete={() => onDeleteTask(task)}
                />
              );
            })}
          </div>
        ) : (
          <div className="py-6">
            <EmptyProjectSection
              title="暂未创建任务"
              description="创建任务，开始你的工作吧！"
              buttonLabel="去创建"
              canCreate={canCreateTask}
              onCreate={onCreateTask}
            />
          </div>
        )
      ) : (
        <div>
          <div className="flex flex-col gap-2 px-[74px] py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-[22px] text-[#3D3D3D]">跟踪状态</span>
              <span className={`text-sm font-medium leading-[22px] ${valueTrackStatusClass(project.valueTrackSummary.status)}`}>
                {project.valueTrackSummary.status}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex h-[38px] w-[140px] shrink-0 items-center gap-2 rounded-lg px-2 ${judgementTone.box}`}>
                <span className="shrink-0 text-xs leading-[18px] text-[#3D3D3D]">价值判断</span>
                <span className={`truncate text-sm font-medium leading-[22px] ${judgementTone.text}`}>
                  {valueJudgementLabel(project.valueTrackSummary.judgement)}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs leading-[18px] text-[#3D3D3D]">实际收益</span>
                <span className="truncate text-sm font-medium leading-[22px] text-[#3D3D3D]">
                  {emptyMetricText(project.valueTrackSummary.actualValue)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 py-2 pr-4 pl-[74px]">
            <span className="shrink-0 text-sm leading-[22px] text-[#3D3D3D]">跟踪过程</span>
            <span className="h-px min-w-0 flex-1 bg-[#F0F0F0]" />
          </div>
          {project.valueTracks.length ? (
            <div>
              {project.valueTracks.map((track) => (
                <ProjectTreeChildRow
                  key={track.id}
                  title={track.periodLabel}
                  description={track.trackingResult}
                  extraDescription={formatValueTrackFollowUp(track.followUpOptimization)}
                  descriptionClassName="mt-1 text-sm leading-[22px] text-[#777777]"
                  statusLabel={track.valueTrackStatus}
                  statusClassName={valueTrackListStatusTagClass(track.valueTrackStatus)}
                  owner={track.owner || project.owner}
                  period={shortQuarterFromPeriodLabel(track.periodLabel)}
                  canEdit={canManageProjectAndValueTracking}
                  onEdit={() => onEditValueTrack(track)}
                />
              ))}
            </div>
          ) : (
            <div className="py-6">
              <EmptyProjectSection
                title="暂无跟踪过程"
                description="需求上线后，记得要记录跟踪过程！"
                buttonLabel="去创建"
                canCreate={canCreateValueTrack}
                onCreate={onCreateValueTrack}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectListActionButtons({
  canCreate,
  canManage,
  onCreate,
  onEdit,
  onDelete,
}: {
  canCreate: boolean;
  canManage: boolean;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      {canCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
          aria-label="新增"
        >
          <img src="/icons/plus-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
          <img src="/icons/plus-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
        </button>
      ) : null}
      {canManage ? (
        <>
          <button
            type="button"
            onClick={onEdit}
            className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
            aria-label="编辑"
          >
            <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
            <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#FFECE8]"
            aria-label="删除"
          >
            <img src="/icons/delete-outlined.png" alt="" width={16} height={16} className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function ProjectTreeTable({
  projects,
  expandedProjectId,
  activePanel,
  canCreateTask,
  canCreateValueTrack,
  canManageProjectAndValueTracking,
  canManageProductTask,
  onToggleExpand,
  onSwitchPanel,
  onCreateTask,
  onCreateValueTrack,
  onEditProject,
  onDeleteProject,
  onEditTask,
  onDeleteTask,
  onEditValueTrack,
}: {
  projects: ProjectWorkspaceItem[];
  expandedProjectId: string | null;
  activePanel: Props["data"]["workspaceFilters"]["projectPanel"];
  canCreateTask: boolean;
  canCreateValueTrack: boolean;
  canManageProjectAndValueTracking: boolean;
  canManageProductTask: boolean;
  onToggleExpand: (projectId: string) => void;
  onSwitchPanel: (panel: Props["data"]["workspaceFilters"]["projectPanel"]) => void;
  onCreateTask: (projectId: string) => void;
  onCreateValueTrack: (projectId: string) => void;
  onEditProject: (project: ProjectWorkspaceItem) => void;
  onDeleteProject: (project: ProjectWorkspaceItem) => void;
  onEditTask: (task: ProjectWorkspaceTaskItem) => void;
  onDeleteTask: (task: ProjectWorkspaceTaskItem) => void;
  onEditValueTrack: (track: ProjectWorkspaceValueTrackItem) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto rounded-2xl bg-white">
      <div className={`${projectTreeRowClass} sticky top-0 z-10 h-11 items-center border-b border-[#F0F0F0] bg-white text-sm leading-[22px] text-[#4B4B4B]`}>
        <div>名称</div>
        <div className="whitespace-nowrap">所属目标</div>
        <div>负责人</div>
        <div className="whitespace-nowrap">工作量(人天)</div>
        <div>状态</div>
        <div>周期</div>
        <div>完成时间</div>
        <div className="text-right">操作</div>
      </div>
      <div>
        {projects.map((project) => {
          const expanded = project.id === expandedProjectId;
          const delayed = project.isOverdue && project.status !== "COMPLETED" && project.status !== "CLOSED";
          return (
            <div key={project.id}>
              <div className={`${projectTreeRowClass} items-center border-b border-[#F0F0F0] py-3 transition-colors duration-300 ${expanded ? "bg-[#F7FAFF]" : "bg-white"}`}>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleExpand(project.id)}
                    className="flex max-w-full items-center gap-2 text-left"
                    aria-expanded={expanded}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <img
                        src={expanded ? "/icons/caret-down-blue.png" : "/icons/caret-down-gray.png"}
                        alt=""
                        width={16}
                        height={16}
                        className={`h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                          expanded ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-300 ${
                        expanded ? "bg-[#E8F2FF]" : "bg-[#F7F8FA]"
                      }`}
                    >
                      <img
                        src={expanded ? "/icons/project-folder-blue.png" : "/icons/project-folder.png"}
                        alt=""
                        width={13}
                        height={13}
                        className="h-[13px] w-[13px]"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-medium leading-6 text-[#181818]">{project.title}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-[18px] text-[#777777]">
                        {project.description || project.expectedOutcome || "暂无项目说明"}
                      </span>
                    </span>
                  </button>
                </div>
                <div className="flex min-w-0 flex-col items-start gap-1">
                  {project.productGoals.length ? (
                    project.productGoals.slice(0, 2).map((goal) => (
                      <span key={goal.id} className="max-w-full truncate rounded bg-[#F5F5F5] px-2 py-[3px] text-xs leading-[18px] text-[#181818]">
                        {goal.title}
                      </span>
                    ))
                  ) : (
                    <span className="max-w-full truncate rounded bg-[#FFECE8] px-2 py-[3px] text-xs leading-[18px] text-[#F53F3F]">未关联目标</span>
                  )}
                </div>
                <div className="text-sm leading-[22px] text-[#4B4B4B]">{project.owner}</div>
                <div className="text-sm leading-[22px] text-[#4B4B4B]">{project.workloadPersonDay ?? "-"}</div>
                <div>
                  <ListStatusTag
                    label={delayed ? "延期" : projectTitleByStatus[project.status]}
                    className={delayed ? "bg-[#FFF7E8] text-[#FF7D00]" : projectStatusTagClass[project.status]}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm leading-[22px] text-[#4B4B4B]">
                  <span>{formatListQuarterRange(project.startQuarter, project.endQuarter)}</span>
                  {project.remainingWeeksLabel ? (
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2 text-xs leading-[18px] ${project.remainingWeeksLabel.startsWith("逾期") ? "bg-[#FFECE8] text-[#F53F3F]" : "bg-[#FFF7E8] text-[#FF7D00]"}`}
                    >
                      {project.remainingWeeksLabel}
                    </span>
                  ) : null}
                </div>
                <div className="text-sm leading-[22px] text-[#4B4B4B]">{formatDateTimeLabel(project.completedAt)}</div>
                <div className="flex items-center justify-end">
                  <ProjectListActionButtons
                    canCreate={canCreateTask || canCreateValueTrack}
                    canManage={canManageProjectAndValueTracking}
                    onCreate={() => {
                      if (activePanel === "value" && canCreateValueTrack) {
                        onCreateValueTrack(project.id);
                        return;
                      }
                      if (canCreateTask) {
                        onCreateTask(project.id);
                        return;
                      }
                      onCreateValueTrack(project.id);
                    }}
                    onEdit={() => onEditProject(project)}
                    onDelete={() => onDeleteProject(project)}
                  />
                </div>
              </div>
              <ProjectTreeCollapse open={expanded}>
                <ProjectExpandedPanel
                  project={project}
                  activePanel={activePanel}
                  canCreateTask={canCreateTask}
                  canCreateValueTrack={canCreateValueTrack}
                  canManageProjectAndValueTracking={canManageProjectAndValueTracking}
                  canManageProductTask={canManageProductTask}
                  onSwitchPanel={onSwitchPanel}
                  onCreateTask={() => onCreateTask(project.id)}
                  onCreateValueTrack={() => onCreateValueTrack(project.id)}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                  onEditValueTrack={onEditValueTrack}
                />
              </ProjectTreeCollapse>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceFilterSelect({
  width,
  value,
  options,
  placeholderMuted,
  searchable,
  searchPlaceholder,
  plain,
  onChange,
}: {
  width: 228 | 112 | 96;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholderMuted?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  plain?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? null;
  const isPlaceholder = Boolean(placeholderMuted && !value);
  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query, searchable]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      setQuery("");
      return;
    }

    const updatePosition = () => {
      const anchor = wrapperRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const minWidth = Math.max(rect.width, searchable ? 228 : 0);
      const menuWidth = measureFilterMenuWidth(filteredOptions.map((option) => option.label), minWidth);
      const maxLeft = window.innerWidth - CREATE_MENU_VIEWPORT_MARGIN - menuWidth;
      const left = Math.max(CREATE_MENU_VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));

      setMenuPosition({
        top: rect.bottom + CREATE_MENU_OFFSET_Y,
        left,
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [filteredOptions, open, searchable]);

  useEffect(() => {
    if (!open || !searchable) return;
    searchInputRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const menu = open && menuPosition ? (
    <div
      ref={menuRef}
      role="listbox"
      style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
      className={`fixed z-50 ${dropdownPanelEnterClass}`}
    >
      <div
        className={`${dropdownPanelEnterBodyClass} flex flex-col rounded-lg bg-white p-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.12)] ${
          searchable ? "max-h-80" : "max-h-64"
        }`}
      >
      {searchable ? (
        <div className="mb-0.5 flex h-8 shrink-0 items-center gap-2 rounded-md bg-[#F5F7F9] px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#777777]" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder ?? "搜索"}
            className="min-w-0 flex-1 bg-transparent text-sm leading-[22px] text-[#181818] outline-none placeholder:text-[#BDBDBD]"
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filteredOptions.length ? (
          filteredOptions.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || "__empty"}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex h-8 min-h-8 w-full shrink-0 items-center overflow-hidden rounded-md px-2 py-0 text-left text-sm leading-[22px] hover:bg-[#F5F5F5] ${
                  active ? "bg-[#F5F5F5] text-[#181818]" : "bg-transparent text-[#181818]"
                }`}
              >
                <span className="truncate">{option.label}</span>
              </button>
            );
          })
        ) : (
          <div className="flex h-8 shrink-0 items-center px-2 text-sm leading-[22px] text-[#777777]">未找到匹配项</div>
        )}
      </div>
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={wrapperRef}
      className={`relative h-8 ${width === 228 ? "w-[228px]" : width === 96 ? "w-[96px]" : "w-[112px]"}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 w-full items-center rounded-md text-left text-sm outline-none ${
          plain
            ? `bg-[#F5F7F9] px-2 pr-7 ${value ? "text-[#181818]" : "text-[#777777]"}`
            : `border border-[#F0F0F0] bg-[#FAFAFA] pl-3 pr-9 ${isPlaceholder ? "text-[#777777]" : "text-[#181818]"}`
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? ""}</span>
      </button>
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B4B4B] transition-transform duration-200 ${
          plain ? "right-2" : "right-3"
        } ${open ? "rotate-180" : ""}`}
      />
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

function GoalNavCard({
  goal,
  active,
  onSelect,
}: {
  goal: Props["data"]["goalNavigationItems"][number];
  active: boolean;
  onSelect: () => void;
}) {
  const compactRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const enableTransition = useRef(false);
  const [bodyHeight, setBodyHeight] = useState<number>();

  useLayoutEffect(() => {
    const nextHeight = active
      ? statsRef.current?.scrollHeight
      : compactRef.current?.scrollHeight;
    if (nextHeight) {
      setBodyHeight(nextHeight);
    }
  }, [active, goal.projectCount, goal.taskCount, goal.title]);

  useLayoutEffect(() => {
    if (bodyHeight != null) {
      enableTransition.current = true;
    }
  }, [bodyHeight]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border bg-white px-3.5 py-3.5 text-left transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        active
          ? "border-[#3069F9] shadow-[0px_6px_16px_0px_rgba(47,107,255,0.12)]"
          : "border-[#E5E6EB] hover:border-[#3069F9]"
      }`}
    >
      <div className="text-sm font-medium text-[#181818]">{goal.title}</div>
      <div
        className={`relative overflow-hidden ${
          enableTransition.current ? "transition-[height] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]" : ""
        }`}
        style={{ height: bodyHeight }}
      >
        <div
          ref={compactRef}
          className={`absolute inset-x-0 top-0 pt-1 text-xs text-[#777777] transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            active ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {goal.projectCount} 项目 · {goal.taskCount} 任务
        </div>
        <div
          ref={statsRef}
          className={`absolute inset-x-0 top-0 flex gap-2 pt-2.5 transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            active ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2px] rounded-[8px] bg-[#FAFAFA] px-2 py-1">
            <div className="text-[14px] font-medium leading-[22px] text-[#181818]">{goal.projectCount}</div>
            <div className="text-xs leading-[18px] text-[#777777]">关联项目</div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2px] rounded-[8px] bg-[#FAFAFA] px-2 py-1">
            <div className="text-[14px] font-medium leading-[22px] text-[#181818]">{goal.taskCount}</div>
            <div className="text-xs leading-[18px] text-[#777777]">项目任务</div>
          </div>
        </div>
      </div>
    </button>
  );
}

function GoalCardGrid({ children }: { children: ReactNode }) {
  const columnCount = useWorkspaceCardColumnCount();
  return (
    <div
      className="grid gap-4 py-4"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function GoalHomeCard({
  goal,
  canEdit,
  onEdit,
  onDelete,
}: {
  goal: Props["data"]["productGoalColumns"][number]["items"][number];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const outcome = goal.expectedOutcome?.trim() || "—";

  return (
    <article className="flex min-h-[225px] flex-col rounded-2xl bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-medium leading-6 text-[#181818]">{goal.title}</h3>
        {canEdit ? (
          <div className="flex h-6 shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[#FAFAFA] hover:bg-[#E8F2FF]"
              aria-label={`编辑${goal.title}`}
            >
              <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
              <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[#FAFAFA] hover:bg-[#FFECE8]"
              aria-label={`删除${goal.title}`}
            >
              <img src="/icons/delete-outlined.png" alt="" width={16} height={16} className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      <span className={`mt-3 inline-flex h-5 w-fit items-center rounded-sm px-2 text-xs leading-[18px] ${goalCardStatusClass[goal.status]}`}>
        {goalCardStatusLabel[goal.status]}
      </span>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0655FE] text-[8px] font-medium leading-[10px] text-white">
            {goal.owner.slice(0, 1)}
          </span>
          <span className="text-xs font-medium leading-[18px] text-[#777777]">{goal.owner}</span>
        </div>
        <div className="flex items-center gap-1">
          <img src="/icons/project-period.png" alt="" width={16} height={16} className="h-4 w-4" />
          <span className="text-xs font-medium leading-[18px] text-[#777777]">{goal.year}</span>
        </div>
      </div>
      <div className="mt-[15px] min-h-0 flex-1">
        <div className="text-sm leading-[22px] text-[#181818]">预期收益</div>
        <p className="mt-1 line-clamp-3 text-sm leading-[22px] text-[#4B4B4B]">{outcome}</p>
      </div>
    </article>
  );
}

function GoalListTable({
  goals,
  canManage,
  onEdit,
  onDelete,
}: {
  goals: Props["data"]["productGoalColumns"][number]["items"][number][];
  canManage: boolean;
  onEdit: (goal: Props["data"]["productGoalColumns"][number]["items"][number]) => void;
  onDelete: (goal: Props["data"]["productGoalColumns"][number]["items"][number]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pingLeft, setPingLeft] = useState(false);
  const [pingRight, setPingRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setPingLeft(el.scrollLeft > 1);
      setPingRight(maxScroll > 1 && el.scrollLeft < maxScroll - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [goals.length]);

  return (
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto rounded-2xl bg-white">
      <div className={`${goalListRowClass} sticky top-0 z-20 h-11 min-w-[1244px] items-center border-b border-[#F0F0F0] bg-white text-sm leading-[22px] text-[#4B4B4B]`}>
        <div className={`sticky left-0 top-0 z-30 flex h-11 items-center overflow-visible border-b border-[#F0F0F0] bg-white pl-4 ${pingLeft ? goalStickyNameShadow : ""}`}>目标</div>
        <div>负责人</div>
        <div>年份</div>
        <div>产品目标描述</div>
        <div>预期收益</div>
        <div>状态</div>
        <div>创建时间</div>
        <div>完成时间</div>
        <div className={`sticky right-0 top-0 z-30 flex h-11 items-center justify-end overflow-visible border-b border-[#F0F0F0] bg-white pr-4 text-right ${pingRight ? goalStickyActionShadow : ""}`}>操作</div>
      </div>
      <div className="min-w-[1244px]">
        {goals.map((goal) => (
          <div key={goal.id} className={`${goalListRowClass} items-start border-b border-[#F2F3F5] bg-white py-3`}>
            <div className={`break-words text-sm font-medium leading-[22px] text-[#181818] ${goalStickyNameClass} ${pingLeft ? goalStickyNameShadow : ""}`}>{goal.title}</div>
            <div className="text-sm leading-[22px] text-[#4B4B4B]">{goal.owner}</div>
            <div className="text-sm leading-[22px] text-[#4B4B4B]">{goal.year}</div>
            <div className="whitespace-pre-wrap break-words text-sm leading-[22px] text-[#4B4B4B]">{goal.description?.trim() || "-"}</div>
            <div className="whitespace-pre-wrap break-words text-sm leading-[22px] text-[#4B4B4B]">{goal.expectedOutcome?.trim() || "-"}</div>
            <div>
              <ListStatusTag label={projectTitleByStatus[goal.status]} className={projectStatusTagClass[goal.status]} />
            </div>
            <div className="text-sm leading-[22px] text-[#4B4B4B]">{formatDateTimeLabel(goal.createdAt)}</div>
            <div className="text-sm leading-[22px] text-[#4B4B4B]">{formatDateTimeLabel(goal.completedAt)}</div>
            <div className={`flex items-center justify-end gap-3 ${goalStickyActionClass} ${pingRight ? goalStickyActionShadow : ""}`}>
              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(goal)}
                    className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
                    aria-label={`编辑${goal.title}`}
                  >
                    <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
                    <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(goal)}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#FFECE8]"
                    aria-label={`删除${goal.title}`}
                  >
                    <img src="/icons/delete-outlined.png" alt="" width={16} height={16} className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueListTable({
  projects,
  canManage,
  canCreateTrack,
  onEdit,
  onCreateTrack,
}: {
  projects: ProjectWorkspaceItem[];
  canManage: boolean;
  canCreateTrack: boolean;
  onEdit: (project: ProjectWorkspaceItem) => void;
  onCreateTrack: (project: ProjectWorkspaceItem) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pingLeft, setPingLeft] = useState(false);
  const [pingRight, setPingRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setPingLeft(el.scrollLeft > 1);
      setPingRight(maxScroll > 1 && el.scrollLeft < maxScroll - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [projects.length]);

  return (
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto rounded-2xl bg-white">
      <div className={`${valueListRowClass} sticky top-0 z-20 h-11 min-w-[1360px] items-center border-b border-[#F0F0F0] bg-white text-sm leading-[22px] text-[#4B4B4B]`}>
        <div className={`sticky left-0 top-0 z-30 flex h-11 items-center overflow-visible border-b border-[#F0F0F0] bg-white pl-4 ${pingLeft ? goalStickyNameShadow : ""}`}>项目名称</div>
        <div>负责人</div>
        <div>工作量(人天)</div>
        <div>其他成本</div>
        <div>预期收益</div>
        <div>实际收益</div>
        <div>跟踪状态</div>
        <div>价值判断</div>
        <div>项目状态</div>
        <div>上线时间</div>
        <div className={`sticky right-0 top-0 z-30 flex h-11 items-center justify-end overflow-visible border-b border-[#F0F0F0] bg-white pr-4 text-right ${pingRight ? goalStickyActionShadow : ""}`}>操作</div>
      </div>
      <div className="min-w-[1360px]">
        {projects.map((project) => {
          const judgement = project.valueTrackSummary.judgement;
          const judgementClass = valueJudgementTagClass(judgement);
          return (
            <div key={project.id} className={`${valueListRowClass} items-center border-b border-[#F2F3F5] bg-white py-3`}>
              <div className={`break-words text-sm font-medium leading-[22px] text-[#181818] ${goalStickyNameClass} ${pingLeft ? goalStickyNameShadow : ""}`}>{project.title}</div>
              <div className="text-sm leading-[22px] text-[#4B4B4B]">{project.owner}</div>
              <div className="text-right text-sm leading-[22px] text-[#4B4B4B]">{project.workloadPersonDay ?? "-"}</div>
              <div className="whitespace-pre-wrap break-words text-sm leading-[22px] text-[#4B4B4B]">{emptyMetricText(project.otherCost)}</div>
              <div className="whitespace-pre-wrap break-words text-sm leading-[22px] text-[#4B4B4B]">{emptyMetricText(project.expectedOutcome)}</div>
              <div className="whitespace-pre-wrap break-words text-sm leading-[22px] text-[#4B4B4B]">{emptyMetricText(project.valueTrackSummary.actualValue)}</div>
              <div>
                <ListStatusTag label={project.valueTrackSummary.status} className={valueTrackListStatusTagClass(project.valueTrackSummary.status)} />
              </div>
              <div>
                {judgementClass ? (
                  <ListStatusTag label={valueJudgementLabel(judgement)} className={judgementClass} />
                ) : (
                  <span className="text-sm leading-[22px] text-[#4B4B4B]">-</span>
                )}
              </div>
              <div>
                <ListStatusTag label={projectTitleByStatus[project.status]} className={projectStatusTagClass[project.status]} />
              </div>
              <div className="text-sm leading-[22px] text-[#4B4B4B]">{formatDateTimeLabel(project.launchedAt)}</div>
              <div className={`flex items-center justify-end gap-3 ${goalStickyActionClass} ${pingRight ? goalStickyActionShadow : ""}`}>
                {canCreateTrack ? (
                  <button
                    type="button"
                    onClick={() => onCreateTrack(project)}
                    className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
                    aria-label={`新增跟踪${project.title}`}
                  >
                    <img src="/icons/plus-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
                    <img src="/icons/plus-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => onEdit(project)}
                    className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
                    aria-label={`编辑${project.title}`}
                  >
                    <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
                    <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskListTable({
  tasks,
  canManage,
  onEdit,
  onDelete,
}: {
  tasks: ProjectWorkspaceTaskItem[];
  canManage: boolean;
  onEdit: (task: ProjectWorkspaceTaskItem) => void;
  onDelete: (task: ProjectWorkspaceTaskItem) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pingLeft, setPingLeft] = useState(false);
  const [pingRight, setPingRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setPingLeft(el.scrollLeft > 1);
      setPingRight(maxScroll > 1 && el.scrollLeft < maxScroll - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [tasks.length]);

  return (
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto rounded-2xl bg-white">
      <div className={`${taskListRowClass} sticky top-0 z-20 h-11 min-w-[1304px] items-center border-b border-[#F0F0F0] bg-white text-sm leading-[22px] text-[#4B4B4B]`}>
        <div className={`sticky left-0 top-0 z-30 flex h-11 items-center overflow-visible border-b border-[#F0F0F0] bg-white pl-4 ${pingLeft ? goalStickyNameShadow : ""}`}>名称</div>
        <div>所属项目</div>
        <div>任务目标</div>
        <div>负责人</div>
        <div className="whitespace-nowrap text-right">工作量(人天)</div>
        <div>任务状态</div>
        <div>任务结果</div>
        <div>周期</div>
        <div>完成时间</div>
        <div className={`sticky right-0 top-0 z-30 flex h-11 items-center justify-end overflow-visible border-b border-[#F0F0F0] bg-white pr-4 text-right ${pingRight ? goalStickyActionShadow : ""}`}>操作</div>
      </div>
      <div className="min-w-[1304px]">
        {tasks.map((task) => {
          const remain = task.remainingWeeksLabel;
          const remainOverdue = Boolean(remain?.startsWith("逾期"));
          return (
            <div key={task.id} className={`${taskListRowClass} items-start border-b border-[#F2F3F5] bg-white py-3`}>
              <div className={`break-words text-sm font-medium leading-[22px] text-[#181818] ${goalStickyNameClass} ${pingLeft ? goalStickyNameShadow : ""}`}>{task.title}</div>
              <div className="min-w-0">
                {task.projectTitle ? (
                  <span className="rounded bg-[#F5F5F5] px-2 py-[3px] text-xs leading-[18px] text-[#181818]">{task.projectTitle}</span>
                ) : (
                  <span className="text-sm leading-[22px] text-[#4B4B4B]">-</span>
                )}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-[22px] text-[#4B4B4B]">{emptyMetricText(task.expectedOutcome || task.description)}</div>
              <div className="text-sm leading-[22px] text-[#4B4B4B]">{task.owner}</div>
              <div className="text-right text-sm leading-[22px] text-[#4B4B4B]">{task.workloadPersonDay ?? "-"}</div>
              <div>
                <ListStatusTag label={columnTitleByStatus[task.status]} className={taskListStatusTagClass(task)} />
              </div>
              <div className="text-sm leading-[22px] text-[#4B4B4B]">{emptyMetricText(task.taskResult)}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm leading-[22px] text-[#4B4B4B]">
                <span>{task.periodLabel || formatMonthRange(task.startMonth, task.endMonth)}</span>
                {remain ? (
                  <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs leading-[18px] ${remainOverdue ? "bg-[#FFECE8] text-[#F53F3F]" : "bg-[#FFF7E8] text-[#FF7D00]"}`}>
                    {remain}
                  </span>
                ) : null}
              </div>
              <div className="text-sm leading-[22px] text-[#4B4B4B]">{formatDateTimeLabel(task.completedAt)}</div>
              <div className={`flex items-center justify-end gap-3 ${goalStickyActionClass} ${pingRight ? goalStickyActionShadow : ""}`}>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(task)}
                      className="group flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#E8F2FF]"
                      aria-label={`编辑${task.title}`}
                    >
                      <img src="/icons/edit-outlined.png" alt="" width={16} height={16} className="h-4 w-4 group-hover:hidden" />
                      <img src="/icons/edit-outlined-blue.png" alt="" width={16} height={16} className="hidden h-4 w-4 group-hover:block" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(task)}
                      className="flex h-[26px] w-[26px] items-center justify-center rounded hover:bg-[#FFECE8]"
                      aria-label={`删除${task.title}`}
                    >
                      <img src="/icons/delete-outlined.png" alt="" width={16} height={16} className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceStatusTabs({
  value,
  onChange,
  items = workspaceStatusTabs,
}: {
  value: string;
  onChange: (status: string) => void;
  items?: ReadonlyArray<{ key: string; label: string }>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState(value);
  const [slider, setSlider] = useState({ left: 0, width: 0 });
  const [enableTransition, setEnableTransition] = useState(false);

  useEffect(() => {
    setActiveKey(value);
  }, [value]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const updateSlider = () => {
      const index = items.findIndex((tab) => tab.key === activeKey);
      const tab = list.querySelectorAll("button")[index];
      if (!(tab instanceof HTMLElement)) return;
      setSlider({ left: tab.offsetLeft, width: tab.offsetWidth });
    };

    updateSlider();
    const frame = window.requestAnimationFrame(() => setEnableTransition(true));
    const observer = new ResizeObserver(updateSlider);
    observer.observe(list);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeKey, items]);

  return (
    <div ref={listRef} className="relative flex h-full items-center gap-6">
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-0 h-0.5 bg-[#3069F9] ${
          enableTransition ? "transition-[left,width] duration-200 ease-in-out" : ""
        }`}
        style={{ left: slider.left, width: slider.width }}
      />
      {items.map((tabItem) => {
        const active = activeKey === tabItem.key;
        return (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => {
              setActiveKey(tabItem.key);
              onChange(tabItem.key);
            }}
            className={`relative flex h-full items-center text-sm transition-colors duration-200 ${
              active ? "font-medium text-[#3069F9]" : "text-[#181818]"
            }`}
          >
            {tabItem.label}
          </button>
        );
      })}
    </div>
  );
}

function QuarterlyWorkShell({
  data,
  canCreateGoal,
  canCreateProject,
  canCreateTask,
  canCreateValueTrack,
  canManageProjectAndValueTracking,
  canManageProductTask,
  onUpdateFilters,
  onCreateGoal,
  onCreateProject,
  onCreateTask,
  onCreateValueTrack,
  onEditGoal,
  onDeleteGoal,
  onEditProject,
  onDeleteProject,
  onEditTask,
  onDeleteTask,
  onEditValueTrack,
  onDeleteValueTrack,
  onEditValueOverview,
  onOpenOperationLogs,
}: {
  data: Props["data"];
  canCreateGoal: boolean;
  canCreateProject: boolean;
  canCreateTask: boolean;
  canCreateValueTrack: boolean;
  canManageProjectAndValueTracking: boolean;
  canManageProductTask: boolean;
  onUpdateFilters: (updates: Record<string, string | number | null>) => void;
  onCreateGoal: () => void;
  onCreateProject: (status: ProjectStatus) => void;
  onCreateTask: (projectId?: string) => void;
  onCreateValueTrack: (projectId?: string) => void;
  onEditGoal: (item: Props["data"]["productGoalColumns"][number]["items"][number]) => void;
  onDeleteGoal: (item: Props["data"]["productGoalColumns"][number]["items"][number]) => void;
  onEditProject: (item: ProjectWorkspaceItem) => void;
  onDeleteProject: (item: ProjectWorkspaceItem) => void;
  onEditTask: (item: ProjectWorkspaceTaskItem) => void;
  onDeleteTask: (item: ProjectWorkspaceTaskItem) => void;
  onEditValueTrack: (item: ProjectWorkspaceValueTrackItem) => void;
  onDeleteValueTrack: (item: ProjectWorkspaceValueTrackItem) => void;
  onEditValueOverview: (item: ProjectWorkspaceItem) => void;
  onOpenOperationLogs: () => void;
}) {
  const activeGoalId = data.workspaceFilters.goalId ?? "all";
  const [expandedGoalId, setExpandedGoalId] = useState(activeGoalId);
  const [entityTab, setEntityTab] = useState<WorkspaceEntityTab>("project");
  const [goalStatusFilter, setGoalStatusFilter] = useState<GoalStatusFilter>("all");
  const activeView = data.workspaceFilters.view === "list" ? "list" : "card";
  const [viewMode, setViewMode] = useState<"card" | "list">(activeView);
  const activeProjectPanel = data.workspaceFilters.projectPanel;
  const activeStatus = data.workspaceFilters.status ?? "all";
  const isGoalHome = entityTab === "goal";
  const isProjectHome = entityTab === "project";
  const isTaskHome = entityTab === "task";
  const isValueHome = entityTab === "value";
  const bleedCardList = (isGoalHome || isTaskHome) && activeView === "card";
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("all");
  const [needsDevOnly, setNeedsDevOnly] = useState(false);
  const [valueStatusFilter, setValueStatusFilter] = useState<ValueStatusFilter>("all");
  const [valueJudgementFilter, setValueJudgementFilter] = useState("");
  const projectStatusCounts = data.workspaceSummary.projectStatusCounts;
  const activeProjectId = data.workspaceFilters.projectId ?? "";
  const selectedDepartmentId = data.workspaceFilters.orgNodeId ?? null;
  const secondLevelTeamOptions = useMemo(
    () => data.teamOptions.filter((team) => !selectedDepartmentId || team.departmentOrgNodeId === selectedDepartmentId),
    [data.teamOptions, selectedDepartmentId],
  );
  const secondLevelTeamValue = data.workspaceFilters.teamId && data.workspaceFilters.teamId !== "all"
    ? data.workspaceFilters.teamId
    : "";
  // 部门/业务组/负责人联动：负责人选项随部门与业务组收缩
  const scopedMemberOptions = useMemo(
    () => data.memberOptions.filter((member) =>
      (!selectedDepartmentId || member.departmentOrgNodeId === selectedDepartmentId)
      && (!secondLevelTeamValue || member.teamOrgNodeId === secondLevelTeamValue),
    ),
    [data.memberOptions, selectedDepartmentId, secondLevelTeamValue],
  );
  // 失效的筛选值（如不存在的 ID、跨部门的业务组/负责人）自动回收，避免叠加后查无数据
  const lastFilterResetRef = useRef("");
  useEffect(() => {
    let reset: Record<string, string | null> | null = null;
    if (selectedDepartmentId && !data.departments.some((department) => department.id === selectedDepartmentId)) {
      reset = { orgNodeId: null, teamId: "all", ownerId: "all" };
    } else if (secondLevelTeamValue && !secondLevelTeamOptions.some((team) => team.id === secondLevelTeamValue)) {
      reset = { teamId: "all", ownerId: "all" };
    } else if (data.workspaceFilters.ownerId && !scopedMemberOptions.some((member) => member.id === data.workspaceFilters.ownerId)) {
      reset = { ownerId: "all" };
    }
    if (!reset) {
      lastFilterResetRef.current = "";
      return;
    }
    const resetKey = JSON.stringify(reset);
    if (lastFilterResetRef.current === resetKey) return;
    lastFilterResetRef.current = resetKey;
    onUpdateFilters(reset);
  }, [selectedDepartmentId, secondLevelTeamValue, secondLevelTeamOptions, scopedMemberOptions, data.departments, data.workspaceFilters.ownerId, onUpdateFilters]);
  const taskItems = data.taskWorkspaceItems;
  const scopedTaskItems = useMemo(
    () => (needsDevOnly ? taskItems.filter((task) => task.needsDevelopment === true) : taskItems),
    [taskItems, needsDevOnly],
  );
  const taskCounts = useMemo(() => {
    const counts: Record<TaskStatusFilter, number> = {
      all: scopedTaskItems.length,
      IN_PROGRESS: 0,
      DELAYED: 0,
      NOT_STARTED: 0,
      COMPLETED: 0,
      CLOSED: 0,
    };
    for (const task of scopedTaskItems) {
      for (const { key } of taskStatusFilters) {
        if (key !== "all" && taskMatchesStatusFilter(task, key)) counts[key] += 1;
      }
    }
    return counts;
  }, [scopedTaskItems]);
  const visibleTasks = useMemo(
    () => scopedTaskItems.filter((task) => taskMatchesStatusFilter(task, taskStatusFilter)),
    [scopedTaskItems, taskStatusFilter],
  );
  const projectFilterOptions = useMemo(() => {
    const titles = new Map<string, string>();
    for (const project of data.projectOptions) {
      titles.set(project.id, project.title);
    }
    for (const project of data.projectWorkspaceItems) {
      titles.set(project.id, project.title);
    }
    for (const task of data.taskWorkspaceItems) {
      titles.set(task.projectId, task.projectTitle);
    }
    return [
      { value: "", label: "全部项目" },
      ...[...titles.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [data.projectOptions, data.projectWorkspaceItems, data.taskWorkspaceItems]);
  const valueCounts = useMemo(() => {
    const scoped = data.projectWorkspaceItems.filter(
      (project) => !valueJudgementFilter || project.valueTrackSummary.judgement === valueJudgementFilter,
    );
    const counts: Record<ValueStatusFilter, number> = {
      all: scoped.length,
      观测中: 0,
      未观测: 0,
      已完成: 0,
    };
    for (const project of scoped) {
      const status = project.valueTrackSummary.status;
      if (status in counts) {
        counts[status as Exclude<ValueStatusFilter, "all">] += 1;
      }
    }
    return counts;
  }, [data.projectWorkspaceItems, valueJudgementFilter]);
  const visibleValueProjects = useMemo(
    () =>
      data.projectWorkspaceItems.filter((project) => {
        if (valueStatusFilter !== "all" && project.valueTrackSummary.status !== valueStatusFilter) return false;
        if (valueJudgementFilter && project.valueTrackSummary.judgement !== valueJudgementFilter) return false;
        return true;
      }),
    [data.projectWorkspaceItems, valueJudgementFilter, valueStatusFilter],
  );
  const goalItems = useMemo(
    () => data.productGoalColumns.flatMap((column) => column.items),
    [data.productGoalColumns],
  );
  const goalCounts = useMemo(() => {
    const counts: Record<GoalStatusFilter, number> = {
      all: goalItems.length,
      IN_PROGRESS: 0,
      NOT_STARTED: 0,
      COMPLETED: 0,
      CLOSED: 0,
    };
    for (const goal of goalItems) {
      if (goal.status in counts) {
        counts[goal.status as Exclude<GoalStatusFilter, "all">] += 1;
      }
    }
    return counts;
  }, [goalItems]);
  const visibleGoals = useMemo(() => {
    const query = data.workspaceFilters.query?.trim().toLowerCase() ?? "";
    const ownerId = data.workspaceFilters.ownerId;
    const teamId = data.workspaceFilters.teamId && data.workspaceFilters.teamId !== "all" ? data.workspaceFilters.teamId : null;
    const orgNodeId = data.workspaceFilters.orgNodeId ?? null;
    return goalItems.filter((goal) => {
      if (goalStatusFilter !== "all" && goal.status !== goalStatusFilter) return false;
      if (orgNodeId && goal.departmentOrgNodeId !== orgNodeId && goal.teamOrgNodeId !== orgNodeId) return false;
      if (teamId && goal.teamOrgNodeId !== teamId) return false;
      if (ownerId && goal.ownerId !== ownerId) return false;
      if (!query) return true;
      return goal.title.toLowerCase().includes(query)
        || (goal.expectedOutcome ?? "").toLowerCase().includes(query)
        || (goal.description ?? "").toLowerCase().includes(query);
    });
  }, [data.workspaceFilters.ownerId, data.workspaceFilters.query, data.workspaceFilters.teamId, data.workspaceFilters.orgNodeId, goalItems, goalStatusFilter]);

  useEffect(() => {
    setExpandedGoalId(activeGoalId);
  }, [activeGoalId]);
  useEffect(() => {
    setViewMode(activeView);
  }, [activeView]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(data.projectWorkspaceItems[0]?.id ?? null);
  const normalizedExpandedProjectId = data.projectWorkspaceItems.some((project) => project.id === expandedProjectId)
    ? expandedProjectId
    : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (isGoalHome) {
        if (canCreateGoal) onCreateGoal();
        return;
      }
      if (isTaskHome) {
        if (canCreateTask) onCreateTask(activeProjectId || undefined);
        return;
      }
      if (isValueHome) return;
      if (canCreateProject) onCreateProject("NOT_STARTED");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeProjectId, canCreateGoal, canCreateProject, canCreateTask, isGoalHome, isTaskHome, isValueHome, onCreateGoal, onCreateProject, onCreateTask]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F5F7F9]">
      <header className="shrink-0 bg-white px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-[36px] tracking-tight text-[#181818]">产品管理</h1>
            <p className="mt-2 text-sm leading-[22px] text-[#777777]">以产品目标为核心管理年度目标、关联项目、项目任务与上线后价值跟踪，每周更新进展，延期自动预警。</p>
          </div>
          <Button variant="ghost" size="sm" className="h-6 shrink-0 rounded px-2 text-sm text-[#181818]" onClick={onOpenOperationLogs}>
            <img src="/icons/operation-log.png" alt="" width={14} height={14} className="h-3.5 w-3.5" />
            操作日志
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
          {data.isSystemAdmin ? (
            <WorkspaceFilterSelect
              width={228}
              searchable
              searchPlaceholder="搜索部门"
              value={data.workspaceFilters.orgNodeId ?? ""}
              onChange={(value) => onUpdateFilters({ orgNodeId: value || null, teamId: "all" })}
              options={[
                { value: "", label: "全部部门" },
                ...data.departments.map((department) => ({ value: department.id, label: department.name })),
              ]}
            />
          ) : null}
          <WorkspaceFilterSelect
            width={228}
            searchable
            searchPlaceholder="搜索业务组"
            value={secondLevelTeamValue}
            onChange={(value) => onUpdateFilters({ teamId: value || "all" })}
            options={[
              { value: "", label: "全部业务组" },
              ...secondLevelTeamOptions.map((team) => ({ value: team.id, label: team.name })),
            ]}
          />
          <WorkspaceFilterSelect
            width={112}
            value={String(data.year)}
            onChange={(value) => onUpdateFilters({ year: value })}
            options={data.availableYears.map((year) => ({ value: String(year), label: String(year) }))}
          />
          <WorkspaceFilterSelect
            width={112}
            value={String(data.quarter)}
            onChange={(value) => onUpdateFilters({ quarter: value })}
            options={[
              { value: "all", label: "全年" },
              ...data.availableQuarters.map((quarter) => ({ value: String(quarter), label: `Q${quarter}` })),
            ]}
          />
          <WorkspaceFilterSelect
            width={112}
            placeholderMuted
            searchable
            searchPlaceholder="搜索负责人"
            value={data.workspaceFilters.ownerId ?? ""}
            onChange={(value) => onUpdateFilters({ ownerId: value || "all" })}
            options={[
              { value: "", label: "负责人" },
              ...scopedMemberOptions.map((member) => ({
                value: member.id,
                label: member.name,
              })),
            ]}
          />
        </div>

        <div className="mt-2 flex h-12 items-center justify-between gap-6">
          <WorkspaceStatusTabs
            value={entityTab}
            items={workspaceEntityTabs}
            onChange={(value) => {
              const nextTab = value as WorkspaceEntityTab;
              setEntityTab(nextTab);
              if (nextTab === "task") {
                setTaskStatusFilter("all");
                setNeedsDevOnly(false);
                if (activeStatus !== "all") onUpdateFilters({ status: null });
              }
              if (nextTab === "value") {
                setValueStatusFilter("all");
                setValueJudgementFilter("");
                if (activeStatus !== "all") onUpdateFilters({ status: null });
              }
            }}
          />
          <div className="flex items-center gap-6">
            {isGoalHome || isProjectHome || isTaskHome || isValueHome ? null : (
              <WorkspaceStatusTabs
                value={activeStatus}
                onChange={(status) => onUpdateFilters({ status: status === "all" ? null : status })}
              />
            )}
            <div className="relative inline-grid h-8 grid-cols-2 rounded-[6px] bg-[#F5F5F5] p-1">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 left-1 h-6 w-[calc(50%-4px)] rounded bg-white transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{ transform: viewMode === "list" ? "translateX(100%)" : "translateX(0)" }}
              />
              {[
                { key: "card" as const, label: "卡片" },
                { key: "list" as const, label: "列表" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setViewMode(item.key);
                    onUpdateFilters({ view: item.key === "card" ? null : item.key });
                  }}
                  className={`relative z-10 px-4 text-sm leading-6 transition-colors duration-200 ${
                    viewMode === item.key ? "text-[#3069F9]" : "text-[#181818] hover:text-[#3069F9]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 grid-cols-[228px_minmax(0,1fr)] gap-4 overflow-hidden px-4 ${(isProjectHome || isValueHome) && activeView === "card" ? "pr-0" : ""} ${bleedCardList ? "" : "py-4"}`}>
        <aside className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white ${bleedCardList ? "my-4" : ""}`}>
          <div className="shrink-0 px-4 pb-3 pt-5">
            <h2 className="text-sm font-medium leading-[22px] text-[rgba(0,0,0,0.85)]">
              {isTaskHome ? "任务" : isProjectHome ? "项目" : isValueHome ? "价值跟踪" : "目标"}
            </h2>
            <form
              className="mt-2 flex h-8 shrink-0 items-center gap-2 rounded-md bg-[#F5F7F9] px-2 text-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                onUpdateFilters({ q: String(formData.get("q") ?? "") || null });
              }}
            >
              <Search className="h-4 w-4 text-[#777777]" />
              <input
                name="q"
                defaultValue={data.workspaceFilters.query}
                placeholder="搜索目标、项目、任务"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#BDBDBD]"
              />
            </form>
            {isProjectHome ? (
              <div className="mt-2">
                <WorkspaceFilterSelect
                  width={96}
                  plain
                  value={activeGoalId === "all" ? "" : activeGoalId}
                  onChange={(value) => {
                    setExpandedGoalId(value || "all");
                    onUpdateFilters({ goalId: value || null });
                  }}
                  options={data.goalNavigationItems.map((goal) => ({
                    value: goal.isAll ? "" : goal.id,
                    label: goal.isAll ? "全部目标" : goal.title,
                  }))}
                />
              </div>
            ) : isTaskHome ? (
              <div className="mt-2 flex items-center gap-2">
                <WorkspaceFilterSelect
                  width={96}
                  plain
                  searchable
                  searchPlaceholder="搜索项目"
                  value={activeProjectId}
                  onChange={(value) => onUpdateFilters({ projectId: value || null })}
                  options={projectFilterOptions}
                />
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={needsDevOnly}
                  onClick={() => setNeedsDevOnly((current) => !current)}
                  className="group inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs text-[#4B4B4B]"
                >
                  {needsDevOnly ? (
                    <img src="/icons/radio-checked.png" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                  ) : (
                    <>
                      <img src="/icons/radio-default.png" alt="" width={14} height={14} className="h-3.5 w-3.5 group-hover:hidden" />
                      <img src="/icons/radio-hover.png" alt="" width={14} height={14} className="hidden h-3.5 w-3.5 group-hover:block" />
                    </>
                  )}
                  仅看需开发
                </button>
              </div>
            ) : isValueHome ? (
              <div className="mt-2 flex gap-2">
                <WorkspaceFilterSelect
                  width={96}
                  plain
                  searchable
                  searchPlaceholder="搜索项目"
                  value={activeProjectId}
                  onChange={(value) => onUpdateFilters({ projectId: value || null })}
                  options={projectFilterOptions}
                />
                <WorkspaceFilterSelect
                  width={96}
                  plain
                  placeholderMuted
                  value={valueJudgementFilter}
                  onChange={setValueJudgementFilter}
                  options={valueJudgementFilterOptions}
                />
              </div>
            ) : null}
            {isGoalHome ? (
              canCreateGoal ? (
                <button
                  type="button"
                  onClick={onCreateGoal}
                  className="mt-8 flex h-10 w-full shrink-0 items-center justify-between rounded-lg border border-[#D9D9D9] bg-white px-2.5 shadow-[0px_2px_4px_0px_rgba(48,105,249,0.04)] hover:bg-[#FAFAFA]"
                >
                  <span className="inline-flex items-center gap-2">
                    <img src="/icons/add-project.png" alt="" width={16} height={16} className="h-4 w-4" />
                    <span className="text-sm text-[rgba(0,0,0,0.85)]">新建目标</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="flex h-5 w-5 items-center justify-center rounded bg-[#F5F6F7] text-[11px] text-black/25">⌘</kbd>
                    <kbd className="flex h-5 w-5 items-center justify-center rounded bg-[#F5F6F7] text-[11px] text-black/25">K</kbd>
                  </span>
                </button>
              ) : null
            ) : isTaskHome ? (
              canCreateTask ? (
                <button
                  type="button"
                  onClick={() => onCreateTask(activeProjectId || undefined)}
                  className="mt-6 flex h-10 w-full shrink-0 items-center justify-between rounded-lg border border-[#D9D9D9] bg-white px-2.5 shadow-[0px_2px_4px_0px_rgba(48,105,249,0.04)] hover:bg-[#FAFAFA]"
                >
                  <span className="inline-flex items-center gap-2">
                    <img src="/icons/add-project.png" alt="" width={16} height={16} className="h-4 w-4" />
                    <span className="text-sm text-[rgba(0,0,0,0.85)]">新建任务</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="flex h-5 w-5 items-center justify-center rounded bg-[#F5F6F7] text-[11px] text-black/25">⌘</kbd>
                    <kbd className="flex h-5 w-5 items-center justify-center rounded bg-[#F5F6F7] text-[11px] text-black/25">K</kbd>
                  </span>
                </button>
              ) : null
            ) : isValueHome ? null : canCreateProject ? (
              <button
                type="button"
                onClick={() => onCreateProject("NOT_STARTED")}
                className={`${isProjectHome ? "mt-6" : "mt-8"} flex h-10 w-full shrink-0 items-center justify-between rounded-lg border border-[#D9D9D9] bg-white px-2.5 shadow-[0px_2px_4px_0px_rgba(48,105,249,0.04)] hover:bg-[#FAFAFA]`}
              >
                <span className="inline-flex items-center gap-2">
                  <img src="/icons/add-project.png" alt="" width={16} height={16} className="h-4 w-4" />
                  <span className="text-sm text-[rgba(0,0,0,0.85)]">新建项目</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="flex h-5 w-5 items-center justify-center rounded bg-[#F5F6F7] text-[11px] text-black/25">⌘</kbd>
                  <kbd className="flex h-5 w-5 items-center justify-center rounded bg-[#F5F6F7] text-[11px] text-black/25">K</kbd>
                </span>
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-4 pt-0">
            {isGoalHome ? (
              goalStatusFilters.map((item) => {
                const active = goalStatusFilter === item.key;
                const count = goalCounts[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setGoalStatusFilter(item.key)}
                    className={`flex h-[46px] w-full items-center rounded-xl border px-3 text-left text-sm transition ${
                      active
                        ? "border-[#0655FE] bg-white font-medium text-[#3069F9] shadow-[0px_6px_16px_0px_rgba(47,107,255,0.12)]"
                        : "border-[#E5E6EB] bg-white font-normal text-[#181818] hover:border-[#3069F9]"
                    }`}
                  >
                    {item.label}（{count}）
                  </button>
                );
              })
            ) : isProjectHome ? (
              projectStatusFilters.map((item) => {
                const active = activeStatus === item.key;
                const count = projectStatusCounts[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onUpdateFilters({ status: item.key === "all" ? null : item.key })}
                    className={`flex h-[46px] w-full items-center rounded-xl border px-3 text-left text-sm transition ${
                      active
                        ? "border-[#0655FE] bg-white font-medium text-[#3069F9] shadow-[0px_6px_16px_0px_rgba(47,107,255,0.12)]"
                        : "border-[#E5E6EB] bg-white font-normal text-[#181818] hover:border-[#3069F9]"
                    }`}
                  >
                    {item.label}（{count}）
                  </button>
                );
              })
            ) : isTaskHome ? (
              taskStatusFilters.map((item) => {
                const active = taskStatusFilter === item.key;
                const count = taskCounts[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTaskStatusFilter(item.key)}
                    className={`flex h-[46px] w-full items-center rounded-xl border px-3 text-left text-sm transition ${
                      active
                        ? "border-[#0655FE] bg-white font-medium text-[#3069F9] shadow-[0px_6px_16px_0px_rgba(47,107,255,0.12)]"
                        : "border-[#E5E6EB] bg-white font-normal text-[#181818] hover:border-[#3069F9]"
                    }`}
                  >
                    {item.label}（{count}）
                  </button>
                );
              })
            ) : isValueHome ? (
              valueStatusFilters.map((item) => {
                const active = valueStatusFilter === item.key;
                const count = valueCounts[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setValueStatusFilter(item.key)}
                    className={`flex h-[46px] w-full items-center rounded-xl border px-3 text-left text-sm transition ${
                      active
                        ? "border-[#0655FE] bg-white font-medium text-[#3069F9] shadow-[0px_6px_16px_0px_rgba(47,107,255,0.12)]"
                        : "border-[#E5E6EB] bg-white font-normal text-[#181818] hover:border-[#3069F9]"
                    }`}
                  >
                    {item.label}（{count}）
                  </button>
                );
              })
            ) : (
              data.goalNavigationItems.map((goal) => (
                <GoalNavCard
                  key={goal.id}
                  goal={goal}
                  active={expandedGoalId === goal.id}
                  onSelect={() => {
                    setExpandedGoalId(goal.id);
                    onUpdateFilters({ goalId: goal.isAll ? null : goal.id });
                  }}
                />
              ))
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col overflow-hidden">
          {isGoalHome ? (
            visibleGoals.length ? (
              activeView === "card" ? (
              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <GoalCardGrid>
                  {visibleGoals.map((goal) => (
                    <GoalHomeCard
                      key={goal.id}
                      goal={goal}
                      canEdit={canCreateGoal}
                      onEdit={() => onEditGoal(goal)}
                      onDelete={() => onDeleteGoal(goal)}
                    />
                  ))}
                </GoalCardGrid>
              </div>
              ) : (
                <GoalListTable
                  goals={visibleGoals}
                  canManage={canCreateGoal}
                  onEdit={onEditGoal}
                  onDelete={onDeleteGoal}
                />
              )
            ) : (
              <div className={`${bleedCardList ? "my-4" : ""} flex h-full min-h-0 flex-col rounded-2xl bg-white`}>
                <EmptyProjectSection
                  title="暂无目标"
                  description="调整筛选条件，或新建目标开始规划。"
                  buttonLabel="新建目标"
                  canCreate={canCreateGoal}
                  onCreate={onCreateGoal}
                />
              </div>
            )
          ) : isTaskHome ? (
            visibleTasks.length ? (
              activeView === "card" ? (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <div className="py-4">
                    <TaskMasonryGrid
                      tasks={visibleTasks}
                      canEdit={canManageProductTask}
                      onEditTask={onEditTask}
                      onDeleteTask={onDeleteTask}
                    />
                  </div>
                </div>
              ) : (
                <TaskListTable
                  tasks={visibleTasks}
                  canManage={canManageProductTask}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                />
              )
            ) : (
              <div className={`${bleedCardList ? "my-4" : ""} flex h-full min-h-0 flex-col rounded-2xl bg-white`}>
                <EmptyProjectSection
                  title="暂无任务"
                  description="调整筛选条件，或新建任务开始规划。"
                  buttonLabel="新建任务"
                  canCreate={canCreateTask}
                  onCreate={() => onCreateTask(activeProjectId || undefined)}
                />
              </div>
            )
          ) : isValueHome ? (
            visibleValueProjects.length ? (
              activeView === "card" ? (
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex h-full w-max items-stretch gap-4">
                    {visibleValueProjects.map((project) => (
                      <ValueHomeCard
                        key={project.id}
                        project={project}
                        canCreateValueTrack={canCreateValueTrack}
                        canManageProjectAndValueTracking={canManageProjectAndValueTracking}
                        onCreateValueTrack={() => onCreateValueTrack(project.id)}
                        onEditValueTrack={onEditValueTrack}
                        onDeleteValueTrack={onDeleteValueTrack}
                        onEditValueOverview={() => onEditValueOverview(project)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <ValueListTable
                  projects={visibleValueProjects}
                  canManage={canManageProjectAndValueTracking}
                  canCreateTrack={canCreateValueTrack}
                  onEdit={onEditValueOverview}
                  onCreateTrack={(project) => onCreateValueTrack(project.id)}
                />
              )
            ) : (
              <div className="flex h-full min-h-0 flex-col rounded-2xl bg-white">
                <EmptyProjectSection
                  title="暂无价值跟踪"
                  description="调整筛选条件，或在项目上记录跟踪过程。"
                  buttonLabel="新建价值跟踪"
                  canCreate={canCreateValueTrack}
                  onCreate={() => onCreateValueTrack(activeProjectId || undefined)}
                />
              </div>
            )
          ) : data.projectWorkspaceItems.length ? (
            activeView === "card" ? (
              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full w-max items-stretch gap-4">
                {data.projectWorkspaceItems.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    canCreateTask={canCreateTask}
                    canCreateValueTrack={canCreateValueTrack}
                    canManageProjectAndValueTracking={canManageProjectAndValueTracking}
                    canManageProductTask={canManageProductTask}
                    onCreateTask={() => onCreateTask(project.id)}
                    onCreateValueTrack={() => onCreateValueTrack(project.id)}
                    onEditProject={() => onEditProject(project)}
                    onDeleteProject={() => onDeleteProject(project)}
                    onEditTask={onEditTask}
                    onDeleteTask={onDeleteTask}
                    onEditValueTrack={onEditValueTrack}
                    onDeleteValueTrack={onDeleteValueTrack}
                    onEditValueOverview={() => onEditValueOverview(project)}
                  />
                ))}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1">
              <ProjectTreeTable
                projects={data.projectWorkspaceItems}
                expandedProjectId={normalizedExpandedProjectId}
                activePanel={activeProjectPanel}
                canCreateTask={canCreateTask}
                canCreateValueTrack={canCreateValueTrack}
                canManageProjectAndValueTracking={canManageProjectAndValueTracking}
                canManageProductTask={canManageProductTask}
                onToggleExpand={(projectId) => setExpandedProjectId((current) => current === projectId ? null : projectId)}
                onSwitchPanel={(panel) => onUpdateFilters({ projectPanel: panel === "task" ? null : panel })}
                onCreateTask={onCreateTask}
                onCreateValueTrack={onCreateValueTrack}
                onEditProject={onEditProject}
                onDeleteProject={onDeleteProject}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                onEditValueTrack={onEditValueTrack}
              />
              </div>
            )
          ) : (
            <div className="flex h-full min-h-0 flex-col rounded-2xl bg-white">
              <EmptyProjectSection
                title="暂无项目"
                description="调整筛选条件，或新建项目开始规划。"
                buttonLabel="新建项目"
                canCreate={canCreateProject}
                onCreate={() => onCreateProject("NOT_STARTED")}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function QuarterlyWorkContent({ data }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<BoardTab>("board");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [needsDevOnly, setNeedsDevOnly] = useState(false);
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
  const [valueOverviewDialog, setValueOverviewDialog] = useState<ValueOverviewDialogState>(null);
  const [tabSearchInput, setTabSearchInput] = useState("");
  const [tabSearchQuery, setTabSearchQuery] = useState("");
  const valueTrackLogSectionRef = useRef<HTMLDivElement | null>(null);
  const [productGoalDialog, setProductGoalDialog] = useState<ProductGoalDialogState>(null);
  const [productGoalDeleteDialog, setProductGoalDeleteDialog] = useState<ProductGoalDeleteState>(null);
  const [projectDeleteDialog, setProjectDeleteDialog] = useState<ProjectDeleteState>(null);
  const [boardDeleteDialog, setBoardDeleteDialog] = useState<BoardDeleteState>(null);
  const [createProjectDialog, setCreateProjectDialog] = useState<ProjectStatus | null>(null);
  const [createProjectProductGoalIds, setCreateProjectProductGoalIds] = useState<string[]>([]);
  const [operationLogDialog, setOperationLogDialog] = useState<{ targetId?: string; targetTitle: string } | null>(null);
  const canManageProductGoal = data.permissions.canManageProductGoal;
  const canManageProjectAndValueTracking = data.permissions.canManageProjectAndValueTracking;
  const canManageProductTask = data.permissions.canManageProductTask;
  const canCreateProductGoal = data.canCreate && canManageProductGoal;
  const canCreateProject = data.canCreate && canManageProjectAndValueTracking;
  const canCreateTask = data.canCreate && canManageProductTask;
  const canCreateValueTrack = data.canCreate && canManageProjectAndValueTracking;
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
  const updateWorkspaceFilters = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
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
  const visibleValueOverviewItems = useMemo(
    () => data.valueOverviewItems.filter((item) =>
      matchesDepartmentAndTeamScope(item, departmentTab, teamTab, teamDepartmentMap),
    ),
    [data.valueOverviewItems, departmentTab, teamTab, teamDepartmentMap]
  );
  const visibleValueTrackItems = useMemo(
    () => data.valueTrackItems.filter((item) =>
      matchesDepartmentAndTeamScope(item, departmentTab, teamTab, teamDepartmentMap),
    ),
    [data.valueTrackItems, departmentTab, teamTab, teamDepartmentMap]
  );
  const filteredProductGoalColumns = useMemo(
    () => visibleProductGoalColumns.map((column) => ({
      ...column,
      items: column.items.filter((item) => matchesFuzzySearch(item.title, tabSearchQuery)),
    })),
    [visibleProductGoalColumns, tabSearchQuery],
  );
  const filteredProjectColumns = useMemo(
    () => visibleProjectColumns.map((column) => ({
      ...column,
      items: column.items.filter((item) => matchesFuzzySearch(item.title, tabSearchQuery)),
    })),
    [visibleProjectColumns, tabSearchQuery],
  );
  const filteredTaskColumns = useMemo(
    () => visibleColumns.map((column) => ({
      ...column,
      items: column.items.filter((item) =>
        matchesFuzzySearch(item.title, tabSearchQuery) && (!needsDevOnly || item.needsDevelopment === true)
      ),
    })),
    [visibleColumns, tabSearchQuery, needsDevOnly],
  );
  const filteredValueOverviewItems = useMemo(
    () => visibleValueOverviewItems.filter((item) => matchesFuzzySearch(item.title, tabSearchQuery)),
    [visibleValueOverviewItems, tabSearchQuery],
  );
  const filteredValueTrackItems = useMemo(() => {
    const items = visibleValueTrackItems.filter((item) =>
      matchesFuzzySearch(item.projectTitle, tabSearchQuery),
    );
    return [...items].sort((left, right) => new Date(right.trackedAt).getTime() - new Date(left.trackedAt).getTime());
  }, [visibleValueTrackItems, tabSearchQuery]);
  const filteredOperationLogs = useMemo(
    () => data.operationLogs.filter((log) => {
      if (!matchesDepartmentAndTeamScope(log, departmentTab, teamTab, teamDepartmentMap)) return false;
      return matchesFuzzySearch(`${log.targetTitle} ${log.remark ?? ""} ${log.operator}`, tabSearchQuery);
    }),
    [data.operationLogs, departmentTab, teamTab, teamDepartmentMap, tabSearchQuery],
  );
  const applyTabSearch = () => {
    setTabSearchQuery(tabSearchInput.trim());
  };
  const clearTabSearch = () => {
    setTabSearchInput("");
    setTabSearchQuery("");
  };
  const openValueTrackCreateDialog = (projectId: string) => {
    setCreateValueTrackProjectId(projectId);
    setCreateValueTrackDialog(true);
  };
  const focusValueTrackLogs = (projectTitle: string) => {
    setTabSearchInput(projectTitle);
    setTabSearchQuery(projectTitle.trim());
    window.requestAnimationFrame(() => {
      valueTrackLogSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTabSearchInput("");
      setTabSearchQuery("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [departmentTab, teamTab, tab]);
  const visibleProductGoalOptions = useMemo(
    () => visibleProductGoalColumns.flatMap((column) => column.items).map((item) => ({
      id: item.id,
      title: item.title,
      year: item.year,
    })),
    [visibleProductGoalColumns]
  );
  const getProductGoalOptionsForForm = (currentProductGoalIds?: string[]) => {
    const missingIds = (currentProductGoalIds ?? []).filter(
      (goalId) => !visibleProductGoalOptions.some((goal) => goal.id === goalId),
    );
    if (!missingIds.length) return visibleProductGoalOptions;
    const extraGoals = missingIds
      .map((goalId) => data.productGoalOptions.find((goal) => goal.id === goalId))
      .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal));
    return [...visibleProductGoalOptions, ...extraGoals];
  };
  const getMemberOptionsForForm = (preserveOwnerId?: string | null) =>
    resolveMemberOptionsForForm(data.memberOptions, departmentTab, teamDepartmentMap, preserveOwnerId);
  const tabSearchBarProps = {
    inputValue: tabSearchInput,
    onInputChange: setTabSearchInput,
    appliedQuery: tabSearchQuery,
    onSearch: applyTabSearch,
    onClear: clearTabSearch,
  };
  const renderLegacyWorkspace = false;

  return (
    <>
      {renderLegacyWorkspace ? (
      <Card className="mb-4 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight">产品管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">按小组规划年度产品目标、项目规划 · 任务拆解 · 每周更新进展，延期自动预警；上线后跟踪需求价值</p>
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
                { k: "log" as const, label: "操作日志" },
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

            {(canCreateProductGoal || canCreateProject || canCreateTask || canCreateValueTrack) && (
              <div className="flex items-center gap-2">
                {canCreateProductGoal ? (
                  <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => setCreateProductGoalDialog(true)}><Plus className="h-4 w-4" />新增产品目标</Button>
                ) : null}
                {canCreateProject ? (
                  <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => setCreateProjectDialog("NOT_STARTED")}><Plus className="h-4 w-4" />新增项目</Button>
                ) : null}
                {canCreateTask ? (
                  <Button className="h-9 rounded-lg px-4 text-sm font-semibold" onClick={() => setCreateDialog({ status: "NOT_STARTED", title: "未启动" })}><Plus className="h-4 w-4" />新增任务</Button>
                ) : null}
                {canCreateValueTrack ? (
                  <Button className="h-9 rounded-lg px-4 text-sm font-semibold" variant="outline" onClick={() => {
                    setCreateValueTrackProjectId(null);
                    setCreateValueTrackDialog(true);
                  }}><Plus className="h-4 w-4" />新增价值跟踪</Button>
                ) : null}
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
          <div key={`${tab}-${viewMode}`}>
          {tab === "goal" ? (
            <>
            <BoardSearchBar
              title="产品目标"
              placeholder="搜索产品目标名称"
              {...tabSearchBarProps}
            />
            {viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {filteredProductGoalColumns.map((column: Props["data"]["productGoalColumns"][number]) => (
                <div key={column.key} className="min-h-[320px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={column.tone}>{column.title}</Badge>
                      <span className="text-xs text-muted-foreground">{column.items.length}</span>
                    </div>
                    {canCreateProductGoal ? (
                      <button
                        type="button"
                        onClick={() => setCreateProductGoalDialog(true)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + 添加
                      </button>
                    ) : null}
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
                                onClick={() => setOperationLogDialog({ targetId: item.id, targetTitle: item.title })}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`查看${item.title}的操作日志`}
                              >
                                <ScrollText className="h-4 w-4" />
                              </button>
                              {canCreateProject ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCreateProjectProductGoalIds([item.id]);
                                    setCreateProjectDialog("NOT_STARTED");
                                  }}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                  aria-label={`为${item.title}新增项目`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              ) : null}
                              {canManageProductGoal ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setProductGoalDialog(item)}
                                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                    aria-label={`编辑${item.title}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setProductGoalDeleteDialog(item)}
                                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                                    aria-label={`删除${item.title}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              ) : null}
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
                  {filteredProductGoalColumns.flatMap((column) => column.items).length ? (
                    filteredProductGoalColumns.flatMap((column) => column.items.map((item) => (
                      <div key={`${column.key}-${item.id}`} className="px-5 py-4 grid grid-cols-[1.2fr_0.9fr_90px_1.3fr_1.3fr_0.9fr_1fr_1fr_120px] gap-4 items-start text-sm hover:bg-muted/20 transition">
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
                              onClick={() => setOperationLogDialog({ targetId: item.id, targetTitle: item.title })}
                              className="text-primary hover:underline"
                              aria-label={`查看${item.title}的操作日志`}
                            >
                              日志
                            </button>
                            {canManageProductGoal ? (
                              <>
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
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )))
                  ) : (
                    <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                      {tabSearchQuery ? "暂无匹配的产品目标数据" : "暂无产品目标数据"}
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
          ) : tab === "project" ? (
            <>
            <BoardSearchBar
              title="项目看板"
              placeholder="搜索项目名称"
              {...tabSearchBarProps}
            />
            {viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {filteredProjectColumns.map((column: Props["data"]["projectColumns"][number]) => (
                <div key={column.key} className="min-h-[320px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={column.tone}>{column.title}</Badge>
                      <span className="text-xs text-muted-foreground">{column.items.length}</span>
                    </div>
                    {canCreateProject ? (
                      <button
                        type="button"
                        onClick={() => setCreateProjectDialog(column.status)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        + 添加
                      </button>
                    ) : null}
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
                                onClick={() => setOperationLogDialog({ targetId: item.id, targetTitle: item.title })}
                                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                aria-label={`查看${item.title}的操作日志`}
                              >
                                <ScrollText className="h-4 w-4" />
                              </button>
                              {canCreateTask ? (
                                <button
                                  type="button"
                                  onClick={() => setCreateDialog({ status: "NOT_STARTED", title: "未启动", projectId: item.id })}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                  aria-label={`为${item.title}新增任务`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              ) : null}
                              {canManageProjectAndValueTracking ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setProjectDialog({ item, title: column.title })}
                                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                    aria-label={`编辑${item.title}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setProjectDeleteDialog(item)}
                                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                                    aria-label={`删除${item.title}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              ) : null}
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
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className={`px-4 py-3 border-b border-border bg-muted/30 grid ${projectListGridClass} gap-x-2 gap-y-3 text-xs text-muted-foreground`}>
                  <div className="min-w-0">项目名称</div>
                  <div className="min-w-0">所属产品目标</div>
                  <div className="min-w-0">负责人</div>
                  <div className="min-w-0">规划周期</div>
                  <div className="min-w-0">预期收益</div>
                  <div className="min-w-0">工作量(人天)</div>
                  <div className="min-w-0">项目状态</div>
                  <div className="min-w-0">创建时间</div>
                  <div className="min-w-0">上线/完成时间</div>
                  <div className="min-w-0 text-right">操作</div>
                </div>
                <div className="divide-y divide-border">
                  {filteredProjectColumns.flatMap((column) => column.items).length ? (
                    filteredProjectColumns.flatMap((column) => column.items.map((item) => (
                      <div key={`${column.key}-${item.id}`} className={`px-4 py-4 grid ${projectListGridClass} gap-x-2 gap-y-3 items-start text-sm hover:bg-muted/20 transition`}>
                        <div className="min-w-0 font-medium text-foreground break-words">{item.title}</div>
                        <div className="min-w-0 text-muted-foreground break-words">{item.productGoalTitle || "—"}</div>
                        <div className="min-w-0 text-muted-foreground break-words">{item.owner}</div>
                        <ProjectQuarterRangeLabel startQuarter={item.startQuarter} endQuarter={item.endQuarter} />
                        <div className="min-w-0 text-muted-foreground whitespace-pre-wrap break-words">{item.expectedOutcome || "—"}</div>
                        <div className="min-w-0 text-muted-foreground">{item.workloadPersonDay ?? "—"}</div>
                        <div className="min-w-0 break-words text-muted-foreground">{projectTitleByStatus[item.status]}</div>
                        <div className="min-w-0 break-words text-muted-foreground">{formatDateTimeLabel(item.createdAt)}</div>
                        <div className="min-w-0 break-words text-muted-foreground">{formatDateTimeLabel(item.launchedAt ?? item.completedAt)}</div>
                        <div className="min-w-0 text-right">
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              onClick={() => setOperationLogDialog({ targetId: item.id, targetTitle: item.title })}
                              className="text-primary hover:underline"
                              aria-label={`查看${item.title}的操作日志`}
                            >
                              日志
                            </button>
                            {canManageProjectAndValueTracking ? (
                              <>
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
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )))
                  ) : (
                    <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {tabSearchQuery ? "暂无匹配的项目数据" : "暂无项目数据"}
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
          ) : tab === "board" ? (
            <>
            <BoardSearchBar
              title="任务看板"
              placeholder="搜索任务名称"
              {...tabSearchBarProps}
            />
            <div className="-mt-1 mb-3 flex items-center px-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={needsDevOnly}
                  onChange={(event) => setNeedsDevOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                仅看需开发
              </label>
            </div>
            {viewMode === "card" ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {filteredTaskColumns.map((c) => (
                  <div key={c.key} className="min-h-[320px] rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={c.tone}>{c.title}</Badge>
                        <span className="text-xs text-muted-foreground">{c.items.length}</span>
                      </div>
                      {canCreateTask ? (
                        <button
                          type="button"
                          onClick={() => setCreateDialog({ status: c.status, title: c.title })}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          + 添加
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {c.items.length ? (
                        c.items.map((it) => (
                          <div key={it.id} className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium leading-snug">{it.title}</div>
                                  {it.needsDevelopment ? <Badge tone="info">需开发</Badge> : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">关联项目：{it.projectTitle}</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setOperationLogDialog({ targetId: it.id, targetTitle: it.title })}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                  aria-label={`查看${it.title}的操作日志`}
                                >
                                  <ScrollText className="h-4 w-4" />
                                </button>
                                {canManageProductTask ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setEditDialog({ item: it, title: c.title })}
                                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                      aria-label={`编辑${it.title}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setBoardDeleteDialog(it)}
                                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                                      aria-label={`删除${it.title}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{it.owner}</span>
                              {it.taskResult ? <span className="text-foreground">{it.taskResult}</span> : null}
                              <span className={it.remainingWeeksLabel?.startsWith("逾期") ? "text-destructive" : "text-muted-foreground"}>{it.remainingWeeksLabel ?? "—"}</span>
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
            </>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.1fr_1fr_0.9fr_0.9fr_0.8fr_1.2fr_0.7fr_0.9fr_0.8fr_0.7fr_1fr_1fr_120px] gap-4 text-xs text-muted-foreground">
                  <div>任务名称</div>
                  <div>所属项目</div>
                  <div>负责人</div>
                  <div>任务周期</div>
                  <div>剩余/逾期</div>
                  <div>任务目标</div>
                  <div>工作量(人天)</div>
                  <div>任务状态</div>
                  <div>任务结果</div>
                  <div>是否需开发</div>
                  <div>创建时间</div>
                  <div>完成时间</div>
                  <div className="text-right">操作</div>
                </div>
                <div className="divide-y divide-border">
                  {filteredTaskColumns.flatMap((column) => column.items).length ? (
                    filteredTaskColumns.flatMap((column) => column.items.map((item) => (
                      <div key={`${column.key}-${item.id}`} className="px-5 py-4 grid grid-cols-[1.1fr_1fr_0.9fr_0.9fr_0.8fr_1.2fr_0.7fr_0.9fr_0.8fr_0.7fr_1fr_1fr_120px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                        <div className="font-medium text-foreground break-words">{item.title}</div>
                        <div className="text-muted-foreground break-words">{item.projectTitle}</div>
                        <div className="text-muted-foreground break-words">{item.owner}</div>
                        <div className="text-muted-foreground">{formatMonthRange(item.startMonth, item.endMonth)}</div>
                        <div className={item.remainingWeeksLabel?.startsWith("逾期") ? "text-destructive" : "text-muted-foreground"}>
                          {item.remainingWeeksLabel ?? "—"}
                        </div>
                        <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.description || "—"}</div>
                        <div className="text-muted-foreground">{item.workloadPersonDay ?? "—"}</div>
                        <div className="text-muted-foreground">{columnTitleByStatus[item.status]}</div>
                        <div className="text-muted-foreground">{item.taskResult || "—"}</div>
                        <div className="text-muted-foreground">{item.needsDevelopment === null ? "—" : item.needsDevelopment ? "是" : "否"}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.createdAt)}</div>
                        <div className="text-muted-foreground">{formatDateTimeLabel(item.completedAt)}</div>
                        <div className="text-right">
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              onClick={() => setOperationLogDialog({ targetId: item.id, targetTitle: item.title })}
                              className="text-primary hover:underline"
                              aria-label={`查看${item.title}的操作日志`}
                            >
                              日志
                            </button>
                            {canManageProductTask ? (
                              <>
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
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )))
                  ) : (
                    <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                      {tabSearchQuery ? "暂无匹配的任务数据" : "暂无任务数据"}
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
          ) : tab === "value" ? (
            <>
            <BoardSearchBar
              title="需求价值概览"
              placeholder="搜索项目名称"
              {...tabSearchBarProps}
            />
            {viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {valueOverviewCardColumns.map((column) => {
                const items = filteredValueOverviewItems.filter((item) => matchesValueOverviewColumn(item, column.key));
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
                        items.map((item: Props["data"]["valueOverviewItems"][number]) => (
                            <div key={item.id} className="rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium leading-snug">{item.title}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {item.owner} · {formatDateTimeLabel(item.launchedAt)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {canCreateValueTrack ? (
                                    <button
                                      type="button"
                                      onClick={() => openValueTrackCreateDialog(item.id)}
                                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                      aria-label={`为${item.title}新增价值跟踪`}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  {canManageProjectAndValueTracking ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setValueOverviewDialog(item)}
                                        className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                        aria-label={`编辑${item.title}的项目价值`}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setProjectDeleteDialog(item)}
                                        className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                                        aria-label={`删除${item.title}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                                <div>
                                  <span className="text-[11px]">价值判断：</span>
                                  <span className="text-foreground">{item.valueJudgement || "—"}</span>
                                </div>
                                <div>
                                  <span className="text-[11px]">工作量(人天)：</span>
                                  <span className="text-foreground">{item.workloadPersonDay ?? "—"}</span>
                                </div>
                                <div>
                                  <span className="text-[11px]">其他成本：</span>
                                  <span className="text-foreground whitespace-pre-wrap break-words">{item.otherCost || "—"}</span>
                                </div>
                                <div>
                                  <span className="text-[11px]">预期收益：</span>
                                  <span className="text-foreground whitespace-pre-wrap break-words">{item.expectedOutcome || "—"}</span>
                                </div>
                                <div>
                                  <span className="text-[11px]">实际收益：</span>
                                  <span className="text-foreground whitespace-pre-wrap break-words">{item.actualValue || "—"}</span>
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
            <div className="space-y-6">
              <div>
                <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                  <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.2fr_0.9fr_110px_1fr_1fr_1fr_0.8fr_0.9fr_0.9fr_1fr_140px] gap-4 text-xs text-muted-foreground">
                    <div>项目名称</div>
                    <div>负责人</div>
                    <div>工作量(人天)</div>
                    <div>其他成本</div>
                    <div>预期收益</div>
                    <div>实际收益</div>
                    <div>跟踪状态</div>
                    <div>价值判断</div>
                    <div>项目状态</div>
                    <div>上线时间</div>
                    <div className="text-right">操作</div>
                  </div>
                  <div className="divide-y divide-border">
                    {filteredValueOverviewItems.length ? (
                      filteredValueOverviewItems.map((item: Props["data"]["valueOverviewItems"][number]) => (
                          <div key={item.id} className="px-5 py-4 grid grid-cols-[1.2fr_0.9fr_110px_1fr_1fr_1fr_0.8fr_0.9fr_0.9fr_1fr_140px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                            <div className="font-medium text-foreground break-words">{item.title}</div>
                            <div className="text-muted-foreground break-words">{item.owner}</div>
                            <div className="text-muted-foreground">{item.workloadPersonDay ?? "—"}</div>
                            <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.otherCost || "—"}</div>
                            <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.expectedOutcome || "—"}</div>
                            <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.actualValue || "—"}</div>
                            <div className="text-muted-foreground">{item.valueTrackStatus}</div>
                            <div className="text-muted-foreground">{item.valueJudgement || "—"}</div>
                            <div className="text-muted-foreground">{projectTitleByStatus[item.status]}</div>
                            <div className="text-muted-foreground">{formatDateTimeLabel(item.launchedAt)}</div>
                            <div className="text-right">
                              <div className="inline-flex flex-col items-end gap-1 whitespace-nowrap text-sm">
                                {canManageProjectAndValueTracking ? (
                                  <button
                                    type="button"
                                    onClick={() => setValueOverviewDialog(item)}
                                    className="text-primary hover:underline"
                                    aria-label={`编辑${item.title}的项目价值`}
                                  >
                                    编辑
                                  </button>
                                ) : null}
                                {canCreateValueTrack ? (
                                  <button
                                    type="button"
                                    onClick={() => openValueTrackCreateDialog(item.id)}
                                    className="text-primary hover:underline"
                                    aria-label={`为${item.title}新增价值跟踪`}
                                  >
                                    新增跟踪
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => focusValueTrackLogs(item.title)}
                                  className="text-primary hover:underline"
                                  aria-label={`查看${item.title}的跟踪日志`}
                                >
                                  查看日志
                                </button>
                              </div>
                            </div>
                          </div>
                      ))
                    ) : (
                      <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                        {tabSearchQuery ? "暂无匹配的需求价值概览数据" : "暂无需求价值概览数据"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div ref={valueTrackLogSectionRef}>
                <h3 className="mb-3 text-sm font-medium text-foreground">价值跟踪日志</h3>
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
                    {filteredValueTrackItems.length ? (
                      filteredValueTrackItems.map((item: Props["data"]["valueTrackItems"][number]) => (
                        <div key={item.id} className="px-5 py-4 grid grid-cols-[1.2fr_0.9fr_1fr_1.6fr_1.6fr_120px] gap-4 items-start text-sm hover:bg-muted/20 transition">
                          <div className="font-medium text-foreground break-words">{item.projectTitle}</div>
                          <div className="text-muted-foreground break-words">{item.owner}</div>
                          <div className="text-muted-foreground">{formatTrackedAtLabel(item.trackedAt)}</div>
                          <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.trackingResult}</div>
                          <div className="text-muted-foreground whitespace-pre-wrap break-words">{item.followUpOptimization || "—"}</div>
                          <div className="text-right">
                            {canManageProjectAndValueTracking ? (
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
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                        {tabSearchQuery ? "暂无匹配的价值跟踪日志" : "暂无价值跟踪日志数据"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
            </>
          ) : (
            <>
            <BoardSearchBar
              title="操作日志"
              placeholder="搜索对象名称、操作内容或操作人"
              {...tabSearchBarProps}
            />
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1fr_0.7fr_1.2fr_0.8fr_0.7fr_2.2fr] gap-4 text-xs text-muted-foreground">
                <div>时间</div>
                <div>对象类型</div>
                <div>对象名称</div>
                <div>操作人</div>
                <div>操作内容</div>
                <div>操作备注</div>
              </div>
              <div className="divide-y divide-border">
                {filteredOperationLogs.length ? (
                  filteredOperationLogs.map((log) => (
                    <div key={log.id} className="px-5 py-4 grid grid-cols-[1fr_0.7fr_1.2fr_0.8fr_0.7fr_2.2fr] gap-4 items-start text-sm hover:bg-muted/20 transition">
                      <div className="text-muted-foreground">{formatDateTimeLabel(log.createdAt)}</div>
                      <div className="text-muted-foreground">{OPERATION_LOG_TARGET_TYPE_LABELS[log.targetType as OperationLogTargetType] ?? log.targetType}</div>
                      <div className="font-medium text-foreground break-words">{log.targetTitle}</div>
                      <div className="text-muted-foreground">{log.operator}</div>
                      <div className="text-muted-foreground">{log.action}</div>
                      <div className="text-muted-foreground whitespace-pre-wrap break-words">{log.remark || "—"}</div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {tabSearchQuery ? "暂无匹配的操作日志" : "暂无操作日志数据"}
                  </div>
                )}
              </div>
            </div>
            </>
          )}
          </div>
        </div>
      </Card>
      ) : (
        <QuarterlyWorkShell
          data={data}
          canCreateGoal={canCreateProductGoal}
          canCreateProject={canCreateProject}
          canCreateTask={canCreateTask}
          canCreateValueTrack={canCreateValueTrack}
          canManageProjectAndValueTracking={canManageProjectAndValueTracking}
          canManageProductTask={canManageProductTask}
          onUpdateFilters={updateWorkspaceFilters}
          onCreateGoal={() => setCreateProductGoalDialog(true)}
          onCreateProject={(status) => setCreateProjectDialog(status)}
          onCreateTask={(projectId) => setCreateDialog({ status: "NOT_STARTED", title: "未启动", projectId })}
          onCreateValueTrack={(projectId) => {
            setCreateValueTrackProjectId(projectId ?? null);
            setCreateValueTrackDialog(true);
          }}
          onEditGoal={(item) => setProductGoalDialog(item)}
          onDeleteGoal={(item) => setProductGoalDeleteDialog(item)}
          onEditProject={(item) => setProjectDialog({ item, title: projectTitleByStatus[item.status] })}
          onDeleteProject={(item) => setProjectDeleteDialog(item)}
          onEditTask={(item) => setEditDialog({ item, title: columnTitleByStatus[item.status] })}
          onDeleteTask={(item) => setBoardDeleteDialog(item)}
          onEditValueTrack={(item) => setValueTrackDialog(item)}
          onDeleteValueTrack={(item) => setValueTrackDeleteDialog(item)}
          onEditValueOverview={(item) => {
            const overview = data.valueOverviewItems.find((row) => row.id === item.id);
            if (overview) {
              setValueOverviewDialog(overview);
              return;
            }
            setValueOverviewDialog({
              id: item.id,
              title: item.title,
              ownerId: item.ownerId,
              owner: item.owner,
              departmentOrgNodeId: item.departmentOrgNodeId,
              teamOrgNodeId: item.teamOrgNodeId,
              workloadPersonDay: item.workloadPersonDay,
              otherCost: item.otherCost,
              expectedOutcome: item.expectedOutcome,
              actualValue: item.actualValue,
              valueJudgement: item.valueJudgement,
              valueTrackStatus: item.valueTrackStatus,
              status: item.status,
              launchedAt: item.launchedAt,
            });
          }}
          onOpenOperationLogs={() => setOperationLogDialog({ targetTitle: "全部操作日志" })}
        />
      )}

      <Dialog open={!!createDialog} onClose={() => setCreateDialog(null)} title="新增任务" stickyLayout>
        {createDialog && (
          <QuarterlyWorkForm
            data={data}
            mode="create"
            status={createDialog.status}
            defaultProjectId={createDialog.projectId}
            departmentOrgNodeId={departmentTab}
            memberOptions={getMemberOptionsForForm()}
            onClose={() => setCreateDialog(null)}
            onSuccess={handleFormSuccess}
            stickyLayout
          />
        )}
      </Dialog>

      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} title="编辑任务" stickyLayout>
        {editDialog && (
          <QuarterlyWorkForm
            data={data}
            mode="edit"
            status={editDialog.item.status}
            item={editDialog.item}
            departmentOrgNodeId={departmentTab}
            memberOptions={getMemberOptionsForForm(editDialog.item.ownerId)}
            onClose={() => setEditDialog(null)}
            onSuccess={handleFormSuccess}
            stickyLayout
          />
        )}
      </Dialog>

      <Dialog open={!!projectDialog} onClose={() => setProjectDialog(null)} title="编辑项目" stickyLayout>
        {projectDialog && (
          <ProjectEditForm
            data={data}
            item={projectDialog.item}
            productGoalOptions={getProductGoalOptionsForForm(projectDialog.item.productGoalIds)}
            departmentOrgNodeId={departmentTab}
            memberOptions={getMemberOptionsForForm(projectDialog.item.ownerId)}
            onClose={() => setProjectDialog(null)}
          />
        )}
      </Dialog>

      <Dialog open={createProductGoalDialog} onClose={() => setCreateProductGoalDialog(false)} title="新增产品目标">
        {createProductGoalDialog ? (
          <ProductGoalCreateForm
            data={data}
            departmentOrgNodeId={departmentTab}
            memberOptions={getMemberOptionsForForm()}
            onClose={() => setCreateProductGoalDialog(false)}
          />
        ) : null}
      </Dialog>

      {operationLogDialog ? (
        <OperationLogDialog
          logs={operationLogDialog.targetId
            ? data.operationLogs.filter((log) => log.targetId === operationLogDialog.targetId)
            : data.operationLogs}
          targetTitle={operationLogDialog.targetTitle}
          onClose={() => setOperationLogDialog(null)}
        />
      ) : null}

      <Dialog open={!!productGoalDialog} onClose={() => setProductGoalDialog(null)} title="编辑产品目标" stickyLayout>
        {productGoalDialog ? (
          <ProductGoalEditForm
            item={productGoalDialog}
            departmentOrgNodeId={departmentTab}
            memberOptions={getMemberOptionsForForm(productGoalDialog.ownerId)}
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
      }} title="新增价值跟踪" stickyLayout>
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

      <Dialog open={!!valueOverviewDialog} onClose={() => setValueOverviewDialog(null)} title="编辑项目价值" stickyLayout>
        {valueOverviewDialog ? (
          <ValueOverviewEditForm
            item={valueOverviewDialog}
            onClose={() => setValueOverviewDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!valueTrackDialog} onClose={() => setValueTrackDialog(null)} title="编辑价值跟踪" stickyLayout>
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
        setCreateProjectProductGoalIds([]);
      }} title="新增项目" stickyLayout>
        {createProjectDialog && (
          <ProjectCreateForm
            data={data}
            productGoalOptions={visibleProductGoalOptions}
            departmentOrgNodeId={departmentTab}
            memberOptions={getMemberOptionsForForm()}
            defaultStatus={createProjectDialog}
            defaultProductGoalIds={createProjectProductGoalIds}
            onClose={() => {
              setCreateProjectDialog(null);
              setCreateProjectProductGoalIds([]);
            }}
          />
        )}
      </Dialog>
    </>
  );
}
