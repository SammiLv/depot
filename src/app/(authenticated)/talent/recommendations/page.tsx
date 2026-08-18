import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getTalentDecisionCycleData } from "@/server/talent/decision-cycle-query";
import { getTalentRecommendationData } from "@/server/talent/decision-history-query";

const cycleStatusLabels: Record<string, string> = { PENDING_CALCULATION: "待计算", PENDING_CONFIRMATION: "待确认", CONFIRMED: "已确认" };
const decisionTypeLabels: Record<string, string> = { PROMOTION: "晋升", CONTRACT_RENEWAL: "续签", SALARY_ADJUSTMENT: "加薪", REWARD: "历史奖励", QUARTERLY_REWARD: "季度奖励", ANNUAL_REWARD: "年度奖励", DEVELOPMENT: "优化培养", TERMINATION: "淘汰解聘" };
const feedbackLabels: Record<string, string> = { PENDING: "待反馈", ADOPTED: "已采纳", ADJUSTED_ADOPTION: "调整采纳", REJECTED: "未采纳", DEFERRED: "暂缓" };

type PageProps = { searchParams: Promise<{ cycle?: string }> };

export default async function TalentRecommendationsPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [cycleData, recommendationData] = await Promise.all([
    getTalentDecisionCycleData(user, params.cycle),
    getTalentRecommendationData(user),
  ]);
  const departmentName = new Map(cycleData.departments.map((row) => [row.id, row.name]));
  const userName = new Map(cycleData.users.map((row) => [row.id, row.name]));
  const recommendationUserName = new Map(recommendationData.users.map((row) => [row.id, row.name]));
  const selected = cycleData.selectedCycle;

  return <div className="space-y-4">
    <Card className="!p-6">
      <PageHeader title="人才集中决策台" description="旧配置已下线；现有批次暂时只读，待新版配置中心与决策引擎完成后恢复操作" action={<div className="flex gap-2"><Link href="/talent/config/reviews" className="flex h-9 items-center rounded-full border border-border px-4 text-sm">规则配置</Link><Link href="/talent/history" className="flex h-9 items-center rounded-full border border-border px-4 text-sm">人才履历</Link><Link href="/talent" className="flex h-9 items-center rounded-full border border-border px-4 text-sm">返回</Link></div>} />
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">人才决策规则配置正在重构。本轮不创建新决策批次，也不执行旧规则计算；历史批次与已冻结证据仅供查看。</div>
    </Card>

    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit !p-4">
        <h2 className="mb-3 font-semibold">决策批次</h2>
        <div className="space-y-2">{cycleData.cycles.map((cycle) => <Link key={cycle.id} href={`/talent/recommendations?cycle=${cycle.id}`} className={`block rounded-xl border p-3 ${selected?.id === cycle.id ? "border-primary bg-primary/5" : "border-border"}`}>
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{cycle.name}</span><Badge tone={cycle.status === "CONFIRMED" ? "success" : "warning"}>{cycleStatusLabels[cycle.status]}</Badge></div>
          <div className="mt-2 text-xs text-muted-foreground">{departmentName.get(cycle.departmentOrgNodeId)} · {cycle.observationStartDate.toLocaleDateString("zh-CN")} 至 {cycle.observationEndDate.toLocaleDateString("zh-CN")}</div>
        </Link>)}</div>
        {cycleData.cycles.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">暂无决策批次</div> : null}
      </Card>

      <Card className="!p-4">
        {selected ? <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold">{selected.name}</h2><div className="mt-1 text-sm text-muted-foreground">考察期间：{selected.observationStartDate.toLocaleDateString("zh-CN")} 至 {selected.observationEndDate.toLocaleDateString("zh-CN")}　数据截止：{selected.dataCutoffDate.toLocaleDateString("zh-CN")}</div></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{["候选员工", "证据完整性", "半年KPI", "业务考核", "节点限制", "缺失资料"].map((label) => <th key={label} className="p-3 text-left text-xs font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{cycleData.results.map((row) => <tr key={row.id} className="align-top"><td className="p-3 font-medium">{userName.get(row.userId) ?? "历史员工"}</td><td className="p-3"><Badge tone={row.evidenceStatus === "READY" ? "success" : "warning"}>{row.evidenceStatus === "READY" ? "资料齐全" : "资料不完整"}</Badge>{row.frozenAt ? <div className="mt-1 text-xs text-muted-foreground">已冻结</div> : null}</td><td className="p-3">{row.kpiCount}/2</td><td className="p-3">{row.assessmentCount}/2</td><td className="p-3">{row.activeRestrictionCount ? <Badge tone="danger">{row.activeRestrictionCount}项生效</Badge> : <span className="text-muted-foreground">无</span>}</td><td className="p-3 text-xs text-muted-foreground">{row.missingItems.length ? row.missingItems.join("；") : "—"}</td></tr>)}</tbody></table></div>
          {cycleData.results.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">尚未计算候选池</div> : null}
        </> : <div className="py-16 text-center text-sm text-muted-foreground">暂无历史决策批次。</div>}
      </Card>
    </div>

    <Card className="!p-4">
      <h2 className="mb-3 font-semibold">既有部门建议与公司反馈</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{["建议编号", "员工", "事项", "公司反馈"].map((label) => <th key={label} className="p-3 text-left text-xs font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{recommendationData.rows.map((row) => <tr key={row.id}><td className="p-3">{row.recommendationNo}</td><td className="p-3">{recommendationUserName.get(row.userId) ?? "历史员工"}</td><td className="p-3">{decisionTypeLabels[row.decisionType] ?? row.decisionType}</td><td className="p-3">{feedbackLabels[row.companyFeedbackStatus] ?? row.companyFeedbackStatus}</td></tr>)}</tbody></table></div>
      {recommendationData.rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">暂无部门建议</div> : null}
    </Card>
  </div>;
}
