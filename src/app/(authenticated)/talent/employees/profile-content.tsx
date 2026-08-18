"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, Save, Search } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui-kit";
import { saveEmployeeBasicProfile, type EmployeeProfileActionState } from "@/server/talent/employee-profile-actions";
import type { getEmployeeProfileManagementData } from "@/server/talent/employee-profile-query";

export type EmployeeProfileData = Awaited<ReturnType<typeof getEmployeeProfileManagementData>>;

const initialState: EmployeeProfileActionState = { status: "idle", message: "", savedUserId: "", requestId: "" };
const inputClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-muted/60";
const roleLabels: Record<string, string> = { ADMIN: "系统管理员", DEPARTMENT_MANAGER: "部门主管", TEAM_LEADER: "组长", MEMBER: "普通员工" };

export default function EmployeeProfileContent({ data }: { data: EmployeeProfileData }) {
  return <Card className="!p-6"><PageHeader title="员工档案" description="统一维护员工基础信息、当前聘期和人才决策事实" action={<Link href="/talent" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted"><ArrowLeft className="h-4 w-4" />返回</Link>} /><EmployeeProfileEditor data={data}/></Card>;
}

export function EmployeeProfileEditor({ data, initialSelectedId }: { data: EmployeeProfileData; initialSelectedId?: string }) {
  const [selectedId, setSelectedId] = useState(initialSelectedId && data.employees.some((item) => item.id === initialSelectedId) ? initialSelectedId : data.employees[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState(saveEmployeeBasicProfile, initialState);
  const selected = data.employees.find((item) => item.id === selectedId) ?? data.employees[0];
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return data.employees;
    return data.employees.filter((item) => [item.name, item.organization, item.originalTitle ?? ""].some((value) => value.toLowerCase().includes(keyword)));
  }, [data.employees, query]);

  return <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-border p-4"><h3 className="font-semibold">选择员工</h3><p className="mt-1 text-xs text-muted-foreground">共 {data.employees.length} 位在职员工</p><div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、组织、岗位" className="h-9 w-full rounded-lg border border-transparent bg-muted/70 pl-9 pr-3 text-sm focus:border-primary focus:bg-card focus:outline-none" /></div></div>
        <div className="max-h-[620px] overflow-y-auto divide-y divide-border">{filtered.map((employee) => <button key={employee.id} type="button" onClick={() => setSelectedId(employee.id)} className={`w-full px-4 py-3 text-left transition-colors ${selected?.id === employee.id ? "bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{employee.name}</span>{selected?.id === employee.id && <Badge tone="primary">编辑中</Badge>}</div><div className="mt-1 text-xs text-muted-foreground">{employee.organization} · {employee.originalTitle ?? "未配置岗位"}</div></button>)}</div>
      </Card>

      {selected ? <form key={`${selected.id}:${state.requestId}`} action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={selected.id} />
        <Card>
          <div className="mb-4"><h3 className="font-semibold">{selected.name} · 基础信息</h3><p className="mt-1 text-xs text-muted-foreground">姓名、所属组织和系统角色请在“组织与权限”中维护；本页维护人才发展所需资料。</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="姓名"><input value={selected.name} disabled className={inputClass} /></Field>
            <Field label="所属组织"><input value={selected.organization} disabled className={inputClass} /></Field>
            <Field label="系统角色"><input value={roleLabels[selected.systemRole] ?? selected.systemRole} disabled className={inputClass} /></Field>
            <Field label="岗位名称"><input value={selected.originalTitle ?? "未配置"} disabled className={inputClass} /></Field>
            <Field label="入职日期"><input name="joinedAt" type="date" defaultValue={selected.joinedAt} className={inputClass} /></Field>
            <Field label="入职职级"><select name="entryJobLevelId" defaultValue={selected.entryJobLevelId} className={inputClass}><option value="">请选择入职职级</option>{data.levels.map((item) => <option key={item.id} value={item.id}>{item.code}{item.name !== item.code ? ` · ${item.name}` : ""}</option>)}</select></Field>
            <Field label="当前职级"><select name="jobLevelId" defaultValue={selected.jobLevelId} className={inputClass}><option value="">请选择当前职级</option>{data.levels.map((item) => <option key={item.id} value={item.id}>{item.code}{item.name !== item.code ? ` · ${item.name}` : ""}</option>)}</select></Field>
            {data.canViewSensitive && <><Field label="入职薪资"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span><input name="startingSalary" type="number" min="0" step="1" defaultValue={selected.startingSalary ?? ""} placeholder="可留空" className={`${inputClass} pl-8`} /></div></Field><Field label="当前薪资"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span><input name="currentSalary" type="number" min="0" step="1" defaultValue={selected.currentSalary ?? ""} placeholder="可留空" className={`${inputClass} pl-8`} /></div></Field></>}
            <div className="md:col-span-2"><Field label="档案备注"><input name="profileNote" defaultValue={selected.profileNote} placeholder="可记录资料来源或补充说明" className={inputClass} /></Field></div>
          </div>
          {!data.canViewSensitive && <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700">当前账号没有敏感数据权限，薪资字段不会展示或修改。</div>}
        </Card>

        <Card><div className="mb-4"><h3 className="font-semibold">当前聘期</h3><p className="mt-1 text-xs text-muted-foreground">记录当前有效聘期；本阶段由管理员维护，后续可由聘期事件更新。</p></div><div className="grid gap-4 md:grid-cols-3"><Field label="当前聘期开始日期"><input name="currentContractStartAt" type="date" defaultValue={selected.currentContractStartAt} className={inputClass}/></Field><Field label="当前聘期结束日期"><input name="currentContractEndAt" type="date" defaultValue={selected.currentContractEndAt} className={inputClass}/></Field><Field label="当前聘期期数"><input name="currentContractSequence" type="number" min="1" step="1" defaultValue={selected.currentContractSequence ?? ""} placeholder="如 1" className={inputClass}/></Field></div></Card>

        <Card><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">人才决策事实</h3><p className="mt-1 text-xs text-muted-foreground">供未来人才决策规则读取；本阶段只维护字段，不实现自动聚合和规则执行。</p></div><Badge tone={selected.decisionFactsUpdatedAt ? "success" : "warning"}>{selected.decisionFactsUpdatedAt ? `更新于 ${new Date(selected.decisionFactsUpdatedAt).toLocaleString("zh-CN", { hour12: false })}` : "尚未更新"}</Badge></div><div className="grid gap-4 md:grid-cols-2"><TriStateField name="hasTwoCReviewsInCurrentContract" label="聘期内人才盘点2次C" defaultValue={selected.hasTwoCReviewsInCurrentContract}/><TriStateField name="hasConsecutiveTwoCReviewsInCurrentContract" label="聘期内人才盘点连续2次C" defaultValue={selected.hasConsecutiveTwoCReviewsInCurrentContract}/><TriStateField name="isLatestPreRenewalReviewC" label="续聘前最近一次人才盘点为C级" defaultValue={selected.isLatestPreRenewalReviewC}/><TriStateField name="hasFormalPromotionInCurrentContract" label="当前聘期内是否有正式晋升" defaultValue={selected.hasFormalPromotionInCurrentContract}/><div className="md:col-span-2"><Field label="事实更新说明"><textarea name="decisionFactsUpdateNote" defaultValue={selected.decisionFactsUpdateNote} rows={3} placeholder="记录本次核对依据；可留空" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"/></Field></div></div><div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">“待更新”表示尚未取得可靠结论，不能等同于“否”。未来由人才盘点、晋升和聘期事件自动更新时，仍复用这些档案字段。</div></Card>

        {state.message && state.savedUserId === selected.id && <div aria-live="polite" className={`rounded-lg px-4 py-3 text-sm ${state.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</div>}
        <div className="flex justify-end"><Button type="submit" disabled={pending || !data.canEdit} className="h-9 rounded-lg px-4 text-sm font-semibold"><Save className="h-4 w-4" />{pending ? "保存中..." : "保存人才档案"}</Button></div>

        <Card className="!p-0 overflow-hidden"><div className="border-b border-border px-5 py-4"><h3 className="font-semibold">字段用途说明</h3></div><div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4"><Hint title="入职与聘期" detail="用于司龄、聘期和续签场景。" /><Hint title="岗位与职级" detail="岗位读取组织架构；入职职级保留历史起点，当前职级用于现状判断。" /><Hint title="薪资信息" detail="用于后续加薪规则，不参与工资核算。" /><Hint title="人才决策事实" detail="作为规则触发字段读取，不在配置中心聚合。" /></div></Card>
      </form> : <Card className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">暂无可维护员工</Card>}
    </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>; }
function TriStateField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) { return <Field label={label}><select name={name} defaultValue={defaultValue} className={inputClass}><option value="">待更新</option><option value="YES">是</option><option value="NO">否</option></select></Field>; }
function Hint({ title, detail }: { title: string; detail: string }) { return <div className="bg-card p-5"><div className="font-medium">{title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>; }
