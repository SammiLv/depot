"use client";

import { Button } from "@/components/ui-kit";
import { createTalentHistoryRecord } from "@/server/talent/history-actions";
import { companyCoinAwardAmounts, companyCoinAwardBaseAmounts, isControlledCompanyCoinAward, rewardCycleLabels, rewardFormLabels, rewardLevelLabels, rewardRecipientLabels, type RewardCycle, type RewardForm, type RewardLevel, type RewardRecipient } from "@/server/talent/reward-types";
import { useEffect, useRef, useState } from "react";

type HistoryType = "PROMOTION" | "CONTRACT_RENEWAL" | "SALARY_ADJUSTMENT" | "REWARD";
type HistorySource = "MANUAL_ENTRY" | "COMPANY_SYSTEM" | "RECOMMENDATION";
type HistoryUser = { id: string; name: string; currentJobLevelCode: string };
type Recommendation = { id: string; recommendationNo: string; userId: string; decisionType: string };

type HistoryRecordFormProps = {
  users: HistoryUser[];
  recommendations: Recommendation[];
  levels: Array<{ id: string; code: string }>;
};

type CommonReward = {
  level: RewardLevel;
  form: RewardForm;
  recipient: RewardRecipient;
  cycle: RewardCycle;
  name: string;
  periodYear: number;
  periodQuarter: number;
  periodMonthValue: string;
};

const inputClass = "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm";
const typeLabels: Record<HistoryType, string> = { PROMOTION: "晋升", SALARY_ADJUSTMENT: "加薪", CONTRACT_RENEWAL: "续签", REWARD: "奖励" };
const fieldName = (userId: string, key: string) => `${key}:${userId}`;
const awardNames = Object.keys(companyCoinAwardBaseAmounts);

function getCurrentPeriodDefaults() {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { year, quarter, month };
}

export function HistoryRecordForm({ users, recommendations, levels }: HistoryRecordFormProps) {
  const [decisionType, setDecisionType] = useState<HistoryType>("PROMOTION");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(users[0]?.id ? [users[0].id] : []);
  const [sourceType, setSourceType] = useState<HistorySource>("MANUAL_ENTRY");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedUsers = users.filter((row) => selectedUserIds.includes(row.id));
  const periodDefaults = getCurrentPeriodDefaults();
  const [commonReward, setCommonReward] = useState<CommonReward>({
    level: "COMPANY",
    form: "COIN",
    recipient: "INDIVIDUAL",
    cycle: "QUARTERLY",
    name: awardNames[0] ?? "",
    periodYear: periodDefaults.year,
    periodQuarter: periodDefaults.quarter,
    periodMonthValue: periodDefaults.month,
  });

  useEffect(() => {
    if (!pickerOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  function toggleUser(userId: string) {
    setSelectedUserIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  return <form action={createTalentHistoryRecord} className="space-y-4">
    <div className="rounded-xl border border-border" role="table" aria-label="批量履历登记范围">
      <div className="hidden grid-cols-[minmax(140px,.8fr)_minmax(260px,1.4fr)_minmax(150px,.8fr)_minmax(160px,.8fr)] gap-3 rounded-t-xl bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground md:grid" role="row">
        <div>履历类型</div><div>员工（可多选）</div><div>生效日期</div><div>数据来源</div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-[minmax(140px,.8fr)_minmax(260px,1.4fr)_minmax(150px,.8fr)_minmax(160px,.8fr)] md:items-end" role="row">
        <HistoryField label="履历类型"><select name="decisionType" value={decisionType} onChange={(event) => setDecisionType(event.target.value as HistoryType)} className={inputClass}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></HistoryField>
        <HistoryField label="员工（可多选）">
          <div ref={pickerRef} className="relative">
            <button type="button" aria-label="选择员工" aria-expanded={pickerOpen} onClick={() => setPickerOpen((open) => !open)} className={`${inputClass} flex items-center justify-between text-left`}><span>{selectedUserIds.length ? `已选择 ${selectedUserIds.length} 位员工` : "请选择员工"}</span><span aria-hidden>⌄</span></button>
            {pickerOpen ? <div className="absolute left-0 right-0 top-10 z-30 max-h-64 overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-border px-2 pb-2 text-xs"><button type="button" className="text-primary" onClick={() => setSelectedUserIds(users.map((row) => row.id))}>全选</button><button type="button" className="text-muted-foreground" onClick={() => setSelectedUserIds([])}>清空</button></div>
              {users.map((row) => <label key={row.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/50"><input type="checkbox" checked={selectedUserIds.includes(row.id)} onChange={() => toggleUser(row.id)}/><span>{row.name}</span><span className="ml-auto text-xs text-muted-foreground">{row.currentJobLevelCode}</span></label>)}
            </div> : null}
          </div>
        </HistoryField>
        <HistoryField label="生效日期"><input name="effectiveDate" type="date" required className={inputClass}/></HistoryField>
        <HistoryField label="数据来源"><select name="sourceType" value={sourceType} onChange={(event) => setSourceType(event.target.value as HistorySource)} className={inputClass}><option value="MANUAL_ENTRY">手工登记</option><option value="COMPANY_SYSTEM">公司系统</option><option value="RECOMMENDATION">人才决策建议</option></select></HistoryField>
      </div>
    </div>

    {selectedUserIds.map((userId) => <input key={userId} type="hidden" name="selectedUserIds" value={userId}/>)}

    {decisionType === "REWARD" && selectedUsers.length > 0 ? <CommonRewardFields value={commonReward} onChange={setCommonReward}/> : null}

    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{typeLabels[decisionType]}信息 · {selectedUsers.length} 人</h4><span className="text-xs text-muted-foreground">每位员工生成独立记录编号；一次提交整批保存</span></div>
      {!selectedUsers.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">请先选择至少一位员工</div> : <BatchHistoryTable decisionType={decisionType} users={selectedUsers} recommendations={recommendations} levels={levels} sourceType={sourceType} commonReward={commonReward}/>}
    </div>
    <Button type="submit" disabled={!selectedUsers.length} className="h-9 w-full rounded-lg text-sm font-semibold">批量保存 {selectedUsers.length} 条{typeLabels[decisionType]}履历</Button>
  </form>;
}

function BatchHistoryTable({ decisionType, users, recommendations, levels, sourceType, commonReward }: { decisionType: HistoryType; users: HistoryUser[]; recommendations: Recommendation[]; levels: Array<{ id: string; code: string }>; sourceType: HistorySource; commonReward: CommonReward }) {
  const configs = {
    PROMOTION: { columns: "md:grid-cols-[.9fr_1fr_1fr_.8fr_1fr_1.2fr_1.3fr]", headers: ["员工", "当前职级", "目标职级", "晋升结果", "晋升类型", "关联人才建议", "公司流程号 / 原因"] },
    SALARY_ADJUSTMENT: { columns: "md:grid-cols-[1fr_1.1fr_1.1fr_1.4fr_1.2fr]", headers: ["员工", "加薪后薪资", "关联人才建议", "公司流程号", "加薪原因"] },
    CONTRACT_RENEWAL: { columns: "md:grid-cols-[1fr_1fr_.7fr_1fr_1.2fr_1.1fr]", headers: ["员工", "新聘期结束日期", "聘期期数", "续签结果", "关联人才建议", "公司流程号"] },
    REWARD: { columns: "md:grid-cols-[1fr_.8fr_1fr_1.2fr]", headers: ["员工", "奖励金额（元）", "关联人才建议", "公司流程号 / 说明"] },
  } as const;
  const config = configs[decisionType];

  return <div className="overflow-hidden rounded-xl border border-border" role="table" aria-label={`${typeLabels[decisionType]}批量登记明细`}>
    <div className={`hidden gap-2 bg-muted/40 px-3 py-3 text-xs font-medium text-muted-foreground md:grid ${config.columns}`} role="row">{config.headers.map((header) => <div key={header}>{header}</div>)}</div>
    {users.map((user, index) => {
      const availableRecommendations = recommendations.filter((row) => row.userId === user.id && (decisionType === "REWARD" ? ["REWARD", "QUARTERLY_REWARD", "ANNUAL_REWARD"].includes(row.decisionType) : row.decisionType === decisionType));
      const recommendation = <select name={fieldName(user.id, "recommendationId")} required={sourceType === "RECOMMENDATION"} className={inputClass} defaultValue=""><option value="">{availableRecommendations.length ? "不关联建议" : "暂无匹配建议"}</option>{availableRecommendations.map((row) => <option key={row.id} value={row.id}>{row.recommendationNo}</option>)}</select>;
      return <div key={`${decisionType}-${user.id}`} className={`grid gap-2 border-t border-border p-3 first:border-t-0 md:items-end ${config.columns}`} role="row">
        <HistoryField label="员工"><div className="text-sm font-medium"><span className="mr-1 text-xs text-muted-foreground">{index + 1}.</span>{user.name}<div className="mt-0.5 text-xs font-normal text-muted-foreground">当前职级：{user.currentJobLevelCode}</div></div></HistoryField>
        {decisionType === "CONTRACT_RENEWAL" ? <RenewalFields user={user} recommendation={recommendation}/> : null}
        {decisionType === "PROMOTION" ? <PromotionFields user={user} recommendation={recommendation} levels={levels}/> : null}
        {decisionType === "SALARY_ADJUSTMENT" ? <SalaryFields user={user} recommendation={recommendation}/> : null}
        {decisionType === "REWARD" ? <RewardFields user={user} recommendation={recommendation} commonReward={commonReward}/> : null}
      </div>;
    })}
  </div>;
}

function PromotionFields({ user, recommendation, levels }: { user: HistoryUser; recommendation: React.ReactNode; levels: Array<{ id: string; code: string }> }) {
  return <>
    <HistoryField label="当前职级"><div className={`${inputClass} flex items-center bg-muted/40 text-muted-foreground`}>{user.currentJobLevelCode}</div></HistoryField>
    <HistoryField label="目标职级"><select name={fieldName(user.id, "toJobLevelId")} required className={inputClass} defaultValue=""><option value="" disabled>请选择</option>{levels.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select></HistoryField>
    <HistoryField label="晋升结果"><select name={fieldName(user.id, "promotionOutcome")} required className={inputClass}><option value="SUCCESS">晋升成功</option><option value="REJECTED">申请驳回</option><option value="FAILED">晋升失败</option></select></HistoryField>
    <HistoryField label="晋升类型"><input name={fieldName(user.id, "promotionType")} placeholder="常规/破格" className={inputClass}/></HistoryField>
    <HistoryField label="关联人才建议">{recommendation}</HistoryField>
    <HistoryField label="公司流程号 / 原因"><div className="grid gap-2"><input name={fieldName(user.id, "externalProcessNo")} placeholder="流程号" className={inputClass}/><input name={fieldName(user.id, "reason")} placeholder="晋升原因" className={inputClass}/></div></HistoryField>
  </>;
}

function SalaryFields({ user, recommendation }: { user: HistoryUser; recommendation: React.ReactNode }) {
  return <>
    <HistoryField label="加薪后薪资"><input name={fieldName(user.id, "afterSalary")} type="number" min="0" step="1" required placeholder="月薪" className={inputClass}/></HistoryField>
    <HistoryField label="关联人才建议">{recommendation}</HistoryField>
    <HistoryField label="公司流程号"><input name={fieldName(user.id, "externalProcessNo")} placeholder="流程号" className={inputClass}/></HistoryField>
    <HistoryField label="加薪原因"><input name={fieldName(user.id, "reason")} placeholder="填写加薪依据" className={inputClass}/></HistoryField>
  </>;
}

function RenewalFields({ user, recommendation }: { user: HistoryUser; recommendation: React.ReactNode }) {
  return <>
    <HistoryField label="新聘期结束日期"><input name={fieldName(user.id, "endDate")} type="date" required className={inputClass}/></HistoryField>
    <HistoryField label="聘期期数"><input name={fieldName(user.id, "renewalSequence")} type="number" min="1" step="1" required defaultValue="1" className={inputClass}/></HistoryField>
    <HistoryField label="续签结果"><select name={fieldName(user.id, "outcome")} required className={inputClass}><option value="RENEWED">已续签</option><option value="NOT_RENEWED">不续签</option><option value="EXTENDED">延期</option><option value="TERMINATED">终止</option></select></HistoryField>
    <HistoryField label="关联人才建议">{recommendation}</HistoryField>
    <HistoryField label="公司流程号"><input name={fieldName(user.id, "externalProcessNo")} placeholder="流程号" className={inputClass}/></HistoryField>
  </>;
}

function CommonRewardFields({ value, onChange }: { value: CommonReward; onChange: (value: CommonReward) => void }) {
  const years = Array.from({ length: 11 }, (_, index) => getCurrentPeriodDefaults().year - 5 + index);
  const controlled = isControlledCompanyCoinAward(value.level, value.form, value.cycle);

  function update(partial: Partial<CommonReward>) {
    onChange({ ...value, ...partial });
  }

  return <div className="rounded-xl border border-border p-4">
    <div className="mb-3 text-sm font-medium">公共奖励信息</div>
    <div className="grid gap-3 md:grid-cols-[repeat(6,minmax(0,1fr))]">
      <HistoryField label="奖励层级"><select name="rewardLevel" required value={value.level} onChange={(event) => update({ level: event.target.value as RewardLevel })} className={inputClass}>{Object.entries(rewardLevelLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></HistoryField>
      <HistoryField label="奖励形式"><select name="rewardForm" required value={value.form} onChange={(event) => update({ form: event.target.value as RewardForm })} className={inputClass}>{Object.entries(rewardFormLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></HistoryField>
      <HistoryField label="奖励对象"><select name="rewardRecipient" required value={value.recipient} onChange={(event) => update({ recipient: event.target.value as RewardRecipient })} className={inputClass}>{Object.entries(rewardRecipientLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></HistoryField>
      <HistoryField label="奖励周期"><select name="rewardCycle" required value={value.cycle} onChange={(event) => update({ cycle: event.target.value as RewardCycle })} className={inputClass}>{Object.entries(rewardCycleLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></HistoryField>
      <HistoryField label="奖励期间">
        {value.cycle === "MONTHLY" || value.cycle === "OTHER" ? <input name="rewardPeriodMonthValue" type="month" required value={value.periodMonthValue} onChange={(event) => update({ periodMonthValue: event.target.value })} className={inputClass}/> : null}
        {value.cycle === "QUARTERLY" ? <div className="grid grid-cols-2 gap-1"><select name="rewardPeriodYear" required value={value.periodYear} onChange={(event) => update({ periodYear: Number(event.target.value) })} className={inputClass}>{years.map((year) => <option key={year} value={year}>{year}年</option>)}</select><select name="rewardPeriodQuarter" required value={value.periodQuarter} onChange={(event) => update({ periodQuarter: Number(event.target.value) })} className={inputClass}>{[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}</select></div> : null}
        {value.cycle === "ANNUAL" ? <select name="rewardPeriodYear" required value={value.periodYear} onChange={(event) => update({ periodYear: Number(event.target.value) })} className={inputClass}>{years.map((year) => <option key={year} value={year}>{year}年</option>)}</select> : null}
      </HistoryField>
      <HistoryField label="奖励名称">{controlled ? <select name="rewardName" required value={value.name} onChange={(event) => update({ name: event.target.value })} className={inputClass}>{awardNames.map((name) => <option key={name} value={name}>{name}</option>)}</select> : <input name="rewardName" required value={value.name} onChange={(event) => update({ name: event.target.value })} placeholder="奖励名称" className={inputClass}/>}</HistoryField>
    </div>
  </div>;
}

function RewardFields({ user, recommendation, commonReward }: { user: HistoryUser; recommendation: React.ReactNode; commonReward: CommonReward }) {
  const controlled = isControlledCompanyCoinAward(commonReward.level, commonReward.form, commonReward.cycle);
  const defaultAmount = controlled ? companyCoinAwardAmounts(commonReward.name, commonReward.cycle)[0] : undefined;
  const amountKey = `${commonReward.level}-${commonReward.form}-${commonReward.cycle}-${commonReward.name}-${user.id}`;

  return <>
    <HistoryField label="奖励金额（元）"><input key={amountKey} name={fieldName(user.id, "rewardAmount")} type="number" min="1" step="1" required defaultValue={defaultAmount} placeholder="金额" className={inputClass}/></HistoryField>
    <HistoryField label="关联人才建议">{recommendation}</HistoryField>
    <HistoryField label="公司流程号 / 说明"><div className="grid gap-2"><input name={fieldName(user.id, "externalProcessNo")} placeholder="流程号" className={inputClass}/><input name={fieldName(user.id, "reason")} placeholder="奖励说明" className={inputClass}/></div></HistoryField>
  </>;
}

function HistoryField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0"><span className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">{label}</span>{children}</label>;
}
