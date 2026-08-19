"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Badge, Button as UiButton, Card } from "@/components/ui-kit";
import { runServerAction } from "@/lib/run-server-action";
import {
  deleteNotificationGroupBot,
  deleteNotificationScenario,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationGroupBot,
  saveNotificationScenario,
  testNotificationScenario,
  toggleNotificationScenario,
} from "@/server/notifications/actions";
import { AlertTriangle, Bell, Check, CheckCircle2, ChevronDown, Plus, Search, X } from "lucide-react";
import {
  formatScheduleNextRunHint,
  previewScheduleNextRun,
} from "@/server/notifications/schedule-utils";
import type { ScheduleConfig, ScheduleScanType } from "@/server/notifications/types";
import { SCHEDULE_SCAN_REGISTRY } from "@/server/notifications/event-registry";

function Button({ className = "", size = "md", ...props }: ComponentProps<typeof UiButton>) {
  return <UiButton {...props} size={size} className={`rounded-lg px-5 text-sm font-semibold shadow-none ${className}`.trim()} />;
}

const tableShellClass = "overflow-hidden rounded-2xl border border-border bg-card";
const tableHeadClass = "bg-muted/30 text-muted-foreground border-b border-border";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  targetType: string | null;
  targetId: string | null;
  isRead: boolean;
  createdAt: string;
  userId?: string;
  userName?: string;
  recipientOrgNodeId?: string | null;
  recipientDepartmentOrgNodeId?: string | null;
};

type ScenarioRow = {
  id: string;
  name: string;
  description: string | null;
  module: string;
  triggerType: "EVENT" | "SCHEDULE";
  triggerEvent: string;
  scheduleConfig: unknown;
  nextRunAt: string | null;
  recipientConfig: unknown;
  channelConfig: unknown;
  conditionConfig: unknown;
  isActive: boolean;
  sortOrder: number;
  createdByName: string;
  createdAt: string;
  updatedByName: string;
  updatedAt: string;
  canManageRecord: boolean;
  creatorDepartmentOrgNodeId: string | null;
};

type EventOption = {
  code: string;
  label: string;
  module: string;
  payloadFields: string[];
  recipientResolvers: string[];
};

type RecipientRule = {
  type: string;
  userIds?: string[];
  roleTypes?: Array<"ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER">;
};

type GroupBotRow = {
  id: string;
  name: string;
  webhookUrl: string;
  securityType: "KEYWORD" | "SIGN" | "IP";
  securityValue: string;
  createdByName: string;
  createdAt: string;
  updatedByName: string;
  updatedAt: string;
  canManageRecord: boolean;
  creatorDepartmentOrgNodeId: string | null;
};

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

type ChannelConfigState = {
  channels: Array<"IN_APP" | "DINGTALK" | "DINGTALK_PERSONAL" | "DINGTALK_GROUP">;
  groupBotId: string;
  notificationType: string;
  dingtalkNotifyType: number;
  titleTemplate: string;
  contentTemplate: string;
  messageUrlTemplate: string;
};

const iconMap: Record<string, { icon: typeof CheckCircle2; tone: string }> = {
  APPROVAL_TODO: { icon: CheckCircle2, tone: "success" },
  GOAL_UPDATE: { icon: CheckCircle2, tone: "success" },
  KPI_TODO: { icon: Bell, tone: "info" },
  WORK_DELAY: { icon: AlertTriangle, tone: "warning" },
  TALENT_WARNING: { icon: AlertTriangle, tone: "warning" },
  SYSTEM: { icon: Bell, tone: "info" },
};

const notificationTypeLabels: Record<string, string> = {
  APPROVAL_TODO: "审批",
  GOAL_UPDATE: "目标更新",
  KPI_TODO: "KPI 提醒",
  WORK_DELAY: "工作延误",
  TALENT_WARNING: "人才预警",
  SYSTEM: "系统",
};

function notificationMatchesSearch(notification: NotificationRow, query: string) {
  if (!query) return true;
  const typeLabel = notificationTypeLabels[notification.type] ?? notification.type;
  const statusLabel = notification.isRead ? "已读" : "新";
  const actionLabel = notification.isRead ? "已读" : "标为已读";
  const haystack = [
    typeLabel,
    notification.type,
    notification.title,
    notification.content ?? "",
    notification.userName ?? "",
    relativeTime(notification.createdAt),
    new Date(notification.createdAt).toLocaleString("zh-CN"),
    statusLabel,
    actionLabel,
  ].join(" ").toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

const filterTabs = [
  { key: "all", label: "全部" },
  { key: "approval", label: "审批结果" },
  { key: "warning", label: "预警" },
  { key: "reminder", label: "提醒" },
] as const;

const SYSTEM_CONFIG_DEPARTMENT_FILTER = "system";

type OrgFilterContext = {
  showAllNotificationsDepartmentFilter: boolean;
  showAllNotificationsTeamFilter: boolean;
  showConfigDepartmentFilter: boolean;
  departments: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string; departmentOrgNodeId: string }>;
};

function matchesConfigDepartmentFilter(
  creatorDepartmentOrgNodeId: string | null,
  filter: string,
) {
  if (filter === "all") return true;
  if (filter === SYSTEM_CONFIG_DEPARTMENT_FILTER) return creatorDepartmentOrgNodeId === null;
  return creatorDepartmentOrgNodeId === filter;
}

function OrgFilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  ariaLabel: string;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [selectWidth, setSelectWidth] = useState<number>();
  const measureLabel = options.reduce(
    (longest, option) => (option.name.length > longest.length ? option.name : longest),
    "",
  );

  useEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    setSelectWidth(Math.ceil(node.getBoundingClientRect().width) + 48);
  }, [measureLabel, options]);

  return (
    <div className="relative inline-flex shrink-0">
      <span
        ref={measureRef}
        className="pointer-events-none invisible absolute whitespace-nowrap text-sm"
        aria-hidden
      >
        {measureLabel}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-9 min-w-[5.5rem] appearance-none rounded-lg border border-border bg-background pl-3 pr-8 text-sm focus:outline-none focus:border-ring"
        style={selectWidth ? { width: selectWidth } : undefined}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function relativeTime(dateText: string): string {
  const date = new Date(dateText);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN");
}

function formatEventLabel(event: Pick<EventOption, "module" | "label">) {
  return `[${event.module}] ${event.label}`;
}

type SearchableSelectOption = {
  value: string;
  label: string;
  keywords?: string;
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
    ? options.filter((option) => {
        const haystack = `${option.label} ${option.keywords ?? ""} ${option.value}`.toLocaleLowerCase();
        return haystack.includes(normalizedSearch);
      })
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
        className={`flex h-10 w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 text-left text-sm transition ${open ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-ring"}`}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? emptyLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[280px] rounded-xl border border-border bg-card p-2 shadow-xl">
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
                  key={option.value}
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

function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function defaultChannelConfig(): ChannelConfigState {
  return {
    channels: ["IN_APP", "DINGTALK"],
    groupBotId: "",
    notificationType: "KPI_TODO",
    dingtalkNotifyType: 5,
    titleTemplate: "{{year}}年Q{{quarter}} KPI 提醒",
    contentTemplate: "{{userName}}，请及时处理相关事项。",
    messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
  };
}

function defaultScheduleConfig(scanType: ScheduleScanType = "kpi_self_review_pending"): ScheduleConfig {
  return {
    frequency: "daily",
    timeOfDay: "09:00",
    weekdays: [1, 2, 3, 4, 5],
    scanType,
    daysBefore: 0,
    timezone: "Asia/Shanghai",
  };
}

function parseRecipientConfig(value: unknown): RecipientRule[] {
  if (!value || typeof value !== "object") return [{ type: "SUBJECT_USER" }];
  const rules = (value as { rules?: RecipientRule[] }).rules;
  return Array.isArray(rules) && rules.length ? rules : [{ type: "SUBJECT_USER" }];
}

function parseChannelConfig(value: unknown): ChannelConfigState {
  const defaults = defaultChannelConfig();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<ChannelConfigState>;
  return {
    channels: Array.isArray(raw.channels) && raw.channels.length ? raw.channels : defaults.channels,
    groupBotId: raw.groupBotId ?? "",
    notificationType: raw.notificationType ?? defaults.notificationType,
    dingtalkNotifyType: raw.dingtalkNotifyType ?? 5,
    titleTemplate: raw.titleTemplate ?? defaults.titleTemplate,
    contentTemplate: raw.contentTemplate ?? defaults.contentTemplate,
    messageUrlTemplate: raw.messageUrlTemplate ?? defaults.messageUrlTemplate,
  };
}

function parseScheduleConfig(value: unknown): ScheduleConfig {
  const defaults = defaultScheduleConfig();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<ScheduleConfig>;
  const scanType =
    raw.scanType && raw.scanType in SCHEDULE_SCAN_REGISTRY
      ? raw.scanType
      : defaults.scanType;
  return {
    frequency: raw.frequency === "weekly" ? "weekly" : "daily",
    timeOfDay: raw.timeOfDay ?? "09:00",
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays : defaults.weekdays,
    scanType,
    daysBefore: typeof raw.daysBefore === "number" ? raw.daysBefore : 0,
    timezone: raw.timezone ?? "Asia/Shanghai",
  };
}

const securityTypeLabels: Record<GroupBotRow["securityType"], string> = {
  KEYWORD: "关键词",
  SIGN: "加签",
  IP: "IP地址（段）",
};

const securityValueLabels: Record<GroupBotRow["securityType"], string> = {
  KEYWORD: "关键词",
  SIGN: "加签密钥",
  IP: "IP 地址（段）",
};

function GroupBotForm({
  bot,
  onClose,
}: {
  bot?: GroupBotRow;
  onClose: () => void;
}) {
  const [securityType, setSecurityType] = useState<GroupBotRow["securityType"]>(bot?.securityType ?? "KEYWORD");

  return (
    <form
      action={async (formData) => {
        await runServerAction(() => saveNotificationGroupBot(formData));
        onClose();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {bot ? <input type="hidden" name="id" value={bot.id} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">群名称 *</label>
          <input
            name="name"
            required
            defaultValue={bot?.name ?? ""}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">安全设置 *</label>
          <select
            name="securityType"
            value={securityType}
            onChange={(event) => setSecurityType(event.target.value as GroupBotRow["securityType"])}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          >
            <option value="KEYWORD">关键词</option>
            <option value="SIGN">加签</option>
            <option value="IP">IP地址（段）</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{securityValueLabels[securityType]} *</label>
          <input
            name="securityValue"
            required
            key={`${bot?.id ?? "new"}-${securityType}`}
            defaultValue={bot?.securityType === securityType ? bot.securityValue : ""}
            placeholder={securityType === "KEYWORD" ? "例如：提醒" : undefined}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Webhook 地址 *</label>
          <input
            name="webhookUrl"
            required
            defaultValue={bot?.webhookUrl ?? ""}
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">{bot ? "保存" : "添加"}</Button>
      </div>
    </form>
  );
}

function truncateMiddle(text: string, head = 28, tail = 12) {
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function UnderlineTabs<T extends string>({
  value,
  onChange,
  tabs,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ key: T; label: string }>;
  className?: string;
}) {
  return (
    <div className={`border-b border-border ${className}`.trim()}>
      <div className="flex flex-wrap items-end gap-8 text-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`pb-3 border-b-2 -mb-px transition ${
              value === tab.key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfigSubTabs({
  value,
  onChange,
}: {
  value: "scenarios" | "groupBots";
  onChange: (value: "scenarios" | "groupBots") => void;
}) {
  const tabs = [
    { key: "scenarios" as const, label: "场景配置" },
    { key: "groupBots" as const, label: "群机器人配置" },
  ];
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`h-9 rounded-lg px-4 text-sm transition ${value === tab.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ScenarioForm({
  scenario,
  eventOptions,
  moduleOptions,
  recipientRuleLabels,
  scanOptions,
  users,
  groupBots,
  onClose,
  onSaved,
}: {
  scenario?: ScenarioRow;
  eventOptions: EventOption[];
  moduleOptions: string[];
  recipientRuleLabels: Record<string, string>;
  scanOptions: Array<{ value: string; label: string; emitEvent: string; module: string }>;
  users: Array<{ id: string; name: string; roleType: string }>;
  groupBots: GroupBotRow[];
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const [triggerType, setTriggerType] = useState<"EVENT" | "SCHEDULE">(scenario?.triggerType ?? "EVENT");
  const [triggerEvent, setTriggerEvent] = useState(scenario?.triggerEvent ?? eventOptions[0]?.code ?? "kpi.initialized");
  const [module, setModule] = useState(
    scenario?.module ?? eventOptions.find((event) => event.code === (scenario?.triggerEvent ?? eventOptions[0]?.code))?.module ?? moduleOptions[0] ?? "KPI管理",
  );
  const [rules, setRules] = useState<RecipientRule[]>(parseRecipientConfig(scenario?.recipientConfig));
  const [channelConfig, setChannelConfig] = useState(parseChannelConfig(scenario?.channelConfig));
  const [scheduleConfig, setScheduleConfig] = useState(parseScheduleConfig(scenario?.scheduleConfig));
  const [isActive, setIsActive] = useState(scenario?.isActive ?? true);

  const selectedEvent = eventOptions.find((event) => event.code === triggerEvent) ?? eventOptions[0];
  const availableResolvers = selectedEvent?.recipientResolvers
    ?? Object.keys(recipientRuleLabels);

  const eventSelectOptions = useMemo(
    () => eventOptions.map((event) => ({
      value: event.code,
      label: formatEventLabel(event),
      keywords: event.code,
    })),
    [eventOptions],
  );

  useEffect(() => {
    if (triggerType !== "EVENT") return;
    const nextModule = selectedEvent?.module;
    if (nextModule) setModule(nextModule);
  }, [triggerEvent, triggerType, selectedEvent?.module]);

  useEffect(() => {
    if (triggerType !== "SCHEDULE") return;
    const scan = scanOptions.find((option) => option.value === scheduleConfig.scanType);
    if (scan?.module) setModule(scan.module);
  }, [scheduleConfig.scanType, triggerType, scanOptions]);

  const schedulePreview = useMemo(() => {
    if (triggerType !== "SCHEDULE") return null;
    const preview = previewScheduleNextRun(scheduleConfig);
    return formatScheduleNextRunHint(preview, scheduleConfig.timeOfDay || "09:00");
  }, [scheduleConfig, triggerType]);

  return (
    <form
      action={async (formData) => {
        const message = await runServerAction(() => saveNotificationScenario(formData));
        onSaved?.(message);
        onClose();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {scenario ? <input type="hidden" name="id" value={scenario.id} /> : null}
      <input type="hidden" name="triggerType" value={triggerType} />
      <input type="hidden" name="triggerEvent" value={triggerEvent} />
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="recipientConfig" value={JSON.stringify({ rules, dedupeWindowHours: triggerType === "SCHEDULE" ? 24 : 0 })} />
      <input type="hidden" name="channelConfig" value={JSON.stringify(channelConfig)} />
      <input type="hidden" name="scheduleConfig" value={JSON.stringify(scheduleConfig)} />
      <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">场景名称 *</label>
        <input
          name="name"
          required
          defaultValue={scenario?.name ?? ""}
          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">说明</label>
        <textarea
          name="description"
          defaultValue={scenario?.description ?? ""}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">所属模块</label>
          <select
            value={module}
            onChange={(event) => setModule(event.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          >
            {moduleOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            启用场景
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">触发方式</label>
          <select
            value={triggerType}
            onChange={(event) => setTriggerType(event.target.value as "EVENT" | "SCHEDULE")}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          >
            <option value="EVENT">业务事件</option>
            <option value="SCHEDULE">定时扫描</option>
          </select>
        </div>
      </div>

      {triggerType === "EVENT" ? (
        <div>
          <label className="block text-sm font-medium mb-1">触发事件</label>
          <SearchableSelect
            value={triggerEvent}
            options={eventSelectOptions}
            searchPlaceholder="搜索模块、事件名称或编码..."
            emptyLabel="没有匹配的触发事件"
            onChange={setTriggerEvent}
          />
          {selectedEvent ? (
            <p className="mt-1 text-xs text-muted-foreground">
              可用变量：{selectedEvent.payloadFields.map((field) => `{{${field}}}`).join("、")}、{"{{appUrl}}"}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">扫描类型</label>
              <select
                value={scheduleConfig.scanType}
                onChange={(event) => setScheduleConfig((prev) => ({ ...prev, scanType: event.target.value as ScheduleScanType }))}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              >
                {scanOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">频率</label>
              <select
                value={scheduleConfig.frequency}
                onChange={(event) => setScheduleConfig((prev) => ({
                  ...prev,
                  frequency: event.target.value as "daily" | "weekly",
                }))}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">执行时间</label>
              <input
                type="time"
                value={scheduleConfig.timeOfDay}
                onChange={(event) => setScheduleConfig((prev) => ({ ...prev, timeOfDay: event.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {scheduleConfig.scanType === "annual_goal_weekly_progress_pending" ? "未更新天数" : "提前天数"}
              </label>
              <input
                type="number"
                min={1}
                value={scheduleConfig.daysBefore}
                onChange={(event) => setScheduleConfig((prev) => ({
                  ...prev,
                  daysBefore: Math.max(1, Number(event.target.value) || 1),
                }))}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              />
              {scheduleConfig.scanType === "annual_goal_weekly_progress_pending" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  扫描小组承接的当前季度指标：距本次扫描时间超过该天数仍未更新进度时通知责任人。
                </p>
              ) : null}
            </div>
          </div>
          {schedulePreview ? (
            <p className={`text-xs leading-relaxed ${schedulePreview.includes("立即补跑") || schedulePreview.includes("推迟到") ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
              {schedulePreview}
            </p>
          ) : null}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">接收人规则</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRules((prev) => [...prev, { type: availableResolvers[0] ?? "SUBJECT_USER" }])}
          >
            添加规则
          </Button>
        </div>
        {rules.map((rule, index) => (
          <div key={`${rule.type}-${index}`} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex gap-2">
              <select
                value={rule.type}
                onChange={(event) => {
                  const next = [...rules];
                  next[index] = { ...rule, type: event.target.value };
                  setRules(next);
                }}
                className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm"
              >
                {availableResolvers.map((resolver) => (
                  <option key={resolver} value={resolver}>
                    {recipientRuleLabels[resolver] ?? resolver}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}>
                删除
              </Button>
            </div>
            {rule.type === "EXPLICIT_USERS" ? (
              <select
                multiple
                value={rule.userIds ?? []}
                onChange={(event) => {
                  const userIds = Array.from(event.target.selectedOptions).map((option) => option.value);
                  const next = [...rules];
                  next[index] = { ...rule, userIds };
                  setRules(next);
                }}
                className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            ) : null}
            {rule.type === "ROLE" ? (
              <select
                multiple
                value={rule.roleTypes ?? []}
                onChange={(event) => {
                  const roleTypes = Array.from(event.target.selectedOptions).map(
                    (option) => option.value as NonNullable<RecipientRule["roleTypes"]>[number],
                  );
                  const next = [...rules];
                  next[index] = { ...rule, roleTypes };
                  setRules(next);
                }}
                className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                {(["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"] as const).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <div className="text-sm font-medium">消息与渠道</div>
        <div className="flex flex-wrap gap-4 text-sm">
          {([
            ["IN_APP", "系统内通知"],
            ["DINGTALK", "钉钉工作通知"],
            ["DINGTALK_PERSONAL", "钉钉本人会话通知"],
            ["DINGTALK_GROUP", "群消息通知"],
          ] as const).map(([channel, label]) => (
            <label key={channel} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={channelConfig.channels.includes(channel)}
                onChange={(event) => {
                  setChannelConfig((prev) => {
                    const channels = event.target.checked
                      ? [...new Set([...prev.channels, channel])]
                      : prev.channels.filter((item) => item !== channel);
                    return {
                      ...prev,
                      channels,
                      groupBotId: channels.includes("DINGTALK_GROUP") ? prev.groupBotId : "",
                    };
                  });
                }}
              />
              {label}
            </label>
          ))}
        </div>
        {channelConfig.channels.includes("DINGTALK_GROUP") ? (
          <div>
            <label className="block text-sm font-medium mb-1">目标群 *</label>
            {groupBots.length ? (
              <select
                value={channelConfig.groupBotId}
                onChange={(event) => setChannelConfig((prev) => ({
                  ...prev,
                  groupBotId: event.target.value,
                }))}
                required
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              >
                <option value="">请选择群</option>
                {groupBots.map((bot) => (
                  <option key={bot.id} value={bot.id}>{bot.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                尚未配置群机器人，请先点击「群消息通知配置」添加
              </p>
            )}
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium mb-1">标题模板 *</label>
          <input
            value={channelConfig.titleTemplate}
            onChange={(event) => setChannelConfig((prev) => ({ ...prev, titleTemplate: event.target.value }))}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">内容模板</label>
          <textarea
            value={channelConfig.contentTemplate}
            onChange={(event) => setChannelConfig((prev) => ({ ...prev, contentTemplate: event.target.value }))}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">跳转链接模板</label>
          <input
            value={channelConfig.messageUrlTemplate}
            onChange={(event) => setChannelConfig((prev) => ({ ...prev, messageUrlTemplate: event.target.value }))}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
      </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">保存</Button>
      </div>
    </form>
  );
}

export function NotificationsContent({
  notifications,
  allNotifications,
  canViewAll,
  canManage,
  orgFilter,
  scenarios,
  users,
  groupBots,
  eventOptions,
  moduleOptions,
  recipientRuleLabels,
  scanOptions,
}: {
  notifications: NotificationRow[];
  allNotifications: NotificationRow[];
  canViewAll: boolean;
  canManage: boolean;
  orgFilter: OrgFilterContext;
  scenarios: ScenarioRow[];
  users: Array<{ id: string; name: string; roleType: string }>;
  groupBots: GroupBotRow[];
  eventOptions: EventOption[];
  moduleOptions: string[];
  recipientRuleLabels: Record<string, string>;
  scanOptions: Array<{ value: string; label: string; emitEvent: string; module: string }>;
}) {
  const [mainTab, setMainTab] = useState<"all" | "inbox" | "scenarios">("inbox");
  const [filter, setFilter] = useState<(typeof filterTabs)[number]["key"]>("all");
  const [dialog, setDialog] = useState<{ type: "create" | "edit"; scenario?: ScenarioRow } | null>(null);
  const [configTab, setConfigTab] = useState<"scenarios" | "groupBots">("scenarios");
  const [groupBotDialog, setGroupBotDialog] = useState<{ type: "create" | "edit"; bot?: GroupBotRow } | null>(null);
  const [testFeedback, setTestFeedback] = useState("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [scenarioModuleFilter, setScenarioModuleFilter] = useState<string>("all");
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [allNotificationsOrgFilter, setAllNotificationsOrgFilter] = useState<string>("all");
  const [configDepartmentFilter, setConfigDepartmentFilter] = useState<string>("all");

  const isAllNotificationsView = mainTab === "all";
  const inboxNotifications = isAllNotificationsView ? allNotifications : notifications;

  const filteredNotifications = useMemo(() => {
    const query = inboxSearch.trim();
    return inboxNotifications.filter((item) => {
      if (filter === "approval" && item.type !== "APPROVAL_TODO") return false;
      if (filter === "warning" && item.type !== "WORK_DELAY" && item.type !== "TALENT_WARNING") return false;
      if (filter === "reminder" && item.type !== "KPI_TODO" && item.type !== "GOAL_UPDATE" && item.type !== "SYSTEM") {
        return false;
      }
      if (isAllNotificationsView && allNotificationsOrgFilter !== "all") {
        if (orgFilter.showAllNotificationsDepartmentFilter) {
          if (item.recipientDepartmentOrgNodeId !== allNotificationsOrgFilter) return false;
        } else if (orgFilter.showAllNotificationsTeamFilter) {
          if (item.recipientOrgNodeId !== allNotificationsOrgFilter) return false;
        }
      }
      return notificationMatchesSearch(item, query);
    });
  }, [allNotificationsOrgFilter, filter, inboxNotifications, inboxSearch, isAllNotificationsView, orgFilter.showAllNotificationsDepartmentFilter, orgFilter.showAllNotificationsTeamFilter]);

  const configDepartmentTabs = useMemo(
    () => [
      { id: "all", name: "全部" },
      ...orgFilter.departments,
      { id: SYSTEM_CONFIG_DEPARTMENT_FILTER, name: "系统" },
    ],
    [orgFilter.departments],
  );

  const allNotificationsOrgTabs = useMemo(() => {
    if (orgFilter.showAllNotificationsDepartmentFilter) {
      return [{ id: "all", name: "全部部门" }, ...orgFilter.departments.map((department) => ({ id: department.id, name: department.name }))];
    }
    if (orgFilter.showAllNotificationsTeamFilter) {
      return [{ id: "all", name: "全部小组" }, ...orgFilter.teams.map((team) => ({ id: team.id, name: team.name }))];
    }
    return [];
  }, [orgFilter.departments, orgFilter.showAllNotificationsDepartmentFilter, orgFilter.showAllNotificationsTeamFilter, orgFilter.teams]);

  const eventLabelMap = useMemo(
    () => Object.fromEntries(eventOptions.map((event) => [event.code, event.label])),
    [eventOptions],
  );

  const scenarioModuleTabs = useMemo(() => ["all", ...moduleOptions], [moduleOptions]);

  const filteredScenarios = useMemo(() => {
    const query = scenarioSearch.trim().toLocaleLowerCase();
    return scenarios.filter((scenario) => {
      if (scenarioModuleFilter !== "all" && scenario.module !== scenarioModuleFilter) return false;
      if (orgFilter.showConfigDepartmentFilter && !matchesConfigDepartmentFilter(scenario.creatorDepartmentOrgNodeId, configDepartmentFilter)) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        scenario.module,
        scenario.name,
        scenario.description ?? "",
        scenario.triggerType === "EVENT" ? "业务事件" : "定时扫描",
        eventLabelMap[scenario.triggerEvent] ?? scenario.triggerEvent,
        scenario.triggerEvent,
      ].join(" ").toLocaleLowerCase();
      return haystack.includes(query);
    });
  }, [configDepartmentFilter, eventLabelMap, orgFilter.showConfigDepartmentFilter, scenarioModuleFilter, scenarioSearch, scenarios]);

  const filteredGroupBots = useMemo(() => {
    if (!orgFilter.showConfigDepartmentFilter || configDepartmentFilter === "all") return groupBots;
    return groupBots.filter((bot) => matchesConfigDepartmentFilter(bot.creatorDepartmentOrgNodeId, configDepartmentFilter));
  }, [configDepartmentFilter, groupBots, orgFilter.showConfigDepartmentFilter]);

  return (
    <>
      <Card className="mb-6 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight">通知中心</h1>
          <p className="mt-2 text-sm text-muted-foreground">系统消息、审批结果、预警与提醒；可配置通知场景</p>
        </div>

        {canViewAll || canManage ? (
          <UnderlineTabs
            className="mx-5 mt-3"
            value={mainTab}
            onChange={setMainTab}
            tabs={[
              { key: "inbox", label: "我的通知" },
              ...(canViewAll ? [{ key: "all" as const, label: "全部通知" }] : []),
              ...(canManage ? [{ key: "scenarios" as const, label: "通知配置" }] : []),
            ]}
          />
        ) : null}

        {testFeedback ? (
          <div className="mx-5 mt-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
            {testFeedback}
          </div>
        ) : null}

        {mainTab === "inbox" || mainTab === "all" ? (
          <div className="px-5 pb-5">
            <div className="pt-3 pb-3 flex flex-wrap items-center gap-2">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${filter === tab.key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
                >
                  {tab.label}
                </button>
              ))}
              {isAllNotificationsView && allNotificationsOrgTabs.length > 0 ? (
                <OrgFilterSelect
                  value={allNotificationsOrgFilter}
                  onChange={setAllNotificationsOrgFilter}
                  options={allNotificationsOrgTabs}
                  ariaLabel={orgFilter.showAllNotificationsDepartmentFilter ? "部门筛选" : "小组筛选"}
                />
              ) : null}
              <div className="ml-auto flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="search"
                    value={inboxSearch}
                    onChange={(event) => setInboxSearch(event.target.value)}
                    placeholder={isAllNotificationsView ? "搜索接收人、类型、标题、内容..." : "搜索类型、标题、内容..."}
                    className="h-9 w-56 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
                  />
                </div>
                {!isAllNotificationsView ? (
                  <form
                    action={async () => {
                      await runServerAction(() => markAllNotificationsRead());
                    }}
                  >
                    <button type="submit" className="text-xs text-primary hover:underline whitespace-nowrap">全部标为已读</button>
                  </form>
                ) : null}
              </div>
            </div>

            <div className={`overflow-x-auto ${tableShellClass}`}>
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    {isAllNotificationsView ? (
                      <th className="text-left font-medium px-4 py-3 w-[100px]">接收人</th>
                    ) : null}
                    <th className="text-left font-medium px-4 py-3 w-[100px]">类型</th>
                    <th className="text-left font-medium px-4 py-3">标题</th>
                    <th className="text-left font-medium px-4 py-3">内容</th>
                    <th className="text-left font-medium px-4 py-3 w-[120px]">时间</th>
                    <th className="text-left font-medium px-4 py-3 w-[80px]">状态</th>
                    {!isAllNotificationsView ? (
                      <th className="text-right font-medium px-4 py-3 w-[100px]">操作</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredNotifications.length ? (
                    filteredNotifications.map((notification) => {
                      const meta = iconMap[notification.type] ?? { icon: Bell, tone: "info" };
                      const Icon = meta.icon;
                      const toneMap: Record<string, string> = {
                        success: "bg-success/15 text-success",
                        warning: "bg-warning/20 text-warning-foreground",
                        info: "bg-info/15 text-info",
                      };
                      return (
                        <tr
                          key={notification.id}
                          className={`hover:bg-muted/20 transition ${notification.isRead ? "opacity-70" : ""}`}
                        >
                          {isAllNotificationsView ? (
                            <td className="px-4 py-3 text-sm">{notification.userName ?? "-"}</td>
                          ) : null}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${toneMap[meta.tone]}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {notificationTypeLabels[notification.type] ?? notification.type}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium">{notification.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {notification.content ?? "-"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {relativeTime(notification.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            {notification.isRead ? (
                              <span className="text-xs text-muted-foreground">已读</span>
                            ) : (
                              <Badge tone="primary">新</Badge>
                            )}
                          </td>
                          {!isAllNotificationsView ? (
                            <td className="px-4 py-3">
                              <form
                                className="flex justify-end"
                                action={async () => {
                                  const fd = new FormData();
                                  fd.set("id", notification.id);
                                  await runServerAction(() => markNotificationRead(fd));
                                }}
                              >
                                <button type="submit" className="text-xs text-primary hover:underline">
                                  {notification.isRead ? "已读" : "标为已读"}
                                </button>
                              </form>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isAllNotificationsView ? 6 : 6} className="px-4 py-12 text-center text-muted-foreground">
                        {inboxSearch.trim() || (isAllNotificationsView && allNotificationsOrgFilter !== "all")
                          ? "没有匹配的通知"
                          : "暂无通知"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className={`pt-3 ${configTab === "scenarios" ? "pb-1" : "pb-3 flex flex-wrap items-center justify-between gap-3"}`}>
              <ConfigSubTabs value={configTab} onChange={setConfigTab} />
              {configTab === "groupBots" ? (
                <Button onClick={() => setGroupBotDialog({ type: "create" })}>
                  <Plus className="w-4 h-4" />
                  新增群机器人
                </Button>
              ) : null}
            </div>

            {configTab === "scenarios" ? (
            <>
            <div className="pb-3 flex flex-wrap items-center gap-2">
              {scenarioModuleTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setScenarioModuleFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${scenarioModuleFilter === tab ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
                >
                  {tab === "all" ? "全部模块" : tab}
                </button>
              ))}
              {orgFilter.showConfigDepartmentFilter ? (
                <OrgFilterSelect
                  value={configDepartmentFilter}
                  onChange={setConfigDepartmentFilter}
                  options={configDepartmentTabs.map((tab) => ({
                    id: tab.id,
                    name: tab.id === "all" ? "全部部门" : tab.name,
                  }))}
                  ariaLabel="部门筛选"
                />
              ) : null}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={scenarioSearch}
                  onChange={(event) => setScenarioSearch(event.target.value)}
                  placeholder="搜索模块、场景、触发事件..."
                  className="h-9 w-64 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
                />
              </div>
              <Button className="ml-auto" onClick={() => setDialog({ type: "create" })}>
                <Plus className="w-4 h-4" />
                新增场景
              </Button>
            </div>
            <div className={`overflow-x-auto ${tableShellClass}`}>
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="text-left font-medium px-4 py-3">场景</th>
                    <th className="text-left font-medium px-4 py-3 w-[100px]">所属模块</th>
                    <th className="text-left font-medium px-4 py-3">触发</th>
                    <th className="text-left font-medium px-4 py-3">状态</th>
                    <th className="text-left font-medium px-4 py-3">下次执行</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">创建人</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">创建时间</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">最后更新</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">更新时间</th>
                    <th className="text-right font-medium px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredScenarios.length ? filteredScenarios.map((scenario) => (
                    <tr key={scenario.id} className="hover:bg-muted/20 transition">
                      <td className="px-4 py-3">
                        <div className="font-medium">{scenario.name}</div>
                        {scenario.description ? (
                          <div className="text-xs text-muted-foreground mt-0.5">{scenario.description}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="default">{scenario.module}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div>{scenario.triggerType === "EVENT" ? "业务事件" : "定时扫描"}</div>
                        <div className="text-xs text-muted-foreground">
                          {eventLabelMap[scenario.triggerEvent] ?? scenario.triggerEvent}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={scenario.isActive ? "success" : "default"}>
                          {scenario.isActive ? "启用" : "停用"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {scenario.triggerType === "SCHEDULE"
                          ? (scenario.nextRunAt ? new Date(scenario.nextRunAt).toLocaleString("zh-CN") : "待计算")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{scenario.createdByName}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(scenario.createdAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{scenario.updatedByName}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(scenario.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {scenario.canManageRecord ? (
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => setDialog({ type: "edit", scenario })}
                            >
                              编辑
                            </button>
                            <form action={async (formData) => { await runServerAction(() => toggleNotificationScenario(formData)); }}>
                              <input type="hidden" name="id" value={scenario.id} />
                              <button type="submit" className="text-primary hover:underline">
                                {scenario.isActive ? "停用" : "启用"}
                              </button>
                            </form>
                            <form action={async (formData) => {
                              const message = await runServerAction(() => testNotificationScenario(formData));
                              setTestFeedback(message);
                            }}>
                              <input type="hidden" name="id" value={scenario.id} />
                              <button type="submit" className="text-primary hover:underline">测试</button>
                            </form>
                            <form
                              action={async (formData) => {
                                if (!window.confirm("确认删除该场景？")) return;
                                await runServerAction(() => deleteNotificationScenario(formData));
                              }}
                            >
                              <input type="hidden" name="id" value={scenario.id} />
                              <button type="submit" className="text-destructive hover:underline">删除</button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                        {scenarioSearch.trim() || scenarioModuleFilter !== "all" || configDepartmentFilter !== "all" ? "没有匹配的场景" : "暂无场景，点击上方「新增场景」"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
            ) : (
            <>
            {orgFilter.showConfigDepartmentFilter ? (
              <div className="pb-3 flex flex-wrap items-center gap-2">
                <OrgFilterSelect
                  value={configDepartmentFilter}
                  onChange={setConfigDepartmentFilter}
                  options={configDepartmentTabs.map((tab) => ({
                    id: tab.id,
                    name: tab.id === "all" ? "全部部门" : tab.name,
                  }))}
                  ariaLabel="部门筛选"
                />
              </div>
            ) : null}
            <div className={`overflow-x-auto ${tableShellClass}`}>
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="text-left font-medium px-4 py-3">群名称</th>
                    <th className="text-left font-medium px-4 py-3">安全设置</th>
                    <th className="text-left font-medium px-4 py-3">安全值</th>
                    <th className="text-left font-medium px-4 py-3">Webhook 地址</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">创建人</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">创建时间</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">最后更新</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">更新时间</th>
                    <th className="text-right font-medium px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredGroupBots.length ? filteredGroupBots.map((bot) => (
                    <tr key={bot.id} className="hover:bg-muted/20 transition">
                      <td className="px-4 py-3 font-medium">{bot.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{securityTypeLabels[bot.securityType]}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate" title={bot.securityValue}>
                        {bot.securityValue}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[280px] truncate" title={bot.webhookUrl}>
                        {truncateMiddle(bot.webhookUrl)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{bot.createdByName}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(bot.createdAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{bot.updatedByName}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(bot.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {bot.canManageRecord ? (
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap text-sm">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => setGroupBotDialog({ type: "edit", bot })}
                            >
                              编辑
                            </button>
                            <form
                              action={async (formData) => {
                                if (!window.confirm(`确认删除群「${bot.name}」的配置？`)) return;
                                await runServerAction(() => deleteNotificationGroupBot(formData));
                              }}
                            >
                              <input type="hidden" name="id" value={bot.id} />
                              <button type="submit" className="text-destructive hover:underline">删除</button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        {configDepartmentFilter !== "all" ? "没有匹配的群机器人配置" : "暂无群机器人配置，点击上方「新增群机器人」"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog?.type === "edit" ? "编辑通知场景" : "新增通知场景"}
      >
        {dialog ? (
          <ScenarioForm
            scenario={dialog.scenario}
            eventOptions={eventOptions}
            moduleOptions={moduleOptions}
            recipientRuleLabels={recipientRuleLabels}
            scanOptions={scanOptions}
            users={users}
            groupBots={groupBots}
            onClose={() => setDialog(null)}
            onSaved={(message) => setTestFeedback(message)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(groupBotDialog)}
        onClose={() => setGroupBotDialog(null)}
        title={groupBotDialog?.type === "edit" ? "编辑群机器人" : "新增群机器人"}
      >
        {groupBotDialog ? (
          <GroupBotForm
            key={groupBotDialog.bot?.id ?? "create"}
            bot={groupBotDialog.bot}
            onClose={() => setGroupBotDialog(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
