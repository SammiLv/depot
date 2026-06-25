"use client";

import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui-kit";

type Props = {
  data: {
    id: string;
    year: number;
    quarter: number;
    status: string;
    tone: "default" | "primary" | "info" | "success" | "warning";
    stages: Array<{
      key: string;
      label: string;
      count: number;
      active: boolean;
      completed: boolean;
    }>;
    basicInfo: {
      department: string;
      team: string;
      name: string;
      title: string;
      quarterLabel: string;
    };
    items: Array<{
      id: string;
      name: string;
      scoringStandard: string;
      targetDetail: string;
      score: number;
      selfScore: number;
      leaderScore: number;
      managerScore: number;
    }>;
    totals: {
      scoreTotal: number;
      selfTotal: number;
      leaderTotal: number;
      managerTotal: number;
      attendanceScore: number;
      finalTotal: number;
    };
    summary: {
      workSummary: string;
      abilitySummary: string;
      praise: string;
      opportunity: string;
      crossDepartment: {
        department: string;
        praise: string;
        opportunity: string;
        complaint: string;
      };
    };
  };
};

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function ScoreInput({ value }: { value: number | string }) {
  return (
    <input
      value={String(value)}
      readOnly
      className="h-10 w-full rounded-lg border border-border bg-muted/20 px-3 text-right text-sm"
    />
  );
}

function SummaryTextarea({ value, placeholder }: { value: string; placeholder: string }) {
  return (
    <textarea
      value={value}
      readOnly
      placeholder={placeholder}
      rows={4}
      className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
    />
  );
}

export function KpiDetailContent({ data }: Props) {
  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{`${data.basicInfo.name} · ${data.basicInfo.quarterLabel} KPI`}</h1>
            <Badge tone={data.tone}>{data.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">查看季度 KPI 单据详情、评分汇总与绩效总结。</p>
        </div>
        <Link href="/kpi">
          <Button variant="outline">返回 KPI 列表</Button>
        </Link>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">KPI流程进度条</h3>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-5">
          {data.stages.map((stage) => (
            <div key={stage.key} className="min-w-0">
              <div className={`mb-2 h-2 rounded-full ${stage.completed || stage.active ? "bg-primary" : "bg-muted"}`} />
              <div className="text-sm font-medium">{stage.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {stage.active ? "当前阶段" : stage.completed ? "已完成" : "未开始"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">基本信息</h3>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {[
            ["部门", data.basicInfo.department],
            ["小组", data.basicInfo.team],
            ["姓名", data.basicInfo.name],
            ["岗位", data.basicInfo.title],
            ["考核季度", data.basicInfo.quarterLabel],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-1 whitespace-nowrap">
              <span className="text-muted-foreground">{label}：</span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">考核指标</h3>
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-muted/40">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="px-5 py-3 font-medium">指标项</th>
                  <th className="px-5 py-3 font-medium">评分标准</th>
                  <th className="px-5 py-3 font-medium">季度指标得分明细</th>
                  <th className="px-4 py-3 font-medium text-right">分值</th>
                  <th className="px-4 py-3 font-medium text-right">自评</th>
                  <th className="px-4 py-3 font-medium text-right">组长评</th>
                  <th className="px-4 py-3 font-medium text-right">主管评</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-5 py-4 text-sm font-medium">{item.name}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground whitespace-pre-wrap">{item.scoringStandard}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground whitespace-pre-wrap">{item.targetDetail || "—"}</td>
                    <td className="px-4 py-4"><ScoreInput value={formatScore(item.score)} /></td>
                    <td className="px-4 py-4"><ScoreInput value={formatScore(item.selfScore)} /></td>
                    <td className="px-4 py-4"><ScoreInput value={formatScore(item.leaderScore)} /></td>
                    <td className="px-4 py-4"><ScoreInput value={formatScore(item.managerScore)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-5 py-4 text-sm font-semibold" colSpan={3}>汇总</td>
                  <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.scoreTotal)} /></td>
                  <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.selfTotal)} /></td>
                  <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.leaderTotal)} /></td>
                  <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.managerTotal)} /></td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-5 py-4" colSpan={3} />
                  <td className="px-4 py-4 text-sm font-medium text-right whitespace-nowrap">考勤分</td>
                  <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.attendanceScore)} /></td>
                  <td className="px-4 py-4 text-sm font-medium text-right whitespace-nowrap">最终绩效总分</td>
                  <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.finalTotal)} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">绩效总结</h3>
        <div className="py-5">
          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-semibold">个人总结</div>
              <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium">季度工作任务总结</div>
                  <SummaryTextarea value={data.summary.workSummary} placeholder="请输入季度工作任务总结" />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">季度工作能力总结</div>
                  <SummaryTextarea value={data.summary.abilitySummary} placeholder="请输入季度工作能力总结" />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-semibold">上级点评</div>
              <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium">表扬</div>
                  <SummaryTextarea value={data.summary.praise} placeholder="请输入上级表扬" />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">机会</div>
                  <SummaryTextarea value={data.summary.opportunity} placeholder="请输入上级建议与机会" />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-semibold">跨部门评价</div>
              <div className="space-y-4">
                <div className="text-sm">
                  <span className="font-medium">评选部门：</span>
                  <span>{data.summary.crossDepartment.department}</span>
                </div>
                <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
                  <div>
                    <div className="mb-2 text-sm font-medium">表扬</div>
                    <SummaryTextarea value={data.summary.crossDepartment.praise} placeholder="请输入跨部门表扬" />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium">机会</div>
                    <SummaryTextarea value={data.summary.crossDepartment.opportunity} placeholder="请输入跨部门改进机会" />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium">跨部门投诉栏</div>
                    <SummaryTextarea value={data.summary.crossDepartment.complaint} placeholder="请输入跨部门投诉内容" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
