import Link from "next/link";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getDashboardData } from "@/server/dashboard/dashboard-query";
import { Badge, Card, PageHeader, Progress, StatCard } from "@/components/ui-kit";
import { Target, CheckSquare, AlertTriangle, ClipboardCheck, TrendingUp, ChevronRight, Bell, CalendarRange } from "lucide-react";

function relativeTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

function activityIconTone(type: string): { tone: "primary" | "info" | "brand" | "warning"; icon: typeof Target } {
  switch (type) {
    case "KPI": return { tone: "brand", icon: ClipboardCheck };
    case "ANNUAL_GOAL": return { tone: "primary", icon: Target };
    case "QUARTERLY_WORK": return { tone: "info", icon: CalendarRange };
    case "TODO": return { tone: "primary", icon: CheckSquare };
    case "WARNING": return { tone: "warning", icon: AlertTriangle };
    case "INFO": return { tone: "info", icon: TrendingUp };
    default: return { tone: "info", icon: Bell };
  }
}

export default async function DashboardPage() {
  const currentUser = await requireCurrentUser();
  const data = await getDashboardData(currentUser);

  return (
    <>
      <PageHeader
        title={`欢迎回来，${data.currentUser.name}`}
        description={`当前身份：${data.currentUser.roleLabel}（${data.currentUser.teamName}）· 数据范围：${data.currentUser.dataScopeLabel}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.summaryCards.map((card) => {
          const Icon = card.title.includes("指标") ? Target
            : card.title.includes("审批") ? CheckSquare
            : card.title.includes("待办") ? CheckSquare
            : AlertTriangle;
          return (
            <StatCard
              key={card.title}
              label={card.title}
              value={card.value}
              hint={card.description}
              tone={card.tone}
              icon={<Icon className="w-5 h-5" />}
            />
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Annual goals progress */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">年度指标完成情况</h3>
              <p className="text-xs text-muted-foreground mt-0.5">2025 年度 · 产品部</p>
            </div>
            <Link href="/annual-goals" className="text-xs text-primary flex items-center gap-1 hover:underline">
              查看全部 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {data.annualGoals.length ? (
            <div className="space-y-4">
              {data.annualGoals.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{g.name}</span>
                      <Badge tone="default">{g.owner}</Badge>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{g.progress}%</span>
                  </div>
                  <Progress value={g.progress} tone={g.tone} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无年度指标数据</p>
          )}
        </Card>

        {/* Todos */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">我的待办</h3>
            <Link href="/todos" className="text-xs text-primary hover:underline">全部</Link>
          </div>
          <div className="space-y-3">
            {data.latestTodos.length ? (
              data.latestTodos.map((todo) => (
                <div key={todo.id} className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/60 transition">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug">{todo.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge tone="default">{todo.targetType ?? "待办"}</Badge>
                      {todo.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          截止：{new Date(todo.dueDate).toLocaleDateString("zh-CN")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">暂无待办</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* KPI progress */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">KPI 当前进度</h3>
              <p className="text-xs text-muted-foreground mt-0.5">流程状态分布</p>
            </div>
            <Link href="/kpi" className="text-xs text-primary flex items-center gap-1 hover:underline">
              查看 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {data.kpiStages.map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums">{s.count}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
              </div>
            ))}
          </div>
          {data.latestNotifications.filter((n) => !n.isRead).length > 0 && (
            <div className="mt-5 p-4 rounded-lg bg-accent/40 border border-border">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium">您有未读通知</div>
                  <div className="text-xs text-muted-foreground">
                    {data.latestNotifications.filter((n) => !n.isRead).length} 条新消息待查看
                  </div>
                </div>
                <Link href="/notifications" className="text-xs px-3 py-1.5 rounded-md bg-card border border-border hover:bg-muted">
                  查看
                </Link>
              </div>
            </div>
          )}
        </Card>

        {/* Quarterly work */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">季度工作完成情况</h3>
            <Link href="/quarterly-work" className="text-xs text-primary hover:underline">查看</Link>
          </div>
          {data.quarterlyWork.total > 0 ? (
            <>
              <div className="text-center py-3">
                <div className="relative inline-flex">
                  <svg className="w-32 h-32 -rotate-90">
                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="none" className="text-muted" />
                    <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="none" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 56}
                      strokeDashoffset={2 * Math.PI * 56 * (1 - data.quarterlyWork.progress / 100)}
                      className="text-primary" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-2xl font-semibold tabular-nums">{data.quarterlyWork.progress}%</div>
                    <div className="text-xs text-muted-foreground">整体完成</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">已完成</span>
                  <span className="font-medium">{data.quarterlyWork.completed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">进行中</span>
                  <span className="font-medium">{data.quarterlyWork.inProgress}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">延期</span>
                  <span className="font-medium text-destructive">{data.quarterlyWork.delayed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">未启动</span>
                  <span className="font-medium">{data.quarterlyWork.notStarted}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无季度工作数据</p>
          )}
        </Card>
      </div>

      {/* Activity feed */}
      <Card className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">最近动态</h3>
          <Badge tone="primary">实时</Badge>
        </div>
        {data.activityFeed.length ? (
          <div className="space-y-3">
            {data.activityFeed.map((a) => {
              const { tone, icon: Icon } = activityIconTone(a.type);
              const iconBgMap: Record<string, string> = {
                primary: "bg-primary/10 text-primary",
                info: "bg-info/15 text-info",
                brand: "bg-brand/15 text-brand",
                warning: "bg-warning/20 text-destructive",
              };
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBgMap[tone]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.what}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{relativeTime(a.time)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">暂无动态</p>
        )}
      </Card>
    </>
  );
}
