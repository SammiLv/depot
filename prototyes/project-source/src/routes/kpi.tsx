import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, PageHeader, Progress, avatarColor } from "@/components/ui-kit";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/kpi")({
  head: () => ({ meta: [{ title: "KPI 管理 · 产品部" }] }),
  component: KpiPage,
});

const stages = ["待制定", "待审批", "执行中", "自评中", "已评分", "已完成"];

const rows = [
  { n: "周明轩", t: "B端组", st: "执行中", tone: "primary" as const, score: "—", p: 60, kpis: 4 },
  { n: "吴雨桐", t: "C端组", st: "自评中", tone: "info" as const, score: "—", p: 88, kpis: 5 },
  { n: "郑雅琪", t: "设计组", st: "已评分", tone: "success" as const, score: "92", p: 100, kpis: 4 },
  { n: "孙宇航", t: "采购组", st: "待审批", tone: "warning" as const, score: "—", p: 0, kpis: 3 },
  { n: "刘亦菲", t: "C端组", st: "已完成", tone: "success" as const, score: "88", p: 100, kpis: 5 },
  { n: "王梓涵", t: "B端组", st: "待制定", tone: "default" as const, score: "—", p: 0, kpis: 0 },
];

function KpiPage() {
  return (
    <AppShell>
      <PageHeader
        title="2025 Q4 KPI"
        description="参考 KPI 模板与小组季度目标生成草稿（弱关联）· 组长审批 → 主管终审 → 季末自评与评分"
        action={
          <div className="flex gap-2">
            <Button variant="outline">导入模板</Button>
            <Button><Plus className="w-4 h-4" />生成 KPI</Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">流程进度</h3>
          <span className="text-xs text-muted-foreground">共 {rows.length} 名成员</span>
        </div>
        <div className="flex items-center gap-2">
          {stages.map((s, i) => {
            const counts = [1, 1, 1, 1, 1, 1];
            return (
              <div key={s} className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted">
                    <div className="h-full" style={{ width: "100%", background: i === 0 ? "var(--muted-foreground)" : "var(--primary)" }} />
                  </div>
                  {i < stages.length - 1 && <div className="w-2" />}
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">{s}</span>
                  <span className="text-sm font-semibold tabular-nums">{counts[i]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input placeholder="搜索成员" className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted text-sm focus:outline-none" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>小组：</span>
            <button className="px-2 py-1 rounded-md bg-primary/10 text-primary">全部</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">B端</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">C端</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">设计</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">采购</button>
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground text-left">
              <th className="px-5 py-3 font-medium">成员</th>
              <th className="px-5 py-3 font-medium">小组</th>
              <th className="px-5 py-3 font-medium">KPI 数</th>
              <th className="px-5 py-3 font-medium">阶段</th>
              <th className="px-5 py-3 font-medium w-48">完成度</th>
              <th className="px-5 py-3 font-medium">得分</th>
              <th className="px-5 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n} className="border-t border-border hover:bg-muted/30 transition">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full text-white text-xs font-medium flex items-center justify-center ${avatarColor(r.n)}`}>{r.n[0]}</div>
                    <span className="text-sm font-medium">{r.n}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{r.t}</td>
                <td className="px-5 py-3 text-sm tabular-nums">{r.kpis}</td>
                <td className="px-5 py-3"><Badge tone={r.tone}>{r.st}</Badge></td>
                <td className="px-5 py-3"><Progress value={r.p} tone={r.tone === "warning" ? "warning" : r.tone === "success" ? "success" : "primary"} /></td>
                <td className="px-5 py-3 text-sm font-semibold tabular-nums">{r.score}</td>
                <td className="px-5 py-3 text-right">
                  <button className="text-xs text-primary hover:underline">查看详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
