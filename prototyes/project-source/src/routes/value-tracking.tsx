import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, PageHeader, Progress } from "@/components/ui-kit";
import { TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/value-tracking")({
  head: () => ({ meta: [{ title: "需求价值跟踪 · 产品部" }] }),
  component: ValueTracking,
});

const items = [
  { name: "B 端订单中心重构", owner: "周明轩", expected: "效率 +30%", actual: "效率 +24%", roi: 82, trend: "up", tone: "primary" as const },
  { name: "C 端会员体系升级", owner: "吴雨桐", expected: "付费率 +5%", actual: "付费率 +6.2%", roi: 124, trend: "up", tone: "success" as const },
  { name: "供应商对账打通", owner: "孙宇航", expected: "对账周期 -50%", actual: "对账周期 -28%", roi: 56, trend: "down", tone: "warning" as const },
  { name: "设计系统 v2 推广", owner: "郑雅琪", expected: "复用率 80%", actual: "复用率 71%", roi: 89, trend: "up", tone: "primary" as const },
];

function ValueTracking() {
  return (
    <AppShell>
      <PageHeader title="需求价值跟踪" description="对已上线需求的预期收益 vs 实际收益对比与 ROI 跟踪" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((it) => (
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
    </AppShell>
  );
}
