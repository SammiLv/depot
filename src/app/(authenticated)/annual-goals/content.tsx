"use client";

import { useState } from "react";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { archiveAnnualGoalPlan, createAnnualGoalMetric, createAnnualGoalMetricSource, createAnnualGoalPlan, deleteAnnualGoalMetric, deleteAnnualGoalMetricSource, deleteAnnualGoalQuarterTargets, restoreAnnualGoalPlan, saveAnnualGoalQuarterTargets, updateAnnualGoalMetric, updateAnnualGoalMetricSource, updateAnnualGoalPlan, updateAnnualGoalQuarterProgress, updateAnnualGoalWeeklyProgress } from "@/server/annual-goals/actions";
import type { getAnnualGoalsData } from "@/server/annual-goals/annual-goals-query";
import { Edit, Filter, GitBranch, History, Plus, Target, Trash2, TrendingUp, X } from "lucide-react";

type Data = Awaited<ReturnType<typeof getAnnualGoalsData>>;
type Plan = Data["plans"][number];
type Metric = Plan["metrics"][number];
type SourceMetric = Metric["sources"][number];
type PlanTab = "metrics" | "sources" | "quarters";
type Props = { data: Data };

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

function getSourceMetricTargetTotal(metric: Metric) {
  return roundValue(
    metric.sources
      .filter((source) => isRealSourceMetric(metric, source))
      .reduce((sum, source) => sum + source.targetValue, 0)
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

function getPlanSummary(plan?: Plan) {
  if (!plan) {
    return {
      planCount: 0,
      metricCount: 0,
      riskCount: 0,
      revisionCount: 0,
      overallWeightedProgress: 0,
    };
  }

  return {
    planCount: 1,
    metricCount: plan.metrics.length,
    riskCount: plan.metrics.filter((metric) => metric.riskStatus === "RISK").length,
    revisionCount: plan.revisionReason ? 1 : 0,
    overallWeightedProgress: plan.weightedProgress,
  };
}

function SearchableMemberField({
  name,
  label,
  options,
  defaultUser,
  placeholder,
}: {
  name: string;
  label: string;
  options: Data["memberOptionsByDepartment"][string] | Data["memberOptionsByTeam"][string];
  defaultUser: { id: string; name: string; title: string | null } | null;
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState(defaultUser ? formatResponsibleUser(defaultUser) : "");
  const [selectedId, setSelectedId] = useState(defaultUser?.id ?? "");
  const listId = `${name}-${label}`;

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
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

function PlanForm({ plan, data, onClose }: { plan?: Plan; data: Data; onClose: () => void }) {
  const [ownerType, setOwnerType] = useState<"DEPARTMENT" | "TEAM">(plan?.ownerType ?? "DEPARTMENT");
  const action = plan ? updateAnnualGoalPlan : createAnnualGoalPlan;
  const departmentId = plan?.departmentId ?? data.currentDepartmentId ?? data.departments[0]?.id ?? "";

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">年份 *</label>
            <input name="year" type="number" defaultValue={plan?.year ?? new Date().getFullYear()} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">方案归属 *</label>
            <select name="ownerType" value={ownerType} onChange={(e) => setOwnerType(e.target.value as "DEPARTMENT" | "TEAM")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              <option value="DEPARTMENT">部门方案</option>
              <option value="TEAM">小组方案</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">方案名称 *</label>
          <input name="name" defaultValue={plan?.name ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">所属部门 *</label>
            <select name="departmentId" defaultValue={departmentId} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">所属小组{ownerType === "TEAM" ? " *" : ""}</label>
            <select name="teamId" defaultValue={plan?.teamId ?? ""} required={ownerType === "TEAM"} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              <option value="">不指定</option>
              {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">说明</label>
          <textarea name="description" defaultValue={plan?.description ?? ""} rows={3} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">{plan ? "保存" : "创建"}</Button>
      </div>
    </form>
  );
}

function MetricForm({ plan, metric, data, onClose }: { plan: Plan; metric?: Metric; data: Data; onClose: () => void }) {
  const action = metric ? updateAnnualGoalMetric : createAnnualGoalMetric;
  const isTeamPlan = plan.ownerType === "TEAM";
  const availableParentMetrics = data.availableParentMetrics.filter(
    (m) => m.departmentId === plan.departmentId && (!plan.metrics.some((pm) => !pm.sourceMetricId && pm.metricCode === m.metricCode) || m.metricCode === metric?.metricCode)
  );
  const [selectedParentMetricId, setSelectedParentMetricId] = useState(metric?.sourceMetricId ? metric.sourceMetricId : availableParentMetrics[0]?.id ?? "");
  const [selectedSourceMetricId, setSelectedSourceMetricId] = useState(metric?.sourceMetricId ?? "");
  const selectedParentMetric = availableParentMetrics.find((m) => m.id === (metric?.sourceMetricId ? availableParentMetrics.find((parentMetric) => parentMetric.sources.some((source) => source.id === metric.sourceMetricId))?.id : selectedParentMetricId));
  const availableSourceMetrics = (selectedParentMetric?.sources ?? []).filter(
    (m) => !plan.metrics.some((pm) => pm.sourceMetricId === m.id) || m.id === metric?.sourceMetricId
  );
  const teamMemberOptions = plan.teamId ? (data.memberOptionsByTeam[plan.teamId] ?? []) : [];
  const selectedSourceMetric = availableSourceMetrics.find((source) => source.id === selectedSourceMetricId);
  const defaultResponsibleUser = metric?.responsibleUser ?? selectedSourceMetric?.responsibleUser ?? (!selectedSourceMetricId ? selectedParentMetric?.responsibleUser ?? null : null);

  return (
    <form action={async (fd) => { await action(fd); onClose(); }}>
      {metric ? <input type="hidden" name="id" value={metric.id} /> : <input type="hidden" name="planId" value={plan.id} />}
      <div className="space-y-4">
        {isTeamPlan && !metric ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">指标项 *</label>
              <select
                name={selectedSourceMetricId ? undefined : "parentMetricId"}
                value={selectedParentMetricId}
                onChange={(e) => { setSelectedParentMetricId(e.target.value); setSelectedSourceMetricId(""); }}
                required={!selectedSourceMetricId}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring"
              >
                <option value="">请选择</option>
                {availableParentMetrics.map((m) => <option key={m.id} value={m.id}>{m.name} · {formatValue(m.targetValue)}{m.unit}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">元指标</label>
              <select
                name={selectedSourceMetricId ? "sourceMetricId" : undefined}
                value={selectedSourceMetricId}
                onChange={(e) => setSelectedSourceMetricId(e.target.value)}
                disabled={!selectedParentMetricId || availableSourceMetrics.length === 0}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground"
              >
                <option value="">不选择元指标，直接选择指标项</option>
                {availableSourceMetrics.map((m) => <option key={m.id} value={m.id}>{m.name} · {formatValue(m.targetValue)}{m.unit}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">选择元指标后将按元指标创建；不选择则按上方指标项创建。</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">指标名称 *</label>
              <input name="name" defaultValue={metric?.name ?? ""} required={!isTeamPlan} disabled={isTeamPlan} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">目标值 *</label>
                <input name="targetValue" type="number" step="0.01" defaultValue={formatInputValue(metric?.targetValue, "0")} required={!isTeamPlan} disabled={isTeamPlan} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">当前值</label>
                <input name="currentValue" type="number" step="0.01" defaultValue={formatInputValue(metric?.currentValue, "0")} disabled={isTeamPlan} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">单位 *</label>
                <input name="unit" defaultValue={metric?.unit ?? ""} required={!isTeamPlan} disabled={isTeamPlan} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground" />
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
          />
        )}
        <div>
          <label className="block text-sm font-medium mb-1">权重 % *</label>
          <input name="weight" type="number" step="0.1" defaultValue={formatInputValue(metric?.weight, "0")} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        {!isTeamPlan && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">计算方式</label>
                <select name="calculationType" defaultValue={metric?.calculationType ?? "RATIO"} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                  <option value="RATIO">比例完成</option>
                  <option value="BOOLEAN">是否完成</option>
                  <option value="MANUAL_SCORE">人工评分</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">风险状态</label>
                <select name="riskStatus" defaultValue={metric?.riskStatus ?? "NORMAL"} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
                  <option value="NORMAL">正常</option>
                  <option value="SLIGHT_DELAY">轻微滞后</option>
                  <option value="RISK">风险</option>
                  <option value="COMPLETED">已完成</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">说明</label>
              <textarea name="description" defaultValue={metric?.description ?? ""} rows={3} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
            </div>
          </>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">{metric ? "保存" : isTeamPlan ? "选择" : "创建"}</Button>
      </div>
    </form>
  );
}

function SourceMetricForm({ parentMetric, sourceMetric, data, onClose }: { parentMetric: Metric; sourceMetric?: SourceMetric; data: Data; onClose: () => void }) {
  const action = sourceMetric ? updateAnnualGoalMetricSource : createAnnualGoalMetricSource;
  const [error, setError] = useState<string | null>(null);
  const departmentMemberOptions = parentMetric.departmentId ? (data.memberOptionsByDepartment[parentMetric.departmentId] ?? []) : [];
  return (
    <form action={async (fd) => {
      setError(null);
      try {
        await action(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    }}>
      {sourceMetric ? <input type="hidden" name="id" value={sourceMetric.id} /> : <input type="hidden" name="parentMetricId" value={parentMetric.id} />}
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          拆解自部门指标：<span className="font-medium text-foreground">{parentMetric.name}</span>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">元指标名称 *</label>
          <input name="name" defaultValue={sourceMetric?.name ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">目标值 *</label>
            <input name="targetValue" type="number" step="0.01" defaultValue={formatInputValue(sourceMetric?.targetValue)} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">当前值</label>
            <input name="currentValue" type="number" step="0.01" defaultValue={formatInputValue(sourceMetric?.currentValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">单位 *</label>
            <input name="unit" defaultValue={sourceMetric?.unit ?? ""} required className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
          </div>
        </div>
        <SearchableMemberField
          key={sourceMetric?.id ?? parentMetric.id}
          name="responsibleUserId"
          label="负责人"
          options={departmentMemberOptions}
          defaultUser={sourceMetric?.responsibleUser ?? null}
          placeholder="输入姓名或姓名 · 职务"
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">计算方式</label>
            <select name="calculationType" defaultValue={sourceMetric?.calculationType ?? "RATIO"} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              <option value="RATIO">比例完成</option>
              <option value="BOOLEAN">是否完成</option>
              <option value="MANUAL_SCORE">人工评分</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">风险状态</label>
            <select name="riskStatus" defaultValue={sourceMetric?.riskStatus ?? "NORMAL"} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
              <option value="NORMAL">正常</option>
              <option value="SLIGHT_DELAY">轻微滞后</option>
              <option value="RISK">风险</option>
              <option value="COMPLETED">已完成</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">说明</label>
          <textarea name="description" defaultValue={sourceMetric?.description ?? ""} rows={3} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">{sourceMetric ? "保存" : "创建"}</Button>
        </div>
      </div>
    </form>
  );
}

function SourceMetricChooser({ plan, onSelect, onClose }: { plan: Plan; onSelect: (metric: Metric) => void; onClose: () => void }) {
  const availableMetrics = plan.metrics.filter(canAddSourceMetric);
  const [selectedMetricId, setSelectedMetricId] = useState(availableMetrics[0]?.id ?? "");
  const selectedMetric = availableMetrics.find((metric) => metric.id === selectedMetricId);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">指标项 *</label>
        <select value={selectedMetricId} onChange={(e) => setSelectedMetricId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
          {availableMetrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.name} · {formatValue(metric.targetValue)}{metric.unit}</option>)}
        </select>
      </div>
      {availableMetrics.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无可拆解的部门指标</div>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="button" onClick={() => selectedMetric && onSelect(selectedMetric)}>继续</Button>
      </div>
    </div>
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

  return (
    <form action={async (fd) => {
      setError(null);
      try {
        await saveAnnualGoalQuarterTargets(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    }}>
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
          return (
            <div key={quarter} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-2 text-sm font-medium">Q{quarter}</div>
              <div className="col-span-5">
                <input name={`q${quarter}Target`} type="number" step="0.01" defaultValue={formatInputValue(target?.targetValue)} placeholder="不填写则不拆解" className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
              </div>
              <div className="col-span-5">
                <input name={`q${quarter}Current`} type="number" step="0.01" defaultValue={formatInputValue(target?.currentValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
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

function QuarterProgressUpdateForm({ metric, sourceMetric, onClose }: { metric: Metric; sourceMetric?: SourceMetric; onClose: () => void }) {
  const targets = sourceMetric?.quarterTargets ?? metric.quarterTargets;
  const targetByQuarter = new Map(targets.map((target) => [target.quarter, target]));
  const subject = sourceMetric ?? metric;
  const [error, setError] = useState<string | null>(null);

  return (
    <form action={async (fd) => {
      setError(null);
      try {
        await updateAnnualGoalQuarterProgress(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    }}>
      <input type="hidden" name="metricId" value={metric.id} />
      {sourceMetric && <input type="hidden" name="sourceMetricId" value={sourceMetric.id} />}
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          更新对象：<span className="font-medium text-foreground">{subject.name}</span> · 仅可更新季度当前值
        </div>
        <div className="grid grid-cols-12 gap-3 text-xs text-muted-foreground px-1">
          <div className="col-span-2">季度</div>
          <div className="col-span-5">目标值</div>
          <div className="col-span-5">当前值</div>
        </div>
        {[1, 2, 3, 4].map((quarter) => {
          const target = targetByQuarter.get(quarter);
          return (
            <div key={quarter} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-2 text-sm font-medium">Q{quarter}</div>
              <div className="col-span-5 text-sm text-muted-foreground">
                {target ? `${formatValue(target.targetValue)}${subject.unit}` : "-"}
              </div>
              <div className="col-span-5">
                {target ? (
                  <>
                    <input type="hidden" name={`q${quarter}Id`} value={target.id} />
                    <input name={`q${quarter}Current`} type="number" step="0.01" defaultValue={formatInputValue(target.currentValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
                  </>
                ) : (
                  <div className="h-10 flex items-center text-sm text-muted-foreground">未拆解</div>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">目标值不可修改；保存后会同步重算上级元指标和指标项当前值。</p>
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
      .filter((source) => isRealSourceMetric(metric, source))
      .map((source) => ({ metric, subject: source, sourceMetric: source, depth: 1 })),
  ]).flatMap((row) => row.subject.quarterTargets.filter((target) => plan.year === currentYear && target.quarter === currentQuarter).map((target) => ({ ...row, target })));
  const [error, setError] = useState<string | null>(null);

  return (
    <form action={async (fd) => {
      setError(null);
      try {
        await updateAnnualGoalWeeklyProgress(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    }}>
      <input type="hidden" name="rowCount" value={rows.length} />
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          更新范围：<span className="font-medium text-foreground">{plan.ownerName}</span> · 仅更新当前季度 Q{currentQuarter}
        </div>
        <div className="grid grid-cols-[1.8fr_0.6fr_0.9fr_1fr_1fr] gap-3 text-xs text-muted-foreground px-1">
          <div>指标</div>
          <div>季度</div>
          <div>目标值</div>
          <div>本周新增</div>
          <div>本季度当前值</div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {rows.map((row, index) => (
            <div key={row.target.id} className="grid grid-cols-[1.8fr_0.6fr_0.9fr_1fr_1fr] gap-3 items-center">
              <input type="hidden" name={`targetId_${index}`} value={row.target.id} />
              <input type="hidden" name={`metricId_${index}`} value={row.target.metricId} />
              {row.target.sourceMetricId && <input type="hidden" name={`sourceMetricId_${index}`} value={row.target.sourceMetricId} />}
              <div className={row.depth ? "pl-4" : ""}>
                <div className="text-sm font-medium truncate">{row.subject.name}</div>
                <div className="text-xs text-muted-foreground">{row.depth ? "元指标" : "指标项"}</div>
              </div>
              <div className="text-sm font-medium">Q{row.target.quarter}</div>
              <div className="text-sm text-muted-foreground">{formatValue(row.target.targetValue)}{row.subject.unit}</div>
              <input name={`weeklyIncrement_${index}`} type="number" step="0.01" defaultValue={formatInputValue(row.target.weeklyIncrement, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
              <input name={`currentValue_${index}`} type="number" step="0.01" defaultValue={formatInputValue(row.target.currentValue, "0")} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring" />
            </div>
          ))}
          {rows.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">当前方案暂无 Q{currentQuarter} 可更新的季度指标</div>}
        </div>
        <p className="text-xs text-muted-foreground">保存后会同步重算上级元指标和指标项当前值，并更新“更新时间”。</p>
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

function isRealSourceMetric(metric: Metric, sourceMetric: SourceMetric) {
  return sourceMetric.name !== metric.name || sourceMetric.targetValue !== metric.targetValue || sourceMetric.currentValue !== metric.currentValue || sourceMetric.unit !== metric.unit;
}

const footerPrimaryButtonClass = "px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90";
const footerSecondaryButtonClass = "px-3 py-1.5 rounded-md hover:bg-muted text-muted-foreground";

function QuarterTargetChooser({ plan, onSelect, onClose }: { plan: Plan; onSelect: (metric: Metric, sourceMetric?: SourceMetric) => void; onClose: () => void }) {
  const options: { key: string; label: string; metric: Metric; sourceMetric?: SourceMetric }[] = plan.metrics.flatMap((metric) => [
    ...(canAddQuarterTarget(metric) ? [{ key: `metric:${metric.id}`, label: `指标项：${metric.name}`, metric }] : []),
    ...metric.sources
      .filter((sourceMetric) => isRealSourceMetric(metric, sourceMetric) && canAddQuarterTarget(sourceMetric))
      .map((sourceMetric) => ({ key: `source:${metric.id}:${sourceMetric.id}`, label: `元指标：${metric.name} / ${sourceMetric.name}`, metric, sourceMetric })),
  ]);
  const [selectedKey, setSelectedKey] = useState(options[0]?.key ?? "");
  const selected = options.find((option) => option.key === selectedKey);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">拆解对象 *</label>
        <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-ring">
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </div>
      {options.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无可拆解的指标项或元指标</div>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="button" onClick={() => selected && onSelect(selected.metric, selected.sourceMetric)}>继续</Button>
      </div>
    </div>
  );
}

function DeleteMetricConfirm({ metric, onClose }: { metric: Metric; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除指标「{metric.name}」？删除后不会计入方案权重和完成度。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form action={async (fd) => { await deleteAnnualGoalMetric(fd); onClose(); }}>
          <input type="hidden" name="id" value={metric.id} />
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function DeleteSourceMetricConfirm({ sourceMetric, onClose }: { sourceMetric: SourceMetric; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除元指标「{sourceMetric.name}」？已分配到小组的同源指标也会同步删除。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form action={async (fd) => { await deleteAnnualGoalMetricSource(fd); onClose(); }}>
          <input type="hidden" name="id" value={sourceMetric.id} />
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function DeleteQuarterTargetsConfirm({ metric, sourceMetric, onClose }: { metric: Metric; sourceMetric?: SourceMetric; onClose: () => void }) {
  const subject = sourceMetric ?? metric;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认删除「{subject.name}」的季度指标？删除后该行不再展示在季度指标列表中。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form action={async (fd) => { await deleteAnnualGoalQuarterTargets(fd); onClose(); }}>
          <input type="hidden" name="metricId" value={metric.id} />
          {sourceMetric && <input type="hidden" name="sourceMetricId" value={sourceMetric.id} />}
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认删除</Button>
        </form>
      </div>
    </div>
  );
}

function ArchivePlanConfirm({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">确认将方案「{plan.name}」归档为历史记录？归档后不再显示在当前方案列表，可从历史记录查看和恢复。</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <form action={async (fd) => { await archiveAnnualGoalPlan(fd); onClose(); }}>
          <input type="hidden" name="id" value={plan.id} />
          <Button type="submit" className="!bg-destructive hover:!bg-destructive/90">确认归档</Button>
        </form>
      </div>
    </div>
  );
}

function RestorePlanButton({ plan }: { plan: Plan }) {
  return (
    <form action={restoreAnnualGoalPlan}>
      <input type="hidden" name="id" value={plan.id} />
      <button type="submit" className="text-xs text-primary hover:underline">恢复到当前列表</button>
    </form>
  );
}

function HistoryPlanDetail({ plan }: { plan: Plan }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="default">{plan.ownerType === "DEPARTMENT" ? "部门" : "小组"}</Badge>
          <span className="text-xs text-muted-foreground">{plan.ownerName}</span>
          <Badge tone="info">历史记录</Badge>
          <span className="text-xs text-muted-foreground">{plan.version}</span>
        </div>
        <h3 className="mt-2 text-base font-semibold">{plan.name}</h3>
        {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
        <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">年份</div><div className="font-medium">{plan.year}</div></div>
          <div><div className="text-xs text-muted-foreground">权重合计</div><div className="font-medium">{formatPercent(plan.totalWeight)}%</div></div>
          <div><div className="text-xs text-muted-foreground">指标项</div><div className="font-medium">{plan.metrics.length} 项</div></div>
          <div><div className="text-xs text-muted-foreground">完成度</div><div className="font-medium text-primary">{formatPercent(plan.weightedProgress)}%</div></div>
        </div>
        {plan.deletedAt && <div className="mt-3 text-xs text-muted-foreground">归档时间：{new Date(plan.deletedAt).toLocaleString("zh-CN")}</div>}
      </div>
      <div className="space-y-3">
        <div className="text-sm font-medium">指标明细</div>
        {plan.metrics.map((metric) => (
          <div key={metric.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{metric.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">单位 {metric.unit} · 权重 {formatPercent(metric.weight)}% · 负责人 {formatResponsibleUser(metric.responsibleUser)}</div>
              </div>
              {metric.riskStatus === "RISK" && <Badge tone="warning">风险</Badge>}
            </div>
            {metric.description && <p className="mt-2 text-xs text-muted-foreground">{metric.description}</p>}
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div><span className="text-muted-foreground">目标值：</span>{formatValue(metric.targetValue)}{metric.unit}</div>
              <div><span className="text-muted-foreground">当前值：</span>{formatValue(metric.currentValue)}{metric.unit}</div>
              <div><span className="text-muted-foreground">完成度：</span>{formatPercent(metric.progress)}%</div>
            </div>
            <div className="mt-3"><Progress value={metric.progress} tone={metric.tone} /></div>
            {metric.quarterTargets.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                {metric.quarterTargets.map((target) => (
                  <div key={target.quarter} className="rounded-lg bg-muted/40 p-2">
                    Q{target.quarter}：{formatValue(target.currentValue)}/{formatValue(target.targetValue)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {plan.metrics.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">暂无指标项</div>}
      </div>
    </div>
  );
}

function PlanDetailTabs({ plan, onCreateMetric, onEditMetric, onSourceMetric, onCreateSourceMetric, onDeleteMetric, onDeleteSourceMetric, onQuarterTarget, onDeleteQuarterTargets, onQuarterProgress, onWeeklyProgress, onChooseQuarterTarget }: { plan: Plan; onCreateMetric: () => void; onEditMetric: (metric: Metric) => void; onSourceMetric: (parentMetric: Metric, sourceMetric?: SourceMetric) => void; onCreateSourceMetric: () => void; onDeleteMetric: (metric: Metric) => void; onDeleteSourceMetric: (parentMetric: Metric, sourceMetric: SourceMetric) => void; onQuarterTarget: (metric: Metric, sourceMetric?: SourceMetric) => void; onDeleteQuarterTargets: (metric: Metric, sourceMetric?: SourceMetric) => void; onQuarterProgress: (metric: Metric, sourceMetric?: SourceMetric) => void; onWeeklyProgress: () => void; onChooseQuarterTarget: () => void }) {
  const [tab, setTab] = useState<PlanTab>("metrics");
  const tabs: { key: PlanTab; label: string }[] = plan.ownerType === "DEPARTMENT"
    ? [
        { key: "metrics", label: "年度指标" },
        { key: "sources", label: "元指标" },
        { key: "quarters", label: "季度指标" },
      ]
    : [
        { key: "metrics", label: "年度指标" },
        { key: "quarters", label: "季度指标" },
      ];
  const sourceRows = plan.metrics.flatMap((metric) =>
    metric.sources
      .filter((source) => isRealSourceMetric(metric, source))
      .map((source) => ({ metric, source }))
  );
  const quarterRows = plan.metrics.flatMap((metric) => [
    { key: metric.id, metric, subject: metric, tone: "default" as const, depth: 0 },
    ...metric.sources
      .filter((source) => isRealSourceMetric(metric, source))
      .map((source) => ({ key: source.id, metric, subject: source, tone: "info" as const, depth: 1 })),
  ]).filter((row) => row.subject.quarterTargets.length > 0);

  return (
    <>
      <div className="px-5 pt-3 border-b border-border flex items-center gap-5 text-sm shrink-0">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`pb-2 border-b-2 transition ${tab === item.key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        {tab === "metrics" && (
          <>
          <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.7fr_0.7fr_1.1fr_1.6fr_0.25fr_1.1fr_1.1fr_1.1fr] gap-3 text-xs text-muted-foreground">
            <div>指标项</div>
            <div className="text-right">权重</div>
            <div>目标 / 当前</div>
            <div>完成度</div>
            <div />
            <div>创建时间</div>
            <div>调整时间</div>
            <div>更新时间</div>
          </div>
          <div className="divide-y divide-border">
            {plan.metrics.map((metric) => (
              <div key={metric.id} className="px-5 py-4 grid grid-cols-[1.7fr_0.7fr_1.1fr_1.6fr_0.25fr_1.1fr_1.1fr_1.1fr] gap-3 items-center hover:bg-muted/20 transition">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{metric.name}</div>
                    {metric.riskStatus === "RISK" && <Badge tone="warning">风险</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">单位 {metric.unit} · 负责人 {formatResponsibleUser(metric.responsibleUser)}</div>
                  {plan.permissions.canEditMetrics && (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <button onClick={() => onEditMetric(metric)} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Edit className="w-3 h-3" />调整
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
                <div className="text-xs text-muted-foreground">{formatDateTime(metric.createdAt)}</div>
                <div className="text-xs text-muted-foreground">{metric.adjustedAt ? formatDateTime(metric.adjustedAt) : "-"}</div>
                <div className="text-xs text-muted-foreground">{metric.progressUpdatedAt ? formatDateTime(metric.progressUpdatedAt) : "-"}</div>
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
              <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.2fr_1.2fr_1.1fr_1.4fr_0.25fr_1.1fr_1.1fr_1.1fr] gap-3 text-xs text-muted-foreground">
                <div>元指标</div>
                <div>所属指标项</div>
                <div>目标 | 当前</div>
                <div>完成度</div>
                <div />
                <div>创建时间</div>
                <div>调整时间</div>
                <div>更新时间</div>
              </div>
              <div className="divide-y divide-border">
                {sourceRows.map(({ metric, source }) => (
                  <div key={source.id} className="px-5 py-4 grid grid-cols-[1.2fr_1.2fr_1.1fr_1.4fr_0.25fr_1.1fr_1.1fr_1.1fr] gap-3 items-center hover:bg-muted/20 transition text-sm">
                    <div>
                      <div className="font-medium">{source.name}</div>
                      {source.description && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{source.description}</div>}
                      <div className="mt-1 text-xs text-muted-foreground">负责人：{formatResponsibleUser(source.responsibleUser)}</div>
                      {plan.permissions.canManageSources && (
                        <div className="mt-1 flex items-center gap-3 text-xs">
                          <button onClick={() => onSourceMetric(metric, source)} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Edit className="w-3 h-3" />调整
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
                    <div className="text-xs text-muted-foreground">{formatDateTime(source.createdAt)}</div>
                    <div className="text-xs text-muted-foreground">{source.adjustedAt ? formatDateTime(source.adjustedAt) : "-"}</div>
                    <div className="text-xs text-muted-foreground">{source.progressUpdatedAt ? formatDateTime(source.progressUpdatedAt) : "-"}</div>
                  </div>
                ))}
                {sourceRows.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">暂无元指标</div>}
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">小组方案不维护元指标，可在年度指标中选择部门指标或元指标。</div>
          )}
        </div>
      )}
      {tab === "quarters" && (
        <div className="overflow-x-auto">
          <div className="min-w-[1540px]">
            <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.2fr_0.75fr_0.75fr_0.75fr_0.75fr] gap-4 text-xs text-muted-foreground">
              <div>指标</div>
              <div>Q1目标 | Q1当前 | 完成度</div>
              <div>Q2目标 | Q2当前 | 完成度</div>
              <div>Q3目标 | Q3当前 | 完成度</div>
              <div>Q4目标 | Q4当前 | 完成度</div>
              <div>本周新增</div>
              <div>创建时间</div>
              <div>调整时间</div>
              <div>更新时间</div>
            </div>
            <div className="divide-y divide-border">
              {quarterRows.map((row) => {
                const targetByQuarter = new Map(row.subject.quarterTargets.map((target) => [target.quarter, target]));
                const time = getQuarterTargetsTime(row.subject.quarterTargets);
                return (
                  <div key={row.key} className="px-5 py-4 grid grid-cols-[1.5fr_1.2fr_1.2fr_1.2fr_1.2fr_0.75fr_0.75fr_0.75fr_0.75fr] gap-4 items-center hover:bg-muted/20 transition text-sm">
                    <div className={row.depth ? "pl-5" : ""}>
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{row.subject.name}</div>
                        <Badge tone={row.tone}>{row.depth ? "元指标" : "指标项"}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">年度目标 {formatValue(row.subject.targetValue)}{row.subject.unit} · 当前 {formatValue(row.subject.currentValue)}{row.subject.unit}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        {plan.permissions.canManageQuarterTargets && plan.ownerType === "DEPARTMENT" && (
                          <>
                            <button onClick={() => onQuarterTarget(row.metric, row.depth ? row.subject as SourceMetric : undefined)} className="text-primary hover:underline">调整</button>
                            <button onClick={() => onDeleteQuarterTargets(row.metric, row.depth ? row.subject as SourceMetric : undefined)} className="inline-flex items-center gap-1 text-destructive hover:underline">
                              <Trash2 className="w-3 h-3" />删除
                            </button>
                          </>
                        )}
                        {plan.permissions.canUpdateQuarterProgress && <button type="button" onClick={() => onQuarterProgress(row.metric, row.depth ? row.subject as SourceMetric : undefined)} className="text-primary hover:underline">更新</button>}
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
                    <div className="text-xs text-muted-foreground">{time ? formatDateTime(time.createdAt) : "-"}</div>
                    <div className="text-xs text-muted-foreground">{time?.adjustedAt ? formatDateTime(time.adjustedAt) : "-"}</div>
                    <div className="text-xs text-muted-foreground">{time?.progressUpdatedAt ? formatDateTime(time.progressUpdatedAt) : "-"}</div>
                  </div>
                );
              })}
              {quarterRows.length === 0 && <div className="px-5 py-8 text-center text-sm text-muted-foreground">暂无季度指标</div>}
            </div>
          </div>
        </div>
      )}
      </div>

      <div className="px-5 py-3 border-t border-border bg-card flex items-center justify-between text-xs">
        {tab === "metrics" ? (
          <span className="text-muted-foreground">权重合计 {formatPercent(plan.totalWeight)}% · 共 {plan.metrics.length} 项</span>
        ) : tab === "sources" ? (
          <span className="text-muted-foreground">共 {sourceRows.length} 项</span>
        ) : (
          <span className="text-muted-foreground">共 {quarterRows.length} 项</span>
        )}
        <div className="ml-auto flex items-center justify-end gap-2">
          {tab === "metrics" && (
            <>
              <button className={footerSecondaryButtonClass}>创建调整版本</button>
              {plan.permissions.canEditMetrics && <button onClick={onCreateMetric} className={footerPrimaryButtonClass}>{plan.ownerType === "TEAM" ? "选择指标" : "新增部门指标"}</button>}
            </>
          )}
          {tab === "sources" && plan.ownerType === "DEPARTMENT" && plan.permissions.canManageSources && (
            <button onClick={onCreateSourceMetric} className={footerPrimaryButtonClass}>拆解元指标</button>
          )}
          {tab === "quarters" && plan.ownerType === "DEPARTMENT" && (
            <>
              {plan.permissions.canUpdateWeeklyProgress && <button onClick={onWeeklyProgress} className={footerSecondaryButtonClass}>周更新</button>}
              {plan.permissions.canManageQuarterTargets && <button onClick={onChooseQuarterTarget} className={footerPrimaryButtonClass}>拆解季度指标</button>}
            </>
          )}
          {tab === "quarters" && plan.ownerType === "TEAM" && plan.permissions.canUpdateWeeklyProgress && (
            <button onClick={onWeeklyProgress} className={footerPrimaryButtonClass}>周更新</button>
          )}
        </div>
      </div>
    </>
  );
}

export function AnnualGoalsContent({ data }: Props) {
  const [planDialog, setPlanDialog] = useState<Plan | "new" | null>(null);
  const [metricDialog, setMetricDialog] = useState<{ plan: Plan; metric?: Metric } | null>(null);
  const [sourceMetricDialog, setSourceMetricDialog] = useState<{ parentMetric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [sourceMetricChooserPlan, setSourceMetricChooserPlan] = useState<Plan | null>(null);
  const [quarterChooserPlan, setQuarterChooserPlan] = useState<Plan | null>(null);
  const [quarterTargetDialog, setQuarterTargetDialog] = useState<{ metric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [quarterProgressDialog, setQuarterProgressDialog] = useState<{ metric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [weeklyProgressPlan, setWeeklyProgressPlan] = useState<Plan | null>(null);
  const [deleteMetric, setDeleteMetric] = useState<Metric | null>(null);
  const [deleteSourceMetric, setDeleteSourceMetric] = useState<{ metric: Metric; sourceMetric: SourceMetric } | null>(null);
  const [deleteQuarterTargets, setDeleteQuarterTargets] = useState<{ metric: Metric; sourceMetric?: SourceMetric } | null>(null);
  const [archivePlan, setArchivePlan] = useState<Plan | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<Plan | null>(null);
  const [activePlanId, setActivePlanId] = useState(data.plans[0]?.id ?? "");
  const activePlan = data.plans.find((plan) => plan.id === activePlanId) ?? data.plans[0];
  const activeSummary = getPlanSummary(activePlan);

  return (
    <>
      <PageHeader
        title="年度指标方案"
        description="部门指标承接公司下达目标，指标元数据用于拆解到小组并同步统计"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowHistory(true)}><History className="w-4 h-4" />历史记录</Button>
            <Button variant="outline"><Filter className="w-4 h-4" />筛选</Button>
            {data.permissions.canCreatePlan && <Button onClick={() => setPlanDialog("new")}><Plus className="w-4 h-4" />新建方案</Button>}
          </div>
        }
      />

      {data.plans.length > 0 && (
        <Card className="mb-6 !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2 overflow-x-auto">
            {data.plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePlanId(p.id)}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition ${
                  activePlan?.id === p.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {p.ownerType === "DEPARTMENT" ? "部门" : p.ownerName}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">年度业绩指标完成度</div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight tabular-nums">{formatPercent(activeSummary.overallWeightedProgress)}%</span>
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <TrendingUp className="w-4 h-4" />{activePlan?.ownerType === "DEPARTMENT" ? "部门加权" : "小组加权"}
              </span>
            </div>
            <div className="mt-3 max-w-xl">
              <Progress value={activeSummary.overallWeightedProgress} tone="primary" />
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{activePlan ? `${activePlan.ownerName} · ${activeSummary.planCount} 个方案 · ${activeSummary.metricCount} 项指标` : "0 个方案 · 0 项指标"}</span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Target className="w-7 h-7" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <div className="text-xs text-muted-foreground">方案总数</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{activeSummary.planCount}</span>
            <Badge tone="default">方案</Badge>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">指标项</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{activeSummary.metricCount}</span>
            <Badge tone="primary">指标</Badge>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">落后预警</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{activeSummary.riskCount}</span>
            <Badge tone="warning">预警</Badge>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">年中调整版本</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{activeSummary.revisionCount}</span>
            <Badge tone="info">调整</Badge>
          </div>
        </Card>
      </div>

      <div>
        {activePlan ? (
          <Card key={activePlan.id} className="!p-0 overflow-hidden">
            <div className="px-5 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="default">{activePlan.ownerType === "DEPARTMENT" ? "部门" : "小组"}</Badge>
                  <span className="text-xs text-muted-foreground">{activePlan.ownerName}</span>
                  <Badge tone={activePlan.approvalStatus === "APPROVED" ? "success" : "primary"}>
                    {activePlan.approvalStatus === "APPROVED" ? "已生效" : "草稿/执行中"}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="w-3 h-3" />{activePlan.version}
                    {activePlan.isActive && <span className="ml-1 px-1.5 py-0.5 rounded bg-success/10 text-success text-[10px]">当前生效</span>}
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-semibold">{activePlan.name}</h3>
                {activePlan.description && <p className="mt-1 text-xs text-muted-foreground">{activePlan.description}</p>}
                {activePlan.revisionReason && (
                  <div className="mt-2 inline-flex items-start gap-2 text-xs bg-info/10 text-info px-2.5 py-1.5 rounded-md">
                    <History className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>年中调整：{activePlan.revisionReason}</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">完成度</div>
                <div className="text-2xl font-bold tabular-nums text-primary">{formatPercent(activePlan.weightedProgress)}%</div>
                {activePlan.permissions.canEditPlan && (
                  <div className="mt-2 flex justify-end gap-3">
                    <button onClick={() => setPlanDialog(activePlan)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Edit className="w-3 h-3" />编辑方案
                    </button>
                    {activePlan.permissions.canArchivePlan && (
                      <button onClick={() => setArchivePlan(activePlan)} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
                        <Trash2 className="w-3 h-3" />归档
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <PlanDetailTabs
              plan={activePlan}
              onCreateMetric={() => setMetricDialog({ plan: activePlan })}
              onEditMetric={(metric) => setMetricDialog({ plan: activePlan, metric })}
              onSourceMetric={(parentMetric, sourceMetric) => setSourceMetricDialog({ parentMetric, sourceMetric })}
              onCreateSourceMetric={() => setSourceMetricChooserPlan(activePlan)}
              onDeleteMetric={setDeleteMetric}
              onDeleteSourceMetric={(metric, sourceMetric) => setDeleteSourceMetric({ metric, sourceMetric })}
              onQuarterTarget={(metric, sourceMetric) => setQuarterTargetDialog({ metric, sourceMetric })}
              onDeleteQuarterTargets={(metric, sourceMetric) => setDeleteQuarterTargets({ metric, sourceMetric })}
              onQuarterProgress={(metric, sourceMetric) => setQuarterProgressDialog({ metric, sourceMetric })}
              onWeeklyProgress={() => setWeeklyProgressPlan(activePlan)}
              onChooseQuarterTarget={() => setQuarterChooserPlan(activePlan)}
            />
          </Card>
        ) : (
          <Card>
            <div className="py-12 text-center text-sm text-muted-foreground">暂无年度指标方案</div>
          </Card>
        )}
      </div>

      <Dialog open={!!planDialog} onClose={() => setPlanDialog(null)} title={planDialog === "new" ? "新建年度方案" : "编辑年度方案"}>
        {planDialog && <PlanForm plan={planDialog === "new" ? undefined : planDialog} data={data} onClose={() => setPlanDialog(null)} />}
      </Dialog>
      <Dialog open={!!metricDialog} onClose={() => setMetricDialog(null)} title={metricDialog?.metric ? "调整指标" : metricDialog?.plan.ownerType === "TEAM" ? "选择指标" : "新增部门指标"}>
        {metricDialog && <MetricForm plan={metricDialog.plan} metric={metricDialog.metric} data={data} onClose={() => setMetricDialog(null)} />}
      </Dialog>
      <Dialog open={!!sourceMetricDialog} onClose={() => setSourceMetricDialog(null)} title={sourceMetricDialog?.sourceMetric ? "调整元指标" : "拆解元指标"}>
        {sourceMetricDialog && <SourceMetricForm parentMetric={sourceMetricDialog.parentMetric} sourceMetric={sourceMetricDialog.sourceMetric} data={data} onClose={() => setSourceMetricDialog(null)} />}
      </Dialog>
      <Dialog open={!!sourceMetricChooserPlan} onClose={() => setSourceMetricChooserPlan(null)} title="拆解元指标">
        {sourceMetricChooserPlan && (
          <SourceMetricChooser
            plan={sourceMetricChooserPlan}
            onClose={() => setSourceMetricChooserPlan(null)}
            onSelect={(metric) => {
              setSourceMetricChooserPlan(null);
              setSourceMetricDialog({ parentMetric: metric });
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!quarterChooserPlan} onClose={() => setQuarterChooserPlan(null)} title="选择拆解对象">
        {quarterChooserPlan && <QuarterTargetChooser plan={quarterChooserPlan} onClose={() => setQuarterChooserPlan(null)} onSelect={(metric, sourceMetric) => { setQuarterChooserPlan(null); setQuarterTargetDialog({ metric, sourceMetric }); }} />}
      </Dialog>
      <Dialog open={!!quarterTargetDialog} onClose={() => setQuarterTargetDialog(null)} title="调整季度指标">
        {quarterTargetDialog && <QuarterTargetForm metric={quarterTargetDialog.metric} sourceMetric={quarterTargetDialog.sourceMetric} onClose={() => setQuarterTargetDialog(null)} />}
      </Dialog>
      <Dialog open={!!quarterProgressDialog} onClose={() => setQuarterProgressDialog(null)} title="更新季度指标">
        {quarterProgressDialog && <QuarterProgressUpdateForm metric={quarterProgressDialog.metric} sourceMetric={quarterProgressDialog.sourceMetric} onClose={() => setQuarterProgressDialog(null)} />}
      </Dialog>
      <Dialog open={!!weeklyProgressPlan} onClose={() => setWeeklyProgressPlan(null)} title="周更新">
        {weeklyProgressPlan && <QuarterWeeklyUpdateForm plan={weeklyProgressPlan} onClose={() => setWeeklyProgressPlan(null)} />}
      </Dialog>
      <Dialog open={!!deleteMetric} onClose={() => setDeleteMetric(null)} title="删除指标项">
        {deleteMetric && <DeleteMetricConfirm metric={deleteMetric} onClose={() => setDeleteMetric(null)} />}
      </Dialog>
      <Dialog open={!!deleteSourceMetric} onClose={() => setDeleteSourceMetric(null)} title="删除元指标">
        {deleteSourceMetric && <DeleteSourceMetricConfirm sourceMetric={deleteSourceMetric.sourceMetric} onClose={() => setDeleteSourceMetric(null)} />}
      </Dialog>
      <Dialog open={!!deleteQuarterTargets} onClose={() => setDeleteQuarterTargets(null)} title="删除季度指标">
        {deleteQuarterTargets && <DeleteQuarterTargetsConfirm metric={deleteQuarterTargets.metric} sourceMetric={deleteQuarterTargets.sourceMetric} onClose={() => setDeleteQuarterTargets(null)} />}
      </Dialog>
      <Dialog open={showHistory} onClose={() => setShowHistory(false)} title="年度指标历史记录">
        <div className="space-y-3">
          {data.archivedPlans.map((p) => (
            <div key={p.id} className="rounded-xl border border-border p-4 flex items-start justify-between gap-4">
              <button type="button" onClick={() => setHistoryDetail(p)} className="flex-1 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="default">{p.ownerType === "DEPARTMENT" ? "部门" : "小组"}</Badge>
                  <span className="text-xs text-muted-foreground">{p.ownerName}</span>
                  <Badge tone="info">历史记录</Badge>
                  <span className="text-xs text-muted-foreground">{p.version}</span>
                </div>
                <div className="mt-1.5 font-semibold hover:text-primary">{p.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.year} 年 · 权重合计 {formatPercent(p.totalWeight)}% · 共 {p.metrics.length} 项 · 完成度 {formatPercent(p.weightedProgress)}%
                </div>
                {p.deletedAt && <div className="mt-1 text-xs text-muted-foreground">归档时间：{new Date(p.deletedAt).toLocaleString("zh-CN")}</div>}
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setHistoryDetail(p)} className="text-xs text-primary hover:underline">查看详情</button>
                {data.permissions.canRestorePlan && <RestorePlanButton plan={p} />}
              </div>
            </div>
          ))}
          {data.archivedPlans.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">暂无历史记录</div>}
        </div>
      </Dialog>
      <Dialog open={!!archivePlan} onClose={() => setArchivePlan(null)} title="归档年度方案">
        {archivePlan && <ArchivePlanConfirm plan={archivePlan} onClose={() => setArchivePlan(null)} />}
      </Dialog>
      <Dialog open={!!historyDetail} onClose={() => setHistoryDetail(null)} title="历史方案详情">
        {historyDetail && <HistoryPlanDetail plan={historyDetail} />}
      </Dialog>
    </>
  );
}

