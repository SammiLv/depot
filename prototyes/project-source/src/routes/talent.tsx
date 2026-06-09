import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, PageHeader, avatarColor } from "@/components/ui-kit";
import { Award, AlertCircle, Calendar, Star } from "lucide-react";

export const Route = createFileRoute("/talent")({
  head: () => ({ meta: [{ title: "人才发展 · 产品部" }] }),
  component: Talent,
});

const people = [
  { n: "周明轩", t: "B端组", title: "高级产品经理", level: "P6", years: 4, perf: ["A", "A", "B+", "A"], grid: "高潜高绩", tone: "success" as const },
  { n: "吴雨桐", t: "C端组", title: "产品经理", level: "P5", years: 2, perf: ["B+", "A", "A"], grid: "潜力新星", tone: "primary" as const },
  { n: "郑雅琪", t: "设计组", title: "高级设计师", level: "P6", years: 5, perf: ["A", "A+", "A"], grid: "高潜高绩", tone: "success" as const },
  { n: "孙宇航", t: "采购组", title: "采购经理", level: "P6", years: 6, perf: ["B+", "B+", "B"], grid: "中坚力量", tone: "info" as const },
  { n: "王梓涵", t: "B端组", title: "组长", level: "M1", years: 7, perf: ["A", "A", "A"], grid: "核心骨干", tone: "brand" as const },
];

function Talent() {
  return (
    <AppShell>
      <PageHeader title="人才发展" description="人才画像 · 9 宫格盘点 · 晋升与合同预警 · 奖励台账" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold mb-4">9 宫格人才盘点</h3>
          <div className="grid grid-cols-3 gap-2 aspect-[3/2]">
            {[
              { label: "潜力新星", n: 1, tone: "primary" }, { label: "高潜中绩", n: 2, tone: "info" }, { label: "高潜高绩", n: 2, tone: "success" },
              { label: "待发展", n: 1, tone: "default" }, { label: "中坚力量", n: 3, tone: "info" }, { label: "核心骨干", n: 2, tone: "brand" },
              { label: "观察", n: 0, tone: "default" }, { label: "稳定贡献", n: 2, tone: "default" }, { label: "明星员工", n: 2, tone: "success" },
            ].map((b, i) => {
              const map: Record<string, string> = {
                default: "bg-muted/60", primary: "bg-primary/10 border-primary/30",
                info: "bg-info/10 border-info/30", success: "bg-success/10 border-success/30",
                brand: "bg-brand/10 border-brand/30",
              };
              return (
                <div key={i} className={`rounded-lg border border-transparent p-3 flex flex-col justify-between ${map[b.tone]}`}>
                  <span className="text-xs text-muted-foreground">{b.label}</span>
                  <span className="text-2xl font-semibold tabular-nums self-end">{b.n}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>← 绩效低</span><span>↑ 潜力高</span><span>绩效高 →</span>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 text-warning-foreground flex items-center justify-center"><AlertCircle className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">合同到期</div>
                <div className="text-xl font-semibold">3 人</div>
              </div>
              <span className="text-xs text-primary cursor-pointer">查看</span>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Calendar className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">晋升候选</div>
                <div className="text-xl font-semibold">5 人</div>
              </div>
              <span className="text-xs text-primary cursor-pointer">查看</span>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand flex items-center justify-center"><Award className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">本季奖励</div>
                <div className="text-xl font-semibold">7 条</div>
              </div>
              <span className="text-xs text-primary cursor-pointer">查看</span>
            </div>
          </Card>
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold">人才画像</h3>
        </div>
        <div className="divide-y divide-border">
          {people.map((p) => (
            <div key={p.n} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition">
              <div className={`w-12 h-12 rounded-full text-white font-medium flex items-center justify-center ${avatarColor(p.n)}`}>{p.n[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.n}</span>
                  <Badge tone="default">{p.level}</Badge>
                  <Badge tone={p.tone}>{p.grid}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.title} · {p.t} · 在职 {p.years} 年</div>
              </div>
              <div className="hidden md:flex items-center gap-1">
                {p.perf.map((s, i) => (
                  <span key={i} className="w-8 h-8 rounded-md bg-muted text-xs font-semibold flex items-center justify-center">{s}</span>
                ))}
              </div>
              <div className="flex items-center gap-1 text-warning-foreground">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm font-medium">4.6</span>
              </div>
              <button className="text-xs text-primary hover:underline">详情</button>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
