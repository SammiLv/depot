"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui-kit";
import { runServerAction } from "@/lib/run-server-action";
import {
  deleteNotificationScenario,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationScenario,
  testNotificationScenario,
  toggleNotificationScenario,
} from "@/server/notifications/actions";
import { AlertTriangle, Bell, CheckCircle2, Plus, X } from "lucide-react";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  targetType: string | null;
  targetId: string | null;
  isRead: boolean;
  createdAt: string;
};

type ScenarioRow = {
  id: string;
  name: string;
  description: string | null;
  triggerType: "EVENT" | "SCHEDULE";
  triggerEvent: string;
  scheduleConfig: unknown;
  nextRunAt: string | null;
  recipientConfig: unknown;
  channelConfig: unknown;
  conditionConfig: unknown;
  isActive: boolean;
  sortOrder: number;
};

type EventOption = {
  code: string;
  label: string;
  category: string;
  payloadFields: string[];
  recipientResolvers: string[];
};

type RecipientRule = {
  type: string;
  userIds?: string[];
  roleTypes?: Array<"ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER">;
};

type ChannelConfigState = {
  channels: Array<"IN_APP" | "DINGTALK">;
  notificationType: string;
  dingtalkNotifyType: number;
  titleTemplate: string;
  contentTemplate: string;
  messageUrlTemplate: string;
};

type ScheduleConfigState = {
  frequency: "daily" | "weekly";
  timeOfDay: string;
  weekdays: number[];
  scanType: string;
  daysBefore: number;
  timezone: string;
};

const iconMap: Record<string, { icon: typeof CheckCircle2; tone: string }> = {
  APPROVAL_TODO: { icon: CheckCircle2, tone: "success" },
  GOAL_UPDATE: { icon: CheckCircle2, tone: "success" },
  KPI_TODO: { icon: Bell, tone: "info" },
  WORK_DELAY: { icon: AlertTriangle, tone: "warning" },
  TALENT_WARNING: { icon: AlertTriangle, tone: "warning" },
  SYSTEM: { icon: Bell, tone: "info" },
};

const filterTabs = [
  { key: "all", label: "全部" },
  { key: "approval", label: "审批结果" },
  { key: "warning", label: "预警" },
  { key: "reminder", label: "提醒" },
] as const;

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

function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function defaultChannelConfig(): ChannelConfigState {
  return {
    channels: ["IN_APP", "DINGTALK"],
    notificationType: "KPI_TODO",
    dingtalkNotifyType: 5,
    titleTemplate: "{{year}}年Q{{quarter}} KPI 提醒",
    contentTemplate: "{{userName}}，请及时处理相关事项。",
    messageUrlTemplate: "{{appUrl}}/kpi/{{targetId}}",
  };
}

function defaultScheduleConfig(scanType = "kpi_self_review_pending"): ScheduleConfigState {
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
    notificationType: raw.notificationType ?? defaults.notificationType,
    dingtalkNotifyType: raw.dingtalkNotifyType ?? 5,
    titleTemplate: raw.titleTemplate ?? defaults.titleTemplate,
    contentTemplate: raw.contentTemplate ?? defaults.contentTemplate,
    messageUrlTemplate: raw.messageUrlTemplate ?? defaults.messageUrlTemplate,
  };
}

function parseScheduleConfig(value: unknown): ScheduleConfigState {
  const defaults = defaultScheduleConfig();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<ScheduleConfigState>;
  return {
    frequency: raw.frequency === "weekly" ? "weekly" : "daily",
    timeOfDay: raw.timeOfDay ?? "09:00",
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays : defaults.weekdays,
    scanType: raw.scanType ?? defaults.scanType,
    daysBefore: typeof raw.daysBefore === "number" ? raw.daysBefore : 0,
    timezone: raw.timezone ?? "Asia/Shanghai",
  };
}

function ScenarioForm({
  scenario,
  eventOptions,
  recipientRuleLabels,
  scanOptions,
  users,
  onClose,
}: {
  scenario?: ScenarioRow;
  eventOptions: EventOption[];
  recipientRuleLabels: Record<string, string>;
  scanOptions: Array<{ value: string; label: string; emitEvent: string }>;
  users: Array<{ id: string; name: string; roleType: string }>;
  onClose: () => void;
}) {
  const [triggerType, setTriggerType] = useState<"EVENT" | "SCHEDULE">(scenario?.triggerType ?? "EVENT");
  const [triggerEvent, setTriggerEvent] = useState(scenario?.triggerEvent ?? eventOptions[0]?.code ?? "kpi.initialized");
  const [rules, setRules] = useState<RecipientRule[]>(parseRecipientConfig(scenario?.recipientConfig));
  const [channelConfig, setChannelConfig] = useState(parseChannelConfig(scenario?.channelConfig));
  const [scheduleConfig, setScheduleConfig] = useState(parseScheduleConfig(scenario?.scheduleConfig));
  const [isActive, setIsActive] = useState(scenario?.isActive ?? true);

  const selectedEvent = eventOptions.find((event) => event.code === triggerEvent) ?? eventOptions[0];
  const availableResolvers = selectedEvent?.recipientResolvers
    ?? Object.keys(recipientRuleLabels);

  return (
    <form
      action={async (formData) => {
        await runServerAction(() => saveNotificationScenario(formData));
        onClose();
      }}
      className="space-y-4"
    >
      {scenario ? <input type="hidden" name="id" value={scenario.id} /> : null}
      <input type="hidden" name="triggerType" value={triggerType} />
      <input type="hidden" name="triggerEvent" value={triggerEvent} />
      <input type="hidden" name="recipientConfig" value={JSON.stringify({ rules, dedupeWindowHours: 24 })} />
      <input type="hidden" name="channelConfig" value={JSON.stringify(channelConfig)} />
      <input type="hidden" name="scheduleConfig" value={JSON.stringify(scheduleConfig)} />
      <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />

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
        <div className="flex items-end pb-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            启用场景
          </label>
        </div>
      </div>

      {triggerType === "EVENT" ? (
        <div>
          <label className="block text-sm font-medium mb-1">触发事件</label>
          <select
            value={triggerEvent}
            onChange={(event) => setTriggerEvent(event.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          >
            {eventOptions.map((event) => (
              <option key={event.code} value={event.code}>
                [{event.category}] {event.label}
              </option>
            ))}
          </select>
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
                onChange={(event) => setScheduleConfig((prev) => ({ ...prev, scanType: event.target.value }))}
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
              <label className="block text-sm font-medium mb-1">提前天数</label>
              <input
                type="number"
                min={0}
                value={scheduleConfig.daysBefore}
                onChange={(event) => setScheduleConfig((prev) => ({
                  ...prev,
                  daysBefore: Number(event.target.value) || 0,
                }))}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>
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
        <div className="flex gap-4 text-sm">
          {(["IN_APP", "DINGTALK"] as const).map((channel) => (
            <label key={channel} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={channelConfig.channels.includes(channel)}
                onChange={(event) => {
                  setChannelConfig((prev) => ({
                    ...prev,
                    channels: event.target.checked
                      ? [...new Set([...prev.channels, channel])]
                      : prev.channels.filter((item) => item !== channel),
                  }));
                }}
              />
              {channel === "IN_APP" ? "系统内通知" : "钉钉工作通知"}
            </label>
          ))}
        </div>
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

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">保存</Button>
      </div>
    </form>
  );
}

export function NotificationsContent({
  notifications,
  canManage,
  scenarios,
  users,
  eventOptions,
  recipientRuleLabels,
  scanOptions,
}: {
  notifications: NotificationRow[];
  canManage: boolean;
  scenarios: ScenarioRow[];
  users: Array<{ id: string; name: string; roleType: string }>;
  eventOptions: EventOption[];
  recipientRuleLabels: Record<string, string>;
  scanOptions: Array<{ value: string; label: string; emitEvent: string }>;
}) {
  const [mainTab, setMainTab] = useState<"inbox" | "scenarios">(canManage ? "inbox" : "inbox");
  const [filter, setFilter] = useState<(typeof filterTabs)[number]["key"]>("all");
  const [dialog, setDialog] = useState<{ type: "create" | "edit"; scenario?: ScenarioRow } | null>(null);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (filter === "all") return true;
      if (filter === "approval") return item.type === "APPROVAL_TODO";
      if (filter === "warning") return item.type === "WORK_DELAY" || item.type === "TALENT_WARNING";
      if (filter === "reminder") return item.type === "KPI_TODO" || item.type === "GOAL_UPDATE" || item.type === "SYSTEM";
      return true;
    });
  }, [filter, notifications]);

  const eventLabelMap = useMemo(
    () => Object.fromEntries(eventOptions.map((event) => [event.code, event.label])),
    [eventOptions],
  );

  return (
    <>
      <PageHeader
        title="通知中心"
        description="系统消息、审批结果、预警与提醒；可配置通知场景"
        action={canManage ? (
          <Button onClick={() => { setMainTab("scenarios"); setDialog({ type: "create" }); }}>
            <Plus className="w-4 h-4" />
            新增场景
          </Button>
        ) : undefined}
      />

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMainTab("inbox")}
          className={`px-3 py-1.5 rounded-lg text-sm ${mainTab === "inbox" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
        >
          我的通知
        </button>
        {canManage ? (
          <button
            type="button"
            onClick={() => setMainTab("scenarios")}
            className={`px-3 py-1.5 rounded-lg text-sm ${mainTab === "scenarios" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
          >
            场景配置
          </button>
        ) : null}
      </div>

      {mainTab === "inbox" ? (
        <>
          <div className="flex items-center gap-2 mb-4">
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
            <form
              className="ml-auto"
              action={async () => {
                await runServerAction(() => markAllNotificationsRead());
              }}
            >
              <button type="submit" className="text-xs text-primary hover:underline">全部标为已读</button>
            </form>
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="divide-y divide-border">
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
                    <div
                      key={notification.id}
                      className={`px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition ${notification.isRead ? "opacity-70" : ""}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${toneMap[meta.tone]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{notification.title}</span>
                          {!notification.isRead ? <Badge tone="primary">新</Badge> : null}
                        </div>
                        {notification.content ? (
                          <div className="text-xs text-muted-foreground mt-0.5">{notification.content}</div>
                        ) : null}
                        <div className="text-xs text-muted-foreground mt-0.5">{relativeTime(notification.createdAt)}</div>
                      </div>
                      <form
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
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无通知</div>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">场景</th>
                  <th className="text-left font-medium px-4 py-3">触发</th>
                  <th className="text-left font-medium px-4 py-3">状态</th>
                  <th className="text-left font-medium px-4 py-3">下次执行</th>
                  <th className="text-right font-medium px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scenarios.length ? scenarios.map((scenario) => (
                  <tr key={scenario.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{scenario.name}</div>
                      {scenario.description ? (
                        <div className="text-xs text-muted-foreground mt-0.5">{scenario.description}</div>
                      ) : null}
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
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ type: "edit", scenario })}>
                          编辑
                        </Button>
                        <form action={async (formData) => { await runServerAction(() => toggleNotificationScenario(formData)); }}>
                          <input type="hidden" name="id" value={scenario.id} />
                          <Button type="submit" variant="outline" size="sm">
                            {scenario.isActive ? "停用" : "启用"}
                          </Button>
                        </form>
                        <form action={async (formData) => { await runServerAction(() => testNotificationScenario(formData)); }}>
                          <input type="hidden" name="id" value={scenario.id} />
                          <Button type="submit" variant="outline" size="sm">测试</Button>
                        </form>
                        <form
                          action={async (formData) => {
                            if (!window.confirm("确认删除该场景？")) return;
                            await runServerAction(() => deleteNotificationScenario(formData));
                          }}
                        >
                          <input type="hidden" name="id" value={scenario.id} />
                          <Button type="submit" variant="ghost" size="sm">删除</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      暂无场景，点击右上角新增
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog?.type === "edit" ? "编辑通知场景" : "新增通知场景"}
      >
        {dialog ? (
          <ScenarioForm
            scenario={dialog.scenario}
            eventOptions={eventOptions}
            recipientRuleLabels={recipientRuleLabels}
            scanOptions={scanOptions}
            users={users}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
