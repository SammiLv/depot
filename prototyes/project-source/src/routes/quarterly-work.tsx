import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { Plus, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/quarterly-work")({
  head: () => ({ meta: [{ title: "季度工作 · 产品部" }] }),
  component: QuarterlyWork,
});

const columns = [
  { key: "todo", title: "未启动", tone: "default" as const, items: [{ t: "B 端订单中心重构", o: "周明轩", w: 4 }] },
  { key: "doing", title: "进行中", tone: "primary" as const, items: [
    { t: "C 端会员体系升级", o: "吴雨桐", w: 8, p: 60 },
    { t: "设计系统 v2 推广", o: "郑雅琪", w: 6, p: 35 },
    { t: "供应商对账打通", o: "孙宇航", w: 5, p: 50 },
  ]},
  { key: "delayed", title: "延期", tone: "warning" as const, items: [{ t: "B 端报表性能优化", o: "周明轩", w: 6, p: 40, delay: 2 }] },
  { key: "done", title: "已完成", tone: "success" as const, items: [
    { t: "Q4 OKR 拆解会议", o: "李文博", w: 2 },
    { t: "采购合同模板更新", o: "孙宇航", w: 3 },
  ]},
];

const valueItems = [
  { name: "B 端订单中心重构", owner: "周明轩", expected: "效率 +30%", actual: "效率 +24%", roi: 82, trend: "up", tone: "primary" as const },
  { name: "C 端会员体系升级", owner: "吴雨桐", expected: "付费率 +5%", actual: "付费率 +6.2%", roi: 124, trend: "up", tone: "success" as const },
  { name: "供应商对账打通", owner: "孙宇航", expected: "对账周期 -50%", actual: "对账周期 -28%", roi: 56, trend: "down", tone: "warning" as const },
  { name: "设计系统 v2 推广", owner: "郑雅琪", expected: "复用率 80%", actual: "复用率 71%", roi: 89, trend: "up", tone: "primary" as const },
];

function QuarterlyWork() {
  const [tab, setTab] = useState<"board" | "value">("board");

  return (
    <AppShell>
      <PageHeader
        title="2025 Q4 季度工作"
        description="按小组规划季度工作 · 月度拆解 · 每周更新进展，延期自动预警；上线后跟踪需求价值"
        action={<Button><Plus className="w-4 h-4" />新增季度工作</Button>}
      />

      <div className="mb-5 inline-flex p-1 rounded-lg bg-muted">
        {[
          { k: "board", label: "工作看板" },
          { k: "value", label: "需求价值跟踪" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as "board" | "value")}
            className={`px-4 py-1.5 rounded-md text-sm transition ${
              tab === t.k ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "board" ? (
        <>
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {["全部", "采购组", "B端组", "C端组", "设计组"].map((t, i) => (
              <button key={t} className={`px-3 py-1.5 rounded-lg text-sm transition ${i === 0 ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
                {t}
              </button>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">第 42 周 · 截至 2025-10-17 18:00 前更新</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {columns.map((c) => (
              <div key={c.key} className="bg-muted/40 rounded-xl p-3 min-h-[400px]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.tone}>{c.title}</Badge>
                    <span className="text-xs text-muted-foreground">{c.items.length}</span>
                  </div>
                  <button className="text-xs text-muted-foreground hover:text-foreground">+ 添加</button>
                </div>
                <div className="space-y-2">
                  {c.items.map((it, i) => (
                    <div key={i} className="bg-card rounded-lg p-3 border border-border hover:border-primary/40 transition cursor-pointer">
                      <div className="text-sm font-medium leading-snug">{it.t}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{it.o}</span>
                        <span>{it.w} 周</span>
                      </div>
                      {"p" in it && it.p !== undefined && (
                        <div className="mt-2">
                          <Progress value={it.p} tone={c.tone === "warning" ? "warning" : "primary"} />
                        </div>
                      )}
                      {"delay" in it && it.delay && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-warning-foreground">
                          <AlertTriangle className="w-3 h-3" />延期 {it.delay} 周
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Card className="mt-6">
            <h3 className="font-semibold mb-3">本周更新提醒</h3>
            <div className="space-y-2">
              {[
                { who: "周明轩", task: "B 端订单中心重构", status: "待更新", tone: "warning" as const },
                { who: "吴雨桐", task: "C 端会员体系升级", status: "已更新", tone: "success" as const },
                { who: "郑雅琪", task: "设计系统 v2 推广", status: "已更新", tone: "success" as const },
                { who: "孙宇航", task: "供应商对账打通", status: "待更新", tone: "warning" as const },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{r.who[0]}</div>
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
        </>
      ) : (
        <>
          <div className="mb-4 text-sm text-muted-foreground">
            对季度工作中已上线需求的<span className="text-foreground font-medium"> 预期收益 vs 实际收益 </span>进行对比与 ROI 跟踪。
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {valueItems.map((it) => (
              <Card key={it.name}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">负责人：{it.owner}</div>
                  </div>
                  <Badge tone={it.tone}>ROI {it.roi}%</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-xs text-muted-foreground">预期</div>
                    <div className="font-medium mt-0.5">{it.expected}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-xs text-muted-foreground">实际</div>
                    <div className="font-medium mt-0.5 flex items-center gap-1">
                      {it.actual}
                      {it.trend === "up" ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : <TrendingDown className="w-3.5 h-3.5 text-warning-foreground" />}
                    </div>
                  </div>
                </div>
                <Progress value={it.roi} tone={it.roi >= 100 ? "success" : it.roi >= 70 ? "primary" : "warning"} />
              </Card>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
