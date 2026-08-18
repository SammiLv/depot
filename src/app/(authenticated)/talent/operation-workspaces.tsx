"use client";

import { Badge, Button, Card } from "@/components/ui-kit";
import { addBusinessAssessmentSubject, createBusinessAssessmentCycle, createBusinessAssessmentCycleWithState, deleteBusinessAssessmentCycleWithState, importBusinessAssessmentResults, importBusinessAssessmentResultsWithState, updateBusinessAssessmentCyclePeriodWithState, updateBusinessAssessmentCycleRuleWithState, updateBusinessAssessmentResultWithState } from "@/server/talent/assessment-actions";
import type { BusinessAssessmentOperationState } from "@/server/talent/assessment-actions";
import { createTalentDecisionRecommendation, updateTalentRecommendationFeedback } from "@/server/talent/decision-actions";
import { deleteEmployeeTalentProfile, type EmployeeProfileActionState } from "@/server/talent/employee-profile-actions";
import { voidTalentHistoryRecord } from "@/server/talent/history-actions";
import { confirmTalentHistoryImport, uploadTalentHistoryImport } from "@/server/talent/history-import-actions";
import { createWorkIncident, voidWorkIncident } from "@/server/talent/incident-actions";
import { ArrowLeft, Download, Eye, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentWorkspaceData, DecisionWorkspaceData, EmployeeProfileWorkspaceData, HistoryWorkspaceData, IncidentWorkspaceData } from "./operation-workspace-types";
import { EmployeeProfileEditor } from "./employees/profile-content";
import { HistoryRecordForm } from "./history/history-record-form";

const inputClass = "h-9 rounded-lg border border-border bg-background px-3 text-sm";
const actionClass = "h-9 rounded-lg px-4 text-sm font-semibold";
const typeLabels: Record<string, string> = { PROMOTION: "晋升", CONTRACT_RENEWAL: "续签", SALARY_ADJUSTMENT: "加薪", REWARD: "奖励", QUARTERLY_REWARD: "奖励", ANNUAL_REWARD: "奖励" };
const feedbackLabels: Record<string, string> = { PENDING: "待反馈", ADOPTED: "已采纳", ADJUSTED_ADOPTION: "调整采纳", REJECTED: "未采纳", DEFERRED: "暂缓" };
const sourceLabels: Record<string, string> = { RECOMMENDATION: "决策建议", COMPANY_SYSTEM: "公司系统", MANUAL_IMPORT: "历史导入", MANUAL_ENTRY: "手工登记" };

function Header({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{action}</div>;
}

function BackButton({ onClick }: { onClick: () => void; label?: string }) {
  return <Button type="button" variant="outline" className={actionClass} onClick={onClick}><ArrowLeft className="h-4 w-4" />返回</Button>;
}

function Empty({ children }: { children: React.ReactNode }) { return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>; }

const initialAssessmentOperationState: BusinessAssessmentOperationState = { status: "idle", message: "" };
const initialProfileDeleteState: EmployeeProfileActionState = { status: "idle", message: "", savedUserId: "", requestId: "" };

function OperationFeedback({ state }: { state: BusinessAssessmentOperationState }) {
  if (!state.message) return null;
  return <div role="status" aria-live="polite" className={`mt-2 rounded-lg px-3 py-2 text-xs ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
    <p className="font-medium">{state.message}</p>
    {state.details?.length ? <div className="mt-2 overflow-hidden rounded-lg border border-red-200 bg-white/70">
      <table className="w-full text-left text-xs">
        <thead className="bg-red-100/70"><tr><th className="px-3 py-2 font-medium">Excel 行</th><th className="px-3 py-2 font-medium">员工</th><th className="px-3 py-2 font-medium">科目</th><th className="px-3 py-2 font-medium">错误原因</th></tr></thead>
        <tbody className="divide-y divide-red-100">{state.details.map((detail) => <tr key={`${detail.rowNumber}-${detail.employeeName}-${detail.subjectName}`}><td className="px-3 py-2">第 {detail.rowNumber} 行</td><td className="px-3 py-2">{detail.employeeName}</td><td className="px-3 py-2">{detail.subjectName}</td><td className="px-3 py-2">{detail.messages.join("；")}</td></tr>)}</tbody>
      </table>
    </div> : null}
  </div>;
}

export function BusinessAssessmentWorkspace({ data }: { data: AssessmentWorkspaceData }) {
  const [managing, setManaging] = useState(false);
  const [subjectScoringType, setSubjectScoringType] = useState<"NUMERIC" | "GRADE">(data.rule.defaultScoringType);
  const userName = new Map(data.users.map((row) => [row.id, row.name]));
  const ruleSummary = `总分 ${data.rule.totalKpiScore} 分，按科目均摊；首次及格 ${data.rule.initialPassPercent}%，补考及格 ${data.rule.retestPassPercent}%，补考不及格 ${data.rule.finalFailPercent}%。`;
  if (!managing) return <div><Header title="业务考核" description="只管理最终考试结果；支持等级评分、分数评分和补考结果导入" action={data.canManage ? <Button className={actionClass} onClick={() => setManaging(true)}><Upload className="h-4 w-4" />新建业务考核</Button> : undefined}/><div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">当前计分规则：</span>{ruleSummary}</div><AssessmentTable data={data} userName={userName}/></div>;
  return <div><Header title="业务考核管理" description="创建业务考核、配置科目并导入最终结果" action={<BackButton onClick={() => setManaging(false)} label="返回业务考核"/>}/>{data.canManage && <><div className="grid gap-4 lg:grid-cols-2"><Card><h3 className="mb-3 font-semibold">创建业务考核</h3><form action={createBusinessAssessmentCycle} className="grid gap-2 sm:grid-cols-2"><select name="departmentOrgNodeId" required className={inputClass}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input name="name" required placeholder="考核名称" className={inputClass}/><input name="year" type="number" defaultValue={new Date().getFullYear()} className={inputClass}/><select name="quarter" className={inputClass}>{[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}</select><Button className={`${actionClass} sm:col-span-2`}>创建业务考核</Button></form></Card><Card><h3 className="mb-3 font-semibold">配置科目</h3><form action={addBusinessAssessmentSubject} className="grid gap-2 sm:grid-cols-2"><select name="cycleId" required className={inputClass}>{data.cycles.filter((row) => row.status === "DRAFT").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input name="code" required placeholder="科目编码" className={inputClass}/><input name="name" required placeholder="科目名称" className={inputClass}/><select name="scoringType" value={subjectScoringType} onChange={(event) => setSubjectScoringType(event.target.value as "NUMERIC" | "GRADE")} className={inputClass}><option value="NUMERIC">分数评分</option><option value="GRADE">等级评分</option></select>{subjectScoringType === "NUMERIC" ? <><input name="passingNumericScore" type="number" min="0" max="100" defaultValue={data.rule.passingNumericScore} placeholder="及格分" className={inputClass}/><input type="hidden" name="requiredGradeCode" value={data.rule.requiredGradeCode}/></> : <><select name="requiredGradeCode" defaultValue={data.rule.requiredGradeCode} className={inputClass}>{["S","A","B","C","D"].map((grade) => <option key={grade} value={grade}>达到 {grade} 级及以上</option>)}</select><input type="hidden" name="passingNumericScore" value={data.rule.passingNumericScore}/></>}<input name="sortOrder" type="number" defaultValue="10" className={inputClass}/><Button className={actionClass}>新增并重新摊分</Button></form></Card></div><Card className="mt-4"><h3 className="font-semibold">导入最终结果</h3><p className="mb-3 mt-1 text-xs text-muted-foreground">整批预检通过后才写入；只保留各科最终结果。</p><form action={importBusinessAssessmentResults} className="flex flex-wrap gap-2"><select name="cycleId" required className={`${inputClass} min-w-60`}>{data.cycles.filter((row) => row.status === "DRAFT").map((row) => <option key={row.id} value={row.id}>{row.year} Q{row.quarter} · {row.name}</option>)}</select><input name="file" type="file" accept=".xlsx,.xls,.csv" required className={`${inputClass} h-auto flex-1 py-1.5`}/><Button className={actionClass}>预检并导入</Button></form></Card></>}<div className="mt-4"><AssessmentTable data={data} userName={userName}/></div></div>;
}

export function BusinessAssessmentQuarterlyWorkspace({ data }: { data: AssessmentWorkspaceData }) {
  const [workspace, setWorkspace] = useState<{ kind: "list" | "create" } | { kind: "import" | "view" | "edit"; cycleId: string }>({ kind: "list" });
  const [createState, createAction, creating] = useActionState(createBusinessAssessmentCycleWithState, initialAssessmentOperationState);
  const [importState, importAction, importing] = useActionState(importBusinessAssessmentResultsWithState, initialAssessmentOperationState);
  const [resultState, resultAction, savingResult] = useActionState(updateBusinessAssessmentResultWithState, initialAssessmentOperationState);
  const [ruleState, ruleAction, updatingRule] = useActionState(updateBusinessAssessmentCycleRuleWithState, initialAssessmentOperationState);
  const [periodState, periodAction, updatingPeriod] = useActionState(updateBusinessAssessmentCyclePeriodWithState, initialAssessmentOperationState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteBusinessAssessmentCycleWithState, initialAssessmentOperationState);
  const userName = new Map(data.users.map((row) => [row.id, row.name]));
  const publishedRules = data.rules.filter((row) => row.status === "CONFIRMED");
  const availableRules = publishedRules.filter((rule) => !data.cycles.some((cycle) => cycle.departmentOrgNodeId === rule.departmentOrgNodeId && cycle.year === rule.year && cycle.quarter === rule.quarter));
  const latestRule = publishedRules[0];
  const selectedCycle = "cycleId" in workspace ? data.cycles.find((row) => row.id === workspace.cycleId) : undefined;
  const ruleSummary = latestRule
    ? `${latestRule.year}年 Q${latestRule.quarter} · 总分 ${latestRule.totalKpiScore} 分；科目 ${data.ruleSubjects.filter((row) => row.ruleId === latestRule.id).length} 个，评分方式和小组及格线按发布版本执行。`
    : "暂无已发布的季度业务考核规则。";

  useEffect(() => {
    if (createState.status !== "success") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace({ kind: "list" });
  }, [createState]);

  useEffect(() => {
    if (importState.status !== "success") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace({ kind: "list" });
  }, [importState]);

  if (workspace.kind === "list") {
    return <div>
      <Header
        title="业务考核"
        description="按季度管理考核批次；只保存各科最终考核结果"
        action={data.canManage ? <Button className={actionClass} onClick={() => setWorkspace({ kind: "create" })}><Plus className="h-4 w-4" />新建业务考核</Button> : undefined}
      />
      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">最新已发布规则：</span>{ruleSummary}
      </div>
      <AssessmentTable data={data} userName={userName} onOpen={(kind, cycleId) => setWorkspace({ kind, cycleId })} deleteAction={deleteAction} deleting={deleting}/>
      <OperationFeedback state={deleteState}/>
    </div>;
  }

  if (workspace.kind === "create") return <div>
    <Header title="新建业务考核" description="选择已发布的季度规则创建业务考核，创建后将冻结科目、评分方式和小组及格标准" action={<BackButton onClick={() => setWorkspace({ kind: "list" })}/>}/>
    {data.canManage && <Card>
        <h3 className="font-semibold">创建业务考核</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">季度、部门、科目及小组及格线均来自所选规则，创建后不受后续规则修改影响。</p>
        <form action={createAction} className="space-y-2">
          <select name="ruleId" required className={`${inputClass} w-full`} defaultValue="">
            <option value="" disabled>请选择已发布的季度规则</option>
            {availableRules.map((rule) => <option key={rule.id} value={rule.id}>
              {data.departments.find((department) => department.id === rule.departmentOrgNodeId)?.name} · {rule.year}年 Q{rule.quarter} · V{rule.version}
            </option>)}
          </select>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label><span className="mb-1 block text-xs text-muted-foreground">考核开始日期</span><input name="assessmentStartDate" type="date" required aria-label="考核开始日期" className={`${inputClass} w-full`}/></label>
            <span className="hidden text-xs text-muted-foreground sm:block">至</span>
            <label><span className="mb-1 block text-xs text-muted-foreground">考核结束日期</span><input name="assessmentEndDate" type="date" required aria-label="考核结束日期" className={`${inputClass} w-full`}/></label>
          </div>
          <p className="text-xs text-muted-foreground">考核时间段对本次业务考核的所有员工和科目统一生效。</p>
          <Button type="submit" className={`${actionClass} w-full`} disabled={creating || !availableRules.length}>{creating ? "创建中" : "创建业务考核"}</Button>
        </form>
        <OperationFeedback state={createState}/>
      </Card>}
  </div>;

  if (!selectedCycle) return <div><Header title="业务考核" description="所选业务考核不存在或已删除" action={<BackButton onClick={() => setWorkspace({ kind: "list" })}/>}/><Empty>未找到业务考核</Empty></div>;

  if (workspace.kind === "import") return <div>
    <Header title="导入考核结果" description={`${selectedCycle.name} · 只导入各科最终结果`} action={<BackButton onClick={() => setWorkspace({ kind: "list" })}/>}/>
    <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-semibold">导入最终结果</h3>
          <a href="/templates/business-assessment-result-import-template-v2.xlsx" download className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted/50"><Download className="h-4 w-4"/>下载 Excel 模板</a>
        </div>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">模板内含分数评分、等级评分和补考结果示例；填写正式数据前请先删除示例行。考核时间段取自本次业务考核，无需逐行填写。</p>
        <div className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          统一考核时间段：{selectedCycle.assessmentStartDate?.slice(0, 10) ?? "未设置"} 至 {selectedCycle.assessmentEndDate?.slice(0, 10) ?? "未设置"}
        </div>
        <form action={importAction} className="space-y-2">
          <input type="hidden" name="cycleId" value={selectedCycle.id}/>
          <input name="file" type="file" accept=".xlsx,.xls,.csv" required disabled={selectedCycle.status !== "DRAFT" || importing || !selectedCycle.assessmentStartDate || !selectedCycle.assessmentEndDate} className={`${inputClass} h-auto w-full py-1.5`}/>
          <Button type="submit" className={`${actionClass} w-full`} disabled={selectedCycle.status !== "DRAFT" || importing || !selectedCycle.assessmentStartDate || !selectedCycle.assessmentEndDate}>{importing ? "预检并导入中" : "预检并导入"}</Button>
        </form>
        {selectedCycle.status !== "DRAFT" && <p className="mt-2 text-xs text-amber-700">该业务考核已完成，不能再次导入结果。</p>}
        <OperationFeedback state={importState}/>
    </Card>
  </div>;

  const cycleSubjects = data.subjects.filter((row) => row.cycleId === selectedCycle.id);
  const cycleResults = data.results.filter((row) => row.cycleId === selectedCycle.id);
  const cycleSummaries = data.summaries.filter((row) => row.cycleId === selectedCycle.id);

  if (workspace.kind === "edit") {
    const frozenRule = data.rules.find((rule) => rule.id === selectedCycle.ruleId);
    const compatibleRules = data.rules.filter((rule) => rule.departmentOrgNodeId === selectedCycle.departmentOrgNodeId
      && rule.year === selectedCycle.year
      && rule.quarter === selectedCycle.quarter
      && Boolean(rule.publishedAt)
      && (rule.status === "CONFIRMED" || rule.status === "VOIDED"));
    return <div>
      <Header title="维护员工成绩" description="可更新使用规则并调整员工各科最终成绩；保存后自动重新计算业务考核得分" action={<BackButton onClick={() => setWorkspace({ kind: "list" })}/>}/>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField label="业务考核" value={selectedCycle.name}/>
          <ReadOnlyField label="考核季度" value={`${selectedCycle.year}年 Q${selectedCycle.quarter}`}/>
          <ReadOnlyField label="当前状态" value={assessmentStatusLabel(selectedCycle.status)}/>
          <form action={ruleAction} className="space-y-2">
            <input type="hidden" name="cycleId" value={selectedCycle.id}/>
            <label className="block text-xs text-muted-foreground">使用规则</label>
            <div className="flex gap-2">
              <select name="ruleId" required defaultValue={selectedCycle.ruleId ?? ""} className={`${inputClass} min-w-0 flex-1`}>
                {!selectedCycle.ruleId && <option value="">请选择已发布规则</option>}
                {compatibleRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} V{rule.version}</option>)}
                {frozenRule && !compatibleRules.some((rule) => rule.id === frozenRule.id) && <option value={frozenRule.id}>{frozenRule.name} V{frozenRule.version}</option>}
              </select>
              <Button type="submit" variant="outline" className={`${actionClass} shrink-0`} disabled={updatingRule || compatibleRules.every((rule) => rule.id === selectedCycle.ruleId)}>{updatingRule ? "更新中" : "更新"}</Button>
            </div>
          </form>
        </div>
        <OperationFeedback state={ruleState}/>
        <form action={periodAction} className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
          <input type="hidden" name="cycleId" value={selectedCycle.id}/>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">考核开始日期</span><input name="assessmentStartDate" type="date" required defaultValue={selectedCycle.assessmentStartDate?.slice(0, 10) ?? ""} className={`${inputClass} w-full`}/></label>
          <span className="hidden pb-2 text-xs text-muted-foreground sm:block">至</span>
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">考核结束日期</span><input name="assessmentEndDate" type="date" required defaultValue={selectedCycle.assessmentEndDate?.slice(0, 10) ?? ""} className={`${inputClass} w-full`}/></label>
          <Button type="submit" variant="outline" className={actionClass} disabled={updatingPeriod}>{updatingPeriod ? "更新中" : "更新时间段"}</Button>
        </form>
        <OperationFeedback state={periodState}/>
      </Card>
      <Card className="mt-4 !p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-4">
          <h3 className="font-semibold">员工成绩</h3>
          <p className="mt-1 text-xs text-muted-foreground">可调整员工各科最终成绩和最终结果；保存后自动重新计算业务考核得分。</p>
          <OperationFeedback state={resultState}/>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-xs">
            <colgroup><col className="w-[16%]"/><col className="w-[18%]"/><col className="w-[72px]"/><col className="w-[80px]"/><col className="w-[112px]"/><col className="w-[160px]"/><col className="w-[72px]"/></colgroup>
            <thead className="bg-muted/40">
              <tr>{["员工", "考核科目", "评分方式", "最终成绩", "最终结果", "备注", "操作"].map((item) => <th key={item} className="px-2 py-3 text-left text-xs font-medium">{item}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cycleResults.map((result) => {
                const subject = cycleSubjects.find((row) => row.id === result.subjectId);
                const employee = userName.get(result.userId) ?? "员工已停用";
                const formId = `assessment-result-${result.id}`;
                return <tr key={result.id}>
                  <td className="px-2 py-3 font-medium break-words">{employee}</td>
                  <td className="px-2 py-3 break-words">{subject?.name ?? "科目已停用"}</td>
                  <td className="px-2 py-3">{subject?.scoringType === "GRADE" ? "等级" : "分数"}</td>
                  <td className="px-2 py-3"><input form={formId} name="rawFinalValue" required defaultValue={result.rawFinalValue} aria-label={`${employee}${subject?.name ?? "科目"}最终成绩`} className={`${inputClass} h-8 w-full px-2`}/></td>
                  <td className="px-2 py-3"><select form={formId} name="attemptResult" defaultValue={result.attemptResult} aria-label={`${employee}${subject?.name ?? "科目"}最终结果`} className={`${inputClass} h-8 w-full px-2`}><option value="INITIAL_PASS">首次及格</option><option value="RETEST_PASS">补考及格</option><option value="FINAL_FAIL">补考不及格</option></select></td>
                  <td className="px-2 py-3"><input form={formId} name="remark" defaultValue={result.remark ?? ""} placeholder="调整说明" aria-label={`${employee}${subject?.name ?? "科目"}备注`} className={`${inputClass} h-8 w-full min-w-0 px-2`}/></td>
                  <td className="px-2 py-3">
                    <form id={formId} action={resultAction}>
                      <input type="hidden" name="resultId" value={result.id}/>
                      <Button type="submit" className={`${actionClass} min-w-[56px] whitespace-nowrap px-2`} disabled={savingResult}>{savingResult ? "保存中" : "保存"}</Button>
                    </form>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!cycleResults.length && <Empty>暂无员工成绩，请先从业务考核列表导入考核结果</Empty>}
      </Card>
    </div>;
  }

  return <div>
    <Header title="查看业务考核" description={`${selectedCycle.name} · 规则和结果快照`} action={<BackButton onClick={() => setWorkspace({ kind: "list" })}/>}/>
    <div className="grid gap-4 lg:grid-cols-3">
      <MiniMetric label="考核季度" value={`${selectedCycle.year}年 Q${selectedCycle.quarter}`}/>
      <MiniMetric label="考核总分" value={`${selectedCycle.totalKpiScore} 分`}/>
      <MiniMetric label="员工结果" value={`${cycleSummaries.length} 人`}/>
    </div>
    <Card className="mt-4 !p-0 overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/40"><tr>{["科目名称", "评分方式", "科目分值", "结果数量"].map((item) => <th key={item} className="p-4 text-left text-xs font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{cycleSubjects.map((subject) => <tr key={subject.id}><td className="p-4 font-medium">{subject.name}</td><td className="p-4 text-xs">{subject.scoringType === "NUMERIC" ? "分数评分" : "等级评分"}</td><td className="p-4 text-xs">{subject.maxScore ?? 0} 分</td><td className="p-4 text-xs">{cycleResults.filter((row) => row.subjectId === subject.id).length} 条</td></tr>)}</tbody></table></div>
    </Card>
    <Card className="mt-4 !p-0 overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/40"><tr>{["员工", "通过科目", "业务考核得分", "结果"].map((item) => <th key={item} className="p-4 text-left text-xs font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{cycleSummaries.map((summary) => <tr key={summary.id}><td className="p-4 font-medium">{userName.get(summary.userId) ?? "员工已停用"}</td><td className="p-4 text-xs">{summary.passedSubjectCount}/{summary.subjectCount}</td><td className="p-4 text-xs">{summary.earnedScore}/{summary.maxScore}</td><td className="p-4"><Badge tone={summary.isOverallPassed ? "success" : "danger"}>{summary.isOverallPassed ? "及格" : "不及格"}</Badge></td></tr>)}</tbody></table></div>
      {!cycleSummaries.length && <Empty>暂无导入结果</Empty>}
    </Card>
  </div>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><div className="mb-1 text-xs text-muted-foreground">{label}</div><div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{value}</div></div>;
}

function assessmentStatusLabel(status: string) {
  if (status === "CONFIRMED") return "已完成";
  if (status === "VOIDED") return "已作废";
  return "进行中";
}

function AssessmentTable({ data, userName, onOpen, deleteAction, deleting = false }: { data: AssessmentWorkspaceData; userName: Map<string, string>; onOpen?: (kind: "import" | "view" | "edit", cycleId: string) => void; deleteAction?: (payload: FormData) => void; deleting?: boolean }) {
  const headers = ["业务考核", "科目与摊分", "员工结果", "状态", ...(onOpen ? ["操作"] : [])];
  return <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-muted/40"><tr>{headers.map((item) => <th key={item} className={`p-4 text-xs font-medium ${item === "操作" ? "text-right" : "text-left"}`}>{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.cycles.map((cycle) => { const subjects = data.subjects.filter((row) => row.cycleId === cycle.id); const summaries = data.summaries.filter((row) => row.cycleId === cycle.id); const inProgress = cycle.status === "DRAFT"; const canMaintainScores = cycle.status !== "VOIDED"; return <tr key={cycle.id}><td className="p-4 font-medium">{cycle.name}<div className="text-xs text-muted-foreground">{cycle.year} Q{cycle.quarter} · 总分{cycle.totalKpiScore}</div></td><td className="p-4 text-xs">{subjects.length ? subjects.map((row) => `${row.name} ${row.maxScore ?? 0}分`).join("、") : "待配置"}</td><td className="p-4"><div className="space-y-1">{summaries.slice(0,5).map((row) => <div key={row.id} className="text-xs">{userName.get(row.userId) ?? "员工已停用"}：{row.earnedScore}/{row.maxScore}</div>)}{summaries.length > 5 && <div className="text-xs text-muted-foreground">共 {summaries.length} 人</div>}</div></td><td className="p-4"><Badge tone={cycle.status === "CONFIRMED" ? "success" : cycle.status === "VOIDED" ? "default" : "primary"}>{assessmentStatusLabel(cycle.status)}</Badge></td>{onOpen && <td className="p-4"><div className="flex items-center justify-end gap-3 whitespace-nowrap">{data.canManage && <button type="button" disabled={!inProgress} onClick={() => onOpen("import", cycle.id)} className="inline-flex items-center gap-1 text-xs text-primary disabled:cursor-not-allowed disabled:text-muted-foreground" title={inProgress ? "导入考核结果" : "已完成的业务考核不能再次导入"}><Upload className="h-3.5 w-3.5"/>导入考核结果</button>}<button type="button" onClick={() => onOpen("view", cycle.id)} className="inline-flex items-center gap-1 text-xs text-primary"><Eye className="h-3.5 w-3.5"/>查看</button>{data.canManage && <button type="button" disabled={!canMaintainScores} onClick={() => onOpen("edit", cycle.id)} className="inline-flex items-center gap-1 text-xs text-primary disabled:cursor-not-allowed disabled:text-muted-foreground" title={canMaintainScores ? "维护员工成绩" : "已作废的业务考核不能维护成绩"}><Pencil className="h-3.5 w-3.5"/>编辑</button>}{data.canManage && deleteAction && <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`确认删除“${cycle.name}”吗？此操作不可恢复。`)) event.preventDefault(); }}><input type="hidden" name="cycleId" value={cycle.id}/><button type="submit" disabled={!inProgress || deleting} className="inline-flex items-center gap-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:text-muted-foreground" title={inProgress ? "删除业务考核" : "已完成的业务考核不能删除"}><Trash2 className="h-3.5 w-3.5"/>删除</button></form>}</div></td>}</tr>; })}</tbody></table></div>{data.cycles.length === 0 && <Empty>暂无业务考核</Empty>}</Card>;
}

export function WorkIncidentWorkspace({ data }: { data: IncidentWorkspaceData }) {
  const [managing, setManaging] = useState(false); const userName = new Map(data.users.map((row) => [row.id, row.name])); const peopleByIncident = new Map(data.responsiblePeople.map((row) => [row.incidentId, row]));
  const table = <IncidentTable data={data} userName={userName} peopleByIncident={peopleByIncident}/>;
  if (!managing) return <div><Header title="工作事故" description="保存事故事实、等级和限制期，并向 KPI 工作事故项提供扣分结果" action={data.canManage ? <Button className={actionClass} onClick={() => setManaging(true)}><Plus className="h-4 w-4"/>进入事故管理</Button> : undefined}/><div className="mb-4 grid gap-3 md:grid-cols-3"><MiniMetric label="事故记录" value={`${data.incidents.length} 起`}/><MiniMetric label="已确认" value={`${data.incidents.filter((row) => row.status === "CONFIRMED").length} 起`}/><MiniMetric label="涉及员工" value={`${new Set(data.responsiblePeople.map((row) => row.userId)).size} 人`}/></div>{table}</div>;
  return <div><Header title="工作事故管理" description="录入已确认的工作事故，并维护作废状态" action={<BackButton onClick={() => setManaging(false)} label="返回工作事故"/>}/>{data.canManage && <Card className="mb-4"><h3 className="mb-3 font-semibold">录入并确认工作事故</h3><form action={createWorkIncident} className="grid gap-2 md:grid-cols-4"><select name="departmentOrgNodeId" required className={inputClass}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="userId" required className={inputClass}>{data.users.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input name="incidentNo" required placeholder="事故编号" className={inputClass}/><input name="occurredAt" type="date" required className={inputClass}/><select name="level" className={inputClass}>{["S","A","B","C","D"].map((level) => <option key={level} value={level}>{level}级</option>)}</select><input name="title" required placeholder="事故标题" className={`${inputClass} md:col-span-2`}/><input name="externalReferenceNo" placeholder="公司制度/外部单号（可选）" className={inputClass}/><textarea name="description" required placeholder="已确认事实和事故说明" className="min-h-20 rounded-lg border border-border bg-background p-3 text-sm md:col-span-3"/><Button className={actionClass}>保存并确认</Button></form></Card>}{table}</div>;
}

function IncidentTable({ data, userName, peopleByIncident }: { data: IncidentWorkspaceData; userName: Map<string,string>; peopleByIncident: Map<string, IncidentWorkspaceData["responsiblePeople"][number]> }) {
  return <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/40"><tr>{["日期/编号","责任人","等级","事故摘要","季度KPI结果","状态/操作"].map((item) => <th key={item} className="p-4 text-left text-xs font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.incidents.map((incident) => { const person = peopleByIncident.get(incident.id); const occurredAt = new Date(incident.occurredAt); const year = occurredAt.getFullYear(); const quarter = Math.floor(occurredAt.getMonth()/3)+1; const summary = data.summaries.find((row) => row.userId === person?.userId && row.year === year && row.quarter === quarter); return <tr key={incident.id}><td className="p-4 text-xs">{occurredAt.toLocaleDateString("zh-CN")}<div className="text-muted-foreground">{incident.incidentNo}</div></td><td className="p-4 font-medium">{person ? userName.get(person.userId) ?? person.userId : "—"}</td><td className="p-4"><Badge tone={["S","A","B"].includes(incident.level) ? "danger" : "warning"}>{incident.level}级</Badge></td><td className="p-4"><div>{incident.title}</div><div className="mt-1 max-w-md text-xs text-muted-foreground">{incident.description}</div></td><td className="p-4 text-xs">{summary ? `工作事故项扣 ${Math.abs(summary.kpiPenalty)} 分` : "—"}</td><td className="p-4"><Badge tone={incident.status === "CONFIRMED" ? "success" : "default"}>{incident.status === "CONFIRMED" ? "已确认" : "已作废"}</Badge>{data.canManage && incident.status === "CONFIRMED" && <form action={voidWorkIncident} className="mt-2 flex gap-1"><input type="hidden" name="id" value={incident.id}/><input name="voidReason" required placeholder="作废原因" className="h-7 w-28 rounded border border-border px-2 text-xs"/><button className="text-xs text-destructive">作废</button></form>}</td></tr>; })}</tbody></table></div>{data.incidents.length === 0 && <Empty>暂无工作事故</Empty>}</Card>;
}

export function TalentDecisionWorkspace({ data }: { data: DecisionWorkspaceData }) {
  const [managing, setManaging] = useState(false); const userName = new Map(data.users.map((row) => [row.id, row.name]));
  const table = <DecisionTable data={data} userName={userName}/>;
  if (!managing) return <div><Header title="人才决策" description="管理部门建议、资格判断与公司反馈；建议不等于正式人事结果" action={data.canManage ? <Button className={actionClass} onClick={() => setManaging(true)}><Plus className="h-4 w-4"/>进入决策管理</Button> : undefined}/>{table}</div>;
  return <div><Header title="人才决策管理" description="新建部门建议，并维护公司反馈结果" action={<BackButton onClick={() => setManaging(false)} label="返回人才决策"/>}/>{data.canManage && <Card className="mb-4"><h3 className="mb-3 font-semibold">新建部门决策建议</h3><form action={createTalentDecisionRecommendation} className="grid gap-2 md:grid-cols-4"><input name="recommendationNo" required placeholder="建议编号" className={inputClass}/><select name="userId" required className={inputClass}>{data.users.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="decisionType" className={inputClass}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select name="conclusion" className={inputClass}><option value="RECOMMEND">建议</option><option value="NOT_RECOMMEND">不建议</option><option value="NEED_REVIEW">需人工复核</option></select><select name="targetJobLevelId" className={inputClass}><option value="">目标职级（仅晋升填写）</option>{data.levels.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select><input name="suggestedRate" placeholder="建议加薪幅度" className={inputClass}/><input name="rewardName" placeholder="建议奖励名称" className={inputClass}/><input name="externalProcessNo" placeholder="公司流程号（可选）" className={inputClass}/><textarea name="summary" required placeholder="部门建议及原因" className="min-h-20 rounded-lg border border-border bg-background p-3 text-sm md:col-span-3"/><Button className={`${actionClass} md:col-span-4`}>生成建议与证据快照</Button></form></Card>}{table}</div>;
}

function DecisionTable({ data, userName }: { data: DecisionWorkspaceData; userName: Map<string,string> }) {
  return <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-muted/40"><tr>{["建议/员工","事项与结论","资格解释","公司反馈","操作"].map((item) => <th key={item} className="p-4 text-left text-xs font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.rows.map((row) => { const qualification = row.qualification as { passed?: boolean; rules?: Array<{code:string;label:string;passed:boolean;blocking:boolean;detail:string}> }; return <tr key={row.id} className="align-top"><td className="p-4"><div className="font-medium">{row.recommendationNo}</div><div className="text-xs text-muted-foreground">{userName.get(row.userId) ?? row.userId}</div></td><td className="p-4"><Badge tone="primary">{typeLabels[row.decisionType]}</Badge><div className="mt-2 text-xs">{String(row.content.summary ?? "—")}</div></td><td className="p-4"><Badge tone={qualification.passed ? "success" : "warning"}>{qualification.passed ? "无阻断项" : "存在阻断项"}</Badge></td><td className="p-4"><Badge tone={row.companyFeedbackStatus === "ADOPTED" || row.companyFeedbackStatus === "ADJUSTED_ADOPTION" ? "success" : row.companyFeedbackStatus === "REJECTED" ? "danger" : "warning"}>{feedbackLabels[row.companyFeedbackStatus]}</Badge></td><td className="p-4">{data.canManage ? <form action={updateTalentRecommendationFeedback} className="space-y-2"><input type="hidden" name="id" value={row.id}/><select name="companyFeedbackStatus" defaultValue={row.companyFeedbackStatus} className={`${inputClass} w-full`}>{Object.entries(feedbackLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><input name="companyFeedbackContent" defaultValue={row.companyFeedbackContent ?? ""} placeholder="反馈说明" className={`${inputClass} w-full`}/><input name="externalProcessNo" defaultValue={row.externalProcessNo ?? ""} placeholder="外部流程号" className={`${inputClass} w-full`}/><button className="text-xs text-primary">保存反馈</button></form> : "—"}</td></tr>; })}</tbody></table></div>{data.rows.length === 0 && <Empty>暂无决策建议</Empty>}</Card>;
}

export function TalentHistoryWorkspace({ data, employeeProfiles, initialCategory = "profiles" }: { data: HistoryWorkspaceData; employeeProfiles: EmployeeProfileWorkspaceData; initialCategory?: "profiles" | "promotion" | "contract" | "salary" | "reward" }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<"main" | "history" | "profile-view" | "profile-edit">("main");
  const [selectedCategory, setSelectedCategory] = useState<"profiles" | "promotion" | "contract" | "salary" | "reward">(initialCategory);
  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EmployeeProfileWorkspaceData["employees"][number] | null>(null);
  const [deleteState, deleteAction, deleting] = useActionState(deleteEmployeeTalentProfile, initialProfileDeleteState);
  const userName = new Map(data.users.map((row) => [row.id, row.name]));
  const selectedProfile = employeeProfiles.employees.find((row) => row.id === selectedProfileId);
  const timeline = selectedUserId ? data.timeline.filter((row) => row.userId === selectedUserId) : data.timeline;
  const categoryTimeline = data.timeline.filter((row) => {
    if (selectedCategory === "promotion") return row.type === "PROMOTION";
    if (selectedCategory === "contract") return row.type === "CONTRACT_RENEWAL";
    if (selectedCategory === "salary") return row.type === "SALARY_ADJUSTMENT";
    if (selectedCategory === "reward") return ["REWARD", "QUARTERLY_REWARD", "ANNUAL_REWARD"].includes(row.type);
    return false;
  });
  useEffect(() => {
    if (deleteState.status !== "success") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeleteTarget(null);
  }, [deleteState]);
  const timelineTable = <HistoryTable data={data} timeline={timeline} userName={userName}/>;
  const setManaging = (value: boolean) => setWorkspace(value ? "history" : "main");
  if (workspace === "profile-view" && selectedProfile) return <div><Header title="查看人才档案" description={`${selectedProfile.name} · 只读档案信息`} action={<BackButton onClick={() => setWorkspace("main")}/>}/><TalentProfileDetail data={employeeProfiles} employee={selectedProfile}/></div>;
  if (workspace === "profile-edit") return <div><Header title="维护人才档案" description="统一维护员工入职、合同、职级、薪资和人才决策事实" action={<BackButton onClick={() => setWorkspace("main")}/>}/><EmployeeProfileEditor data={employeeProfiles} initialSelectedId={selectedProfileId || undefined}/></div>;
  if (workspace === "main") return <div>
    <Header title="人才履历" description="查询人才档案及已正式发生的晋升、续签、加薪和奖励记录" action={<div className="flex flex-wrap gap-2">{employeeProfiles.canEdit && <Button variant="outline" className={actionClass} onClick={() => { router.refresh(); setSelectedProfileId(""); setWorkspace("profile-edit"); }}>维护人才档案</Button>}{data.canManage && <Button className={actionClass} onClick={() => setWorkspace("history")}><Plus className="h-4 w-4"/>进入履历管理</Button>}</div>}/>
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <SelectableMetric label="人才档案" value={`${employeeProfiles.employees.length} 人`} selected={selectedCategory === "profiles"} onClick={() => setSelectedCategory("profiles")}/>
      <SelectableMetric label="续签记录" value={`${data.counts.contract} 条`} selected={selectedCategory === "contract"} onClick={() => setSelectedCategory("contract")}/>
      <SelectableMetric label="晋升记录" value={`${data.counts.promotion} 条`} selected={selectedCategory === "promotion"} onClick={() => setSelectedCategory("promotion")}/>
      <SelectableMetric label="奖励记录" value={`${data.counts.reward} 条`} selected={selectedCategory === "reward"} onClick={() => setSelectedCategory("reward")}/>
      <SelectableMetric label="加薪记录" value={`${data.counts.salary} 条`} selected={selectedCategory === "salary"} onClick={() => setSelectedCategory("salary")}/>
    </div>
    {selectedCategory === "profiles"
      ? <TalentProfileTable data={employeeProfiles} onView={(employeeId) => { setSelectedProfileId(employeeId); setWorkspace("profile-view"); }} onEdit={(employeeId) => { setSelectedProfileId(employeeId); setWorkspace("profile-edit"); }} onDelete={(employee) => setDeleteTarget(employee)}/>
      : <HistoryTable data={data} timeline={categoryTimeline} userName={userName}/>
    }
    <ProfileDeleteDialog target={deleteTarget} state={deleteState} pending={deleting} action={deleteAction} onClose={() => setDeleteTarget(null)}/>
  </div>;
  return <div>
    <Header title="人才履历管理" description="导入历史结果，或登记正式发生的人事结果" action={<BackButton onClick={() => setManaging(false)} label="返回人才履历"/>}/>
    {data.canManage ? <>
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold">历史履历批量导入</h3><p className="mt-1 text-xs text-muted-foreground">用于批量补录过去已经发生的履历；先预检、确认后再整批入库，不覆盖员工当前基础信息。</p></div>
          <a href="/templates/talent-history-import-template.csv" download className="rounded-lg border border-border px-4 py-2 text-xs">下载 CSV 模板</a>
        </div>
        <form action={uploadTalentHistoryImport} className="flex flex-wrap gap-2">
          <input type="hidden" name="returnPath" value="/talent"/>
          <input name="file" type="file" accept=".xlsx,.xls,.csv" required className="min-w-72 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"/>
          <Button className={actionClass}>上传并预检</Button>
        </form>
        {data.selectedImportBatch?.status === "VALIDATED" ? <form action={confirmTalentHistoryImport} className="mt-3">
          <input type="hidden" name="batchId" value={data.selectedImportBatch.id}/><input type="hidden" name="returnPath" value="/talent"/><Button className={actionClass}>确认整批导入</Button>
        </form> : null}
      </Card>
      <Card className="mb-4">
        <h3 className="mb-1 font-semibold">批量登记正式履历</h3>
        <p className="mb-4 text-xs text-muted-foreground">先选择履历类型，再多选员工；生效日期和数据来源整批共用，每位员工的类型明细逐行填写。晋升仅变更职级；岗位变更请在组织架构中按转岗处理。</p>
        <HistoryRecordForm users={data.users} recommendations={data.recommendations} levels={data.levels}/>
      </Card>
    </> : null}
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="font-semibold">履历记录列表</h3><p className="mt-1 text-xs text-muted-foreground">集中查询通过历史批量导入或批量登记形成的正式履历。</p></div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">筛选员工</span>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className={`${inputClass} min-w-56`}>
            <option value="">全部员工</option>
            {data.users.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
      </div>
      {timelineTable}
    </section>
  </div>;
}

function HistoryTable({ data, timeline, userName }: { data: HistoryWorkspaceData; timeline: HistoryWorkspaceData["timeline"]; userName: Map<string,string> }) {
  return <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-muted/40"><tr>{["生效日期","员工","类型","正式结果","记录编号","来源","状态/操作"].map((item) => <th key={item} className="p-4 text-left text-xs font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{timeline.map((row) => <tr key={`${row.type}-${row.id}`}><td className="p-4 text-xs">{new Date(row.effectiveDate).toLocaleDateString("zh-CN")}</td><td className="p-4 font-medium">{userName.get(row.userId) ?? row.userId}</td><td className="p-4"><Badge tone="primary">{typeLabels[row.type]}</Badge></td><td className="p-4 text-xs font-medium">{row.result}</td><td className="p-4 text-xs text-muted-foreground">{row.recordNo}</td><td className="p-4 text-xs">{sourceLabels[row.sourceType]}</td><td className="p-4"><Badge tone={row.status === "CONFIRMED" ? "success" : "default"}>{row.status === "CONFIRMED" ? "已确认" : "已作废"}</Badge>{data.canManage && row.status === "CONFIRMED" && <form action={voidTalentHistoryRecord} className="mt-2 flex gap-1"><input type="hidden" name="id" value={row.id}/><input type="hidden" name="decisionType" value={row.type}/><input name="voidReason" required placeholder="作废原因" className="h-7 w-24 rounded border border-border px-2 text-xs"/><button className="text-xs text-destructive">作废</button></form>}</td></tr>)}</tbody></table></div>{timeline.length === 0 && <Empty>暂无正式履历记录</Empty>}</Card>;
}

function TalentProfileTable({ data, onView, onEdit, onDelete }: {
  data: EmployeeProfileWorkspaceData;
  onView: (employeeId: string) => void;
  onEdit: (employeeId: string) => void;
  onDelete: (employee: EmployeeProfileWorkspaceData["employees"][number]) => void;
}) {
  const [query, setQuery] = useState("");
  const levelName = new Map(data.levels.map((row) => [row.id, `${row.code}${row.name !== row.code ? ` · ${row.name}` : ""}`]));
  const keyword = query.trim().toLowerCase();
  const employees = keyword
    ? data.employees.filter((row) => [row.name, row.organization, row.originalTitle ?? "", levelName.get(row.jobLevelId) ?? ""].some((value) => value.toLowerCase().includes(keyword)))
    : data.employees;
  const columns = "lg:grid-cols-[minmax(80px,.55fr)_minmax(55px,.35fr)_minmax(50px,.3fr)_minmax(180px,1fr)_minmax(50px,.3fr)_minmax(250px,1.3fr)_minmax(55px,.35fr)_minmax(125px,.7fr)]";

  return <Card className="!p-0 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div><h3 className="font-semibold">人才档案列表</h3><p className="mt-1 text-xs text-muted-foreground">共 {data.employees.length} 位在职员工，岗位名称实时读取组织架构。</p></div>
      <label className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="查询姓名、组织、岗位或职级" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:border-primary focus:outline-none"/>
      </label>
    </div>
    <div className={`hidden gap-x-2 bg-muted/40 px-4 py-3 text-xs text-muted-foreground lg:grid ${columns}`}>
      <div>员工/组织</div><div>岗位名称</div><div>当前职级</div><div>当前聘期</div><div>聘期期数</div><div>人才决策事实</div><div>档案状态</div><div className="text-right">操作</div>
    </div>
    <div className="divide-y divide-border">
      {employees.map((employee) => <div key={employee.id} className={`grid gap-y-3 px-4 py-4 text-sm lg:gap-x-2 ${columns}`}>
        <div><div className="font-medium">{employee.name}</div><div className="mt-1 text-xs text-muted-foreground">{employee.organization}</div></div>
        <div><div className="lg:hidden text-xs text-muted-foreground">岗位名称</div>{employee.originalTitle ?? "未配置岗位"}</div>
        <div><div className="lg:hidden text-xs text-muted-foreground">当前职级</div>{levelName.get(employee.jobLevelId) ?? "未配置"}</div>
        <div>
          <div className="lg:hidden text-xs text-muted-foreground">当前聘期</div>
          <div className="whitespace-nowrap">{employee.currentContractStartAt || employee.currentContractEndAt ? `${employee.currentContractStartAt || "开始日期未配置"} 至 ${employee.currentContractEndAt || "结束日期未配置"}` : "未配置"}</div>
          {employee.contractExpiryStatus === "EXPIRING_SOON" ? <div className="mt-1"><Badge tone="warning">合同即将到期</Badge></div> : null}
          {employee.contractExpiryStatus === "EXPIRES_TODAY" ? <div className="mt-1"><Badge tone="danger">合同到期</Badge></div> : null}
          {employee.contractExpiryStatus === "EXPIRED" ? <div className="mt-1"><Badge tone="danger">合同已过期</Badge></div> : null}
        </div>
        <div><div className="lg:hidden text-xs text-muted-foreground">聘期期数</div>{employee.currentContractSequence ? `第 ${employee.currentContractSequence} 期` : "未配置"}</div>
        <TalentDecisionFacts employee={employee}/>
        <div><div className="lg:hidden text-xs text-muted-foreground">档案状态</div><Badge tone={!employee.hasProfile ? "default" : employee.decisionFactsUpdatedAt ? "success" : "warning"}>{!employee.hasProfile ? "未建档" : employee.decisionFactsUpdatedAt ? "已维护" : "待完善"}</Badge></div>
        <div className="flex items-center gap-2 whitespace-nowrap lg:justify-end">
          <button type="button" onClick={() => onView(employee.id)} className="inline-flex items-center gap-1 text-primary hover:underline"><Eye className="h-3.5 w-3.5"/>查看</button>
          {data.canEdit ? <button type="button" onClick={() => onEdit(employee.id)} className="inline-flex items-center gap-1 text-primary hover:underline"><Pencil className="h-3.5 w-3.5"/>编辑</button> : null}
          {data.canEdit && employee.hasProfile ? <button type="button" onClick={() => onDelete(employee)} className="inline-flex items-center gap-1 text-destructive hover:underline"><Trash2 className="h-3.5 w-3.5"/>删除</button> : null}
        </div>
      </div>)}
    </div>
    {employees.length === 0 && <Empty>未查询到匹配的人才档案</Empty>}
  </Card>;
}

function TalentDecisionFacts({ employee }: { employee: EmployeeProfileWorkspaceData["employees"][number] }) {
  const valueLabel = (value: string) => value === "YES" ? "是" : value === "NO" ? "否" : "未维护";
  const facts = [
    ["盘点2次C级", employee.hasTwoCReviewsInCurrentContract],
    ["连续2次C级", employee.hasConsecutiveTwoCReviewsInCurrentContract],
    ["续聘前盘点C级", employee.isLatestPreRenewalReviewC],
    ["聘期内正式晋升", employee.hasFormalPromotionInCurrentContract],
  ];
  return <div>
    <div className="mb-1 text-xs text-muted-foreground lg:hidden">人才决策事实</div>
    <div className="space-y-0.5 text-xs leading-5">
      {facts.map(([label, value]) => <div key={label} className="flex items-center gap-1 whitespace-nowrap"><span><span className="text-muted-foreground">{label}：</span><span className="font-medium">{valueLabel(value)}</span></span>{label === "聘期内正式晋升" && value === "NO" && employee.remainingPromotionOpportunityCount !== null ? <Badge tone={employee.remainingPromotionOpportunityCount >= 5 ? "success" : employee.remainingPromotionOpportunityCount <= 2 ? "danger" : "warning"}>可晋升机会剩余：{employee.remainingPromotionOpportunityCount}次</Badge> : null}</div>)}
    </div>
  </div>;
}

function TalentProfileDetail({ data, employee }: { data: EmployeeProfileWorkspaceData; employee: EmployeeProfileWorkspaceData["employees"][number] }) {
  const levelName = new Map(data.levels.map((row) => [row.id, `${row.code}${row.name !== row.code ? ` · ${row.name}` : ""}`]));
  const booleanLabel = (value: string) => value === "YES" ? "是" : value === "NO" ? "否" : "未维护";
  const roleLabels: Record<string, string> = { ADMIN: "系统管理员", DEPARTMENT_MANAGER: "部门负责人", MANAGER: "管理人员", EMPLOYEE: "员工" };
  const fields = [
    ["员工", employee.name], ["组织", employee.organization], ["岗位名称", employee.originalTitle ?? "未配置岗位"],
    ["系统角色", roleLabels[employee.systemRole] ?? employee.systemRole], ["入职日期", employee.joinedAt || "未配置"],
    ["入职职级", levelName.get(employee.entryJobLevelId) ?? "未配置"], ["当前职级", levelName.get(employee.jobLevelId) ?? "未配置"],
    ["当前聘期", employee.currentContractStartAt || employee.currentContractEndAt ? `${employee.currentContractStartAt || "—"} 至 ${employee.currentContractEndAt || "—"}` : "未配置"],
    ["当前聘期期数", employee.currentContractSequence ? `第 ${employee.currentContractSequence} 期` : "未配置"],
  ];
  const decisionFacts = [
    ["聘期内人才盘点2次C级", booleanLabel(employee.hasTwoCReviewsInCurrentContract)],
    ["聘期内人才盘点连续2次C级", booleanLabel(employee.hasConsecutiveTwoCReviewsInCurrentContract)],
    ["续聘前最近一次人才盘点为C级", booleanLabel(employee.isLatestPreRenewalReviewC)],
    ["当前聘期内是否有正式晋升", booleanLabel(employee.hasFormalPromotionInCurrentContract)],
  ];
  return <div className="space-y-4">
    {!employee.hasProfile ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">该员工尚未建立人才档案，以下仅展示组织架构中的员工信息。</div> : null}
    <Card><h3 className="mb-4 font-semibold">基本信息</h3><div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([label, value]) => <ProfileReadOnlyField key={label} label={label} value={value}/>)}</div></Card>
    {data.canViewSensitive && employee.hasProfile ? <Card><h3 className="mb-4 font-semibold">薪资信息</h3><div className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><ProfileReadOnlyField label="入职薪资" value={employee.startingSalary === null ? "未配置" : String(employee.startingSalary)}/><ProfileReadOnlyField label="当前薪资" value={employee.currentSalary === null ? "未配置" : String(employee.currentSalary)}/></div></Card> : null}
    <Card><h3 className="mb-4 font-semibold">人才决策基础事实</h3><div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{decisionFacts.map(([label, value]) => <ProfileReadOnlyField key={label} label={label} value={value}/>)}</div>{employee.decisionFactsUpdateNote ? <div className="mt-5"><ProfileReadOnlyField label="更新说明" value={employee.decisionFactsUpdateNote}/></div> : null}</Card>
    {employee.profileNote ? <Card><h3 className="mb-3 font-semibold">档案备注</h3><p className="whitespace-pre-wrap text-sm">{employee.profileNote}</p></Card> : null}
  </div>;
}

function ProfileReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function ProfileDeleteDialog({ target, state, pending, action, onClose }: {
  target: EmployeeProfileWorkspaceData["employees"][number] | null;
  state: EmployeeProfileActionState;
  pending: boolean;
  action: (payload: FormData) => void;
  onClose: () => void;
}) {
  if (!target) return null;
  const matchingError = state.status === "error" && state.savedUserId === target.id;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="delete-profile-title">
    <button type="button" aria-label="关闭删除确认" className="absolute inset-0 bg-slate-950/35" onClick={onClose} disabled={pending}/>
    <div className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl">
      <h3 id="delete-profile-title" className="text-lg font-semibold">删除人才档案</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">确认删除“{target.name}”的人才档案吗？仅删除人才档案数据，组织架构中的员工账号、岗位和组织关系不会删除。</p>
      {matchingError ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p> : null}
      <form action={action} className="mt-6 flex justify-end gap-3">
        <input type="hidden" name="userId" value={target.id}/>
        <Button type="button" variant="outline" className={`${actionClass} whitespace-nowrap`} onClick={onClose} disabled={pending}>取消</Button>
        <Button type="submit" className={`${actionClass} whitespace-nowrap bg-red-600 hover:bg-red-700`} disabled={pending}>{pending ? "删除中" : "确认删除"}</Button>
      </form>
    </div>
  </div>;
}

function SelectableMetric({ label, value, selected, onClick }: { label: string; value: string; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-xl border p-4 text-left shadow-sm transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"}`}>
    <div className={`text-xs ${selected ? "font-medium text-primary" : "text-muted-foreground"}`}>{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
  </button>;
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <Card><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></Card>; }
