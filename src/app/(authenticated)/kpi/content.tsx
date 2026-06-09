"use client";

import { Badge, Button, Card, PageHeader, Progress, avatarColor } from "@/components/ui-kit";
import { Plus, Search } from "lucide-react";
import type { getKpiData } from "@/server/kpi/kpi-query";

type Props = { data: Awaited<ReturnType<typeof getKpiData>> };

export function KpiContent({ data }: Props) {
  return (
    <>
      <PageHeader
        title="2025 Q4 KPI"
        description="参考 KPI 模板与小组季度目标生成草稿 · 组长审批 → 主管终审 → 季末自评与评分"
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
          <span className="text-xs text-muted-foreground">共 {data.totalCount} 名成员</span>
        </div>
        <div className="flex items-center gap-2">
          {data.stages.map((s, i) => {
            const maxCount = Math.max(...data.stages.map((s) => s.count), 1);
            return (
              <div key={s.label} className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex-1 h-2 rounded-full overflow-hidden bg-muted`}
                  >
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(s.count / maxCount) * 100}%` }}
                    />
                  </div>
                  {i < data.stages.length - 1 && <div className="w-2" />}
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{s.count}</span>
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
            {data.rows.length ? (
              data.rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full text-white text-xs font-medium flex items-center justify-center ${avatarColor(r.userName)}`}>{r.userName[0]}</div>
                      <span className="text-sm font-medium">{r.userName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{r.teamName}</td>
                  <td className="px-5 py-3 text-sm tabular-nums">{r.itemCount}</td>
                  <td className="px-5 py-3"><Badge tone={r.tone}>{r.status}</Badge></td>
                  <td className="px-5 py-3"><Progress value={r.progress} tone={r.tone === "warning" ? "warning" : r.tone === "success" ? "success" : "primary"} /></td>
                  <td className="px-5 py-3 text-sm font-semibold tabular-nums">{r.score}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="text-xs text-primary hover:underline">查看详情</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">暂无 KPI 数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
