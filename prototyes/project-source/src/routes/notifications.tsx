import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { Bell, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "通知中心 · 产品部" }] }),
  component: Notifs,
});

const items = [
  { icon: CheckCircle2, tone: "success", title: "你的 Q4 KPI 已通过主管终审", time: "刚刚", new: true },
  { icon: AlertTriangle, tone: "warning", title: "B 端报表性能优化 已延期 2 周，请尽快更新", time: "1 小时前", new: true },
  { icon: MessageSquare, tone: "primary", title: "组长 王梓涵 评论了你的周更新", time: "今天 11:02", new: true },
  { icon: Bell, tone: "info", title: "Q4 KPI 自评窗口将于 10-20 关闭", time: "今天 09:00", new: false },
  { icon: CheckCircle2, tone: "success", title: "年度指标「GMV 突破 5 亿」进度更新至 72%", time: "昨天", new: false },
  { icon: Bell, tone: "info", title: "系统将于本周日 02:00-04:00 维护升级", time: "2 天前", new: false },
];

function Notifs() {
  return (
    <AppShell>
      <PageHeader title="通知中心" description="系统消息、审批结果、预警与提醒" />

      <div className="flex items-center gap-2 mb-4">
        {["全部", "审批结果", "预警", "提醒", "评论"].map((t, i) => (
          <button key={t} className={`px-3 py-1.5 rounded-lg text-sm ${i === 0 ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>{t}</button>
        ))}
        <button className="ml-auto text-xs text-primary hover:underline">全部标为已读</button>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {items.map((it, i) => {
            const Icon = it.icon;
            const toneMap: Record<string, string> = {
              success: "bg-success/15 text-success", warning: "bg-warning/20 text-warning-foreground",
              primary: "bg-primary/10 text-primary", info: "bg-info/15 text-info",
            };
            return (
              <div key={i} className={`px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition ${it.new ? "" : "opacity-70"}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${toneMap[it.tone]}`}><Icon className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{it.title}</span>
                    {it.new && <Badge tone="primary">新</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{it.time}</div>
                </div>
                <button className="text-xs text-primary hover:underline">查看</button>
              </div>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}
