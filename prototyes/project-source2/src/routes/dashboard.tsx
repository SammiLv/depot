import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, PageHeader, Progress, StatCard } from "@/components/ui-kit";
import { Target, CheckSquare, AlertTriangle, ClipboardCheck, TrendingUp, ChevronRight, CalendarRange } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "首页工作台 · 产品部" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [user, setUser] = useState(() => getCurrentUser());
  useEffect(() => setUser(getCurrentUser()), []);

  return (
    <AppShell>
      <PageHeader
        title={`欢迎回来，${user.name}`}
        description={`今天是 2025-Q4 · 你当前的身份是 ${user.roleLabel}（${user.team}）。`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="年度指标完成度" value="68%" hint="较上周 +4%" tone="primary" icon={<Target className="w-5 h-5" />} />
        <StatCard label="本周待更新" value="7" hint="3 项已逾期" tone="warning" icon={<CalendarRange className="w-5 h-5" />} />
        <StatCard label="待我审批" value="5" hint="2 项 KPI、3 项指标" tone="info" icon={<CheckSquare className="w-5 h-5" />} />
        <StatCard label="风险预警" value="3" hint="1 项严重" tone="brand" icon={<AlertTriangle className="w-5 h-5" />} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Annual goals */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">年度指标完成情况</h3>
              <p className="text-xs text-muted-foreground mt-0.5">2025 年度 · 产品部</p>
            </div>
            <Link to="/annual-goals" className="text-xs text-primary flex items-center gap-1 hover:underline">查看全部 <ChevronRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-4">
            {[
              { name: "GMV 突破 5 亿", value: 72, owner: "B端组", tone: "primary" as const },
              { name: "C 端月活 800 万", value: 84, owner: "C端组", tone: "success" as const },
              { name: "采购成本下降 8%", value: 41, owner: "采购组", tone: "warning" as const },
              { name: "用户体验 NPS ≥ 60", value: 55, owner: "设计组", tone: "primary" as const },
            ].map((g) => (
              <div key={g.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{g.name}</span>
                    <Badge tone="default">{g.owner}</Badge>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{g.value}%</span>
                </div>
                <Progress value={g.value} tone={g.tone} />
              </div>
            ))}
          </div>
        </Card>

        {/* Todos */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">我的待办</h3>
            <Link to="/todos" className="text-xs text-primary hover:underline">全部</Link>
          </div>
          <div className="space-y-3">
            {[
              { t: "审批 周明轩 Q4 季度指标", tag: "指标", tone: "primary" as const, time: "2 小时前" },
              { t: "审批 吴雨桐 KPI 自评", tag: "KPI", tone: "brand" as const, time: "今天" },
              { t: "更新 B端组 第 42 周进展", tag: "周更新", tone: "info" as const, time: "今天截止" },
              { t: "回复 郑雅琪 人才盘点反馈", tag: "人才", tone: "success" as const, time: "明天" },
              { t: "审批 采购组 季度规划", tag: "规划", tone: "warning" as const, time: "3 天前" },
            ].map((it, i) => (
              <div key={i} className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/60 transition">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">{it.t}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge tone={it.tone}>{it.tag}</Badge>
                    <span className="text-xs text-muted-foreground">{it.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* KPI progress */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">KPI 当前进度</h3>
              <p className="text-xs text-muted-foreground mt-0.5">2025 Q4 · 流程状态分布</p>
            </div>
            <Link to="/kpi" className="text-xs text-primary flex items-center gap-1 hover:underline">查看 <ChevronRight className="w-3 h-3" /></Link>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "待制定", count: 2, tone: "default" as const },
              { label: "待审批", count: 5, tone: "warning" as const },
              { label: "执行中", count: 8, tone: "primary" as const },
              { label: "自评中", count: 3, tone: "info" as const },
              { label: "已完成", count: 12, tone: "success" as const },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums">{s.count}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 p-4 rounded-lg bg-accent/40 border border-border">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">Q4 KPI 制定即将到期</div>
                <div className="text-xs text-muted-foreground">还有 2 名成员未完成 KPI 制定，截止 2025-10-15</div>
              </div>
              <button className="text-xs px-3 py-1.5 rounded-md bg-card border border-border hover:bg-muted">提醒</button>
            </div>
          </div>
        </Card>

        {/* Quarterly work */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">季度工作完成情况</h3>
            <Link to="/quarterly-work" className="text-xs text-primary hover:underline">查看</Link>
          </div>
          <div className="text-center py-3">
            <div className="relative inline-flex">
              <svg className="w-32 h-32 -rotate-90">
                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="none" className="text-muted" />
                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="none" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 56} strokeDashoffset={2 * Math.PI * 56 * (1 - 0.62)}
                  className="text-primary" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-semibold tabular-nums">62%</div>
                <div className="text-xs text-muted-foreground">整体完成</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">已完成</span><span className="font-medium">18</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">进行中</span><span className="font-medium">9</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">延期</span><span className="font-medium text-warning-foreground">3</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">未启动</span><span className="font-medium">2</span></div>
          </div>
        </Card>
      </div>

      {/* Activity */}
      <Card className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">最近动态</h3>
          <Badge tone="primary">实时</Badge>
        </div>
        <div className="space-y-3">
          {[
            { who: "周明轩", what: "提交了 Q4 个人季度指标，等待 组长 王梓涵 审批", time: "10 分钟前", icon: Target, tone: "primary" as const },
            { who: "刘亦菲", what: "通过了 吴雨桐 的 KPI 自评，等待主管终评", time: "1 小时前", icon: ClipboardCheck, tone: "info" as const },
            { who: "李文博", what: "新增 2025 部门年度指标：用户体验 NPS ≥ 60", time: "2 小时前", icon: TrendingUp, tone: "brand" as const },
            { who: "系统", what: "B端组 第 42 周进展更新延期，已生成预警", time: "今天 09:00", icon: AlertTriangle, tone: "warning" as const },
          ].map((a, i) => {
            const Icon = a.icon;
            const map: Record<string, string> = {
              primary: "bg-primary/10 text-primary", info: "bg-info/15 text-info",
              brand: "bg-brand/15 text-brand", warning: "bg-warning/20 text-warning-foreground",
            };
            return (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${map[a.tone]}`}><Icon className="w-4 h-4" /></div>
                <div className="flex-1">
                  <div className="text-sm"><span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.what}</span></div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}
