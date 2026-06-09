"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { Plus, AlertTriangle } from "lucide-react";
import type { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";

type Props = { data: Awaited<ReturnType<typeof getQuarterlyWorkData>> };

export function QuarterlyWorkContent({ data }: Props) {
  const [tab, setTab] = useState<"board" | "value">("board");

  return (
    <>
      <PageHeader
        title="2025 Q4 季度工作"
        description="按小组规划季度工作 · 月度拆解 · 每周更新进展，延期自动预警；上线后跟踪需求价值"
        action={<Button><Plus className="w-4 h-4" />新增季度工作</Button>}
      />

      {/* Unified toolbar card */}
      <div className="mb-4 rounded-xl bg-card border border-border p-5 shadow-sm">
        <div className="inline-flex p-1 rounded-lg bg-muted">
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
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {["全部", "采购组", "B端组", "C端组", "设计组"].map((t, i) => (
              <button key={t} className={`px-3 py-1.5 rounded-lg text-sm transition ${i === 0 ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
                {t}
              </button>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">第 42 周 · 截至 2025-10-17 18:00 前更新</div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted-foreground">
            对季度工作中已上线需求的<span className="text-foreground font-medium"> 预期收益 vs 实际收益 </span>进行对比与 ROI 跟踪。
          </div>
        )}
      </div>

      {tab === "board" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.columns.map((c) => (
              <div key={c.key} className="rounded-xl border border-border p-3 min-h-[400px] shadow-sm" style={{ background: "var(--card)" }}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.tone}>{c.title}</Badge>
                    <span className="text-xs text-muted-foreground">{c.items.length}</span>
                  </div>
                  <button className="text-xs text-muted-foreground hover:text-foreground">+ 添加</button>
                </div>
                <div className="space-y-2">
                  {c.items.length ? (
                    c.items.map((it, i) => (
                      <div key={i} className="bg-muted/50 rounded-lg p-3 border border-border hover:border-primary/40 hover:shadow-md transition cursor-pointer shadow-sm">
                        <div className="text-sm font-medium leading-snug">{it.title}</div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{it.owner}</span>
                          <span>{it.weeks} 周</span>
                        </div>
                        {it.progress !== undefined && (
                          <div className="mt-2">
                            <Progress value={it.progress} tone={c.key === "delayed" ? "warning" : "primary"} />
                          </div>
                        )}
                        {it.delay && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="w-3 h-3" />延期 {it.delay} 周
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-xs text-muted-foreground py-8">暂无</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.updateReminders.length > 0 && (
            <Card className="mt-6">
              <h3 className="font-semibold mb-3">本周更新提醒</h3>
              <div className="space-y-2">
                {data.updateReminders.map((r, i) => (
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
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          对季度工作中已上线需求的<span className="text-foreground font-medium"> 预期收益 vs 实际收益 </span>进行对比与 ROI 跟踪。
          <div className="mt-4">
            <Link href="/value-tracking" className="text-primary hover:underline font-medium">
              前往需求价值跟踪页面 →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
