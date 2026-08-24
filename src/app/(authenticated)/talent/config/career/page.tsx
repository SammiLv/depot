import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { requireCurrentUser } from "@/server/auth/current-user";
import { resolvePermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { getCareerConfiguration } from "@/server/talent/config-query";
import { createCareerTrack, createJobFamily, createJobLevel, createJobLevelGroup, createJobRole, createPromotionPath, createSalaryCap, saveEmployeeTalentProfile } from "@/server/talent/config-actions";

const input = "h-9 rounded-lg border border-border bg-background px-3 text-sm";
const button = "h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground";

export default async function CareerConfigurationPage() {
  const user = await requireCurrentUser();
  const coverage = await resolvePermissionCoverage(user, orgPermissionModuleKeys.talent, talentAbilityKeys.viewConfig);
  if (!coverage.hasPermission) redirect("/talent");
  const data = await getCareerConfiguration(user);
  const trackName = new Map(data.tracks.map((row) => [row.id, row.name]));
  const familyName = new Map(data.families.map((row) => [row.id, row.name]));
  const groupName = new Map(data.levelGroups.map((row) => [row.id, row.code]));
  const levelName = new Map(data.levels.map((row) => [row.id, row.code]));
  const roleName = new Map(data.roles.map((row) => [row.id, row.name]));
  const profileByUserId = new Map(data.profiles.map((row) => [row.userId, row]));
  const levelById = new Map(data.levels.map((row) => [row.id, row]));

  return <Card className="!p-6">
    <PageHeader title="职业通道与职级配置" description="配置职业通道、岗位序列、具体岗位、职级分档、晋升路径和薪资上限" action={<Link href="/talent" className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted">返回人才发展</Link>} />
    <div className="flex gap-5 border-b border-border mb-5"><span className="pb-3 border-b-2 border-primary text-primary text-sm font-medium">职业通道与职级</span><Link href="/talent/config/competencies" className="pb-3 text-sm text-muted-foreground">能力库与能力模型</Link></div>

    <div className="grid xl:grid-cols-2 gap-4">
      <ConfigCard title="1. 职业通道" hint="例如：专业通道、管理通道">
        <form action={createCareerTrack} className="grid grid-cols-2 gap-2">
          <select name="departmentOrgNodeId" required className={input}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          <input name="code" required placeholder="编码，如 PROFESSIONAL" className={input}/><input name="name" required placeholder="通道名称" className={input}/><input name="sortOrder" type="number" defaultValue="10" className={input}/><input name="description" placeholder="说明" className={`${input} col-span-2`}/><button className={`${button} col-span-2`}>新增职业通道</button>
        </form>
        <Rows empty="暂无职业通道" rows={data.tracks.map((row) => <Row key={row.id} title={row.name} detail={`${row.code} · 排序 ${row.sortOrder}`} />)} />
      </ConfigCard>

      <ConfigCard title="2. 岗位序列与岗位" hint="岗位必须归属岗位序列，岗位序列必须归属职业通道">
        <form action={createJobFamily} className="grid grid-cols-2 gap-2 mb-3"><select name="careerTrackId" required className={input}>{data.tracks.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input name="code" required placeholder="序列编码" className={input}/><input name="name" required placeholder="序列名称" className={input}/><input name="sortOrder" type="number" defaultValue="10" className={input}/><button className={`${button} col-span-2`}>新增岗位序列</button></form>
        <form action={createJobRole} className="grid grid-cols-2 gap-2"><select name="jobFamilyId" required className={input}>{data.families.map((row) => <option key={row.id} value={row.id}>{trackName.get(row.careerTrackId)} / {row.name}</option>)}</select><input name="code" required placeholder="岗位编码" className={input}/><input name="name" required placeholder="岗位名称，如 C端产品" className={input}/><input name="sortOrder" type="number" defaultValue="10" className={input}/><button className={`${button} col-span-2`}>新增具体岗位</button></form>
        <Rows empty="暂无岗位" rows={data.roles.map((row) => <Row key={row.id} title={row.name} detail={`${familyName.get(row.jobFamilyId) ?? "未知序列"} · ${row.code}`} />)} />
      </ConfigCard>

      <ConfigCard title="3. 职级段与细分档" hint="上下级关系使用 rankOrder/stepOrder，不解析职级名称">
        <form action={createJobLevelGroup} className="grid grid-cols-3 gap-2 mb-3"><input name="code" required placeholder="R3" className={input}/><input name="name" required placeholder="R3职级" className={input}/><input name="rankOrder" required type="number" placeholder="排序3" className={input}/><button className={`${button} col-span-3`}>新增职级段</button></form>
        <form action={createJobLevel} className="grid grid-cols-2 gap-2"><select name="jobLevelGroupId" required className={input}>{data.levelGroups.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select><input name="code" required placeholder="R3-1" className={input}/><input name="name" required placeholder="R3-1" className={input}/><input name="stepOrder" required type="number" min="1" placeholder="档位1" className={input}/><input name="displayOrder" type="number" defaultValue="10" className={input}/><button className={button}>新增细分职级</button></form>
        <Rows empty="暂无职级" rows={data.levelGroups.map((group) => <Row key={group.id} title={group.code} detail={data.levels.filter((row) => row.jobLevelGroupId === group.id).map((row) => row.code).join("、") || "尚未细分"} />)} />
      </ConfigCard>

      <ConfigCard title="4. 晋升路径" hint="显式配置岗位内允许的职级变化">
        <form action={createPromotionPath} className="grid grid-cols-2 gap-2"><select name="jobRoleId" required className={input}>{data.roles.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input name="sortOrder" type="number" defaultValue="10" className={input}/><select name="fromJobLevelId" required className={input}>{data.levels.map((row) => <option key={row.id} value={row.id}>从 {row.code}</option>)}</select><select name="toJobLevelId" required className={input}>{data.levels.map((row) => <option key={row.id} value={row.id}>到 {row.code}</option>)}</select><button className={`${button} col-span-2`}>新增晋升路径</button></form>
        <Rows empty="暂无晋升路径" rows={data.promotionPaths.map((row) => <Row key={row.id} title={roleName.get(row.jobRoleId) ?? "未知岗位"} detail={`${levelName.get(row.fromJobLevelId)} → ${levelName.get(row.toJobLevelId)}`} />)} />
      </ConfigCard>

      <div className="xl:col-span-2"><ConfigCard title="5. 薪资与职级上限" hint="细分职级未配置时继承职级段上限；具体档覆盖优先">
        <form action={createSalaryCap} className="grid md:grid-cols-4 gap-2"><select name="departmentOrgNodeId" required className={input}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select name="jobLevelGroupId" required className={input}>{data.levelGroups.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select><select name="jobLevelId" className={input}><option value="">整个职级段（默认）</option>{data.levels.map((row) => <option key={row.id} value={row.id}>{row.code} 单独覆盖</option>)}</select><input name="maxSalary" required type="number" min="1" placeholder="薪资上限" className={input}/><input name="effectiveFrom" required type="date" className={input}/><input name="effectiveTo" type="date" className={input}/><input name="version" type="number" min="1" defaultValue="1" className={input}/><button className={button}>发布薪资上限</button></form>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left p-3">职级</th><th className="text-left p-3">上限</th><th className="text-left p-3">生效期</th><th className="text-left p-3">状态</th></tr></thead><tbody className="divide-y divide-border">{data.salaryCaps.map((row) => <tr key={row.id}><td className="p-3">{row.jobLevelId ? levelName.get(row.jobLevelId) : groupName.get(row.jobLevelGroupId)}</td><td className="p-3 font-medium">¥ {row.maxSalary.toLocaleString()}</td><td className="p-3 text-xs">{row.effectiveFrom.toLocaleDateString("zh-CN")} 至 {row.effectiveTo?.toLocaleDateString("zh-CN") ?? "长期"}</td><td className="p-3"><Badge tone="success">{row.versionStatus}</Badge></td></tr>)}</tbody></table></div>
      </ConfigCard></div>

      <div className="xl:col-span-2"><ConfigCard title="6. 员工岗位、职级与当前薪资" hint="当前薪资属于敏感信息，仅配置管理员可维护；本模块只做上限判断，不做工资核算">
        <form action={saveEmployeeTalentProfile} className="grid md:grid-cols-3 gap-2"><select name="userId" required className={input}>{data.users.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.title ?? "未配置岗位"}</option>)}</select><select name="jobLevelId" className={input}><option value="">仅使用原始职级信息</option>{data.levels.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select><input name="currentSalary" type="number" min="1" placeholder="当前薪资（可留空）" className={input}/><button className={`${button} md:col-span-3`}>保存员工人才档案</button></form>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left p-3">员工</th><th className="text-left p-3">岗位</th><th className="text-left p-3">细分职级</th><th className="text-left p-3">当前薪资</th><th className="text-left p-3">上限判断</th></tr></thead><tbody className="divide-y divide-border">{data.users.map((person) => { const profile = profileByUserId.get(person.id); const level = profile?.jobLevelId ? levelById.get(profile.jobLevelId) : null; const departmentOrgNodeId = data.departmentOrgNodeIdByUserId[person.id]; const applicableCaps = level ? data.salaryCaps.filter((cap) => cap.departmentOrgNodeId === departmentOrgNodeId && cap.jobLevelGroupId === level.jobLevelGroupId && (cap.jobLevelId === level.id || cap.jobLevelId === null)) : []; const salaryCap = applicableCaps.find((cap) => cap.jobLevelId === level?.id) ?? applicableCaps.find((cap) => cap.jobLevelId === null); const reachedCap = Boolean(profile?.currentSalary && salaryCap && profile.currentSalary >= salaryCap.maxSalary); return <tr key={person.id}><td className="p-3 font-medium">{person.name}</td><td className="p-3">{person.title ?? "未配置"}</td><td className="p-3">{profile?.jobLevelId ? levelName.get(profile.jobLevelId) ?? "未配置" : "未配置"}</td><td className="p-3">{profile?.currentSalary ? `¥ ${profile.currentSalary.toLocaleString()}` : "未维护"}</td><td className="p-3">{!profile?.currentSalary || !salaryCap ? <Badge>待补数据</Badge> : reachedCap ? <Badge tone="warning">已达上限</Badge> : <Badge tone="success">距上限 ¥ {(salaryCap.maxSalary - profile.currentSalary).toLocaleString()}</Badge>}</td></tr>; })}</tbody></table></div>
      </ConfigCard></div>
    </div>
  </Card>;
}

function ConfigCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) { return <Card className="h-full"><div className="mb-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground mt-1">{hint}</p></div>{children}</Card>; }
function Rows({ rows, empty }: { rows: React.ReactNode[]; empty: string }) { return <div className="mt-4 border-t border-border divide-y divide-border">{rows.length ? rows : <div className="py-3 text-xs text-muted-foreground">{empty}</div>}</div>; }
function Row({ title, detail }: { title: string; detail: string }) { return <div className="py-2.5 flex justify-between gap-4 text-sm"><span className="font-medium">{title}</span><span className="text-xs text-muted-foreground text-right">{detail}</span></div>; }
