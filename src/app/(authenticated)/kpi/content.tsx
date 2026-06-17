"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Progress, avatarColor } from "@/components/ui-kit";
import { downloadKpiTemplateCsv, importKpiTemplates, initializeQuarterlyKpis } from "@/server/kpi/actions";
import { Search, Upload, X } from "lucide-react";
import type { getKpiData } from "@/server/kpi/kpi-query";


type Props = { data: Awaited<ReturnType<typeof getKpiData>> };
type SectionTab = "quarterly-kpi" | "kpi-template";
type TeamTab = "all" | Props["data"]["teamOptions"][number]["id"];
type TemplateRow = Props["data"]["templateRows"][number];

type InitializationResult = Awaited<ReturnType<typeof initializeQuarterlyKpis>>;
type TemplateImportResult = Awaited<ReturnType<typeof importKpiTemplates>>;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function TemplateList({ rows }: { rows: TemplateRow[] }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/40">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-5 py-3 font-medium">模板名称</th>
            <th className="px-5 py-3 font-medium">创建人</th>
            <th className="px-5 py-3 font-medium">适用范围</th>
            <th className="px-5 py-3 font-medium">创建时间</th>
            <th className="px-5 py-3 font-medium">最后更新</th>
            <th className="px-5 py-3 font-medium">最后更新时间</th>
            <th className="px-5 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-border transition hover:bg-muted/30">
                <td className="px-5 py-3 text-sm font-medium">{row.name}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{row.createdByName}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{row.scopeName}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground tabular-nums">{formatDateTime(row.createdAt)}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">{row.updatedByName}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground tabular-nums">{formatDateTime(row.updatedAt)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" disabled>查看</Button>
                    <Button type="button" variant="ghost" size="sm" disabled>编辑</Button>
                    <Button type="button" variant="ghost" size="sm" disabled>删除</Button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">暂无 KPI 模板</td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function KpiInitializationForm({
  year,
  quarter,
  onClose,
  onComplete,
}: {
  year: number;
  quarter: number;
  onClose: () => void;
  onComplete: (result: InitializationResult) => void;
}) {
  return (
    <form
      action={async (formData) => {
        const result = await initializeQuarterlyKpis(formData);
        onComplete(result);
        onClose();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <p className="text-sm text-muted-foreground">
        将按当前可见范围，为 {year} Q{quarter} 批量初始化个人 KPI 单据，并基于命中的最新版已审核通过模板生成快照。
      </p>
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
        <div>会创建缺失的季度 KPI 单据</div>
        <div>已存在单据的成员会自动跳过</div>
        <div>未命中模板的成员不会建单</div>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">初始化本季度 KPI</Button>
      </div>
    </form>
  );
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function TemplateImportForm({
  departmentOptions,
  defaultDepartmentOrgNodeId,
  canSelectAnyDepartment,
  onClose,
  onComplete,
}: {
  departmentOptions: Props["data"]["departmentOptions"];
  defaultDepartmentOrgNodeId: string;
  canSelectAnyDepartment: boolean;
  onClose: () => void;
  onComplete: (result: TemplateImportResult) => void;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        try {
          setErrorMessage(null);
          const result = await importKpiTemplates(formData);
          onComplete(result);
          onClose();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "导入失败，请检查模板内容后重试");
        }
      }}
      className="space-y-4"
    >
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
        <div>请先下载 Excel 模板，在 Excel 或 WPS 中填写后再上传。</div>
        <div>模板列固定为：指标项*、评分标准*、分值*。</div>
        <div>其中指标项、评分标准、分值为必填。</div>
        <div>如果你直接在 Excel 中编辑，请不要改动表头顺序。</div>
      </div>
      {errorMessage ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-sm font-medium">所属部门 *</label>
        <select
          name="departmentOrgNodeId"
          defaultValue={defaultDepartmentOrgNodeId}
          disabled={!canSelectAnyDepartment}
          className="block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted"
        >
          {departmentOptions.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">上传模板文件 *</label>
        <input
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
        />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit"><Upload className="h-4 w-4" />导入模板</Button>
      </div>
    </form>
  );
}

export function KpiContent({ data }: Props) {
  const router = useRouter();
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [initResult, setInitResult] = useState<InitializationResult | null>(null);
  const [templateImportResult, setTemplateImportResult] = useState<TemplateImportResult | null>(null);
  const [departmentTab, setDepartmentTab] = useState(data.defaultDepartmentOrgNodeId);
  const [teamTab, setTeamTab] = useState<TeamTab>("all");
  const [sectionTab, setSectionTab] = useState<SectionTab>("quarterly-kpi");
  const filteredTeamOptions = useMemo(
    () => data.teamOptions.filter((team) => team.departmentOrgNodeId === departmentTab),
    [data.teamOptions, departmentTab]
  );
  const teamTabs = useMemo(
    () => [{ id: "all" as const, name: "全部" }, ...filteredTeamOptions],
    [filteredTeamOptions]
  );
  const rows = useMemo(
    () => data.rows.filter((row) => {
      if (row.departmentOrgNodeId !== departmentTab) return false;
      return teamTab === "all" ? true : row.teamOrgNodeId === teamTab;
    }),
    [data.rows, departmentTab, teamTab]
  );

  async function handleDownloadTemplate() {
    const formData = new FormData();
    formData.set("departmentOrgNodeId", departmentTab);
    const { fileName, content } = await downloadKpiTemplateCsv(formData);
    const blob = base64ToBlob(
      content,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card className="mb-4 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">{data.year} Q{data.quarter} KPI</h1>
            <p className="mt-2 text-sm text-muted-foreground">按模板规则批量初始化季度 KPI 单据，并进入自评、组长评分、主管评分流程</p>
          </div>

          <div className="flex flex-wrap items-end gap-8 text-sm shrink-0">
            {data.departmentOptions.map((department) => (
              <button
                key={department.id}
                type="button"
                onClick={() => {
                  setDepartmentTab(department.id);
                  setTeamTab("all");
                }}
                className={`pb-3 border-b-2 transition ${
                  departmentTab === department.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {department.name}
              </button>
            ))}
          </div>

          <div className="px-0 py-4 flex flex-wrap items-center gap-2">
            {teamTabs.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setTeamTab(team.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${teamTab === team.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
              >
                {team.name}
              </button>
            ))}
          </div>

          <div className="pb-5 flex flex-wrap items-center gap-4">
            <div className="inline-flex rounded-lg bg-muted p-1">
              {[
                { key: "quarterly-kpi" as const, label: "季度KPI" },
                { key: "kpi-template" as const, label: "KPI模板" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSectionTab(tab.key)}
                  className={`rounded-md px-4 py-1.5 text-sm transition ${
                    sectionTab === tab.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {sectionTab === "quarterly-kpi" ? (
                <Button onClick={() => setShowInitDialog(true)}>初始化本季度 KPI</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleDownloadTemplate}>下载模板</Button>
                  <Button onClick={() => setShowImportDialog(true)}><Upload className="w-4 h-4" />导入模板</Button>
                </>
              )}
            </div>

            <div className="ml-auto text-xs text-muted-foreground">
              {sectionTab === "quarterly-kpi"
                ? `当前看板：${data.year} Q${data.quarter}`
                : `当前模板部门：${data.departmentOptions.find((department) => department.id === departmentTab)?.name ?? "—"}`}
            </div>
          </div>
        </div>

        {sectionTab === "kpi-template" && templateImportResult ? (
          <div className="px-5 pb-4">
            <Card className="border-success/20 bg-success/5">
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{templateImportResult.departmentName}模板导入成功</span>
                  <Badge tone="success">已成功导入 {templateImportResult.importedTemplateCount} 个模板</Badge>
                  <Badge tone="info">{templateImportResult.importedItemCount} 个模板项</Badge>
                  <Badge tone="primary">{templateImportResult.importedAssignmentCount} 条分配规则</Badge>
                  <button
                    className="ml-auto text-xs text-primary hover:underline"
                    onClick={() => {
                      setTemplateImportResult(null);
                      router.refresh();
                    }}
                  >
                    刷新数据
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">已导入模板名称：</div>
                  <div className="flex flex-wrap gap-2">
                    {templateImportResult.importedTemplateNames.map((templateName) => (
                      <Badge key={templateName} tone="success">{templateName}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {sectionTab === "quarterly-kpi" ? (
          <div className="px-5 pb-5 space-y-4">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">流程进度</h3>
                <span className="text-xs text-muted-foreground">共 {rows.length} 份 KPI</span>
              </div>
              <div className="flex items-center gap-2">
                {data.stages.map((s, i) => {
                  const maxCount = Math.max(...data.stages.map((stage) => stage.count), 1);
                  return (
                    <div key={s.label} className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                        </div>
                        {i < data.stages.length - 1 ? <div className="w-2" /> : null}
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
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input placeholder="搜索成员" className="h-9 w-full rounded-lg bg-muted pl-9 pr-3 text-sm focus:outline-none" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>小组：</span>
                  <button className="rounded-md bg-primary/10 px-2 py-1 text-primary">{teamTab === "all" ? "全部" : teamTabs.find((team) => team.id === teamTab)?.name ?? "全部"}</button>
                </div>
              </div>
              <table className="w-full">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">成员</th>
                    <th className="px-5 py-3 font-medium">小组</th>
                    <th className="px-5 py-3 font-medium">KPI 数</th>
                    <th className="px-5 py-3 font-medium">阶段</th>
                    <th className="w-48 px-5 py-3 font-medium">完成度</th>
                    <th className="px-5 py-3 font-medium">得分</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-border transition hover:bg-muted/30">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${avatarColor(r.userName)}`}>{r.userName[0]}</div>
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
          </div>
        ) : (
          <div className="px-5 pb-5">
            <TemplateList rows={data.templateRows.filter((row) => row.departmentOrgNodeId === departmentTab)} />
          </div>
        )}
      </Card>

      <Dialog open={showImportDialog} onClose={() => setShowImportDialog(false)} title="导入 KPI 模板">
        <TemplateImportForm
          departmentOptions={data.departmentOptions}
          defaultDepartmentOrgNodeId={departmentTab}
          canSelectAnyDepartment={data.canSelectAnyDepartment}
          onClose={() => setShowImportDialog(false)}
          onComplete={(result) => {
            setTemplateImportResult(result);
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog open={showInitDialog} onClose={() => setShowInitDialog(false)} title={`初始化 ${data.year} Q${data.quarter} KPI`}>
        <KpiInitializationForm
          year={data.year}
          quarter={data.quarter}
          onClose={() => setShowInitDialog(false)}
          onComplete={(result) => {
            setInitResult(result);
            router.refresh();
          }}
        />
      </Dialog>
    </>
  );
}
