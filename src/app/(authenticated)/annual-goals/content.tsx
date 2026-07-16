"use client";

import { useEffect, useState, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button as UiButton, Card, Progress } from "@/components/ui-kit";
import { createAnnualGoalMetric, createAnnualGoalMetricSource, createAnnualGoalPlan, deleteAnnualGoalMetric, deleteAnnualGoalMetricSource, deleteAnnualGoalPlan, deleteAnnualGoalQuarterTargets, saveAnnualGoalQuarterTargets, updateAnnualGoalMetric, updateAnnualGoalMetricSource, updateAnnualGoalPlan, updateAnnualGoalQuarterProgress, updateAnnualGoalWeeklyProgress } from "@/server/annual-goals/actions";
import type { getAnnualGoalsData } from "@/server/annual-goals/annual-goals-query";
import { Edit, GitBranch, History, Plus, Target, Trash2, TrendingUp, X } from "lucide-react";

type Data = Awaited<ReturnType<typeof getAnnualGoalsData>>;
type Plan = Data["plans"][number];
type ScopeItem = Data["scopeItems"][number];
type Metric = Plan["metrics"][number];
type SourceMetric = Metric["sources"][number];
type PlanDetailView = Pick<Plan, "ownerType" | "metrics" | "permissions" | "totalWeight">;
type PlanTab = "metrics" | "sources" | "quarters";
type Props = { data: Data };

function Button({ className = "", size = "md", ...props }: ComponentProps<typeof UiButton>) {
  return <UiButton {...props} size={size} className={`rounded-lg px-5 text-sm font-semibold shadow-none ${className}`.trim()} />;
}

function renderRequiredLabel(label: string) {
  const trimmedLabel = label.trimEnd();
  if (!trimmedLabel.endsWith("*")) return label;
  return <>{trimmedLabel.slice(0, -1).trimEnd()} <span className="text-destructive">*</span></>;
}

function getYearLabel(year: number) {
  return `${year} 年`;
}

function getScopeItemKey(item: ScopeItem) {
  return `${item.type}:${item.orgNodeId}`;
}

function formatPercent(value: number) {
  return value.toFixed(1);
}

function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatInputValue(value: number | null | undefined, fallback = "") {
  return value === null || value === undefined ? fallback : formatValue(value);
}

function roundValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const DECIMAL_UNITS = new Set(["万元", "元", "分"]);

function allowsDecimalUnit(unit: string | null | undefined) {
  return !!unit && DECIMAL_UNITS.has(unit.trim());
}

function getNumberStep(unit: string | null | undefined) {
  return allowsDecimalUnit(unit) ? "0.01" : "1";
}

function validateUnitValue(value: FormDataEntryValue | null, unit: string | null | undefined, label: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const parsed = Number(raw);
  const normalizedLabel = label.includes("目标值") ? "目标值" : label.includes("当前值") ? "当前值" : label;
  if (!Number.isFinite(parsed)) return `${normalizedLabel}格式不正确`;
  if (!allowsDecimalUnit(unit) && !Number.isInteger(parsed)) {
    return `${normalizedLabel}仅支持整数`;
  }
  return null;
}

function getSourceMetricTargetTotal(metric: Metric) {
  return roundValue(
    metric.sources.reduce((sum, source) => sum + source.targetValue, 0)
  );
}

function canAddSourceMetric(metric: Metric) {
  return getSourceMetricTargetTotal(metric) < roundValue(metric.rawTargetValue);
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getQuarterTargetsTime(targets: Metric["quarterTargets"]) {
  if (targets.length === 0) return null;
  return {
    createdAt: targets.reduce((earliest, target) => new Date(target.createdAt) < new Date(earliest) ? target.createdAt : earliest, targets[0].createdAt),
    updatedAt: targets.reduce<Date | string | null>((latest, target) => {
      if (!target.updatedAt) return latest;
      return !latest || new Date(target.updatedAt) > new Date(latest) ? target.updatedAt : latest;
    }, null),
    createdBy: targets.reduce<typeof targets[number] | null>((earliest, target) => {
      if (!earliest) return target;
      return new Date(target.createdAt) < new Date(earliest.createdAt) ? target : earliest;
    }, null)?.createdBy ?? null,
    updatedBy: targets.reduce<typeof targets[number] | null>((latest, target) => {
      if (!latest || new Date(target.updatedAt) > new Date(latest.updatedAt)) return target;
      return latest;
    }, null)?.updatedBy ?? null,
    adjustedAt: targets.reduce<Date | string | null>((latest, target) => {
      if (!target.adjustedAt) return latest;
      return !latest || new Date(target.adjustedAt) > new Date(latest) ? target.adjustedAt : latest;
    }, null),
    progressUpdatedAt: targets.reduce<Date | string | null>((latest, target) => {
      if (!target.progressUpdatedAt) return latest;
      return !latest || new Date(target.progressUpdatedAt) > new Date(latest) ? target.progressUpdatedAt : latest;
    }, null),
  };
}

function getQuarterProgress(targetValue: number, currentValue: number) {
  return targetValue > 0 ? (currentValue / targetValue) * 100 : 0;
}

function formatMemberOptionLabel(member: Data["memberOptionsByDepartment"][string][number]) {
  return member.title ? `${member.name} · ${member.title}` : member.name;
}

function formatResponsibleUser(user: { name: string; title: string | null } | null) {
  if (!user) return "未指定";
  return user.title ? `${user.name} · ${user.title}` : user.name;
}

function formatActor(user: { name: string; title: string | null } | null) {
  if (!user) return "-";
  return user.title ? `${user.name} · ${user.title}` : user.name;
}

function buildEmptyPlanDetailView(activeItem: ScopeItem): PlanDetailView {
  return {
    ownerType: activeItem.type === "DEPARTMENT" ? "DEPARTMENT" : "TEAM",
    metrics: [],
    totalWeight: 0,
    permissions: {
      canEditPlan: false,
      canEditMetrics: false,
      canManageSources: false,
      canManageQuarterTargets: false,
      canUpdateQuarterProgress: false,
      canUpdateWeeklyProgress: false,
    },
  };
}

function SearchableMemberField({
  name,
  label,
  options,
  defaultUser,
  placeholder,
  inline,
}: {
  name: string;
  label: string;
  options: Data["memberOptionsByDepartment"][string] | Data["memberOptionsByTeam"][string];
  defaultUser: { id: string; name: string; title: string | null } | null;
  placeholder: string;
  inline?: boolean;
}) {
  const [inputValue, setInputValue] = useState(defaultUser ? formatResponsibleUser(defaultUser) : "");
  const [selectedId, setSelectedId] = useState(defaultUser?.id ?? "");
  const listId = `${name}-${label}`;

  return (
    <div className={inline ? "flex items-start gap-3" : ""}>
      <label className={`text-sm font-medium ${inline ? "shrink-0 w-24 mt-2 whitespace-nowrap" : "block mb-1"}`}>{label}</label>
      <div className="flex-1">
        <input type="hidden" name={name} value={selectedId} />
        <input
          list={listId}
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => {
            const nextValue = e.target.value;
            setInputValue(nextValue);
            const matched = options.find((option) => formatMemberOptionLabel(option) === nextValue);
            setSelectedId(matched?.id ?? "");
          }}
          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
        />
        <datalist id={listId}>
          {options.map((option) => <option key={option.id} value={formatMemberOptionLabel(option)} />)}
        </datalist>
        <p className="mt-1 text-xs text-muted-foreground">可输入姓名或职务进行匹配，不选择则留空。</p>
      </div>
    </div>
  );
}

function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function submitWithClose(action: (formData: FormData) => Promise<void>, onSuccess: () => void, setError?: (message: string | null) => void) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError?.(null);
    const formData = new FormData(event.currentTarget);
    try {
      await action(formData);
      onSuccess();
    } catch (err) {
      setError?.(err instanceof Error ? err.message : "保存失败");
    }
  };
}

function PlanForm({ plan, data, onClose }: { plan?: Plan; data: Data; onClose: () => void }) {
  const action = plan ? updateAnnualGoalPlan : createAnnualGoalPlan;
  const [error, setError] = useState<string | null>(null);
  const defaultDepartmentOrgNodeId = plan?.scopeDepartmentOrgNodeId ?? data.defaultDepartmentOrgNodeId ?? data.scopeDepartments[0]?.orgNodeId ?? "";
  const [departmentOrgNodeId, setDepartmentOrgNodeId] = useState(defaultDepartmentOrgNodeId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await action(new FormData(event.currentTarget));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <input type="hidden" name="ownerType" value={plan ? plan.ownerType : "DEPARTMENT"} />
      {plan?.teamOrgNodeId && <input type="hidden" name="teamOrgNodeId" value={plan.teamOrgNodeId} />}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0 w-20">{renderRequiredLabel("年份 *")}</label>
          <input name="year" type="number" defaultValue={plan?.year ?? data.selectedYear} required className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0 w-20">{renderRequiredLabel("所属部门 *")}</label>
          <select name="departmentOrgNodeId" value={departmentOrgNodeId} onChange={(e) => setDepartmentOrgNodeId(e.target.value)} required className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
            {data.scopeDepartments.map((d) => <option key={d.orgNodeId} value={d.orgNodeId}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-start gap-3">
          <label className="text-sm font-medium shrink-0 w-20 mt-2">说明</label>
          <textarea name="description" defaultValue={plan?.description ?? ""} rows={3} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">{plan ? "保存" : "创建"}</Button>
        </div>
      </div>
    </form>
  );
}

function MetricForm({ plan, metric, data, onClose }: { plan: Plan; metric?: Metric; data: Data; onClose: () => void }) {
  const action = metric ? updateAnnualGoalMetric : createAnnualGoalMetric;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "targetValue" | "currentValue" | "unit" | "weight", string>>>({});
  const isTeamPlan = plan.ownerType === "TEAM";
  const availableParentMetrics = data.availableParentMetrics.filter(
    (m) => m.scopeDepartmentOrgNodeId === plan.scopeDepartmentOrgNodeId && (!plan.metrics.some((pm) => !pm.sourceMetricId && pm.metricCode === m.metricCode) || m.metricCode === metric?.metricCode)
  );
  const editingParentMetricId = metric?.sourceMetricId
    ? (availableParentMetrics.find((parentMetric) => parentMetric.sources.some((source) => source.id === metric.sourceMetricId))?.id ?? "")
    : "";
  const [selectedParentMetricId, setSelectedParentMetricId] = useState(editingParentMetricId || (availableParentMetrics[0]?.id ?? ""));
  const [selectedSourceMetricId, setSelectedSourceMetricId] = useState(metric?.sourceMetricId ?? "");
  const [unitValue, setUnitValue] = useState(metric?.unit ?? "");
  const selectedParentMetric = availableParentMetrics.find((m) => m.id === (metric?.sourceMetricId ? editingParentMetricId : selectedParentMetricId));
  const availableSourceMetrics = (selectedParentMetric?.sources ?? []).filter(
    (m) => !plan.metrics.some((pm) => pm.sourceMetricId === m.id) || m.id === metric?.sourceMetricId
  );
  const teamMemberOptions = plan.teamOrgNodeId ? (data.memberOptionsByTeam[plan.teamOrgNodeId] ?? []) : [];
  const teamMemberOptionIds = new Set(teamMemberOptions.map((option) => option.id));
  const selectedSourceMetric = availableSourceMetrics.find((source) => source.id === selectedSourceMetricId);
  const candidateResponsibleUser = metric?.responsibleUser ?? selectedSourceMetric?.responsibleUser ?? (!selectedSourceMetricId ? selectedParentMetric?.responsibleUser ?? null : null);
  const defaultResponsibleUser = candidateResponsibleUser && teamMemberOptionIds.has(candidateResponsibleUser.id)
    ? candidateResponsibleUser
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const formData = new FormData(event.currentTarget);
      const name = ((formData.get("name") as string | null) ?? "").trim();
      const targetValue = ((formData.get("targetValue") as string | null) ?? "").trim();
      const currentValue = ((formData.get("currentValue") as string | null) ?? "").trim();
      const unit = ((formData.get("unit") as string | null) ?? "").trim();
      const weight = ((formData.get("weight") as string | null) ?? "").trim();
      const nextFieldErrors: Partial<Record<"name" | "targetValue" | "currentValue" | "unit" | "weight", string>> = {};
      if (!isTeamPlan) {
        if (!name) {
          nextFieldErrors.name = "请输入指标名称";
        }
        if (!targetValue) {
          nextFieldErrors.targetValue = "请输入目标值";
        }
        if (!unit) {
          nextFieldErrors.unit = "请输入单位";
        }
      }
      if (!weight) {
        nextFieldErrors.weight = "请输入权重";
      } else {
        const weightNumber = Number(weight);
        if (Number.isNaN(weightNumber)) {
          nextFieldErrors.weight = "权重格式不正确";
        } else if (weightNumber < 0 || weightNumber > 100) {
          nextFieldErrors.weight = "权重请输入 0 到 100 之间的数值";
        }
      }
      const resolvedUnit = isTeamPlan
        ? (selectedSourceMetric?.unit ?? selectedParentMetric?.unit ?? unitValue)
        : unit;
      const targetValidationError = validateUnitValue(formData.get("targetValue"), resolvedUnit, "目标值");
      if (targetValidationError) {
        nextFieldErrors.targetValue = targetValidationError;
      }
      const currentValidationError = validateUnitValue(formData.get("currentValue"), resolvedUnit, "当前值");
      if (currentValidationError) {
        nextFieldErrors.currentValue = currentValidationError;
      }
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      await action(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {metric ? <input type="hidden" name="id" value={metric.id} /> : <input type="hidden" name="planId" value={plan.id} />}
      <div className="space-y-4">
        {isTeamPlan && !metric ? (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0 w-20">{renderRequiredLabel("指标项 *")}</label>
              <select
                name={selectedSourceMetricId ? undefined : "parentMetricId"}
                value={selectedParentMetricId}
                onChange={(e) => { setSelectedParentMetricId(e.target.value); setSelectedSourceMetricId(""); }}
                required={!selectedSourceMetricId}
                className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
              >
                <option value="">请选择</option>
                {availableParentMetrics.map((m) => <option key={m.id} value={m.id}>{m.name} · {formatValue(m.targetValue)}{m.unit}</option>)}
              </select>
            </div>
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium shrink-0 w-20 mt-2">小组指标</label>
              <div className="flex-1">
                <select
                  name={selectedSourceMetricId ? "sourceMetricId" : undefined}
                  value={selectedSourceMetricId}
                  onChange={(e) => setSelectedSourceMetricId(e.target.value)}
                  disabled={!selectedParentMetricId || availableSourceMetrics.length === 0}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground"
                >
                  <option value="">不选择小组指标，直接选择指标项</option>
                  {availableSourceMetrics.map((m) => <option key={m.id} value={m.id}>{m.name} · {formatValue(m.targetValue)}{m.unit}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">选择小组指标后将按小组指标创建；不选择则按上方指标项创建。</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0 w-20">{renderRequiredLabel("指标名称 *")}</label>
              <div className="flex-1">
                <input name="name" defaultValue={metric?.name ?? ""} required={!isTeamPlan} disabled={isTeamPlan} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
                {fieldErrors.name && <div className="mt-1 text-xs text-destructive">{fieldErrors.name}</div>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{renderRequiredLabel("目标值 *")}</label>
                <input name="targetValue" type="number" step={getNumberStep(unitValue)} defaultValue={formatInputValue(metric?.targetValue, "0")} required={!isTeamPlan} disabled={isTeamPlan} onChange={(event) => !isTeamPlan && setUnitValue((event.currentTarget.form?.elements.namedItem("unit") as HTMLInputElement | null)?.value ?? unitValue)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
                {fieldErrors.targetValue && <div className="mt-1 text-xs text-destructive">{fieldErrors.targetValue}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">当前值</label>
                <input name="currentValue" type="number" step={getNumberStep(unitValue)} defaultValue={formatInputValue(metric?.currentValue, "0")} disabled={isTeamPlan || (!!metric && metric.sources.length > 0)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
                {fieldErrors.currentValue && <div className="mt-1 text-xs text-destructive">{fieldErrors.currentValue}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{renderRequiredLabel("单位 *")}</label>
                <input name="unit" defaultValue={metric?.unit ?? ""} required={!isTeamPlan} disabled={isTeamPlan} onChange={(event) => setUnitValue(event.currentTarget.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
                {fieldErrors.unit && <div className="mt-1 text-xs text-destructive">{fieldErrors.unit}</div>}
              </div>
            </div>
          </>
        )}
        {isTeamPlan && (
          <SearchableMemberField
            key={`${metric?.id ?? "new"}:${selectedParentMetricId}:${selectedSourceMetricId}`}
            name="responsibleUserId"
            label="负责人"
            options={teamMemberOptions}
            defaultUser={defaultResponsibleUser}
            placeholder="输入姓名或姓名 · 职务"
            inline
          />
        )}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0 w-20">{renderRequiredLabel("权重 % *")}</label>
          <div className="flex-1">
            <input name="weight" type="number" step="0.1" defaultValue={formatInputValue(metric?.weight, "0")} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
            {fieldErrors.weight && <div className="mt-1 text-xs text-destructive">{fieldErrors.weight}</div>}
          </div>
        </div>
        {!isTeamPlan && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0 w-20">计算方式</label>
              <select name="calculationType" defaultValue={metric?.calculationType ?? "RATIO"} className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                <option value="RATIO">比例完成</option>
                <option value="BOOLEAN">是否完成</option>
                <option value="MANUAL_SCORE">人工评分</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0 w-20">风险状态</label>
              <select name="riskStatus" defaultValue={metric?.riskStatus ?? "NORMAL"} className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                <option value="NORMAL">正常</option>
                <option value="SLIGHT_DELAY">轻微滞后</option>
                <option value="RISK">风险</option>
                <option value="COMPLETED">已完成</option>
              </select>
            </div>
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium shrink-0 w-20 mt-2">说明</label>
              <textarea name="description" defaultValue={metric?.description ?? ""} rows={3} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
            </div>
          </>
        )}
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">{metric ? "保存" : isTeamPlan ? "选择" : "创建"}</Button>
        </div>
      </div>
    </form>
  );
}

function SourceMetricForm({ plan, parentMetric: initialParent, sourceMetric, data, onClose }: { plan: Plan; parentMetric?: Metric; sourceMetric?: SourceMetric; data: Data; onClose: () => void }) {
  const action = sourceMetric ? updateAnnualGoalMetricSource : createAnnualGoalMetricSource;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const availableMetrics = plan.metrics.filter(canAddSourceMetric);
  const [selectedParentId, setSelectedParentId] = useState(initialParent?.id ?? availableMetrics[0]?.id ?? "");
  const isEditing = Boolean(sourceMetric);
  const selectedParentMetric = availableMetrics.find((metric) => metric.id === selectedParentId) ?? null;
  const parentMetric = isEditing
    ? (initialParent ?? null)
    : (selectedParentMetric ?? initialParent ?? null);
  const displayUnit = isEditing
    ? (sourceMetric?.unit ?? parentMetric?.unit ?? "")
    : (parentMetric?.unit ?? "");
  const departmentMemberOptions = parentMetric?.scopeDepartmentOrgNodeId ? (data.memberOptionsByDepartment[parentMetric.scopeDepartmentOrgNodeId] ?? []) : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const formData = new FormData(event.currentTarget);
      const nextFieldErrors: Record<string, string> = {};
      const name = String(formData.get("name") ?? "").trim();
      const rawTargetValue = String(formData.get("targetValue") ?? "").trim();
      const targetValue = rawTargetValue ? Number(rawTargetValue) : NaN;
      const unit = String(formData.get("unit") ?? displayUnit).trim();

      if (!parentMetric) {
        nextFieldErrors.parentMetricId = "请选择年度指标";
      }
      if (!name) {
        nextFieldErrors.name = "请输入小组指标名称";
      }
      if (!rawTargetValue) {
        nextFieldErrors.targetValue = "请输入目标值";
      }
      if (!unit) {
        nextFieldErrors.unit = "请输入单位";
      }

      const targetValidationError = validateUnitValue(formData.get("targetValue"), displayUnit, "目标值");
      if (targetValidationError) {
        nextFieldErrors.targetValue = targetValidationError;
      }
      const currentValidationError = validateUnitValue(formData.get("currentValue"), displayUnit, "当前值");
      if (currentValidationError) {
        nextFieldErrors.currentValue = currentValidationError;
      }
      if (!nextFieldErrors.targetValue && parentMetric && Number.isFinite(targetValue)) {
        const siblingTargetTotal = parentMetric.sources.reduce((sum, source) => {
          if (sourceMetric && source.id === sourceMetric.id) return sum;
          return sum + source.targetValue;
        }, 0);
        if (roundValue(siblingTargetTotal + targetValue) > roundValue(parentMetric.rawTargetValue)) {
          nextFieldErrors.targetValue = "超出父指标目标值，请重新填写";
        }
      }
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      await action(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {sourceMetric ? <input type="hidden" name="id" value={sourceMetric.id} /> : <input type="hidden" name="parentMetricId" value={parentMetric?.id ?? ""} />}
      <input type="hidden" name="unit" value={displayUnit} />
      <div className="space-y-4">
        {!initialParent && !sourceMetric && (
          <div className="flex items-start gap-3">
            <label className="text-sm font-medium shrink-0 w-24 mt-2 whitespace-nowrap">{renderRequiredLabel("年度指标 *")}</label>
            <div className="flex-1">
              <select value={selectedParentId} onChange={(e) => setSelectedParentId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                {availableMetrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.name} · {formatValue(metric.targetValue)}{metric.unit}</option>)}
              </select>
              {fieldErrors.parentMetricId && <div className="mt-1 text-xs text-destructive">{fieldErrors.parentMetricId}</div>}
              {availableMetrics.length === 0 && <p className="mt-2 text-xs text-muted-foreground">暂无可拆解的部门指标</p>}
            </div>
          </div>
        )}
        {parentMetric && (
          <>
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium shrink-0 w-24 mt-2 whitespace-nowrap">{renderRequiredLabel("小组指标名称 *")}</label>
              <div className="flex-1">
                <input name="name" defaultValue={sourceMetric?.name ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                {fieldErrors.name && <div className="mt-1 text-xs text-destructive">{fieldErrors.name}</div>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{renderRequiredLabel("目标值 *")}</label>
                <input key={`source-target-${parentMetric.id}-${sourceMetric?.id ?? "new"}`} name="targetValue" type="number" step={getNumberStep(displayUnit)} defaultValue={formatInputValue(sourceMetric?.targetValue)} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                {fieldErrors.targetValue && <div className="mt-1 text-xs text-destructive">{fieldErrors.targetValue}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">当前值</label>
                <input key={`source-current-${parentMetric.id}-${sourceMetric?.id ?? "new"}`} name="currentValue" type="number" step={getNumberStep(displayUnit)} defaultValue={formatInputValue(sourceMetric?.currentValue, "0")} disabled={!!sourceMetric && sourceMetric.quarterTargets.length > 0} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
                {fieldErrors.currentValue && <div className="mt-1 text-xs text-destructive">{fieldErrors.currentValue}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{renderRequiredLabel("单位 *")}</label>
                <input key={`source-unit-${parentMetric.id}-${sourceMetric?.id ?? "new"}`} value={displayUnit} readOnly disabled className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
                {fieldErrors.unit && <div className="mt-1 text-xs text-destructive">{fieldErrors.unit}</div>}
              </div>
            </div>
            <SearchableMemberField
              key={sourceMetric?.id ?? parentMetric.id}
              name="responsibleUserId"
              label="负责人"
              options={departmentMemberOptions}
              defaultUser={sourceMetric?.responsibleUser ?? null}
              placeholder="输入姓名或姓名 · 职务"
              inline
            />
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0 w-20">计算方式</label>
              <select name="calculationType" defaultValue={sourceMetric?.calculationType ?? "RATIO"} className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                <option value="RATIO">比例完成</option>
                <option value="BOOLEAN">是否完成</option>
                <option value="MANUAL_SCORE">人工评分</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0 w-20">风险状态</label>
              <select name="riskStatus" defaultValue={sourceMetric?.riskStatus ?? "NORMAL"} className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                <option value="NORMAL">正常</option>
                <option value="SLIGHT_DELAY">轻微滞后</option>
                <option value="RISK">风险</option>
                <option value="COMPLETED">已完成</option>
              </select>
            </div>
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium shrink-0 w-20 mt-2">说明</label>
              <textarea name="description" defaultValue={sourceMetric?.description ?? ""} rows={3} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
            </div>
          </>
        )}
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={!parentMetric}>{sourceMetric ? "保存" : "创建"}</Button>
        </div>
      </div>
    </form>
  );
}

function getQuarterTargetTotal(subject: Metric | SourceMetric) {
  const ownTotal = subject.quarterTargets.reduce((sum, target) => sum + target.targetValue, 0);
  const sourceTotal = "sources" in subject
    ? subject.sources.reduce((sum, source) => sum + source.quarterTargets.reduce((sourceSum, target) => sourceSum + target.targetValue, 0), 0)
    : 0;
  return roundValue(ownTotal + sourceTotal);
}

function canAddQuarterTarget(subject: Metric | SourceMetric) {
  return getQuarterTargetTotal(subject) < roundValue(subject.targetValue);
}

function QuarterTargetForm({ metric, sourceMetric, onClose }: { metric: Metric; sourceMetric?: SourceMetric; onClose: () => void }) {
  const targets = sourceMetric?.quarterTargets ?? metric.quarterTargets;
  const targetByQuarter = new Map(targets.map((target) => [target.quarter, target]));
  const subject = sourceMetric ?? metric;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const step = getNumberStep(subject.unit);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const formData = new FormData(event.currentTarget);
      const nextFieldErrors: Record<string, string> = {};
      for (const quarter of [1, 2, 3, 4]) {
        const targetKey = `q${quarter}Target`;
        const currentKey = `q${quarter}Current`;
        const rawTargetValue = String(formData.get(targetKey) ?? "").trim();
        const rawCurrentValue = String(formData.get(currentKey) ?? "").trim();

        if (rawTargetValue) {
          const targetNumber = Number(rawTargetValue);
          if (Number.isNaN(targetNumber)) {
            nextFieldErrors[targetKey] = "目标值格式不正确";
          } else if (targetNumber < 0) {
            nextFieldErrors[targetKey] = "目标值不能小于 0";
          } else {
            const targetError = validateUnitValue(formData.get(targetKey), subject.unit, "目标值");
            if (targetError) {
              nextFieldErrors[targetKey] = targetError;
            }
          }
        }

        if (rawCurrentValue) {
          const currentNumber = Number(rawCurrentValue);
          if (Number.isNaN(currentNumber)) {
            nextFieldErrors[currentKey] = "当前值格式不正确";
          } else if (currentNumber < 0) {
            nextFieldErrors[currentKey] = "当前值不能小于 0";
          } else {
            const currentError = validateUnitValue(formData.get(currentKey), subject.unit, "当前值");
            if (currentError) {
              nextFieldErrors[currentKey] = currentError;
            }
          }
        }
      }
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      await saveAnnualGoalQuarterTargets(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="metricId" value={metric.id} />
      {sourceMetric && <input type="hidden" name="sourceMetricId" value={sourceMetric.id} />}
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          拆解对象：<span className="font-medium text-foreground">{subject.name}</span> · 年度目标 {formatValue(subject.targetValue)}{subject.unit}
        </div>
        <div className="grid grid-cols-12 gap-3 text-xs text-muted-foreground px-1">
          <div className="col-span-2">季度</div>
          <div className="col-span-5">目标值</div>
          <div className="col-span-5">当前值</div>
        </div>
        {[1, 2, 3, 4].map((quarter) => {
          const target = targetByQuarter.get(quarter);
          const targetKey = `q${quarter}Target`;
          const currentKey = `q${quarter}Current`;
          return (
            <div key={quarter} className="grid grid-cols-12 gap-3 items-start">
              <div className="col-span-2 h-10 flex items-center text-sm font-medium">Q{quarter}</div>
              <div className="col-span-5">
                <input name={targetKey} type="number" step={step} defaultValue={formatInputValue(target?.targetValue)} placeholder="不填写则不拆解" className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                {fieldErrors[targetKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[targetKey]}</div>}
              </div>
              <div className="col-span-5">
                <input name={currentKey} type="number" step={step} defaultValue={formatInputValue(target?.currentValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                {fieldErrors[currentKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[currentKey]}</div>}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">只填写需要拆解的季度；清空目标值后保存，可取消该季度拆解。</p>
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">保存</Button>
        </div>
      </div>
    </form>
  );
}

function QuarterTargetSetupForm({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const options = [
    ...plan.metrics.flatMap((metric) => {
      const items: { key: string; label: string; metric: Metric; sourceMetric?: SourceMetric }[] = [];
      if (metric.sources.length === 0 && canAddQuarterTarget(metric)) {
        items.push({ key: `metric:${metric.id}`, label: `指标项：${metric.name}`, metric });
      }
      metric.sources
        .filter((sourceMetric) => canAddQuarterTarget(sourceMetric))
        .forEach((sourceMetric) => {
          items.push({
            key: `source:${sourceMetric.id}`,
            label: `小组指标：${metric.name} / ${sourceMetric.name}`,
            metric,
            sourceMetric,
          });
        });
      return items;
    }),
  ];
  const [selectedKey, setSelectedKey] = useState(options[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const selected = options.find((option) => option.key === selectedKey) ?? options[0] ?? null;
  const subject = selected?.sourceMetric ?? selected?.metric ?? null;
  const step = getNumberStep(subject?.unit ?? "");
  const targets = subject?.quarterTargets ?? [];
  const targetByQuarter = new Map(targets.map((target) => [target.quarter, target]));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const formData = new FormData(event.currentTarget);
      const nextFieldErrors: Record<string, string> = {};
      if (subject) {
        for (const quarter of [1, 2, 3, 4]) {
          const targetKey = `q${quarter}Target`;
          const currentKey = `q${quarter}Current`;
          const rawTargetValue = String(formData.get(targetKey) ?? "").trim();
          const rawCurrentValue = String(formData.get(currentKey) ?? "").trim();

          if (rawTargetValue) {
            const targetNumber = Number(rawTargetValue);
            if (Number.isNaN(targetNumber)) {
              nextFieldErrors[targetKey] = "目标值格式不正确";
            } else if (targetNumber < 0) {
              nextFieldErrors[targetKey] = "目标值不能小于 0";
            } else {
              const targetError = validateUnitValue(formData.get(targetKey), subject.unit, "目标值");
              if (targetError) {
                nextFieldErrors[targetKey] = targetError;
              }
            }
          }

          if (rawCurrentValue) {
            const currentNumber = Number(rawCurrentValue);
            if (Number.isNaN(currentNumber)) {
              nextFieldErrors[currentKey] = "当前值格式不正确";
            } else if (currentNumber < 0) {
              nextFieldErrors[currentKey] = "当前值不能小于 0";
            } else {
              const currentError = validateUnitValue(formData.get(currentKey), subject.unit, "当前值");
              if (currentError) {
                nextFieldErrors[currentKey] = currentError;
              }
            }
          }
        }
      }
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      await saveAnnualGoalQuarterTargets(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  if (options.length === 0) {
    return <div className="py-6 text-sm text-muted-foreground">当前没有可继续拆解的指标对象</div>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium">{renderRequiredLabel("拆解对象 *")}</label>
          <select
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:border-ring"
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        {selected && subject ? (
          <>
            <input type="hidden" name="metricId" value={selected.metric.id} />
            {selected.sourceMetric && <input type="hidden" name="sourceMetricId" value={selected.sourceMetric.id} />}
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
              拆解对象：<span className="font-medium text-foreground">{subject.name}</span> · 年度目标 {formatValue(subject.targetValue)}{subject.unit}
            </div>
            <div className="grid grid-cols-12 gap-3 px-1 text-xs text-muted-foreground">
              <div className="col-span-2">季度</div>
              <div className="col-span-5">目标值</div>
              <div className="col-span-5">当前值</div>
            </div>
            {[1, 2, 3, 4].map((quarter) => {
              const target = targetByQuarter.get(quarter);
              const targetKey = `q${quarter}Target`;
              const currentKey = `q${quarter}Current`;
              return (
                <div key={quarter} className="grid grid-cols-12 items-start gap-3">
                  <div className="col-span-2 h-10 flex items-center text-sm font-medium">Q{quarter}</div>
                  <div className="col-span-5">
                    <input name={targetKey} type="number" step={step} defaultValue={formatInputValue(target?.targetValue)} placeholder="不填写则不拆解" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:border-ring" />
                    {fieldErrors[targetKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[targetKey]}</div>}
                  </div>
                  <div className="col-span-5">
                    <input name={currentKey} type="number" step={step} defaultValue={formatInputValue(target?.currentValue, "0")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:border-ring" />
                    {fieldErrors[currentKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[currentKey]}</div>}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">只填写需要拆解的季度；清空目标值后保存，可取消该季度拆解。</p>
          </>
        ) : null}
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">保存</Button>
        </div>
      </div>
    </form>
  );
}

function QuarterProgressUpdateForm({ metric, sourceMetric, onClose }: { metric: Metric; sourceMetric?: SourceMetric; onClose: () => void }) {
  const targets = sourceMetric?.quarterTargets ?? metric.quarterTargets;
  const targetByQuarter = new Map(targets.map((target) => [target.quarter, target]));
  const subject = sourceMetric ?? metric;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const step = getNumberStep(subject.unit);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const formData = new FormData(event.currentTarget);
      const nextFieldErrors: Record<string, string> = {};
      for (const quarter of [1, 2, 3, 4]) {
        const target = targetByQuarter.get(quarter);
        if (!target) continue;
        const targetKey = `q${quarter}Target`;
        const currentKey = `q${quarter}Current`;
        const rawTargetValue = String(formData.get(targetKey) ?? "").trim();
        const rawCurrentValue = String(formData.get(currentKey) ?? "").trim();

        if (rawTargetValue) {
          const targetNumber = Number(rawTargetValue);
          if (Number.isNaN(targetNumber)) {
            nextFieldErrors[targetKey] = "目标值格式不正确";
          } else if (targetNumber < 0) {
            nextFieldErrors[targetKey] = "目标值不能小于 0";
          } else {
            const targetError = validateUnitValue(formData.get(targetKey), subject.unit, "目标值");
            if (targetError) {
              nextFieldErrors[targetKey] = targetError;
            }
          }
        }

        if (rawCurrentValue) {
          const currentNumber = Number(rawCurrentValue);
          if (Number.isNaN(currentNumber)) {
            nextFieldErrors[currentKey] = "当前值格式不正确";
          } else if (currentNumber < 0) {
            nextFieldErrors[currentKey] = "当前值不能小于 0";
          } else {
            const currentError = validateUnitValue(formData.get(currentKey), subject.unit, "当前值");
            if (currentError) {
              nextFieldErrors[currentKey] = currentError;
            }
          }
        }
      }
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      await updateAnnualGoalQuarterProgress(formData);
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        const message = err.message.includes("An error occurred in the Server Components render")
          ? "保存失败，请刷新页面后重试；如果问题持续存在，请联系管理员。"
          : err.message;
        setError(message);
      } else {
        setError("保存失败");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="metricId" value={metric.id} />
      {sourceMetric && <input type="hidden" name="sourceMetricId" value={sourceMetric.id} />}
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          更新对象：<span className="font-medium text-foreground">{subject.name}</span> · 可更新季度目标值与当前值
        </div>
        <div className="grid grid-cols-12 gap-3 text-xs text-muted-foreground px-1">
          <div className="col-span-2">季度</div>
          <div className="col-span-5">目标值</div>
          <div className="col-span-5">当前值</div>
        </div>
        {[1, 2, 3, 4].map((quarter) => {
          const target = targetByQuarter.get(quarter);
          const targetKey = `q${quarter}Target`;
          const currentKey = `q${quarter}Current`;
          return (
            <div key={quarter} className="grid grid-cols-12 gap-3 items-start">
              <div className="col-span-2 h-10 flex items-center text-sm font-medium">Q{quarter}</div>
              <div className="col-span-5">
                {target ? (
                  <>
                    <input type="hidden" name={`q${quarter}Id`} value={target.id} />
                    <input name={targetKey} type="number" step={step} defaultValue={formatInputValue(target.targetValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                    {fieldErrors[targetKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[targetKey]}</div>}
                  </>
                ) : (
                  <div className="h-10 flex items-center text-sm text-muted-foreground">未拆解</div>
                )}
              </div>
              <div className="col-span-5">
                {target ? (
                  <>
                    <input name={currentKey} type="number" step={step} defaultValue={formatInputValue(target.currentValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                    {fieldErrors[currentKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[currentKey]}</div>}
                  </>
                ) : (
                  <div className="h-10 flex items-center text-sm text-muted-foreground">未拆解</div>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">保存后会同步重算上级小组指标和指标项当前值。</p>
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">保存</Button>
        </div>
      </div>
    </form>
  );
}

function QuarterWeeklyUpdateForm({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const rows = plan.metrics.flatMap((metric) => [
    { metric, subject: metric, sourceMetric: undefined as SourceMetric | undefined, depth: 0 },
    ...metric.sources
      .map((source) => ({ metric, subject: source, sourceMetric: source, depth: 1 })),
  ]).flatMap((row) => row.subject.quarterTargets.filter((target) => plan.year === currentYear && target.quarter === currentQuarter).map((target) => ({ ...row, target })));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const formData = new FormData(event.currentTarget);
      const nextFieldErrors: Record<string, string> = {};
      rows.forEach((row, index) => {
        const weeklyKey = `weeklyIncrement_${index}`;
        const rawWeeklyValue = String(formData.get(weeklyKey) ?? "").trim();

        if (rawWeeklyValue) {
          const weeklyNumber = Number(rawWeeklyValue);
          if (Number.isNaN(weeklyNumber)) {
            nextFieldErrors[weeklyKey] = "本周新增格式不正确";
          } else if (weeklyNumber < 0) {
            nextFieldErrors[weeklyKey] = "本周新增不能小于 0";
          } else {
            const weeklyError = validateUnitValue(formData.get(weeklyKey), row.subject.unit, "本周新增");
            if (weeklyError) {
              nextFieldErrors[weeklyKey] = weeklyError;
            }
          }
        }
      });
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      await updateAnnualGoalWeeklyProgress(new FormData(event.currentTarget));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="rowCount" value={rows.length} />
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          更新范围：<span className="font-medium text-foreground">{plan.ownerName}</span> · 仅更新当前季度 Q{currentQuarter}
        </div>
        <div className="grid grid-cols-[1.8fr_0.6fr_0.9fr_1fr] gap-3 text-xs text-muted-foreground px-1">
          <div>指标</div>
          <div>季度</div>
          <div>目标值</div>
          <div>本周新增</div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {rows.map((row, index) => {
            const weeklyKey = `weeklyIncrement_${index}`;
            const step = getNumberStep(row.subject.unit);
            return (
              <div key={row.target.id} className="grid grid-cols-[1.8fr_0.6fr_0.9fr_1fr] gap-3 items-start">
                <input type="hidden" name={`targetId_${index}`} value={row.target.id} />
                <input type="hidden" name={`metricId_${index}`} value={row.target.metricId} />
                {row.target.sourceMetricId && <input type="hidden" name={`sourceMetricId_${index}`} value={row.target.sourceMetricId} />}
                <div className={row.depth ? "pl-4" : ""}>
                  <div className="text-sm font-medium truncate">{row.subject.name}</div>
                  <div className="text-xs text-muted-foreground">{row.depth ? "小组指标" : "指标项"}</div>
                </div>
                <div className="h-10 flex items-center text-sm font-medium">Q{row.target.quarter}</div>
                <div className="h-10 flex items-center text-sm text-muted-foreground">{formatValue(row.target.targetValue)}{row.subject.unit}</div>
                <div>
                  <input name={weeklyKey} type="number" step={step} defaultValue={formatInputValue(row.target.weeklyIncrement, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                  {fieldErrors[weeklyKey] && <div className="mt-1 text-xs text-destructive">{fieldErrors[weeklyKey]}</div>}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">当前方案暂无 Q{currentQuarter} 可更新的季度指标</div>}
        </div>
        <p className="text-xs text-muted-foreground">保存后会同步重算上级小组指标和指标项当前值，并更新“更新时间”。</p>
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">保存</Button>
        </div>
      </div>
    </form>
  );
}


const footerPrimaryButtonClass = "px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90";
const footerSecondaryButtonClass = "px-3 py-1.5 rounded-md hover:bg-muted text-muted-foreground";

function QuarterTargetChooser({ plan, onSelect, onClose }: { plan: Plan; onSelect: (metric: Metric, sourceMetric?: SourceMetric) => void; onClose: () => void }) {
  const options: { key: string; label: string; metric: Metric; sourceMetric?: SourceMetric }[] = plan.metrics.flatMap((metric) => [
    ...(metric.sources.length === 0 && canAddQuarterTarget(metric) ? [{ key: `metric:${metric.id}`, label: `指标项：${metric.name}`, metric }] : []),
    ...metric.sources
      .filter((sourceMetric) => canAddQuarterTarget(sourceMetric))
      .map((sourceMetric) => ({ key: `source:${metric.id}:${sourceMetric.id}`, label: `小组指标：${metric.name} / ${sourceMetric.name}`, metric, sourceMetric })),
  ]);
  const [selectedKey, setSelectedKey] = useState(options[0]?.key ?? "");
  const selected = options.find((option) => option.key === selectedKey);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">{renderRequiredLabel("拆解对象 *")}</label>
        <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </div>
      {options.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无可拆解的指标项或小组指标</div>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="button" onClick={() => selected && onSelect(selected.metric, selected.sourceMetric)}>继续</Button>
      </div>
    </div>
  );
}

function DeleteMetricConfirm({ metric, onClose }: { metric: Metric; onClose: () => void }) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await deleteAnnualGoalMetric(new FormData(event.currentTarget));
    onClose();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除指标「{metric.name}」？删除后不会计入方案权重和完成度。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form onSubmit={handleSubmit} noValidate>
          <input type="hidden" name="id" value={metric.id} />
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function DeleteSourceMetricConfirm({ sourceMetric, onClose }: { sourceMetric: SourceMetric; onClose: () => void }) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await deleteAnnualGoalMetricSource(new FormData(event.currentTarget));
    onClose();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除小组指标「{sourceMetric.name}」？已分配到小组的同源指标也会同步删除。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form onSubmit={handleSubmit} noValidate>
          <input type="hidden" name="id" value={sourceMetric.id} />
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function DeleteQuarterTargetsConfirm({ metric, sourceMetric, onClose }: { metric: Metric; sourceMetric?: SourceMetric; onClose: () => void }) {
  const subject = sourceMetric ?? metric;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await deleteAnnualGoalQuarterTargets(new FormData(event.currentTarget));
    onClose();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除「{subject.name}」的季度指标？删除后该行不再展示在季度指标列表中。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form onSubmit={handleSubmit} noValidate>
          <input type="hidden" name="metricId" value={metric.id} />
          {sourceMetric && <input type="hidden" name="sourceMetricId" value={sourceMetric.id} />}
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function DeletePlanConfirm({ plan, years, onClose }: { plan: Plan; years: number[]; onClose: () => void }) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await deleteAnnualGoalPlan(new FormData(event.currentTarget));
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">年份</label>
        <label className="flex h-10 w-full items-center rounded-lg border border-border bg-background px-3 text-sm text-foreground">
          <select name="year" defaultValue={String(plan.year)} form="delete-plan-form" className="h-full w-full bg-transparent outline-none">
            {years.map((year) => (
              <option key={year} value={year}>{getYearLabel(year)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-muted-foreground">确认删除方案「{plan.name}」？删除后会同步删除该方案下的指标、小组指标和季度指标。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form id="delete-plan-form" onSubmit={handleSubmit} noValidate>
          <input type="hidden" name="id" value={plan.id} />
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function PlanDetailTabs({ plan, tab, setTab, onCreateMetric, onEditMetric, onSourceMetric, onCreateSourceMetric, onDeleteMetric, onDeleteSourceMetric, onQuarterTarget, onDeleteQuarterTargets, onQuarterProgress, onWeeklyProgress, onChooseQuarterTarget }: { plan: PlanDetailView; tab: PlanTab; setTab: (tab: PlanTab) => void; onCreateMetric: () => void; onEditMetric: (metric: Metric) => void; onSourceMetric: (parentMetric: Metric, sourceMetric?: SourceMetric) => void; onCreateSourceMetric: () => void; onDeleteMetric: (metric: Metric) => void; onDeleteSourceMetric: (parentMetric: Metric, sourceMetric: SourceMetric) => void; onQuarterTarget: (metric: Metric, sourceMetric?: SourceMetric) => void; onDeleteQuarterTargets: (metric: Metric, sourceMetric?: SourceMetric) => void; onQuarterProgress: (metric: Metric, sourceMetric?: SourceMetric) => void; onWeeklyProgress: () => void; onChooseQuarterTarget: () => void }) {
  const tabs: { key: PlanTab; label: string }[] = plan.ownerType === "DEPARTMENT"
    ? [
        { key: "metrics", label: "部门指标" },
        { key: "sources", label: "小组指标" },
        { key: "quarters", label: "季度指标" },
      ]
    : [
        { key: "metrics", label: "小组指标" },
        { key: "quarters", label: "季度指标" },
      ];
  const sourceRows = plan.metrics.flatMap((metric) =>
    metric.sources
      .map((source) => ({ metric, source }))
  );
  const quarterRows = plan.metrics.flatMap((metric) => [
    { key: metric.id, metric, subject: metric, tone: "default" as const, depth: 0 },
    ...metric.sources.map((source) => ({ key: source.id, metric, subject: source, tone: "info" as const, depth: 1 })),
  ]).filter((row) => row.subject.quarterTargets.length > 0);
  const quarterFooterActions = [
    ...(plan.permissions.canManageQuarterTargets
      ? [{ key: "quarter-targets", label: "拆解季度指标", onClick: onChooseQuarterTarget, primary: true }]
      : []),
    ...(plan.permissions.canUpdateWeeklyProgress
      ? [{ key: "weekly-progress", label: "周更新", onClick: onWeeklyProgress, primary: false }]
      : []),
  ].map((action, _, actions) => ({
    ...action,
    primary: actions.length === 1 ? true : action.primary,
  }));

  return (
    <div className="px-5 pb-5">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {tab === "metrics" && (
          <>
          <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.7fr_0.7fr_1.1fr_1.6fr_0.25fr_1fr_1fr_1fr_1fr] gap-3 text-xs text-muted-foreground">
            <div>指标项</div>
            <div className="text-right">权重</div>
            <div>目标 / 当前</div>
            <div>完成度</div>
            <div />
            <div>创建人</div>
            <div>创建时间</div>
            <div>最后更新人</div>
            <div>最后更新时间</div>
          </div>
          <div className="divide-y divide-border">
            {plan.metrics.map((metric) => (
              <div key={metric.id} className="px-5 py-4 grid grid-cols-[1.7fr_0.7fr_1.1fr_1.6fr_0.25fr_1fr_1fr_1fr_1fr] gap-3 items-center hover:bg-muted/20 transition">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{metric.name}</div>
                    {metric.riskStatus === "RISK" && <Badge tone="warning">风险</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">单位 {metric.unit} · 负责人 {formatResponsibleUser(metric.responsibleUser)}</div>
                  {plan.permissions.canEditMetrics && (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <button onClick={() => onEditMetric(metric)} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Edit className="w-3 h-3" />更新
                      </button>
                      <button onClick={() => onDeleteMetric(metric)} className="inline-flex items-center gap-1 text-destructive hover:underline">
                        <Trash2 className="w-3 h-3" />删除
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center justify-center min-w-[42px] px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold tabular-nums">{formatPercent(metric.weight)}%</span>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{formatValue(metric.targetValue)}{metric.unit}</div>
                  <div className="text-xs text-muted-foreground">当前 {formatValue(metric.currentValue)}{metric.unit}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Progress value={metric.progress} tone={metric.tone} />
                    <span className="text-xs font-semibold tabular-nums w-9 text-right">{formatPercent(metric.progress)}%</span>
                  </div>
                </div>
                <div />
                <div className="text-xs text-muted-foreground">{formatActor(metric.createdBy)}</div>
                <div className="text-xs text-muted-foreground">{formatDateTime(metric.createdAt)}</div>
                <div className="text-xs text-muted-foreground">{formatActor(metric.updatedBy)}</div>
                <div className="text-xs text-muted-foreground">{formatDateTime(metric.updatedAt)}</div>
              </div>
            ))}
            {plan.metrics.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">暂无指标项</div>}
          </div>
        </>
      )}
      {tab === "sources" && (
        <div className="overflow-x-auto">
          {plan.ownerType === "DEPARTMENT" ? (
            <div className="min-w-[1400px]">
              <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.2fr_1.2fr_1.1fr_1.4fr_0.25fr_1fr_1fr_1fr_1fr] gap-3 text-xs text-muted-foreground">
                <div>小组指标</div>
                <div>所属指标项</div>
                <div>目标 | 当前</div>
                <div>完成度</div>
                <div />
                <div>创建人</div>
                <div>创建时间</div>
                <div>最后更新人</div>
                <div>最后更新时间</div>
              </div>
              <div className="divide-y divide-border">
                {sourceRows.map(({ metric, source }) => (
                  <div key={source.id} className="px-5 py-4 grid grid-cols-[1.2fr_1.2fr_1.1fr_1.4fr_0.25fr_1fr_1fr_1fr_1fr] gap-3 items-center hover:bg-muted/20 transition text-sm">
                    <div>
                      <div className="font-medium">{source.name}</div>
                      {source.description && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{source.description}</div>}
                      <div className="mt-1 text-xs text-muted-foreground">负责人：{formatResponsibleUser(source.responsibleUser)}</div>
                      {plan.permissions.canManageSources && (
                        <div className="mt-1 flex items-center gap-3 text-xs">
                          <button onClick={() => onSourceMetric(metric, source)} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Edit className="w-3 h-3" />更新
                          </button>
                          <button onClick={() => onDeleteSourceMetric(metric, source)} className="inline-flex items-center gap-1 text-destructive hover:underline">
                            <Trash2 className="w-3 h-3" />删除
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-sm">{metric.name}</div>
                    <div className="text-sm text-muted-foreground">
                      <span className="text-foreground font-medium">{formatValue(source.targetValue)}{source.unit}</span>
                      <span className="mx-1">|</span>
                      <span>{formatValue(source.currentValue)}{source.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={source.progress} tone={source.tone} />
                      <span className="text-xs font-semibold tabular-nums w-9 text-right">{formatPercent(source.progress)}%</span>
                    </div>
                    <div />
                    <div className="text-xs text-muted-foreground">{formatActor(source.createdBy)}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(source.createdAt)}</div>
                    <div className="text-xs text-muted-foreground">{formatActor(source.updatedBy)}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(source.updatedAt)}</div>
                  </div>
                ))}
                {sourceRows.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">暂无小组指标</div>}
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">小组方案不维护小组指标，可在小组指标中选择部门指标或小组指标。</div>
          )}
        </div>
      )}
      {tab === "quarters" && (
        <div className="overflow-x-auto">
          <div className="min-w-[1540px]">
            <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.2fr_0.75fr_1fr_1fr_1fr_1fr] gap-4 text-xs text-muted-foreground">
              <div>指标</div>
              <div>Q1目标 | Q1当前 | 完成度</div>
              <div>Q2目标 | Q2当前 | 完成度</div>
              <div>Q3目标 | Q3当前 | 完成度</div>
              <div>Q4目标 | Q4当前 | 完成度</div>
              <div>本周新增</div>
              <div>创建人</div>
              <div>创建时间</div>
              <div>最后更新人</div>
              <div>最后更新时间</div>
            </div>
            <div className="divide-y divide-border">
              {quarterRows.map((row) => {
                const targetByQuarter = new Map(row.subject.quarterTargets.map((target) => [target.quarter, target]));
                const time = getQuarterTargetsTime(row.subject.quarterTargets);
                return (
                  <div key={row.key} className="px-5 py-4 grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.2fr_0.75fr_1fr_1fr_1fr_1fr] gap-4 items-center hover:bg-muted/20 transition text-sm">
                    <div className={row.depth ? "pl-5" : ""}>
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{row.subject.name}</div>
                        <Badge tone={row.tone}>{row.depth ? "小组指标" : "指标项"}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">年度目标 {formatValue(row.subject.targetValue)}{row.subject.unit} · 当前 {formatValue(row.subject.currentValue)}{row.subject.unit}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        {plan.permissions.canUpdateQuarterProgress && <button type="button" onClick={() => onQuarterProgress(row.metric, row.depth ? row.subject as SourceMetric : undefined)} className="text-primary hover:underline">更新</button>}
                        {plan.permissions.canManageQuarterTargets && plan.ownerType === "DEPARTMENT" && (
                          <button onClick={() => onDeleteQuarterTargets(row.metric, row.depth ? row.subject as SourceMetric : undefined)} className="inline-flex items-center gap-1 text-destructive hover:underline">
                            <Trash2 className="w-3 h-3" />删除
                          </button>
                        )}
                      </div>
                    </div>
                    {[1, 2, 3, 4].map((quarter) => {
                      const target = targetByQuarter.get(quarter);
                      return (
                        <div key={quarter} className="text-xs">
                          {target ? (
                            <div className="text-muted-foreground">
                              <div>
                                <span className="text-foreground font-medium">{formatValue(target.targetValue)}{row.subject.unit}</span>
                                <span className="mx-1">|</span>
                                <span>{formatValue(target.currentValue)}{row.subject.unit}</span>
                              </div>
                              <div className="mt-0.5 text-primary font-medium">{formatPercent(getQuarterProgress(target.targetValue, target.currentValue))}%</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      );
                    })}
                    <div className="text-xs text-muted-foreground font-medium">{formatValue(row.subject.quarterTargets.reduce((sum, target) => sum + target.weeklyIncrement, 0))}{row.subject.unit}</div>
                    <div className="text-xs text-muted-foreground">{formatActor(time?.createdBy ?? null)}</div>
                    <div className="text-xs text-muted-foreground">{time ? formatDateTime(time.createdAt) : "-"}</div>
                    <div className="text-xs text-muted-foreground">{formatActor(time?.updatedBy ?? null)}</div>
                    <div className="text-xs text-muted-foreground">{time?.updatedAt ? formatDateTime(time.updatedAt) : "-"}</div>
                  </div>
                );
              })}
              {quarterRows.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">暂无季度指标</div>}
            </div>
          </div>
        </div>
      )}

      <div className="px-5 py-3 border-t border-border bg-card flex items-center justify-between text-xs">
        {tab === "metrics" ? (
          <span className="text-muted-foreground">权重合计 {formatPercent(plan.totalWeight)}% · 共 {plan.metrics.length} 项</span>
        ) : tab === "sources" ? (
          <span className="text-muted-foreground">共 {sourceRows.length} 项</span>
        ) : (
          <span className="text-muted-foreground">共 {quarterRows.length} 项</span>
        )}
      </div>
      </div>
    </div>
  );
}

export function AnnualGoalsContent({ data }: Props) {
  const router = useRouter();
  const [planDialog, setPlanDialog] = useState<Plan | "new" | null>(null);
  const [metricDialog, setMetricDialog] = useState<{ plan: Plan; metric?: Metric } | null>(null);
  const [sourceMetricDialog, setSourceMetricDialog] = useState<{ plan: Plan; parentMetric?: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [quarterTargetSetupPlan, setQuarterTargetSetupPlan] = useState<Plan | null>(null);
  const [quarterTargetDialog, setQuarterTargetDialog] = useState<{ metric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [quarterProgressDialog, setQuarterProgressDialog] = useState<{ metric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [weeklyProgressPlan, setWeeklyProgressPlan] = useState<Plan | null>(null);
  const [deleteMetric, setDeleteMetric] = useState<Metric | null>(null);
  const [deleteSourceMetric, setDeleteSourceMetric] = useState<{ metric: Metric; sourceMetric: SourceMetric } | null>(null);
  const [deleteQuarterTargets, setDeleteQuarterTargets] = useState<{ metric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [deletePlan, setDeletePlan] = useState<Plan | null>(null);
  const firstDepartmentWithPlan = data.scopeDepartments.find((department) =>
    data.scopeItems.some((item) => item.type === "DEPARTMENT" && item.scopeDepartmentOrgNodeId === department.orgNodeId && item.plan)
  );
  const singleDepartmentOrgNodeId = !data.showDepartmentNavigation && data.scopeDepartments.length === 1
    ? data.scopeDepartments[0]?.orgNodeId ?? ""
    : "";
  const [selectedDepartmentOrgNodeId, setSelectedDepartmentOrgNodeId] = useState(
    singleDepartmentOrgNodeId || firstDepartmentWithPlan?.orgNodeId || data.defaultDepartmentOrgNodeId || data.scopeDepartments[0]?.orgNodeId || ""
  );
  const filteredScopeItems = data.scopeItems.filter((item) => item.scopeDepartmentOrgNodeId === selectedDepartmentOrgNodeId);
  const activeDepartmentPlan = filteredScopeItems.find((item) => item.type === "DEPARTMENT")?.plan ?? null;
  const firstItemWithPlan = filteredScopeItems.find((item) => item.plan);
  const [activeItemKey, setActiveItemKey] = useState(firstItemWithPlan ? getScopeItemKey(firstItemWithPlan) : filteredScopeItems[0] ? getScopeItemKey(filteredScopeItems[0]) : "");
  const activeItem = filteredScopeItems.find((item) => getScopeItemKey(item) === activeItemKey)
    ?? firstItemWithPlan
    ?? filteredScopeItems[0]
    ?? null;
  const activePlan = activeItem?.plan ?? null;
  const activePlanDetailView = activePlan ?? (activeItem ? buildEmptyPlanDetailView(activeItem) : null);
  const activePlanTabs: { key: PlanTab; label: string }[] = activePlanDetailView?.ownerType === "DEPARTMENT"
    ? [
        { key: "metrics", label: "部门指标" },
        { key: "sources", label: "小组指标" },
        { key: "quarters", label: "季度指标" },
      ]
    : [
        { key: "metrics", label: "小组指标" },
        { key: "quarters", label: "季度指标" },
      ];
  const [tab, setTab] = useState<PlanTab>("metrics");
  const planHeaderActions = (
    <>
      {tab === "metrics" && activePlanDetailView?.ownerType === "DEPARTMENT" ? (
        <>
          {data.permissions.canCreatePlan && <Button variant="outline" onClick={() => setPlanDialog("new")}><Plus className="w-4 h-4" />新建部门方案</Button>}
          {data.permissions.canEditDepartmentPlans && activeDepartmentPlan ? (
            <>
              <Button variant="outline" onClick={() => setPlanDialog(activeDepartmentPlan)}>
                <Edit className="w-4 h-4" />编辑方案
              </Button>
              <Button variant="outline" onClick={() => setDeletePlan(activeDepartmentPlan)} className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />删除方案
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
        <select
          value={String(data.selectedYear)}
          onChange={(event) => handleSelectedYearChange(Number.parseInt(event.target.value, 10))}
          className="h-full bg-transparent outline-none"
        >
          {data.availableYears.map((year) => (
            <option key={year} value={year}>{getYearLabel(year)}</option>
          ))}
        </select>
      </label>
    </>
  );
  const topTabActions = (
    <div className="flex flex-wrap items-center gap-2">
      {activePlan ? (
        <>
          {tab === "metrics" && activePlan.permissions.canEditMetrics && (
            <Button onClick={() => setMetricDialog({ plan: activePlan })}><Plus className="w-4 h-4" />{activePlan.ownerType === "TEAM" ? "选择指标" : "新增年度指标"}</Button>
          )}
          {tab === "sources" && activePlan.ownerType === "DEPARTMENT" && activePlan.permissions.canManageSources && (
            <Button onClick={() => setSourceMetricDialog({ plan: activePlan })}>拆解小组指标</Button>
          )}
          {tab === "quarters" && (activePlan.ownerType === "DEPARTMENT" || activePlan.ownerType === "TEAM") && activePlan.permissions.canManageQuarterTargets && (
            <Button onClick={() => setQuarterTargetSetupPlan(activePlan)}>拆解季度指标</Button>
          )}
          {tab === "quarters" && (activePlan.ownerType === "DEPARTMENT" || activePlan.ownerType === "TEAM") && activePlan.permissions.canUpdateWeeklyProgress && (
            <Button variant="outline" onClick={() => setWeeklyProgressPlan(activePlan)}>周更新</Button>
          )}
        </>
      ) : null}
      {planHeaderActions}
    </div>
  );

  const emptyDepartmentPlanDetailView: PlanDetailView = {
    ownerType: "DEPARTMENT",
    metrics: [],
    totalWeight: 0,
    permissions: {
      canEditPlan: false,
      canEditMetrics: false,
      canManageSources: false,
      canManageQuarterTargets: false,
      canUpdateQuarterProgress: false,
      canUpdateWeeklyProgress: false,
    },
  };

  function handleSelectedYearChange(year: number) {
    router.push(`/annual-goals?year=${year}`);
  }

  return (
    <>
      <Card className="mb-6 !p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight">指标管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">查看部门指标承接、拆解与执行进展</p>
        </div>

        {(data.scopeDepartments.length > 0 || activeItem) ? (
          <>
            {data.scopeDepartments.length > 0 && (
              <>
                {data.showDepartmentNavigation && data.scopeDepartments.length > 0 && (
                  <div className="px-5 pt-3 flex flex-wrap items-end gap-8 text-sm shrink-0">
                    {data.scopeDepartments.map((department) => (
                      <button
                        key={department.orgNodeId}
                        type="button"
                        onClick={() => setSelectedDepartmentOrgNodeId(department.orgNodeId)}
                        className={`pb-3 border-b-2 transition ${
                          selectedDepartmentOrgNodeId === department.orgNodeId
                            ? "border-primary text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {department.name}
                      </button>
                    ))}
                  </div>
                )}

                {filteredScopeItems.length > 0 && (
                  <div className="px-5 pt-3 pb-2 flex flex-wrap items-center gap-2">
                    {filteredScopeItems.map((item) => (
                      <button
                        key={getScopeItemKey(item)}
                        type="button"
                        onClick={() => {
                          setActiveItemKey(getScopeItemKey(item));
                          if (item.type === "TEAM" && tab === "sources") {
                            setTab("metrics");
                          }
                        }}
                        className={`rounded-lg px-3 py-1.5 text-sm transition ${
                          activeItem && getScopeItemKey(activeItem) === getScopeItemKey(item)
                            ? "bg-primary text-primary-foreground"
                            : "bg-card hover:bg-muted"
                        }`}
                      >
                        {item.type === "DEPARTMENT" ? "全部" : item.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeItem && activePlanDetailView ? (
              <div key={activePlan?.id ?? getScopeItemKey(activeItem)}>
                {activePlan ? (
                  <div className="px-5 pt-1 pb-0">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">完成度</div>
                      <div className="text-2xl font-bold tabular-nums text-primary">{formatPercent(activePlan.weightedProgress)}%</div>
                    <div className="ml-auto flex justify-end gap-3">
                    </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 pt-1 pb-0">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">完成度</div>
                      <div className="text-2xl font-bold tabular-nums text-primary">0.0%</div>
                    </div>
                  </div>
                )}

                <div className={`px-5 pb-3 flex flex-wrap items-center gap-4 ${data.showDepartmentNavigation ? "pt-2" : "pt-3"}`}>
                  <div className="inline-flex rounded-lg bg-muted p-1">
                    {activePlanTabs.map((currentTab) => (
                      <button
                        key={currentTab.key}
                        type="button"
                        onClick={() => setTab(currentTab.key)}
                        className={`h-9 rounded-lg px-4 text-sm transition ${tab === currentTab.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {currentTab.label}
                      </button>
                    ))}
                  </div>
                  {topTabActions}
                </div>

                <PlanDetailTabs
                  plan={activePlanDetailView}
                  tab={tab}
                  setTab={setTab}
                  onCreateMetric={() => activePlan && setMetricDialog({ plan: activePlan })}
                  onEditMetric={(metric) => activePlan && setMetricDialog({ plan: activePlan, metric })}
                  onSourceMetric={(parentMetric, sourceMetric) => activePlan && setSourceMetricDialog({ plan: activePlan, parentMetric, sourceMetric })}
                  onCreateSourceMetric={() => activePlan && setSourceMetricDialog({ plan: activePlan })}
                  onDeleteMetric={setDeleteMetric}
                  onDeleteSourceMetric={(metric, sourceMetric) => setDeleteSourceMetric({ metric, sourceMetric })}
                  onQuarterTarget={(metric, sourceMetric) => setQuarterTargetDialog({ metric, sourceMetric })}
                  onDeleteQuarterTargets={(metric, sourceMetric) => setDeleteQuarterTargets({ metric, sourceMetric })}
                  onQuarterProgress={(metric, sourceMetric) => setQuarterProgressDialog({ metric, sourceMetric })}
                  onWeeklyProgress={() => activePlan && setWeeklyProgressPlan(activePlan)}
                  onChooseQuarterTarget={() => activePlan && setQuarterTargetSetupPlan(activePlan)}
                />
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无可见组织</div>
            )}
          </>
        ) : (
          <div className="px-5 pb-5">
            <div className="px-0 pb-3 pt-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="inline-flex rounded-lg bg-muted p-1">
                  {[
                    { key: "metrics" as const, label: "部门指标" },
                    { key: "sources" as const, label: "小组指标" },
                    { key: "quarters" as const, label: "季度指标" },
                  ].map((currentTab) => (
                    <button
                      key={currentTab.key}
                      type="button"
                      onClick={() => setTab(currentTab.key)}
                      className={`h-9 rounded-lg px-4 text-sm transition ${tab === currentTab.key ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {currentTab.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tab === "metrics" ? <Button variant="outline" disabled><Plus className="w-4 h-4" />新增年度指标</Button> : null}
                  <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                    <select
                      value={String(data.selectedYear)}
                      onChange={(event) => handleSelectedYearChange(Number.parseInt(event.target.value, 10))}
                      className="h-full bg-transparent outline-none"
                    >
                      {data.availableYears.map((year) => (
                        <option key={year} value={year}>{getYearLabel(year)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <PlanDetailTabs
              plan={emptyDepartmentPlanDetailView}
              tab={tab}
              setTab={setTab}
              onCreateMetric={() => {}}
              onEditMetric={() => {}}
              onSourceMetric={() => {}}
              onCreateSourceMetric={() => {}}
              onDeleteMetric={() => {}}
              onDeleteSourceMetric={() => {}}
              onQuarterTarget={() => {}}
              onDeleteQuarterTargets={() => {}}
              onQuarterProgress={() => {}}
              onWeeklyProgress={() => {}}
              onChooseQuarterTarget={() => {}}
            />
          </div>
        )}
      </Card>

      <Dialog open={!!planDialog} onClose={() => setPlanDialog(null)} title={planDialog === "new" ? "新建部门方案" : "编辑部门方案"}>
        {planDialog && <PlanForm plan={planDialog === "new" ? undefined : planDialog} data={data} onClose={() => { setPlanDialog(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!metricDialog} onClose={() => { setMetricDialog(null); router.refresh(); }} title={metricDialog?.metric ? "调整年度指标" : metricDialog?.plan.ownerType === "TEAM" ? "选择指标" : "新增年度指标"}>
        {metricDialog && <MetricForm plan={metricDialog.plan} metric={metricDialog.metric} data={data} onClose={() => { setMetricDialog(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!sourceMetricDialog} onClose={() => { setSourceMetricDialog(null); router.refresh(); }} title={sourceMetricDialog?.sourceMetric ? "更新小组指标" : "拆解小组指标"}>
        {sourceMetricDialog && <SourceMetricForm key={`${sourceMetricDialog.sourceMetric?.id ?? "new"}:${sourceMetricDialog.parentMetric?.id ?? "none"}:${sourceMetricDialog.plan.id}`} plan={sourceMetricDialog.plan} parentMetric={sourceMetricDialog.parentMetric} sourceMetric={sourceMetricDialog.sourceMetric} data={data} onClose={() => { setSourceMetricDialog(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!quarterTargetSetupPlan} onClose={() => { setQuarterTargetSetupPlan(null); router.refresh(); }} title="拆解季度指标">
        {quarterTargetSetupPlan && <QuarterTargetSetupForm plan={quarterTargetSetupPlan} onClose={() => { setQuarterTargetSetupPlan(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!quarterProgressDialog} onClose={() => { setQuarterProgressDialog(null); router.refresh(); }} title="更新季度指标">
        {quarterProgressDialog && <QuarterProgressUpdateForm metric={quarterProgressDialog.metric} sourceMetric={quarterProgressDialog.sourceMetric} onClose={() => { setQuarterProgressDialog(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!weeklyProgressPlan} onClose={() => { setWeeklyProgressPlan(null); router.refresh(); }} title="周更新">
        {weeklyProgressPlan && <QuarterWeeklyUpdateForm plan={weeklyProgressPlan} onClose={() => { setWeeklyProgressPlan(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!deleteMetric} onClose={() => { setDeleteMetric(null); router.refresh(); }} title="删除指标项">
        {deleteMetric && <DeleteMetricConfirm metric={deleteMetric} onClose={() => { setDeleteMetric(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!deleteSourceMetric} onClose={() => { setDeleteSourceMetric(null); router.refresh(); }} title="删除小组指标">
        {deleteSourceMetric && <DeleteSourceMetricConfirm sourceMetric={deleteSourceMetric.sourceMetric} onClose={() => { setDeleteSourceMetric(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!deleteQuarterTargets} onClose={() => { setDeleteQuarterTargets(null); router.refresh(); }} title="删除季度指标">
        {deleteQuarterTargets && <DeleteQuarterTargetsConfirm metric={deleteQuarterTargets.metric} sourceMetric={deleteQuarterTargets.sourceMetric} onClose={() => { setDeleteQuarterTargets(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!deletePlan} onClose={() => { setDeletePlan(null); router.refresh(); }} title="删除年度方案">
        {deletePlan && <DeletePlanConfirm plan={deletePlan} years={data.availableYears} onClose={() => { setDeletePlan(null); router.refresh(); }} />}
      </Dialog>
    </>
  );
}

