"use client";

import { Button, Card } from "@/components/ui-kit";
import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { createBusinessAssessmentCycleInlineWithState, type BusinessAssessmentOperationState } from "@/server/talent/assessment-actions";
import type { AssessmentWorkspaceData } from "./operation-workspace-types";
import { OperationFeedback } from "./operation-workspaces";

const inputClass = "h-9 rounded-lg border border-border bg-background px-3 text-sm";
const actionClass = "h-9 rounded-lg px-4 text-sm font-semibold";
const rowIconButtonClass = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40";

const initialCreateState: BusinessAssessmentOperationState = { status: "idle", message: "" };

type QuarterlyStandardRow = {
  key: string;
  scopeType: "ORG_NODE" | "USER";
  scopeId: string;
  passingNumericScore: number;
  requiredGradeCode: string;
};
type QuarterlySubjectRow = { key: string; code: string; name: string; scoringType: "NUMERIC" | "GRADE"; standards: QuarterlyStandardRow[] };

function departmentTeams(data: AssessmentWorkspaceData, departmentOrgNodeId: string | null) {
  return data.teams.filter((team) => team.parentId === departmentOrgNodeId);
}

function departmentUsers(data: AssessmentWorkspaceData, departmentOrgNodeId: string | null) {
  const teamIds = new Set(departmentTeams(data, departmentOrgNodeId).map((team) => team.id));
  return data.users.filter((user) => user.orgNodeId && teamIds.has(user.orgNodeId));
}

function makeQuarterlyStandard(
  data: AssessmentWorkspaceData,
  departmentOrgNodeId: string | null,
  scopeType: "ORG_NODE" | "USER" = "ORG_NODE",
): QuarterlyStandardRow {
  const targets = scopeType === "ORG_NODE"
    ? departmentTeams(data, departmentOrgNodeId)
    : departmentUsers(data, departmentOrgNodeId);
  return {
    key: `standard-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    scopeType,
    scopeId: targets[0]?.id ?? "",
    passingNumericScore: 80,
    requiredGradeCode: "A",
  };
}

function makeQuarterlySubject(data: AssessmentWorkspaceData, departmentOrgNodeId: string | null): QuarterlySubjectRow {
  const teams = departmentTeams(data, departmentOrgNodeId);
  return {
    key: `subject-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    code: `SUBJECT_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: "",
    scoringType: "NUMERIC",
    standards: teams.length
      ? teams.map((team) => ({ ...makeQuarterlyStandard(data, departmentOrgNodeId), key: `standard-${team.id}-${Date.now()}`, scopeId: team.id }))
      : [makeQuarterlyStandard(data, departmentOrgNodeId)],
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-muted-foreground">{label}</span>{children}</label>;
}

export function BusinessAssessmentCycleCreateForm({ data, onSuccess }: { data: AssessmentWorkspaceData; onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(createBusinessAssessmentCycleInlineWithState, initialCreateState);
  const [departmentOrgNodeId, setDepartmentOrgNodeId] = useState(data.departments[0]?.id ?? "");
  const [subjectRows, setSubjectRows] = useState<QuarterlySubjectRow[]>(() => [makeQuarterlySubject(data, data.departments[0]?.id ?? null)]);

  useEffect(() => {
    if (state.status !== "success") return;
    // 创建成功后由父工作区切回列表页。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    onSuccess();
  }, [state, onSuccess]);

  const changeDepartment = (nextDepartmentOrgNodeId: string) => {
    setDepartmentOrgNodeId(nextDepartmentOrgNodeId);
    // 小组及格标准跟随部门预填，切换部门后按新部门小组重建科目草稿。
    setSubjectRows([makeQuarterlySubject(data, nextDepartmentOrgNodeId)]);
  };
  const updateSubject = (key: string, patch: Partial<QuarterlySubjectRow>) => setSubjectRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const updateStandard = (subjectKey: string, standardKey: string, patch: Partial<QuarterlyStandardRow>) => setSubjectRows((current) => current.map((subject) => subject.key === subjectKey ? { ...subject, standards: subject.standards.map((standard) => standard.key === standardKey ? { ...standard, ...patch } : standard) } : subject));

  return <form action={formAction} className="space-y-4">
    <input type="hidden" name="ruleSubjectsJson" value={JSON.stringify(subjectRows.map((subject) => ({ code: subject.code, name: subject.name, scoringType: subject.scoringType, standards: subject.standards.map((standard) => ({ scopeType: standard.scopeType, scopeId: standard.scopeId, passingNumericScore: standard.passingNumericScore, requiredGradeCode: standard.requiredGradeCode })) })))}/>
    <Card>
      <h3 className="font-semibold">基本信息</h3>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">每个部门每季度只能创建一个业务考核；总分与摊分比例按「人才发展 → 规则配置 → 绩效管理规则」中本部门已发布版本冻结，科目与及格标准随本次考核冻结。</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="考核部门"><select name="departmentOrgNodeId" required value={departmentOrgNodeId} onChange={(event) => changeDepartment(event.target.value)} disabled={pending} className={`${inputClass} w-full`}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label="考核年份"><input name="year" type="number" min="2020" defaultValue={new Date().getFullYear()} required disabled={pending} className={`${inputClass} w-full`}/></Field>
        <Field label="考核季度"><select name="quarter" defaultValue={Math.floor(new Date().getMonth() / 3) + 1} disabled={pending} className={`${inputClass} w-full`}>{[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}</select></Field>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="考核开始日期"><input name="assessmentStartDate" type="date" required disabled={pending} aria-label="考核开始日期" className={`${inputClass} w-full`}/></Field>
          <span className="pb-2 text-xs text-muted-foreground">至</span>
          <Field label="考核结束日期"><input name="assessmentEndDate" type="date" required disabled={pending} aria-label="考核结束日期" className={`${inputClass} w-full`}/></Field>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">考核时间段对本次业务考核的所有员工和科目统一生效。</p>
    </Card>
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold">考核科目与小组及格标准</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">每个科目先确定评分方式，再分别设置本部门各小组的及格线，所有小组都必须配置；个人规则仅作为同科目下的特殊覆盖。</p></div>
        <Button type="button" variant="outline" className={actionClass} disabled={pending} onClick={() => setSubjectRows((current) => [...current, makeQuarterlySubject(data, departmentOrgNodeId)])}><Plus className="h-4 w-4"/>添加科目</Button>
      </div>
      <div className="space-y-3">{subjectRows.map((subject, subjectIndex) => <div key={subject.key} className="rounded-xl border border-border p-3"><div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_76px] md:items-end"><Field label="科目名称"><input value={subject.name} disabled={pending} onChange={(event) => updateSubject(subject.key, { name: event.target.value })} placeholder="如 PPT 演讲" className={inputClass}/></Field><Field label="评分方式"><select value={subject.scoringType} disabled={pending} onChange={(event) => updateSubject(subject.key, { scoringType: event.target.value as "NUMERIC" | "GRADE" })} className={inputClass}><option value="NUMERIC">分数评分</option><option value="GRADE">等级评分</option></select></Field><div className="flex justify-end gap-1 pb-0.5"><button type="button" disabled={pending || subjectRows.length === 1} onClick={() => setSubjectRows((current) => current.filter((row) => row.key !== subject.key))} className={`${rowIconButtonClass} text-red-600`} aria-label="删除科目"><Trash2 className="h-4 w-4"/></button><button type="button" disabled={pending} onClick={() => setSubjectRows((current) => [...current.slice(0, subjectIndex + 1), makeQuarterlySubject(data, departmentOrgNodeId), ...current.slice(subjectIndex + 1)])} className={rowIconButtonClass} aria-label="添加科目"><Plus className="h-4 w-4"/></button></div></div><div className="mt-3 space-y-2 border-t border-border pt-3"><p className="text-xs font-medium">小组及格标准</p>{subject.standards.map((standard, standardIndex) => { const targets = standard.scopeType === "ORG_NODE" ? departmentTeams(data, departmentOrgNodeId) : departmentUsers(data, departmentOrgNodeId); return <div key={standard.key} className="grid gap-2 rounded-lg bg-muted/30 p-2 md:grid-cols-[110px_minmax(180px,1fr)_minmax(150px,1fr)_76px] md:items-end"><Field label="适用范围"><select value={standard.scopeType} disabled={pending} onChange={(event) => { const scopeType = event.target.value as "ORG_NODE" | "USER"; const nextTargets = scopeType === "ORG_NODE" ? departmentTeams(data, departmentOrgNodeId) : departmentUsers(data, departmentOrgNodeId); updateStandard(subject.key, standard.key, { scopeType, scopeId: nextTargets[0]?.id ?? "" }); }} className={inputClass}><option value="ORG_NODE">小组</option><option value="USER">个人例外</option></select></Field><Field label={standard.scopeType === "ORG_NODE" ? "选择小组" : "选择员工"}><select value={standard.scopeId} disabled={pending} onChange={(event) => updateStandard(subject.key, standard.key, { scopeId: event.target.value })} className={inputClass}><option value="">请选择</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>{subject.scoringType === "NUMERIC" ? <Field label="分数及格线"><div className="relative"><input type="number" min="0" max="100" step="0.01" value={standard.passingNumericScore} disabled={pending} onChange={(event) => updateStandard(subject.key, standard.key, { passingNumericScore: Number(event.target.value) })} className={`${inputClass} w-full pr-9`}/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">分</span></div></Field> : <Field label="要求等级"><select value={standard.requiredGradeCode} disabled={pending} onChange={(event) => updateStandard(subject.key, standard.key, { requiredGradeCode: event.target.value })} className={inputClass}>{["S","A","B","C","D"].map((grade) => <option key={grade} value={grade}>达到 {grade} 级及以上</option>)}</select></Field>}<div className="flex justify-end gap-1 pb-0.5"><button type="button" disabled={pending || subject.standards.length === 1} onClick={() => updateSubject(subject.key, { standards: subject.standards.filter((row) => row.key !== standard.key) })} className={`${rowIconButtonClass} text-red-600`} aria-label="删除及格标准"><Trash2 className="h-4 w-4"/></button><button type="button" disabled={pending} onClick={() => updateSubject(subject.key, { standards: [...subject.standards.slice(0, standardIndex + 1), makeQuarterlyStandard(data, departmentOrgNodeId, standard.scopeType), ...subject.standards.slice(standardIndex + 1)] })} className={rowIconButtonClass} aria-label="添加及格标准"><Plus className="h-4 w-4"/></button></div></div>; })}</div></div>)}{!subjectRows.length && <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">暂无科目，请先添加考核科目</div>}</div>
    </Card>
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="mr-auto"><OperationFeedback state={state}/></div>
      <Button type="submit" className={actionClass} disabled={pending || !data.departments.length}>{pending ? "创建中" : "创建业务考核"}</Button>
    </div>
  </form>;
}
