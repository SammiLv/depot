import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/todos")({
  head: () => ({ meta: [{ title: "我的待办 · 产品部" }] }),
  component: Todos,
});

const tabs = [
  { k: "approve", l: "待我审批", n: 5, tone: "warning" as const },
  { k: "update", l: "待我更新", n: 3, tone: "primary" as const },
  { k: "submit", l: "我提交的", n: 8, tone: "info" as const },
  { k: "done", l: "已完成", n: 24, tone: "success" as const },
];

const items = [
  { title: "审批 周明轩 提交的 Q4 个人季度指标", from: "周明轩 · B端组", type: "年度指标", tone: "primary" as const, time: "2 小时前" },
  { title: "审批 吴雨桐 KPI 自评", from: "吴雨桐 · C端组", type: "KPI", tone: "brand" as const, time: "今天 10:24" },
  { title: "审批 采购组 Q4 季度规划", from: "孙宇航 · 采购组", type: "季度工作", tone: "info" as const, time: "今天 09:08" },
  { title: "审批 郑雅琪 设计系统 v2 节点延期", from: "郑雅琪 · 设计组", type: "延期", tone: "warning" as const, time: "昨天" },
  { title: "审批 王梓涵 B端组 KPI 模板", from: "王梓涵 · B端组", type: "KPI", tone: "brand" as const, time: "2 天前" },
];

function Todos() {
  return (
    <AppShell>
      <PageHeader title="我的待办" description="所有需要我处理或我提交后等待反馈的事项" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {tabs.map((t, i) => (
          <button key={t.k} className={`text-left rounded-xl p-4 border transition ${i === 0 ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"}`}>
            <div className="text-xs text-muted-foreground">{t.l}</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{t.n}</span>
              <Badge tone={t.tone}>{t.l}</Badge>
            </div>
          </button>
        ))}
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">待我审批 (5)</h3>
          <div className="flex gap-2 text-xs">
            <button className="px-2 py-1 rounded-md hover:bg-muted">全部</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">指标</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">KPI</button>
            <button className="px-2 py-1 rounded-md hover:bg-muted">季度工作</button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {items.map((it, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={it.tone}>{it.type}</Badge>
                  <span className="text-sm font-medium truncate">{it.title}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{it.from} · {it.time}</div>
              </div>
              <button className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:bg-muted flex items-center gap-1"><X className="w-3 h-3" />驳回</button>
              <button className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"><Check className="w-3 h-3" />通过</button>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
