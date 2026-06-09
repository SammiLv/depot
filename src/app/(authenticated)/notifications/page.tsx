import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { Bell, CheckCircle2, AlertTriangle } from "lucide-react";

const iconMap: Record<string, { icon: typeof CheckCircle2; tone: string }> = {
  APPROVAL_TODO: { icon: CheckCircle2, tone: "success" },
  GOAL_UPDATE: { icon: CheckCircle2, tone: "success" },
  KPI_TODO: { icon: Bell, tone: "info" },
  WORK_DELAY: { icon: AlertTriangle, tone: "warning" },
  TALENT_WARNING: { icon: AlertTriangle, tone: "warning" },
  SYSTEM: { icon: Bell, tone: "info" },
};

function relativeTime(date: Date): string {
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

export default async function NotifsPage() {
  const currentUser = await requireCurrentUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader title="通知中心" description="系统消息、审批结果、预警与提醒" />

      <div className="flex items-center gap-2 mb-4">
        {["全部", "审批结果", "预警", "提醒", "评论"].map((t, i) => (
          <button key={t} className={`px-3 py-1.5 rounded-lg text-sm ${i === 0 ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>{t}</button>
        ))}
        <button className="ml-auto text-xs text-primary hover:underline">全部标为已读</button>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {notifications.length ? (
            notifications.map((n) => {
              const meta = iconMap[n.type] ?? { icon: Bell, tone: "info" };
              const Icon = meta.icon;
              const toneMap: Record<string, string> = {
                success: "bg-success/15 text-success",
                warning: "bg-warning/20 text-warning-foreground",
                primary: "bg-primary/10 text-primary",
                info: "bg-info/15 text-info",
              };
              return (
                <div key={n.id} className={`px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition ${n.isRead ? "opacity-70" : ""}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${toneMap[meta.tone]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.isRead && <Badge tone="primary">新</Badge>}
                    </div>
                    {n.content && <div className="text-xs text-muted-foreground mt-0.5">{n.content}</div>}
                    <div className="text-xs text-muted-foreground mt-0.5">{relativeTime(n.createdAt)}</div>
                  </div>
                  <button className="text-xs text-primary hover:underline">查看</button>
                </div>
              );
            })
          ) : (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无通知</div>
          )}
        </div>
      </Card>
    </>
  );
}
