import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { Plus, Filter, ChevronDown, Target, TrendingUp, GitBranch, History } from "lucide-react";

export const Route = createFileRoute("/annual-goals")({
  head: () => ({ meta: [{ title: "年度指标 · 产品部" }] }),
  component: AnnualGoals,
});

// 年度指标方案 → 年度指标项（含权重）+ 季度目标
const plans = [
  {
    id: "P-DEPT",
    name: "产品部 2025 年度指标方案",
    scope: "部门",
    owner: "产品部",
    version: "v1.2",
    active: true,
    revised: true,
    revisedReason: "Q3 战略调整：上调 GMV 目标，下调采购成本权重",
    status: "已生效",
    tone: "success" as const,
    weightedProgress: 68,
    items: [
      { id: "M1", name: "GMV 突破 5 亿", target: "5 亿", current: "3.6 亿", unit: "元", weight: 30, progress: 72, tone: "primary" as const,
        q: [{ q: "Q1", t: 25, c: 22 }, { q: "Q2", t: 50, c: 48 }, { q: "Q3", t: 70, c: 65 }, { q: "Q4", t: 90, c: 0 }] },
      { id: "M2", name: "C 端月活 800 万", target: "800万", current: "672万", unit: "MAU", weight: 25, progress: 84, tone: "success" as const,
        q: [{ q: "Q1", t: 40, c: 42 }, { q: "Q2", t: 60, c: 63 }, { q: "Q3", t: 80, c: 84 }, { q: "Q4", t: 100, c: 0 }] },
      { id: "M3", name: "采购成本下降 8%", target: "-8%", current: "-3.3%", unit: "%", weight: 20, progress: 41, tone: "warning" as const,
        q: [{ q: "Q1", t: 10, c: 8 }, { q: "Q2", t: 25, c: 18 }, { q: "Q3", t: 55, c: 41 }, { q: "Q4", t: 80, c: 0 }] },
      { id: "M4", name: "用户体验 NPS ≥ 60", target: "≥ 60", current: "52", unit: "分", weight: 25, progress: 55, tone: "primary" as const,
        q: [{ q: "Q1", t: 20, c: 18 }, { q: "Q2", t: 35, c: 33 }, { q: "Q3", t: 55, c: 52 }, { q: "Q4", t: 75, c: 0 }] },
    ],
  },
  {
    id: "P-B",
    name: "B端组 2025 年度指标方案",
    scope: "小组",
    owner: "B端组",
    version: "v1.0",
    active: true,
    revised: false,
    status: "执行中",
    tone: "primary" as const,
    weightedProgress: 70,
    items: [
      { id: "B1", name: "B 端新品上线 12 款", target: "12", current: "8", unit: "款", weight: 50, progress: 67, tone: "primary" as const,
        q: [{ q: "Q1", t: 25, c: 25 }, { q: "Q2", t: 50, c: 50 }, { q: "Q3", t: 70, c: 67 }, { q: "Q4", t: 100, c: 0 }] },
      { id: "B2", name: "大客户续约率 ≥ 90%", target: "90%", current: "86%", unit: "%", weight: 50, progress: 73, tone: "primary" as const,
        q: [{ q: "Q1", t: 80, c: 82 }, { q: "Q2", t: 85, c: 84 }, { q: "Q3", t: 90, c: 86 }, { q: "Q4", t: 90, c: 0 }] },
    ],
  },
  {
    id: "P-C",
    name: "C端组 2025 年度指标方案",
    scope: "小组",
    owner: "C端组",
    version: "v1.1",
    active: true,
    revised: true,
    revisedReason: "Q2 调整：新增直播 GMV 指标项",
    status: "已生效",
    tone: "success" as const,
    weightedProgress: 78,
    items: [
      { id: "C1", name: "月活 800 万", target: "800万", current: "672万", unit: "MAU", weight: 60, progress: 84, tone: "success" as const,
        q: [{ q: "Q1", t: 40, c: 42 }, { q: "Q2", t: 60, c: 63 }, { q: "Q3", t: 80, c: 84 }, { q: "Q4", t: 100, c: 0 }] },
      { id: "C2", name: "直播 GMV 6000 万", target: "6000万", current: "4080万", unit: "元", weight: 40, progress: 68, tone: "primary" as const,
        q: [{ q: "Q1", t: 20, c: 18 }, { q: "Q2", t: 45, c: 42 }, { q: "Q3", t: 68, c: 68 }, { q: "Q4", t: 100, c: 0 }] },
    ],
  },
];

function AnnualGoals() {
  return (
    <AppShell>
      <PageHeader
        title="2025 年度指标方案"
        description="部门方案 → 小组方案（含加权指标项 + 季度目标），支持审批、周更新和年中调整版本"
        action={
          <div className="flex gap-2">
            <Button variant="outline"><History className="w-4 h-4" />版本记录</Button>
            <Button variant="outline"><Filter className="w-4 h-4" />筛选</Button>
            <Button><Plus className="w-4 h-4" />新建方案</Button>
          </div>
        }
      />

      <Card className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">年度方案加权完成度</div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight tabular-nums">68%</span>
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <TrendingUp className="w-4 h-4" />较上周 +4%
              </span>
            </div>
            <div className="mt-3 max-w-xl">
              <Progress value={68} tone="primary" />
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>3 个方案 · 8 项指标 · 按权重汇总</span>
              <span>距年终还剩 92 天</span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Target className="w-7 h-7" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { l: "方案总数", v: "3", t: "default" as const },
          { l: "指标项", v: "8", t: "primary" as const },
          { l: "落后预警", v: "1", t: "warning" as const },
          { l: "年中调整版本", v: "2", t: "info" as const },
        ].map((s) => (
          <Card key={s.l}>
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{s.v}</span>
              <Badge tone={s.t}>{s.l}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {plans.map((p) => (
          <Card key={p.id} className="!p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="default">{p.scope}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                  <Badge tone={p.tone}>{p.status}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="w-3 h-3" />{p.version}
                    {p.active && <span className="ml-1 px-1.5 py-0.5 rounded bg-success/10 text-success text-[10px]">当前生效</span>}
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-semibold">{p.name}</h3>
                <div className="mt-1 text-xs text-muted-foreground">负责：{p.owner}</div>
                {p.revised && (
                  <div className="mt-2 inline-flex items-start gap-2 text-xs bg-info/10 text-info px-2.5 py-1.5 rounded-md">
                    <History className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>年中调整：{p.revisedReason}</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">加权完成度</div>
                <div className="text-2xl font-bold tabular-nums text-primary">{p.weightedProgress}%</div>
                <button className="mt-1 text-xs text-primary hover:underline inline-flex items-center gap-1">查看详情 <ChevronDown className="w-3 h-3" /></button>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-12 gap-3 text-xs text-muted-foreground">
              <div className="col-span-4">指标项</div>
              <div className="col-span-1 text-right">权重</div>
              <div className="col-span-2">目标 / 当前</div>
              <div className="col-span-2">完成度</div>
              <div className="col-span-3">季度目标进度</div>
            </div>

            <div className="divide-y divide-border">
              {p.items.map((m) => (
                <div key={m.id} className="px-5 py-4 grid grid-cols-12 gap-3 items-center hover:bg-muted/20 transition">
                  <div className="col-span-4">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{m.id} · 单位 {m.unit}</div>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="inline-flex items-center justify-center min-w-[42px] px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold tabular-nums">{m.weight}%</span>
                  </div>
                  <div className="col-span-2 text-sm">
                    <div className="font-medium">{m.target}</div>
                    <div className="text-xs text-muted-foreground">当前 {m.current}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <Progress value={m.progress} tone={m.tone} />
                      <span className="text-xs font-semibold tabular-nums w-9 text-right">{m.progress}%</span>
                    </div>
                  </div>
                  <div className="col-span-3 grid grid-cols-4 gap-1.5">
                    {m.q.map((qt) => {
                      const done = qt.c >= qt.t && qt.c > 0;
                      const lag = qt.c > 0 && qt.c < qt.t;
                      const future = qt.c === 0;
                      return (
                        <div key={qt.q} className={`rounded-md p-1.5 text-center border ${future ? "bg-muted/40 border-border" : done ? "bg-success/10 border-success/30" : lag ? "bg-warning/10 border-warning/30" : "bg-muted/40 border-border"}`}>
                          <div className="text-[10px] text-muted-foreground">{qt.q}</div>
                          <div className="text-xs font-medium tabular-nums">{future ? `目标 ${qt.t}%` : `${qt.c}/${qt.t}%`}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">权重合计 {p.items.reduce((s, i) => s + i.weight, 0)}% · 共 {p.items.length} 项</span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-md hover:bg-muted text-foreground">维护指标项</button>
                <button className="px-3 py-1.5 rounded-md hover:bg-muted text-foreground">拆解季度目标</button>
                <button className="px-3 py-1.5 rounded-md hover:bg-muted text-foreground">周更新</button>
                <button className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">创建调整版本</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
