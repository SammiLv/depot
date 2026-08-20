"use client";

import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { avatarColor } from "@/lib/avatar-color";
import {
  addTalentGradeThresholds,
  addTalentRatingOptions,
  addTalentReviewDimensions,
  calibrateTalentReviewResult,
  cloneTalentReviewTemplateVersion,
  confirmTalentReviewCycle,
  createTalentReviewCycleWithState,
  createTalentReviewTemplate,
  deleteTalentReviewCycle,
  deleteTalentReviewRule,
  initializeDefaultTalentReviewTemplate,
  publishTalentReviewTemplateWithState,
  saveTalentReviewEvaluation,
  saveDefaultTalentNineBoxRules,
  updateTalentReviewTemplate,
  updateTalentReviewDimension,
  updateTalentAbilityCalculationWeights,
} from "@/server/talent/review-actions";
import { DeleteDraftTemplateDialog } from "./config/reviews/delete-draft-template-dialog";
import type { ReviewCycleDetail, ReviewWorkspaceData } from "./review-workspace-types";
import type { AssessmentWorkspaceData, TalentDecisionRuleWorkspaceData, TalentOperationWorkspaceData } from "./operation-workspace-types";
import type { CareerWorkspaceData, CompetencyWorkspaceData } from "./operation-workspace-types";
import {
  categoryLabels,
  conditionSummary,
  outputSummary,
  outputTypeLabels,
  revisionStatusLabels,
  ruleStatusLabels,
  sourceLabels,
} from "./config/decision-rules/presentation";
import {
  createBusinessAssessmentRuleVersion,
  deleteBusinessAssessmentRuleVersion,
  publishBusinessAssessmentRuleVersion,
  saveBusinessAssessmentRuleVersion,
  type BusinessAssessmentRuleActionState,
} from "@/server/talent/assessment-actions";
import {
  addCompetencyPackageItem,
  addCompetencyPackageToModel,
  addJobLevelRequirement,
  createCompetencyItem,
  createCompetencyModel,
  createCompetencyPackage,
  publishCompetencyModel,
  saveCareerRoleStructure,
  saveJobLevelStructure,
  type CareerRoleStructureActionState,
  type JobLevelStructureActionState,
} from "@/server/talent/config-actions";
import {
  createDefaultKpiRatingRule,
  cloneWorkIncidentRuleVersion,
  createWorkIncidentRuleVersion,
  publishKpiRatingRule,
  publishWorkIncidentRuleVersion,
  saveKpiRatingBand,
  type TalentRuleActionState,
} from "@/server/talent/decision-rule-actions";
import {
  deleteTalentRestrictionRule,
  deleteTalentRestrictionRuleDraft,
  disableTalentRestrictionRule,
  publishTalentRestrictionRuleDraft,
  saveTalentRestrictionRuleDraft,
  type RestrictionRuleDraftActionState,
} from "@/server/talent/restriction-rule-actions";
import {
  TalentDecisionWorkspace,
  TalentHistoryWorkspace,
} from "./operation-workspaces";
import {
  AlertCircle,
  ArrowRight,
  Award,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Database,
  FileText,
  Filter,
  History,
  Medal,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Route,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "brand";
type Tab = "overview" | "review" | "ability" | "decision";
type Section = "overview" | "review" | "decision" | "history" | "config";

type ConfigKey = "review" | "career" | "competency" | "salary" | "assessment" | "incident" | "kpi-rating" | "decision-rules";

type ProfileExtras = {
  yearsOfService: number;
  contractEndAt: string | null;
  latestIncidentLevel: string | null;
  hasTwoCReviews: boolean;
  hasConsecutiveTwoCReviews: boolean;
  isLatestReviewC: boolean;
  hasPromotionInCurrentContract: boolean;
  kpiHistory: { period: string; score: number; rating: string | null }[];
  reviewHistory: { period: string; score: number; grade: string | null }[];
  abilityMatchScore: number | null;
  kpiTotalScore: number;
  reviewTotalScore: number;
  kpiWeight: number;
  reviewWeight: number;
};

type Person = {
  id: number | string;
  name: string;
  team: string;
  title: string;
  level: string;
  years: number;
  grid: string;
  tone: Tone;
  score: number;
  kpi: number;
  hasKpi: boolean;
  kpiRating: string | null;
  potential: number;
  reviewLevel: string;
  assessment: number;
  assessmentMax: number;
  hasAssessment: boolean;
  nextLevel: string;
  recommendation: string;
  contract: string;
  gridCode?: string;
  profileExtras?: ProfileExtras;
};

const people: Person[] = [
  { id: 1, name: "周明轩", team: "B端组", title: "高级产品经理", level: "R3-2", years: 4, grid: "高潜高绩", tone: "success", score: 27, kpi: 103, hasKpi: true, kpiRating: "A", potential: 92, reviewLevel: "S", assessment: 6, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-3", recommendation: "建议晋升", contract: "2027-06-30" },
  { id: 2, name: "吴雨桐", team: "C端组", title: "产品经理", level: "R2", years: 2, grid: "潜力新星", tone: "primary", score: 23, kpi: 91, hasKpi: true, kpiRating: "B", potential: 94, reviewLevel: "A", assessment: 5, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-1", recommendation: "重点培养", contract: "2026-11-30" },
  { id: 3, name: "郑雅琪", team: "设计组", title: "高级设计师", level: "R3-1", years: 5, grid: "高潜高绩", tone: "success", score: 26, kpi: 106, hasKpi: true, kpiRating: "S", potential: 90, reviewLevel: "S", assessment: 6, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-2", recommendation: "建议加薪", contract: "2028-03-31" },
  { id: 4, name: "孙宇航", team: "采购组", title: "采购经理", level: "R3-1", years: 6, grid: "中坚力量", tone: "info", score: 20, kpi: 88, hasKpi: true, kpiRating: "C", potential: 74, reviewLevel: "A", assessment: 4, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-2", recommendation: "保持观察", contract: "2026-10-15" },
  { id: 5, name: "王梓涵", team: "B端组", title: "产品组长", level: "R4-1", years: 7, grid: "核心骨干", tone: "brand", score: 25, kpi: 101, hasKpi: true, kpiRating: "A", potential: 86, reviewLevel: "S", assessment: 6, assessmentMax: 6, hasAssessment: true, nextLevel: "R4-2", recommendation: "建议奖励", contract: "2027-12-31" },
  { id: 6, name: "李隽贤", team: "C端组", title: "产品经理", level: "R2", years: 3, grid: "中坚力量", tone: "info", score: 19, kpi: 84, hasKpi: true, kpiRating: "C", potential: 78, reviewLevel: "A", assessment: 3, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-1", recommendation: "补足能力项", contract: "2027-04-30" },
  { id: 7, name: "何晓斌", team: "B端组", title: "项目经理", level: "R2", years: 3, grid: "待发展", tone: "default", score: 14, kpi: 76, hasKpi: true, kpiRating: "C", potential: 68, reviewLevel: "B", assessment: 2, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-1", recommendation: "制定改进计划", contract: "2026-09-30" },
  { id: 8, name: "孙圣宇", team: "设计组", title: "UI设计师", level: "R3-1", years: 3, grid: "明星员工", tone: "success", score: 24, kpi: 99, hasKpi: true, kpiRating: "B", potential: 82, reviewLevel: "A", assessment: 6, assessmentMax: 6, hasAssessment: true, nextLevel: "R3-2", recommendation: "建议奖励", contract: "2027-08-31" },
];

const overviewNineBoxLayout = [
  { code: "HIGH_LOW", defaultLabel: "熟练员工", tone: "primary" }, { code: "HIGH_MID", defaultLabel: "绩效之星", tone: "brand" }, { code: "HIGH_HIGH", defaultLabel: "超级明星", tone: "success" },
  { code: "MID_LOW", defaultLabel: "基本胜任", tone: "default" }, { code: "MID_MID", defaultLabel: "中坚力量", tone: "primary" }, { code: "MID_HIGH", defaultLabel: "潜力之星", tone: "brand" },
  { code: "LOW_LOW", defaultLabel: "问题员工", tone: "light" }, { code: "LOW_MID", defaultLabel: "差距员工", tone: "default" }, { code: "LOW_HIGH", defaultLabel: "待发展者", tone: "primary" },
] as const;
const legacyGridCodeByLabel: Record<string, string> = { 潜力新星: "LOW_HIGH", 高潜中绩: "MID_HIGH", 高潜高绩: "HIGH_HIGH", 待发展: "LOW_MID", 中坚力量: "MID_MID", 核心骨干: "HIGH_MID", 观察: "LOW_LOW", 稳定贡献: "MID_LOW", 明星员工: "HIGH_LOW", 熟练员工: "HIGH_LOW", 绩效之星: "HIGH_MID", 超级明星: "HIGH_HIGH", 基本胜任: "MID_LOW", 潜力之星: "MID_HIGH", 问题员工: "LOW_LOW", 差距员工: "LOW_MID", 待发展者: "LOW_HIGH" };

function resolveKpiRatingName(score: number, bands: Array<{ name: string; minScore: number; maxScore: number | null; isUnbounded: boolean }>): string | null {
  const ordered = [...bands].sort((left, right) => right.minScore - left.minScore);
  const band = ordered.find((band) => score >= band.minScore && (band.isUnbounded || (band.maxScore != null && score <= band.maxScore)));
  return band?.name ?? null;
}

const dimensions = [
  { label: "忠诚度", value: "S", score: 5 },
  { label: "工作态度", value: "A", score: 4 },
  { label: "匹配度", value: "S", score: 5 },
  { label: "成长性", value: "A", score: 4 },
  { label: "能力度", value: "A", score: 4 },
  { label: "产出度", value: "S", score: 5 },
];

const decisions = [
  { date: "2026-07-18", type: "奖励", title: "2026年Q2季度奖励", detail: "部门建议已采纳 · 卓越贡献奖 · ¥3,000", icon: Medal, tone: "bg-amber-50 text-amber-600" },
  { date: "2026-04-01", type: "加薪", title: "年度薪资调整", detail: "部门建议已采纳 · 调整幅度 8% · 已生效", icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-600" },
  { date: "2025-11-01", type: "晋升", title: "R3-1 晋升至 R3-2", detail: "公司流程已完成 · 生效日期 2025-11-01", icon: TrendingUp, tone: "bg-blue-50 text-blue-600" },
  { date: "2025-06-30", type: "续签", title: "劳动合同续签", detail: "续签 2 年 · 至 2027-06-30", icon: FileText, tone: "bg-violet-50 text-violet-600" },
];

const actionButtonClass = "h-9 rounded-lg px-4 text-sm font-semibold whitespace-nowrap";
const rowIconButtonClass = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30";
const outlineActionLinkClass = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted";
const primaryActionLinkClass = "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90";

function scoreTone(score: number) {
  if (score >= 100) return "text-emerald-600 bg-emerald-50";
  if (score >= 85) return "text-blue-600 bg-blue-50";
  return "text-amber-600 bg-amber-50";
}

export default function TalentPageContent({
  reviewWorkspace,
  operationWorkspace,
  latestKpiByUserId,
  latestAssessmentByUserId,
  statCards,
  profileExtrasByUserId,
}: {
  reviewWorkspace: ReviewWorkspaceData;
  operationWorkspace: TalentOperationWorkspaceData;
  latestKpiByUserId: Record<string, { userId: string; year: number; quarter: number; finalScore: number | null; finalRatingName: string | null }>;
  latestAssessmentByUserId: Record<string, { userId: string; cycleId: string; earnedScore: number; maxScore: number; isOverallPassed: boolean; cycle: { year: number; quarter: number } | null }>;
  statCards: {
    contractsExpiringSoon: number;
    contractsExpiringSoonNames: string[];
    recentPromotions: number;
    recentPromotionHalfYear: "first" | "second";
    recentPromotionNames: string[];
    lowPromotionOpportunityCount: number;
    lowPromotionOpportunityNames: string[];
    currentQuarterRewards: number;
    currentQuarterRewardNames: string[];
  };
  profileExtrasByUserId: Record<string, ProfileExtras>;
}) {
  const [gridFilter, setGridFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("全部团队");
  const [selected, setSelected] = useState<Person | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<Section>("overview");
  const [historyInitialCategory, setHistoryInitialCategory] = useState<"profiles" | "promotion" | "contract" | "salary" | "reward">("profiles");
  const [activeConfig, setActiveConfig] = useState<ConfigKey | null>(null);
  const overviewCycle = reviewWorkspace.cycles.cycles[0];
  const overviewDetail = reviewWorkspace.details.find((item) => item.cycleId === overviewCycle?.id);
  const overviewTemplateId = overviewCycle?.templateVersionId ?? reviewWorkspace.config.templates.find((item) => item.status === "ACTIVE")?.id;
  const configuredNineBoxRules = overviewDetail?.nineBoxRules ?? reviewWorkspace.config.nineBoxRules.filter((item) => item.templateVersionId === overviewTemplateId);
  const configuredNineBoxByCode = new Map(configuredNineBoxRules.map((item) => [item.code, item]));
  const overviewGrids = overviewNineBoxLayout.map((item) => ({ ...item, label: configuredNineBoxByCode.get(item.code)?.label ?? item.defaultLabel }));
  const overviewLabelByCode = new Map<string, string>(overviewGrids.map((item) => [item.code, item.label]));
  const overviewTitle = overviewCycle?.name ?? `${new Date().getFullYear()}年${new Date().getMonth() < 6 ? "上半年" : "下半年"}人才盘点`;
  const overviewResultByParticipant = new Map(overviewDetail?.results.map((item) => [item.participantId, item]) ?? []);
  const overviewUserById = new Map(overviewDetail?.users.map((item) => [item.id, item]) ?? []);
  const overviewCandidateById = new Map(reviewWorkspace.cycles.candidates.map((item) => [item.id, item]));
  const employeeProfileByUserId = new Map(operationWorkspace.employeeProfiles.employees.map((item) => [item.id, item]));
  const jobLevelById = new Map(operationWorkspace.employeeProfiles.levels.map((item) => [item.id, item]));
  const overviewPeople: Person[] = overviewDetail ? overviewDetail.participants.map((participant) => {
    const user = overviewUserById.get(participant.userId);
    const result = overviewResultByParticipant.get(participant.id);
    const candidate = overviewCandidateById.get(participant.userId);
    const fallback = people.find((item) => item.name === user?.name);
    const employeeProfile = employeeProfileByUserId.get(participant.userId);
    const jobLevel = employeeProfile?.jobLevelId ? jobLevelById.get(employeeProfile.jobLevelId) : null;
    const gridCode = result?.nineBoxCode ?? undefined;
    const toneByGridCode: Record<string, Tone> = { HIGH_HIGH: "success", HIGH_MID: "brand", HIGH_LOW: "primary", MID_HIGH: "brand", MID_MID: "primary", MID_LOW: "warning", LOW_HIGH: "primary", LOW_MID: "warning", LOW_LOW: "danger" };
    const latestKpi = latestKpiByUserId[participant.userId];
    const activeKpiVersion = latestKpi
      ? operationWorkspace.decisionRules.kpiRuleVersions
          .filter((version) => version.departmentOrgNodeId === candidate?.departmentOrgNodeId && version.status === "ACTIVE")
          .sort((left, right) => {
            const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
            const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
            return rightTime - leftTime;
          })[0]
      : null;
    const kpiBands = activeKpiVersion ? operationWorkspace.decisionRules.kpiBands.filter((band) => band.ruleVersionId === activeKpiVersion.id) : [];
    const kpiRating = latestKpi?.finalScore != null ? resolveKpiRatingName(latestKpi.finalScore, kpiBands) : fallback?.kpiRating ?? null;
    return {
      id: participant.userId,
      name: user?.name ?? "未知员工",
      team: candidate?.orgNodeName ?? fallback?.team ?? "未配置组织",
      title: user?.title ?? fallback?.title ?? "未配置岗位",
      level: jobLevel?.code ?? jobLevel?.name ?? fallback?.level ?? "未配置职级",
      years: fallback?.years ?? 0,
      grid: gridCode ? overviewLabelByCode.get(gridCode) ?? result?.talentType ?? "未落宫格" : "待评价",
      gridCode,
      tone: gridCode ? toneByGridCode[gridCode] ?? "default" : "default",
      score: result?.totalScore ?? 0,
      kpi: latestKpi?.finalScore ?? fallback?.kpi ?? 0,
      hasKpi: latestKpi != null || fallback?.hasKpi === true,
      kpiRating,
      potential: fallback?.potential ?? 0,
      reviewLevel: result?.gradeCode ?? "待评价",
      assessment: latestAssessmentByUserId[participant.userId]?.earnedScore ?? fallback?.assessment ?? 0,
      assessmentMax: latestAssessmentByUserId[participant.userId]?.maxScore ?? fallback?.assessmentMax ?? 6,
      hasAssessment: latestAssessmentByUserId[participant.userId] != null || fallback?.hasAssessment === true,
      nextLevel: fallback?.nextLevel ?? "待配置",
      recommendation: fallback?.recommendation ?? "待部门决策",
      contract: fallback?.contract ?? "未配置",
      profileExtras: profileExtrasByUserId[participant.userId],
    };
  }) : people;
  const overviewCompleted = overviewDetail?.results.length ?? 0;
  const overviewTotal = overviewDetail?.participants.length ?? 0;
  const overviewCompletionRate = overviewTotal > 0 ? Math.round((overviewCompleted / overviewTotal) * 100) : 0;

  const filtered = overviewPeople.filter((person) => {
    const matchesGrid = !gridFilter || (person.gridCode ?? legacyGridCodeByLabel[person.grid]) === gridFilter;
    const matchesTeam = team === "全部团队" || person.team === team;
    const keyword = query.trim().toLowerCase();
    const matchesQuery = !keyword || [person.name, person.title, person.level, person.team].some((value) => value.toLowerCase().includes(keyword));
    return matchesGrid && matchesTeam && matchesQuery;
  });

  function openPerson(person: Person, nextTab: Tab = "overview") {
    const gridCode = person.gridCode ?? legacyGridCodeByLabel[person.grid];
    setSelected({ ...person, grid: overviewLabelByCode.get(gridCode) ?? person.grid });
    setTab(nextTab);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <Card className="!p-6">
      <PageHeader
        title="人才发展"
        description="人才画像 · 人才盘点 · 人才决策"
      />

      <div className="flex items-center gap-1 border-b border-border mb-5 overflow-x-auto">
        {([
          ["overview", "人才总览"], ["review", "人才盘点"], ["decision", "人才决策"], ["history", "人才履历"], ["config", "规则配置"],
        ] as [Section, string][]).map(([key, label]) => <button key={key} onClick={() => { setSection(key); if (key === "config") setActiveConfig(null); }} className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${section === key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
      </div>

      {section === "overview" && <>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(280px,0.9fr)] gap-4 mb-5">
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div><h3 className="font-semibold">{overviewTitle} · 9 宫格</h3><p className="text-xs text-muted-foreground mt-1">名称取自当前盘点模型配置；点击宫格筛选员工</p></div>
            {gridFilter && <button onClick={() => setGridFilter(null)} className="text-xs text-primary flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" />清除筛选</button>}
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2 min-h-[310px]">
              {overviewGrids.map((item) => {
                const count = overviewDetail ? overviewDetail.results.filter((result) => result.nineBoxCode === item.code).length : people.filter((person) => legacyGridCodeByLabel[person.grid] === item.code).length;
                const active = gridFilter === item.code;
                const map: Record<string, string> = {
                  light: "bg-slate-50/40 hover:bg-slate-50/70",
                  default: "bg-slate-50 hover:bg-slate-100",
                  primary: "bg-indigo-50/80 hover:bg-indigo-100/80",
                  success: "bg-emerald-50/80 hover:bg-emerald-100/80",
                  brand: "bg-cyan-50/80 hover:bg-cyan-100/80",
                };
                return <button key={item.code} onClick={() => setGridFilter(active ? null : item.code)} className={`rounded-xl border p-3 text-left flex flex-col justify-between transition-all ${map[item.tone]} ${active ? "border-primary ring-2 ring-primary/15 shadow-sm" : "border-transparent"}`}>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">{item.label}{active && <Check className="w-3.5 h-3.5 text-primary" />}</span>
                  <span className="text-2xl font-semibold tabular-nums self-end">{count}</span>
                </button>;
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>← 潜力低</span><span>绩效 ↑</span><span>潜力高 →</span></div>
          </div>
        </Card>

        <div className="h-full flex flex-col justify-between gap-3">
          <QuickCard icon={<CalendarClock className="w-5 h-5" />} tone="bg-orange-50 text-orange-500" hoverTone="hover:bg-orange-100/80" label="90 天内合同到期" value={`${statCards.contractsExpiringSoon} 人`} names={statCards.contractsExpiringSoonNames} action={() => { setSection("history"); showNotice("已切换到人才履历，请查看合同到期人员"); }} />
          <QuickCard icon={<AlertCircle className="w-5 h-5" />} tone="bg-red-50 text-red-600" hoverTone="hover:bg-red-100/80" label="晋升机会紧张" value={`${statCards.lowPromotionOpportunityCount} 人`} names={statCards.lowPromotionOpportunityNames} action={() => { setSection("history"); showNotice("已切换到人才履历，请查看晋升机会紧张人员"); }} />
          <QuickCard icon={<TrendingUp className="w-5 h-5" />} tone="bg-blue-50 text-blue-600" hoverTone="hover:bg-blue-100/80" label={statCards.recentPromotionHalfYear === "first" ? "上半年晋升" : "下半年晋升"} value={`${statCards.recentPromotions} 人`} names={statCards.recentPromotionNames} action={() => { setHistoryInitialCategory("promotion"); setSection("history"); showNotice("已切换到人才履历的晋升记录"); }} />
          <QuickCard icon={<Award className="w-5 h-5" />} tone="bg-teal-50 text-teal-600" hoverTone="hover:bg-teal-100/80" label="本季奖励记录" value={`${statCards.currentQuarterRewards} 条`} names={statCards.currentQuarterRewardNames} action={() => { setHistoryInitialCategory("reward"); setSection("history"); showNotice("已切换到人才履历的奖励记录"); }} />
          <Card className="!p-4 border-blue-100 bg-blue-50/80 text-slate-900 cursor-pointer hover:bg-blue-100/80 transition-colors" onClick={() => { setSection("review"); showNotice("已切换到人才盘点"); }}>
            <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-100 text-blue-600"><UserRound className="w-5 h-5" /></div><div><div className="text-xs text-slate-500">本次盘点完成度</div><div className="mt-0.5 text-2xl font-semibold text-blue-700">{overviewCompletionRate}%</div></div></div><div className="text-[11px] text-slate-500 whitespace-nowrap self-end">{overviewCompleted} / {overviewTotal} 人已完成评价</div></div>
          </Card>
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <div><h3 className="font-semibold">人才画像</h3><p className="text-xs text-muted-foreground mt-0.5">共 {filtered.length} 位员工</p></div>
          <div className="relative ml-auto min-w-52"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、岗位、职级" className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/70 border border-transparent text-sm focus:outline-none focus:border-primary focus:bg-card" /></div>
          <div className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" /><select value={team} onChange={(event) => setTeam(event.target.value)} className="h-9 rounded-lg border border-border bg-card pl-8 pr-8 text-xs appearance-none focus:outline-none focus:border-primary"><option>全部团队</option><option>B端组</option><option>C端组</option><option>设计组</option><option>采购组</option></select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left font-medium px-5 py-3">员工</th><th className="text-left font-medium px-4 py-3">当前职级</th><th className="text-left font-medium px-4 py-3">人才盘点</th><th className="text-left font-medium px-4 py-3">有效 KPI</th><th className="text-left font-medium px-4 py-3">业务考核</th><th className="text-left font-medium px-4 py-3">能力匹配度</th><th className="text-left font-medium px-4 py-3">当前建议</th><th className="text-right font-medium px-5 py-3">操作</th></tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map((person) => <tr key={person.id} className="hover:bg-muted/25 transition-colors cursor-pointer" onClick={() => openPerson(person)}>
                <td className="px-5 py-3.5"><div><div className="font-medium">{person.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{person.title} · {person.team}</div></div></td>
                <td className="px-4 py-3.5"><span className="text-sm">{person.level}</span></td>
                <td className="px-4 py-3.5"><div className="flex items-center gap-2"><Badge tone={person.tone}>{person.grid}</Badge><span className="text-xs text-muted-foreground">{person.reviewLevel === "待评价" ? "尚未完成评价" : `${person.score}分 / ${person.reviewLevel}`}</span></div></td>
                <td className="px-4 py-3.5">{person.hasKpi ? <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${scoreTone(person.kpi)}`}>{person.kpi} 分{person.kpiRating ? ` / ${person.kpiRating}` : null}</span> : <span className="text-xs text-muted-foreground">暂无</span>}</td>
                <td className="px-4 py-3.5">{person.hasAssessment ? <><span className="font-medium">{person.assessment}</span><span className="text-xs text-muted-foreground"> / {person.assessmentMax}分</span></> : <span className="text-xs text-muted-foreground">暂无</span>}</td>
                <td className="px-4 py-3.5">{person.profileExtras?.abilityMatchScore != null ? <span className="text-sm font-medium text-primary">{person.profileExtras.abilityMatchScore}%</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3.5"><span className="text-xs">{person.recommendation}</span></td>
                <td className="px-5 py-3.5 text-right"><button onClick={(event) => { event.stopPropagation(); openPerson(person); }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">查看画像<ChevronRight className="w-3.5 h-3.5" /></button></td>
              </tr>)}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-muted-foreground">没有匹配的员工，请调整筛选条件</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      </>}

      {section === "review" && <TalentReviewWorkbench data={reviewWorkspace} />}
      {section === "decision" && <TalentDecisionWorkspace data={operationWorkspace.decision} />}
      {section === "history" && <TalentHistoryWorkspace data={operationWorkspace.history} employeeProfiles={operationWorkspace.employeeProfiles} initialCategory={historyInitialCategory} />}
      {section === "config" && <ConfigWorkbench data={reviewWorkspace} career={operationWorkspace.career} competency={operationWorkspace.competency} assessment={operationWorkspace.assessment} decisionRules={operationWorkspace.decisionRules} activeConfig={activeConfig} onSelect={setActiveConfig} onBack={() => setActiveConfig(null)} onNotice={showNotice} />}

      {selected && <PersonDrawer person={selected} tab={tab} setTab={setTab} onClose={() => setSelected(null)} onNotice={showNotice} />}
      {notice && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] rounded-lg bg-slate-900 text-white px-4 py-3 shadow-xl text-sm flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{notice}</div>}
    </Card>
  );
}

function WorkbenchHeader({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 mb-4"><div><h3 className="text-lg font-semibold">{title}</h3><p className="text-xs text-muted-foreground mt-1">{description}</p></div>{action}</div>;
}

function TalentReviewWorkbench({ data }: { data: ReviewWorkspaceData }) {
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDepartmentId, setCreateDepartmentId] = useState(data.cycles.departments[0]?.id ?? "");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [acknowledgedCreateRequestId, setAcknowledgedCreateRequestId] = useState("");
  const [createState, createFormAction, createPending] = useActionState(createTalentReviewCycleWithState, { status: "idle" as const, message: "", requestId: "" });
  const createPanelVisible = showCreate && !(createState.status === "success" && createState.requestId !== acknowledgedCreateRequestId);
  const selectedDetail = data.details.find((item) => item.cycleId === selectedCycleId);
  if (selectedDetail) return <ReviewCycleDetailPanel detail={selectedDetail} onBack={() => setSelectedCycleId(null)} />;
  const participantRows = data.cycles.participants;
  const pending = participantRows.filter((item) => item.status === "PENDING").length;
  const completed = participantRows.length - pending;
  const departmentName = new Map(data.cycles.departments.map((item) => [item.id, item.name]));
  const templateName = new Map(data.cycles.templates.map((item) => [item.id, `${item.name} V${item.version}`]));
  const activeTemplates = data.config.templates.filter((item) => item.status === "ACTIVE" && item.departmentOrgNodeId === createDepartmentId);
  const selectableCandidates = data.cycles.candidates.filter((item) => item.departmentOrgNodeId === createDepartmentId);
  const selectedParticipantIdSet = new Set(selectedParticipantIds);
  const toggleParticipant = (userId: string) => setSelectedParticipantIds((current) => current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]);
  return <div>
    <WorkbenchHeader title="人才盘点" description="选择已发布模型创建批次；批次会冻结模型版本，后续修改不影响历史结果" action={data.cycles.canCreateCycle ? <Button className={actionButtonClass} variant={createPanelVisible ? "outline" : "primary"} onClick={() => { if (createPanelVisible) { setShowCreate(false); } else { setAcknowledgedCreateRequestId(createState.requestId); setShowCreate(true); } setSelectedParticipantIds([]); }}>{createPanelVisible ? <><ArrowRight className="h-4 w-4 rotate-180" />返回</> : <><Plus className="h-4 w-4" />新建人才盘点</>}</Button> : null} />
    {createPanelVisible && <Card className="mb-4"><form action={createFormAction} className="grid gap-3 md:grid-cols-4">
      <Field label="适用部门"><select name="departmentOrgNodeId" required value={createDepartmentId} onChange={(event) => { setCreateDepartmentId(event.target.value); setSelectedParticipantIds([]); }} className={inputClass}>{data.cycles.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="已发布模型"><select name="templateVersionId" required className={inputClass}>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} V{item.version}</option>)}</select></Field>
      <Field label="年度"><input name="year" type="number" defaultValue={new Date().getFullYear()} className={inputClass}/></Field>
      <Field label="盘点周期"><select name="halfYear" defaultValue={new Date().getMonth() < 6 ? "1" : "2"} className={inputClass}><option value="1">上半年</option><option value="2">下半年</option></select></Field>
      <div className="md:col-span-4 rounded-xl border border-border"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h4 className="text-sm font-medium">选择盘点成员</h4><p className="mt-1 text-xs text-muted-foreground">组长和普通成员参加九宫格评价；仅部门主管不在名单中，主管使用管理层评价模型。</p></div><div className="flex items-center gap-3 text-xs"><span className="text-muted-foreground">已选择 {selectedParticipantIds.length} 人</span><button type="button" onClick={() => setSelectedParticipantIds(selectableCandidates.map((item) => item.id))} className="text-primary">全选</button><button type="button" onClick={() => setSelectedParticipantIds([])} className="text-muted-foreground">清空</button></div></div><div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto p-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">{selectableCandidates.map((candidate) => <label key={candidate.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${selectedParticipantIdSet.has(candidate.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}><input type="checkbox" name="participantUserIds" value={candidate.id} checked={selectedParticipantIdSet.has(candidate.id)} onChange={() => toggleParticipant(candidate.id)}/><span className="min-w-0"><span className="block truncate text-sm font-medium">{candidate.name}</span><span className="block truncate text-xs text-muted-foreground">{candidate.orgNodeName} · {candidate.title ?? "未配置岗位"}</span></span></label>)}{selectableCandidates.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">该部门暂无可参与九宫格盘点的组长或普通成员</p>}</div></div>
      <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-muted-foreground">批次名称由系统自动生成；一个批次绑定一个评价模型和一组明确选择的成员。</p><Button type="submit" className={actionButtonClass} disabled={createPending || activeTemplates.length === 0 || selectedParticipantIds.length === 0}>{createPending ? "正在创建…" : "创建盘点批次"}</Button></div>
    </form>{activeTemplates.length === 0 && <p className="mt-2 text-xs text-amber-600">暂无已发布模型，请先到“规则配置 → 人才盘点模型”完成发布。</p>}</Card>}
    {!createPanelVisible && <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4"><Metric label="待评价" value={`${pending} 人`} hint="全部批次" /><Metric label="已评价" value={`${completed} 人`} hint="含待校准结果" /><Metric label="盘点批次" value={`${data.cycles.cycles.length} 个`} hint="历史版本独立保留" /></div>
    <Card className="!p-0 overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left px-5 py-3 font-medium">盘点批次</th><th className="text-left px-4 py-3 font-medium">使用模型</th><th className="text-left px-4 py-3 font-medium">范围</th><th className="text-left px-4 py-3 font-medium">进度</th><th className="text-left px-4 py-3 font-medium">状态</th><th className="text-right px-5 py-3 font-medium">操作</th></tr></thead><tbody className="divide-y divide-border">{data.cycles.cycles.map((cycle) => { const rows = participantRows.filter((item) => item.cycleId === cycle.id); const done = rows.filter((item) => item.status !== "PENDING").length; return <tr key={cycle.id}><td className="px-5 py-4 font-medium">{cycle.name}<div className="text-xs text-muted-foreground mt-1">{cycle.year}年{cycle.halfYear === 1 ? "上半年" : "下半年"}</div></td><td className="px-4 py-4 text-xs">{templateName.get(cycle.templateVersionId) ?? "模型已归档"}</td><td className="px-4 py-4 text-xs">{departmentName.get(cycle.departmentOrgNodeId)} · {rows.length}人</td><td className="px-4 py-4 font-medium">{done}/{rows.length}</td><td className="px-4 py-4"><Badge tone={cycle.status === "CONFIRMED" ? "success" : "primary"}>{reviewStatusLabel(cycle.status)}</Badge></td><td className="px-5 py-4"><div className="flex items-center justify-end gap-3"><button onClick={() => setSelectedCycleId(cycle.id)} className="text-xs text-primary">{cycle.status === "CONFIRMED" ? "查看结果" : "继续盘点"}</button>{cycle.status !== "CONFIRMED" && <form action={deleteTalentReviewCycle} onSubmit={(event) => { if (!window.confirm(`确认删除“${cycle.name}”吗？将删除 ${rows.length} 名员工的盘点数据，其中 ${done} 人已有评价结果。此操作不可恢复。`)) event.preventDefault(); }}><input type="hidden" name="cycleId" value={cycle.id}/><button type="submit" className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5"/>删除</button></form>}</div></td></tr>; })}</tbody></table>{data.cycles.cycles.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">暂无盘点批次，请先发布模型并新建批次</div>}</Card>
    </>}
    <ActionFeedback key={createState.requestId} state={createState}/>
  </div>;
}

function ReviewEvaluationRow({ participant, person, result, dimensions, ratings, thresholds, savedRatings, editable, canManage }: {
  participant: ReviewCycleDetail["participants"][number];
  person: ReviewCycleDetail["users"][number] | undefined;
  result: ReviewCycleDetail["results"][number] | undefined;
  dimensions: ReviewCycleDetail["dimensions"];
  ratings: ReviewCycleDetail["ratings"];
  thresholds: ReviewCycleDetail["thresholds"];
  savedRatings: Record<string, string | undefined>;
  editable: boolean;
  canManage: boolean;
}) {
  const fallbackRating = ratings[0]?.code ?? "";
  const savedValues = Object.fromEntries(dimensions.map((dimension) => [dimension.id, savedRatings[dimension.id] ?? fallbackRating]));
  const [values, setValues] = useState<Record<string, string>>(savedValues);
  const hasChanges = dimensions.some((dimension) => values[dimension.id] !== savedValues[dimension.id]);
  const formId = `review-${participant.id}`;
  const ratingByCode = new Map(ratings.map((item) => [item.code, item]));
  const grade = result ? thresholds.find((item) => item.gradeCode === result.gradeCode) : undefined;
  const saved = Boolean(result) && !hasChanges;
  return <tr className="align-middle"><td className="px-4 py-3"><form id={formId} action={saveTalentReviewEvaluation}><input type="hidden" name="participantId" value={participant.id}/></form><div className="font-medium">{person?.name ?? "未知员工"}</div><div className="mt-1 text-xs text-muted-foreground">{person?.title ?? "未配置岗位"}</div></td>{dimensions.map((dimension) => { const rating = ratingByCode.get(savedRatings[dimension.id] ?? ""); return <td key={dimension.id} className="px-2 py-3">{editable && canManage ? <select form={formId} name={`rating_${dimension.id}`} value={values[dimension.id]} onChange={(event) => setValues((current) => ({ ...current, [dimension.id]: event.target.value }))} aria-label={`${person?.name ?? "员工"}-${dimension.name}`} className={inputClass}>{ratings.map((item) => <option key={item.id} value={item.code}>{item.code} · {item.label} · {item.numericScore}分</option>)}</select> : <span>{rating ? `${rating.code} · ${rating.label}` : "—"}</span>}</td>; })}<td className="whitespace-nowrap px-3 py-3 font-medium">{result ? `${result.totalScore}分` : "—"}</td><td className="whitespace-nowrap px-3 py-3">{result ? <Badge tone="success">{result.gradeCode}{grade ? ` · ${grade.label}` : ""}</Badge> : <Badge>待评价</Badge>}</td><td className="whitespace-nowrap px-3 py-3">{result?.talentType ?? "—"}</td><td className="whitespace-nowrap px-4 py-3 text-right">{editable && canManage ? <button form={formId} type="submit" disabled={saved} className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45">{saved ? "已保存" : "保存"}</button> : "—"}</td></tr>;
}

function ReviewCycleDetailPanel({ detail, onBack }: { detail: ReviewCycleDetail; onBack: () => void }) {
  const userById = new Map(detail.users.map((item) => [item.id, item]));
  const resultByParticipant = new Map(detail.results.map((item) => [item.participantId, item]));
  const ratingByKey = new Map(detail.dimensionResults.map((item) => [`${item.participantId}:${item.dimensionId}`, item.ratingCode]));
  const editable = ["IN_PROGRESS", "CALIBRATING"].includes(detail.cycleStatus);
  return <div><WorkbenchHeader title="盘点评价与结果" description="逐人评价、自动计算等级与九宫格；有权限的负责人可校准并确认" action={<div className="flex gap-2"><Button className={actionButtonClass} variant="outline" onClick={onBack}><ArrowRight className="h-4 w-4 rotate-180"/>返回</Button>{editable && detail.canCalibrate && <form action={confirmTalentReviewCycle}><input type="hidden" name="cycleId" value={detail.cycleId}/><Button type="submit" className={actionButtonClass}>确认全部结果</Button></form>}</div>} />
    <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1460px] text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="min-w-40 px-4 py-3 text-left font-medium">姓名</th>{detail.dimensions.map((dimension) => <th key={dimension.id} className="min-w-36 px-2 py-3 text-left font-medium">{dimension.name}</th>)}<th className="min-w-24 px-3 py-3 text-left font-medium">总分值</th><th className="min-w-32 px-3 py-3 text-left font-medium">盘点等级</th><th className="min-w-28 px-3 py-3 text-left font-medium">人才类型</th><th className="w-28 px-4 py-3 text-right font-medium">操作</th></tr></thead><tbody className="divide-y divide-border">{detail.participants.map((participant) => { const savedRatings = Object.fromEntries(detail.dimensions.map((dimension) => [dimension.id, ratingByKey.get(`${participant.id}:${dimension.id}`)])); const savedSignature = detail.dimensions.map((dimension) => savedRatings[dimension.id] ?? "").join("|"); return <ReviewEvaluationRow key={`${participant.id}:${savedSignature}`} participant={participant} person={userById.get(participant.userId)} result={resultByParticipant.get(participant.id)} dimensions={detail.dimensions} ratings={detail.ratings} thresholds={detail.thresholds} savedRatings={savedRatings} editable={editable} canManage={detail.canManage}/>; })}</tbody></table></div>{detail.participants.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">该批次暂无可查看员工</div>}</Card>
    {editable && detail.canCalibrate && detail.results.length > 0 && <Card className="!p-0 mt-4 overflow-hidden"><div className="border-b border-border px-5 py-4"><h4 className="font-medium">结果校准</h4><p className="mt-1 text-xs text-muted-foreground">仅在自动计算结果需要调整时使用，并填写校准说明。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3 text-left font-medium">姓名</th><th className="px-3 py-3 text-left font-medium">总分</th><th className="px-3 py-3 text-left font-medium">等级</th><th className="px-3 py-3 text-left font-medium">九宫格</th><th className="px-3 py-3 text-left font-medium">校准说明</th><th className="px-5 py-3 text-right font-medium">操作</th></tr></thead><tbody className="divide-y divide-border">{detail.participants.flatMap((participant) => { const result = resultByParticipant.get(participant.id); if (!result) return []; const person = userById.get(participant.userId); const formId = `calibrate-${participant.id}`; return [<tr key={participant.id}><td className="px-5 py-3 font-medium"><form id={formId} action={calibrateTalentReviewResult}><input type="hidden" name="participantId" value={participant.id}/></form>{person?.name ?? "未知员工"}</td><td className="px-3 py-3">{result.totalScore}分</td><td className="px-3 py-3"><select form={formId} name="gradeCode" defaultValue={result.gradeCode} className={inputClass}>{detail.thresholds.map((item) => <option key={item.id} value={item.gradeCode}>{item.gradeCode} · {item.label}</option>)}</select></td><td className="px-3 py-3"><select form={formId} name="nineBoxCode" defaultValue={result.nineBoxCode ?? ""} className={inputClass}>{detail.nineBoxRules.map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}</select></td><td className="px-3 py-3"><input form={formId} name="managerComment" defaultValue={result.managerComment ?? ""} placeholder="校准说明" className={inputClass}/></td><td className="px-5 py-3 text-right"><button form={formId} type="submit" className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.99]">保存校准</button></td></tr>]; })}</tbody></table></div></Card>}
  </div>;
}

function reviewStatusLabel(status: string) { return ({ IN_PROGRESS: "进行中", CALIBRATING: "校准中", CONFIRMED: "已完成" } as Record<string, string>)[status] ?? status; }

function DecisionWorkbench() {
  const suggestions = [
    { id: "JY-2026-031", name: "周明轩", type: "晋升", suggestion: "R3-2 → R3-3", basis: "盘点S · KPI 103 · 考核6分", result: "已采纳", date: "2026-09-01" },
    { id: "JY-2026-032", name: "郑雅琪", type: "加薪", suggestion: "建议加薪 8%", basis: "盘点S · KPI 106 · 薪资未达上限", result: "调整采纳", date: "2026-08-01" },
    { id: "JY-2026-033", name: "吴雨桐", type: "晋升", suggestion: "R2 → R3-1", basis: "盘点A · 能力达成7/10", result: "暂缓", date: "—" },
    { id: "JY-2026-034", name: "王梓涵", type: "奖励", suggestion: "卓越贡献奖", basis: "盘点S · KPI 101 · 无事故", result: "待反馈", date: "—" },
  ];
  return <div>
    <WorkbenchHeader title="人才决策" description="管理部门对晋升、续签、加薪和奖励提出的建议，并跟踪公司的采纳反馈" action={<Link href="/talent/recommendations" className={primaryActionLinkClass}><Plus className="w-4 h-4" />进入决策管理</Link>} />
    <Card className="!p-0 overflow-hidden"><div className="px-5 py-4 border-b border-border"><h4 className="font-medium">决策建议列表</h4><p className="text-xs text-muted-foreground mt-1">建议记录数据依据和公司反馈，但不会直接改变员工的职级、合同、薪资或奖励履历</p></div><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left px-5 py-3 font-medium">建议编号</th><th className="text-left px-4 py-3 font-medium">员工 / 事项</th><th className="text-left px-4 py-3 font-medium">部门建议</th><th className="text-left px-4 py-3 font-medium">决策依据</th><th className="text-left px-4 py-3 font-medium">公司反馈</th><th className="text-right px-5 py-3 font-medium">操作</th></tr></thead><tbody className="divide-y divide-border">{suggestions.map((item) => <tr key={item.id}><td className="px-5 py-4 text-xs text-muted-foreground">{item.id}</td><td className="px-4 py-4"><div className="font-medium">{item.name}</div><Badge tone="primary">{item.type}</Badge></td><td className="px-4 py-4 text-xs font-medium">{item.suggestion}</td><td className="px-4 py-4 text-xs text-muted-foreground">{item.basis}</td><td className="px-4 py-4"><Badge tone={item.result === "已采纳" ? "success" : item.result === "暂缓" ? "warning" : item.result === "待反馈" ? "default" : "primary"}>{item.result}</Badge>{item.date !== "—" && <div className="text-[11px] text-muted-foreground mt-1">{item.date}</div>}</td><td className="px-5 py-4 text-right"><button className="text-xs text-primary">查看建议</button></td></tr>)}</tbody></table></Card>
  </div>;
}

function TalentHistoryWorkbench() {
  const records = [
    { id: "LS-2026-018", name: "周明轩", type: "晋升", content: "R3-2 → R3-3", effective: "2026-09-01", source: "关联建议 JY-2026-031" },
    { id: "LS-2026-017", name: "郑雅琪", type: "加薪", content: "薪资调整 6%", effective: "2026-08-01", source: "关联建议 JY-2026-032" },
    { id: "LS-2026-016", name: "王梓涵", type: "奖励", content: "2026年Q2卓越贡献奖", effective: "2026-07-18", source: "公司奖励系统" },
    { id: "LS-2026-011", name: "孙宇航", type: "续签", content: "续签 2 年，至 2028-04-30", effective: "2026-05-01", source: "公司合同系统" },
  ];
  return <div><WorkbenchHeader title="人才履历" description="管理员工已经正式发生的晋升、续签、加薪和奖励记录，并支持按员工查询完整历史" action={<Link href="/talent/history" className={primaryActionLinkClass}><Plus className="w-4 h-4" />进入履历管理</Link>} /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"><Metric label="晋升记录" value="12 条" hint="近三年" /><Metric label="续签记录" value="18 条" hint="近三年" /><Metric label="加薪记录" value="21 条" hint="近三年" /><Metric label="奖励记录" value="32 条" hint="近三年" /></div><Card className="!p-0 overflow-hidden"><div className="px-5 py-4 border-b border-border flex items-center justify-between"><div><h4 className="font-medium">员工履历记录</h4><p className="text-xs text-muted-foreground mt-1">正式记录可以关联人才决策，也可以来自公司其他管理系统</p></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input placeholder="搜索员工历史" className="h-9 w-48 rounded-lg bg-muted/70 pl-8 pr-3 text-xs focus:outline-none focus:border-primary border border-transparent" /></div></div><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left px-5 py-3 font-medium">记录编号</th><th className="text-left px-4 py-3 font-medium">员工</th><th className="text-left px-4 py-3 font-medium">类型</th><th className="text-left px-4 py-3 font-medium">正式结果</th><th className="text-left px-4 py-3 font-medium">生效日期</th><th className="text-left px-4 py-3 font-medium">来源</th><th className="text-right px-5 py-3 font-medium">操作</th></tr></thead><tbody className="divide-y divide-border">{records.map((item) => <tr key={item.id}><td className="px-5 py-4 text-xs text-muted-foreground">{item.id}</td><td className="px-4 py-4 font-medium">{item.name}</td><td className="px-4 py-4"><Badge tone="primary">{item.type}</Badge></td><td className="px-4 py-4 text-xs font-medium">{item.content}</td><td className="px-4 py-4 text-xs">{item.effective}</td><td className="px-4 py-4 text-xs text-muted-foreground">{item.source}</td><td className="px-5 py-4 text-right"><button className="text-xs text-primary">查看员工履历</button></td></tr>)}</tbody></table></Card></div>;
}

function ConfigWorkbench({ data, career, competency, assessment, decisionRules, activeConfig, onSelect, onBack, onNotice }: { data: ReviewWorkspaceData; career: CareerWorkspaceData; competency: CompetencyWorkspaceData; assessment: AssessmentWorkspaceData; decisionRules: TalentDecisionRuleWorkspaceData; activeConfig: ConfigKey | null; onSelect: (key: ConfigKey) => void; onBack: () => void; onNotice: (message: string) => void }) {
  const configs: Array<{ key: ConfigKey; icon: typeof SlidersHorizontal; title: string; detail: string; version: string }> = [
    { key: "review", icon: SlidersHorizontal, title: "人才能力评估", detail: "配置人才能力测算权重与人才盘点评价模型", version: "V1.0 已启用" },
    { key: "career", icon: Route, title: "职业发展通道", detail: "岗位族、岗位、职级组和 R3-1 等职级档", version: "V1.0 已启用" },
    { key: "competency", icon: ClipboardList, title: "职业能力模型", detail: "按岗位与目标职级配置晋升能力要求", version: "支持草稿与发布" },
    { key: "salary", icon: WalletCards, title: "薪资与职级上限", detail: "R1 至 R6 薪资上限及细分职级继承规则", version: "V1.0 已启用" },
    { key: "assessment", icon: FileText, title: "业务考核规则", detail: "等级/分数及格线、补考与 6 分摊分规则", version: "V1.0 已启用" },
    { key: "incident", icon: ShieldAlert, title: "工作事故等级配置", detail: "定义S/A/B/C/D工作事故等级，供事故记录和其他规则引用", version: decisionRules.incidentRuleVersions.some((row) => row.status === "ACTIVE") ? "已有发布版本" : "待配置" },
    { key: "kpi-rating", icon: TrendingUp, title: "绩效等级规则", detail: "独立维护KPI等级名称、连续分数区间和评价说明", version: decisionRules.kpiRuleVersions.some((row) => row.status === "ACTIVE") ? "已有发布版本" : "待配置" },
    { key: "decision-rules", icon: Database, title: "人才决策规则配置", detail: "按业务字段配置触发条件和限制输出，不执行员工决策", version: `${decisionRules.restrictionRules.length} 条规则` },
  ];
  if (activeConfig) return <InlineConfigPanel data={data} career={career} competency={competency} assessment={assessment} decisionRules={decisionRules} configKey={activeConfig} onBack={onBack} onNotice={onNotice} />;
  return <div><WorkbenchHeader title="规则配置" description="先选择规则类型，再在各自的版本列表中创建、编辑或查看规则" action={<span />} /><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{configs.map((item) => { const Icon = item.icon; return <button key={item.key} onClick={() => onSelect(item.key)} className="text-left"><Card className="h-full hover:border-primary/40 hover:shadow-md transition-all"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></div><div className="flex-1"><h4 className="font-medium">{item.title}</h4><p className="text-xs text-muted-foreground leading-5 mt-1 min-h-10">{item.detail}</p><div className="mt-4 flex items-center justify-between"><Badge tone="default">{item.version}</Badge><span className="text-xs text-primary flex items-center">{item.key === "decision-rules" ? "进入规则列表" : "进入版本列表"}<ChevronRight className="w-3.5 h-3.5" /></span></div></div></div></Card></button>; })}</div></div>;
}

function InlineConfigPanel({ data, career, competency, assessment, decisionRules, configKey, onBack, onNotice }: { data: ReviewWorkspaceData; career: CareerWorkspaceData; competency: CompetencyWorkspaceData; assessment: AssessmentWorkspaceData; decisionRules: TalentDecisionRuleWorkspaceData; configKey: ConfigKey; onBack: () => void; onNotice: (message: string) => void }) {
  const meta: Record<ConfigKey, { title: string; description: string }> = {
    review: { title: "人才能力评估", description: "配置人才能力测算权重与人才盘点评价模型" },
    career: { title: "职业发展通道", description: "配置职业通道、岗位序列、具体岗位和细分职级" },
    competency: { title: "职业能力模型", description: "按岗位与目标职级配置晋升能力要求" },
    salary: { title: "薪资与职级上限", description: "维护职级段薪资上限和细分职级覆盖规则" },
    assessment: { title: "业务考核规则", description: "维护评分方式、及格线、补考和 6 分摊分规则" },
    incident: { title: "工作事故等级配置", description: "独立定义工作事故等级，不配置KPI扣分或人才决策处罚" },
    "kpi-rating": { title: "绩效等级规则", description: "独立维护版本化 KPI 等级名称、分数区间和评价说明" },
    "decision-rules": { title: "人才决策规则配置", description: "这里只维护规则定义，不计算员工数据、不生成限制记录，也不直接作出人才决策" },
  };
  const current = meta[configKey];
  return <div><WorkbenchHeader title={current.title} description={current.description} action={<Button className={actionButtonClass} variant="outline" onClick={onBack}><ArrowRight className="h-4 w-4 rotate-180" />返回</Button>} />
    {configKey === "review" && <ReviewModelConfiguration data={data} />}
    {configKey === "career" && <CareerConfiguration data={career}/>} 
    {configKey === "competency" && <CompetencyConfiguration data={competency}/>} 
    {configKey === "salary" && <SalaryConfiguration/>}
    {configKey === "assessment" && <BusinessAssessmentRuleConfiguration data={assessment}/>} 
    {configKey === "incident" && <IncidentRuleConfiguration data={decisionRules}/>} 
    {configKey === "kpi-rating" && <KpiRatingRuleConfiguration data={decisionRules}/>} 
    {configKey === "decision-rules" && <TalentRestrictionRuleConfiguration data={decisionRules}/>} 
    {configKey !== "incident" && configKey !== "review" && configKey !== "career" && configKey !== "competency" && configKey !== "salary" && configKey !== "assessment" && configKey !== "kpi-rating" && configKey !== "decision-rules" && <div className="mt-4 flex justify-end"><Button className={actionButtonClass} onClick={() => onNotice(`${current.title}草稿已保存`)}><Save className="h-4 w-4"/>保存配置草稿</Button></div>}
  </div>;
}

function TalentRestrictionRuleConfiguration({ data }: { data: TalentDecisionRuleWorkspaceData }) {
  const [screen, setScreen] = useState<"list" | "detail" | "editor">("list");
  const [selectedRuleId, setSelectedRuleId] = useState(data.restrictionRules[0]?.id ?? "");
  const [ruleQuery, setRuleQuery] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [outputType, setOutputType] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const departmentNames = new Map(data.departments.map((department) => [department.id, department.name]));
  const fieldById = new Map(data.restrictionFieldDefinitions.map((field) => [field.id, field]));
  const userNames = new Map(data.restrictionRuleUsers.map((user) => [user.id, user.name]));
  const revisionsFor = (ruleId: string) => data.restrictionRuleRevisions.filter((revision) => revision.ruleId === ruleId).sort((left, right) => right.revisionNo - left.revisionNo);
  const displayedRevisionFor = (rule: TalentDecisionRuleWorkspaceData["restrictionRules"][number]) => {
    const revisions = revisionsFor(rule.id);
    return revisions.find((revision) => revision.id === rule.currentRevisionId) ?? revisions[0] ?? null;
  };
  const draftRevisionFor = (ruleId: string) => revisionsFor(ruleId).find((revision) => revision.status === "DRAFT") ?? null;
  const conditionFor = (revisionId: string | undefined) => revisionId ? data.restrictionRuleConditions.find((condition) => condition.revisionId === revisionId) ?? null : null;
  const outputsFor = (revisionId: string | undefined) => revisionId ? data.restrictionRuleOutputs.filter((output) => output.revisionId === revisionId).sort((left, right) => left.sortOrder - right.sortOrder) : [];
  const rows = data.restrictionRules.map((rule) => {
    const revision = displayedRevisionFor(rule);
    const condition = conditionFor(revision?.id);
    const field = condition ? fieldById.get(condition.fieldDefinitionId) ?? null : null;
    return { rule, revision, condition, field, outputs: outputsFor(revision?.id) };
  });
  const filteredRows = rows.filter(({ rule, field, outputs }) => {
    const keyword = ruleQuery.trim().toLowerCase();
    return (!keyword || rule.name.toLowerCase().includes(keyword))
      && (!category || rule.category === category)
      && (!source || field?.source === source)
      && (!outputType || outputs.some((output) => output.outputType === outputType))
      && (!departmentId || rule.departmentOrgNodeId === departmentId)
      && (!status || rule.status === status);
  });
  const hasFilters = Boolean(ruleQuery.trim() || category || source || outputType || departmentId || status);
  const clearFilters = () => {
    setRuleQuery("");
    setCategory("");
    setSource("");
    setOutputType("");
    setDepartmentId("");
    setStatus("");
  };

  if (screen === "editor") {
    const selectedRule = data.restrictionRules.find((rule) => rule.id === selectedRuleId);
    const revision = selectedRule ? draftRevisionFor(selectedRule.id) ?? displayedRevisionFor(selectedRule) : null;
    const condition = conditionFor(revision?.id);
    const outputs = outputsFor(revision?.id);
    return <RestrictionRuleDraftEditor
      key={selectedRule?.id ?? "new-rule"}
      data={data}
      rule={selectedRule ?? null}
      revision={revision}
      condition={condition}
      outputs={outputs}
      onBack={() => setScreen("list")}
    />;
  }

  if (screen === "detail") {
    const selectedRule = data.restrictionRules.find((rule) => rule.id === selectedRuleId);
    if (!selectedRule) return <ConfigBlock title="规则不存在"><Button variant="outline" onClick={() => setScreen("list")}>返回规则列表</Button></ConfigBlock>;
    const revisions = revisionsFor(selectedRule.id);
    const currentRevision = displayedRevisionFor(selectedRule);
    const detailDraftRevision = draftRevisionFor(selectedRule.id);
    const currentCondition = conditionFor(currentRevision?.id);
    const currentField = currentCondition ? fieldById.get(currentCondition.fieldDefinitionId) ?? null : null;
    const currentOutputs = outputsFor(currentRevision?.id);
    return <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{selectedRule.name}</h3><Badge tone="primary">{categoryLabels[selectedRule.category]}</Badge><Badge tone={selectedRule.status === "ACTIVE" ? "success" : selectedRule.status === "DRAFT" ? "warning" : "default"}>{ruleStatusLabels[selectedRule.status]}</Badge>{currentRevision ? <Badge tone="default">当前修订 R{currentRevision.revisionNo}</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">规则只读详情：快速核对触发字段、全部输出、生效范围和修订历史</p></div>
        <div className="flex flex-wrap gap-2">{detailDraftRevision ? <RestrictionRulePublishButton ruleId={selectedRule.id} revisionNo={detailDraftRevision.revisionNo} replacesCurrent={selectedRule.status === "ACTIVE"}/> : null}{selectedRule.status === "ACTIVE" ? <RestrictionRuleLifecycleButton key="active-disable" ruleId={selectedRule.id} ruleName={selectedRule.name} mode="disable"/> : <RestrictionRuleLifecycleButton key={`${selectedRule.status}-delete`} ruleId={selectedRule.id} ruleName={selectedRule.name} mode="delete"/>}<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回规则列表</Button></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <ConfigBlock title="触发条件">
            {currentField && currentCondition ? <div className="rounded-xl border border-border p-4"><div className="text-base font-semibold">{conditionSummary(currentField, currentCondition.comparisonValueJson)}</div><div className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><RestrictionInfo label="数据来源" value={sourceLabels[currentField.source]}/><RestrictionInfo label="触发字段" value={currentField.displayName}/><RestrictionInfo label="运算符" value="等于"/></div><div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{currentField.description || "该字段由责任模块提供，本配置只读取字段值。"}</div></div> : <RestrictionWarning text="当前修订尚未配置触发条件。"/>}
          </ConfigBlock>
          <ConfigBlock title="处罚规则">
            <p className="mb-4 text-xs text-muted-foreground">共 {currentOutputs.length} 项处罚规则；这里只展示规则定义，不执行处理</p>
            {currentOutputs.length ? <div className="grid gap-3 md:grid-cols-2">{currentOutputs.map((output) => <div key={output.id} className="rounded-xl border border-border p-4"><div className="font-semibold">{outputSummary(output)}</div>{output.description ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{output.description}</p> : null}</div>)}</div> : <RestrictionWarning text="当前修订尚未配置处罚规则。"/>}
          </ConfigBlock>
          <ConfigBlock title="制度与生效信息">
            {currentRevision ? <div className="grid gap-4 sm:grid-cols-2"><RestrictionInfo label="制度依据" value={currentRevision.policyBasis || "未填写"}/><RestrictionInfo label="优先级" value={String(currentRevision.priority)}/><RestrictionInfo label="生效日期" value={formatRestrictionDate(currentRevision.effectiveFrom)}/><RestrictionInfo label="失效日期" value={formatRestrictionDate(currentRevision.effectiveTo)}/><RestrictionInfo label="规则说明" value={currentRevision.description || "未填写"}/><RestrictionInfo label="修订说明" value={currentRevision.revisionNote || "未填写"}/></div> : <RestrictionWarning text="规则尚无修订。"/>}
          </ConfigBlock>
        </div>
        <ConfigBlock title="基本信息"><div className="space-y-4"><RestrictionInfo label="规则名称" value={selectedRule.name}/><RestrictionInfo label="适用部门" value={departmentNames.get(selectedRule.departmentOrgNodeId) || "历史部门"}/><RestrictionInfo label="规则类别" value={categoryLabels[selectedRule.category]}/><RestrictionInfo label="创建人" value={userNames.get(selectedRule.createdById) || "历史用户"}/><RestrictionInfo label="创建时间" value={formatRestrictionDateTime(selectedRule.createdAt)}/><RestrictionInfo label="最近更新" value={formatRestrictionDateTime(selectedRule.updatedAt)}/></div></ConfigBlock>
      </div>
      <ConfigBlock title="修订历史">
        {revisions.length ? <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[920px] text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{["修订", "状态", "触发条件", "输出", "生效期间", "创建/发布", "修订说明"].map((label) => <th key={label} className="px-4 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{revisions.map((revision) => { const revisionCondition = conditionFor(revision.id); const revisionField = revisionCondition ? fieldById.get(revisionCondition.fieldDefinitionId) ?? null : null; return <tr key={revision.id} className="align-top"><td className="px-4 py-4 font-medium">R{revision.revisionNo}{revision.id === selectedRule.currentRevisionId ? <div className="mt-1 text-xs text-primary">当前使用</div> : null}</td><td className="px-4 py-4"><Badge tone={revision.status === "ACTIVE" ? "success" : revision.status === "DRAFT" ? "warning" : "default"}>{revisionStatusLabels[revision.status]}</Badge></td><td className="px-4 py-4">{conditionSummary(revisionField, revisionCondition?.comparisonValueJson)}</td><td className="px-4 py-4">{outputsFor(revision.id).length}项</td><td className="px-4 py-4 text-xs">{formatRestrictionDate(revision.effectiveFrom)} 至 {formatRestrictionDate(revision.effectiveTo)}</td><td className="px-4 py-4 text-xs"><div>{userNames.get(revision.createdById) || "历史用户"}创建</div><div className="mt-1 text-muted-foreground">{revision.publishedById ? `${userNames.get(revision.publishedById) || "历史用户"}发布` : "尚未发布"}</div></td><td className="max-w-[220px] px-4 py-4 text-xs text-muted-foreground">{revision.revisionNote || "—"}</td></tr>; })}</tbody></table></div> : <div className="py-10 text-center text-sm text-muted-foreground">暂无修订记录</div>}
      </ConfigBlock>
    </div>;
  }

  const activeCount = rows.filter(({ rule }) => rule.status === "ACTIVE").length;
  const draftCount = data.restrictionRuleRevisions.filter((revision) => revision.status === "DRAFT").length;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><RestrictionSummary label="当前规则" value={`${rows.length}条`}/><RestrictionSummary label="已生效" value={`${activeCount}条`}/><RestrictionSummary label="草稿" value={`${draftCount}条`}/></div>
    <div>
      <div className="mb-4 grid gap-2 lg:grid-cols-7">
        <input value={ruleQuery} onChange={(event) => setRuleQuery(event.target.value)} placeholder="搜索规则名称" className={`${inputClass} lg:col-span-2`}/>
        <RestrictionSelect value={category} onChange={setCategory} emptyLabel="全部规则类别" options={Object.entries(categoryLabels)}/>
        <RestrictionSelect value={source} onChange={setSource} emptyLabel="全部数据来源" options={Object.entries(sourceLabels)}/>
        <RestrictionSelect value={outputType} onChange={setOutputType} emptyLabel="全部输出类型" options={Object.entries(outputTypeLabels)}/>
        <RestrictionSelect value={departmentId} onChange={setDepartmentId} emptyLabel="全部适用部门" options={data.departments.map((department) => [department.id, department.name])}/>
        <RestrictionSelect value={status} onChange={setStatus} emptyLabel="全部状态" options={Object.entries(ruleStatusLabels)}/>
        <div className="flex items-center justify-between gap-2 lg:col-span-7"><span className="text-xs text-muted-foreground">列表完整展示每条规则配置的全部处罚规则；新建、编辑和查看均在当前人才发展工作台内完成。</span><div className="flex gap-2"><Button variant="outline" className={actionButtonClass} onClick={clearFilters} disabled={!hasFilters}>清空筛选</Button><Button className={actionButtonClass} onClick={() => { setSelectedRuleId(""); setScreen("editor"); }}><Plus className="h-4 w-4"/>新建规则</Button></div></div>
      </div>
      {filteredRows.length ? <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full table-fixed text-xs xl:text-sm">
          <colgroup><col className="w-[13%]"/><col className="w-[9%]"/><col className="w-[17%]"/><col className="w-[27%]"/><col className="w-[7%]"/><col className="w-[6%]"/><col className="w-[9%]"/><col className="w-[12%]"/></colgroup>
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{["规则名称", "规则类别", "触发条件", "处罚规则", "适用范围", "状态", "最近更新", "操作"].map((label) => <th key={label} className="whitespace-nowrap px-2 py-3 text-left font-medium xl:px-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{filteredRows.map(({ rule, revision, condition, field, outputs }) => {
            const revisionDraft = draftRevisionFor(rule.id);
            return <tr key={rule.id} className="align-top hover:bg-muted/20">
              <td className="break-words px-2 py-4 xl:px-3"><div className="font-medium">{rule.name}</div><div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><span>{revision ? `${rule.status === "ACTIVE" ? "当前生效" : "当前修订"} R${revision.revisionNo}` : "尚无修订"}</span>{revisionDraft && revisionDraft.id !== rule.currentRevisionId ? <Badge tone="warning">R{revisionDraft.revisionNo}草稿</Badge> : null}</div></td>
              <td className="whitespace-nowrap px-2 py-4 xl:px-3"><Badge tone="primary">{categoryLabels[rule.category]}</Badge></td>
              <td className="break-words px-2 py-4 xl:px-3"><div className="font-medium">{conditionSummary(field, condition?.comparisonValueJson)}</div><div className="mt-1 text-xs text-muted-foreground">{field ? sourceLabels[field.source] : "—"}</div></td>
              <td className="px-2 py-4 xl:px-3"><div className="flex max-w-full flex-wrap gap-1">{outputs.map((output) => <Badge key={output.id} tone="default">{outputSummary(output)}</Badge>)}{!outputs.length ? <span className="text-muted-foreground">尚未配置处罚规则</span> : null}</div></td>
              <td className="px-2 py-4 xl:px-3">{departmentNames.get(rule.departmentOrgNodeId) || "历史部门"}</td>
              <td className="px-2 py-4 xl:px-3"><Badge tone={rule.status === "ACTIVE" ? "success" : rule.status === "DRAFT" ? "warning" : "default"}>{ruleStatusLabels[rule.status]}</Badge></td>
              <td className="break-words px-2 py-4 text-xs text-muted-foreground xl:px-3">{formatRestrictionDateTime(rule.updatedAt)}</td>
              <td className="px-2 py-4 xl:px-3"><div className="flex flex-wrap items-center gap-x-2 gap-y-1">{revisionDraft ? <RestrictionRulePublishButton ruleId={rule.id} revisionNo={revisionDraft.revisionNo} compact replacesCurrent={rule.status === "ACTIVE"}/> : null}{rule.status !== "DISABLED" ? <button type="button" className="shrink-0 whitespace-nowrap font-medium text-primary" onClick={() => { setSelectedRuleId(rule.id); setScreen("editor"); }}>编辑</button> : null}<button type="button" className="shrink-0 whitespace-nowrap font-medium text-primary" onClick={() => { setSelectedRuleId(rule.id); setScreen("detail"); }}>查看</button>{rule.status === "ACTIVE" ? <RestrictionRuleLifecycleButton key="active-disable" ruleId={rule.id} ruleName={rule.name} mode="disable" compact/> : <RestrictionRuleLifecycleButton key={`${rule.status}-delete`} ruleId={rule.id} ruleName={rule.name} mode="delete" compact/>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center"><div className="font-medium">{hasFilters ? "没有符合筛选条件的规则" : "尚未建立人才决策规则"}</div><p className="mt-2 text-sm text-muted-foreground">{hasFilters ? "请清空或调整筛选条件。" : "点击“新建规则”建立第一条规则草稿。"}</p></div>}
    </div>
  </div>;
}

type EditableRestrictionOutput = {
  clientId: string;
  outputType: keyof typeof outputTypeLabels;
  handlingCode: string;
  numericValue: string;
  durationValue: string;
  durationUnit: string;
  effectPeriodCode: string;
  description: string;
};

const restrictionHandlingOptions: Record<EditableRestrictionOutput["outputType"], Array<[string, string]>> = {
  KPI_PROCESSING: [["NO_DEDUCTION", "不扣分"], ["DEDUCT_POINTS", "扣减KPI分数"]],
  REWARD_PROCESSING: [["NONE", "不限制"], ["PROHIBIT", "禁止奖励"], ["MANUAL_REVIEW", "人工复核"]],
  SALARY_RESTRICTION: [["NONE", "不限制"], ["PROHIBIT", "禁止加薪"], ["MANUAL_REVIEW", "人工复核"]],
  PROMOTION_RESTRICTION: [["NONE", "不限制"], ["PROHIBIT", "禁止晋升"], ["MANUAL_REVIEW", "人工复核"]],
  ANNUAL_BONUS_PROCESSING: [["NONE", "不处理"], ["CANCEL", "取消年终奖"], ["MANUAL_REVIEW", "人工复核"]],
  TRAINING_OR_TRANSFER: [["TRAINING", "安排培训"], ["TRANSFER", "建议调岗"], ["TRAINING_OR_TRANSFER", "培训或调岗"], ["MANUAL_REVIEW", "人工复核"]],
  SALARY_REDUCTION: [["SUGGEST_REDUCTION", "建议降薪"], ["MANUAL_REVIEW", "人工复核"]],
  CONTRACT_PROCESSING: [["DO_NOT_RENEW", "不续签"], ["SUGGEST_TERMINATION", "解除合同"], ["IMMEDIATE_TERMINATION_RECOMMENDATION", "立即解除合同"]],
};
const restrictionDurationOptions: Array<[string, string]> = [["DAY", "天"], ["MONTH", "个月"], ["QUARTER", "个季度"], ["YEAR", "年"]];
const restrictionEffectPeriodOptions: Array<[string, string]> = [["CURRENT_QUARTER", "当季度"], ["CURRENT_YEAR", "当年度"], ["UNTIL_MANUAL_RELEASE", "直至人工解除"], ["IMMEDIATE", "立即"]];
const initialRestrictionRuleState: RestrictionRuleDraftActionState = { status: "idle", message: "" };

function parseRestrictionOptions(value: string) {
  try { return JSON.parse(value) as Array<{ value: string; label: string }>; } catch { return []; }
}

function parseRestrictionComparison(value: string | null | undefined) {
  try { const parsed = JSON.parse(value || "null") as unknown; return typeof parsed === "string" ? parsed : ""; } catch { return ""; }
}

function restrictionComparisonOptions(
  data: TalentDecisionRuleWorkspaceData,
  field: TalentDecisionRuleWorkspaceData["restrictionFieldDefinitions"][number] | undefined,
  departmentOrgNodeId: string,
) {
  if (!field) return [];
  if (field.source === "WORK_INCIDENT") return data.incidentLevelOptionsByDepartment.find((item) => item.departmentOrgNodeId === departmentOrgNodeId)?.options ?? [];
  if (field.source === "QUARTERLY_KPI") return data.kpiLevelOptionsByDepartment.find((item) => item.departmentOrgNodeId === departmentOrgNodeId)?.options ?? [];
  if (field.source === "TALENT_REVIEW") return data.talentReviewLevelOptionsByDepartment.find((item) => item.departmentOrgNodeId === departmentOrgNodeId)?.options ?? [];
  return parseRestrictionOptions(field.enumValuesJson);
}

const configuredTriggerSources: Partial<Record<keyof typeof categoryLabels, { configurationName: string; valueName: string }>> = {
  WORK_INCIDENT: { configurationName: "工作事故等级配置", valueName: "事故等级" },
  QUARTERLY_KPI: { configurationName: "绩效等级规则", valueName: "KPI等级" },
  TALENT_REVIEW: { configurationName: "人才盘点模型等级区间", valueName: "人才盘点等级" },
} as const;

function dateInputValue(value: string | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }

function RestrictionRuleDraftEditor({ data, rule, revision, condition, outputs, onBack }: {
  data: TalentDecisionRuleWorkspaceData;
  rule: TalentDecisionRuleWorkspaceData["restrictionRules"][number] | null;
  revision: TalentDecisionRuleWorkspaceData["restrictionRuleRevisions"][number] | null;
  condition: TalentDecisionRuleWorkspaceData["restrictionRuleConditions"][number] | null;
  outputs: TalentDecisionRuleWorkspaceData["restrictionRuleOutputs"];
  onBack: () => void;
}) {
  const router = useRouter();
  const initialCategory = rule?.category ?? "WORK_INCIDENT";
  const initialFields = data.restrictionFieldDefinitions.filter((field) => field.source === initialCategory);
  const initialDepartmentId = rule?.departmentOrgNodeId ?? data.departments[0]?.id ?? "";
  const [name, setName] = useState(rule?.name ?? "");
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const [category, setCategory] = useState<keyof typeof categoryLabels>(initialCategory);
  const [fieldId, setFieldId] = useState(condition?.fieldDefinitionId ?? initialFields[0]?.id ?? "");
  const initialField = data.restrictionFieldDefinitions.find((field) => field.id === (condition?.fieldDefinitionId ?? initialFields[0]?.id));
  const initialOptions = restrictionComparisonOptions(data, initialField, initialDepartmentId);
  const [comparisonValue, setComparisonValue] = useState(parseRestrictionComparison(condition?.comparisonValueJson) || initialOptions[0]?.value || "");
  const [policyBasis, setPolicyBasis] = useState(revision?.policyBasis ?? "");
  const [description, setDescription] = useState(revision?.description ?? "");
  const [revisionNote, setRevisionNote] = useState(revision?.revisionNote ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(dateInputValue(revision?.effectiveFrom) || new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState(dateInputValue(revision?.effectiveTo));
  const [priority, setPriority] = useState(String(revision?.priority ?? 100));
  const [editableOutputs, setEditableOutputs] = useState<EditableRestrictionOutput[]>(outputs.map((output) => ({
    clientId: output.id,
    outputType: output.outputType,
    handlingCode: output.outputType === "REWARD_PROCESSING" && ["RESTRICT", "CANCEL"].includes(output.handlingCode) ? "PROHIBIT" : output.handlingCode,
    numericValue: output.numericValue == null ? "" : String(output.numericValue),
    durationValue: output.durationValue == null ? "" : String(output.durationValue),
    durationUnit: output.durationUnit ?? "",
    effectPeriodCode: output.effectPeriodCode ?? "",
    description: output.description ?? "",
  })));
  const [saveState, saveAction, saving] = useActionState(saveTalentRestrictionRuleDraft, initialRestrictionRuleState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteTalentRestrictionRuleDraft, initialRestrictionRuleState);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isActiveRule = rule?.status === "ACTIVE";
  const availableFields = data.restrictionFieldDefinitions.filter((field) => field.source === category);
  const selectedField = availableFields.find((field) => field.id === fieldId);
  const comparisonOptions = restrictionComparisonOptions(data, selectedField, departmentId);
  const comparisonValueAvailable = comparisonOptions.some((option) => option.value === comparisonValue);
  const configuredTriggerSource = configuredTriggerSources[category];
  const effectiveRuleId = rule?.id ?? saveState.ruleId ?? "";
  const canDeleteDraft = rule?.status === "DRAFT" || revision?.status === "DRAFT" || (isActiveRule && saveState.status === "success");

  useEffect(() => { if (saveState.status === "success") router.refresh(); }, [router, saveState.status]);
  useEffect(() => { if (deleteState.status === "success") { router.refresh(); onBack(); } }, [deleteState.status, onBack, router]);

  const updateOutput = (clientId: string, patch: Partial<EditableRestrictionOutput>) => setEditableOutputs((current) => current.map((output) => output.clientId === clientId ? { ...output, ...patch } : output));
  const addOutput = (outputType: EditableRestrictionOutput["outputType"]) => setEditableOutputs((current) => [...current, {
    clientId: crypto.randomUUID(),
    outputType,
    handlingCode: restrictionHandlingOptions[outputType][0][0],
    numericValue: "",
    durationValue: "",
    durationUnit: "",
    effectPeriodCode: "",
    description: "",
  }]);
  const submittedOutputs = editableOutputs.map((output) => ({
    outputType: output.outputType,
    handlingCode: output.handlingCode,
    numericValue: output.numericValue === "" ? null : Number(output.numericValue),
    durationValue: output.durationValue === "" ? null : Number(output.durationValue),
    durationUnit: output.durationUnit,
    effectPeriodCode: output.effectPeriodCode,
    description: output.description,
  }));
  const previewOutputs = submittedOutputs.map((output, index) => ({ ...output, numericValue: output.numericValue, durationValue: output.durationValue, durationUnit: output.durationUnit || null, effectPeriodCode: output.effectPeriodCode || null, parametersJson: "{}", sortOrder: (index + 1) * 10 }));
  const usedOutputTypes = new Set(editableOutputs.map((output) => output.outputType));

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4"><div><h3 className="text-lg font-semibold">{rule ? `编辑规则：${rule.name}` : "新建人才决策规则"}</h3><p className="mt-1 text-xs text-muted-foreground">{isActiveRule ? revision?.status === "DRAFT" ? `正在编辑R${revision.revisionNo}修订草稿，当前生效版本保持不变` : `以当前生效R${revision?.revisionNo ?? 1}为基础，保存时建立下一修订草稿` : "只定义触发字段和处罚规则；不会匹配员工或生成限制记录"}</p></div><Button variant="outline" className={actionButtonClass} onClick={onBack}><ArrowRight className="h-4 w-4 rotate-180"/>返回规则列表</Button></div>
    <form action={saveAction} className="space-y-4">
      <input type="hidden" name="ruleId" value={effectiveRuleId}/><input type="hidden" name="outputsJson" value={JSON.stringify(submittedOutputs)}/>
      <ConfigBlock title="1. 规则基本信息"><div className="grid gap-4 md:grid-cols-2"><Field label="规则名称"><input name="规则名称" value={name} onChange={(event) => setName(event.target.value)} readOnly={isActiveRule} required className={`${inputClass} ${isActiveRule ? "bg-muted/50" : ""}`} placeholder="例如：A级工作事故"/></Field><Field label="适用部门">{isActiveRule ? <><input type="hidden" name="适用部门" value={departmentId}/><div className="flex h-10 items-center rounded-lg bg-muted/50 px-3 text-sm">{data.departments.find((department) => department.id === departmentId)?.name}</div></> : <select name="适用部门" value={departmentId} onChange={(event) => { const nextDepartmentId = event.target.value; setDepartmentId(nextDepartmentId); setComparisonValue(restrictionComparisonOptions(data, selectedField, nextDepartmentId)[0]?.value ?? ""); }} required className={inputClass}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>}</Field><Field label="规则类别">{isActiveRule ? <><input type="hidden" name="规则类别" value={category}/><div className="flex h-10 items-center rounded-lg bg-muted/50 px-3 text-sm">{categoryLabels[category]}</div></> : <select name="规则类别" value={category} onChange={(event) => { const nextCategory = event.target.value as keyof typeof categoryLabels; const nextField = data.restrictionFieldDefinitions.find((field) => field.source === nextCategory); setCategory(nextCategory); setFieldId(nextField?.id ?? ""); setComparisonValue(restrictionComparisonOptions(data, nextField, departmentId)[0]?.value ?? ""); }} className={inputClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</Field><Field label="制度依据"><input name="制度依据" value={policyBasis} onChange={(event) => setPolicyBasis(event.target.value)} className={inputClass} placeholder="例如：部门绩效管理机制 V3.0"/></Field><Field label="生效日期"><input type="date" name="生效日期" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required className={inputClass}/></Field><Field label="失效日期（可选）"><input type="date" name="失效日期" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} className={inputClass}/></Field><Field label="优先级"><input type="number" min="0" step="1" name="优先级" value={priority} onChange={(event) => setPriority(event.target.value)} required className={inputClass}/></Field><Field label="修订说明"><input name="修订说明" value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} className={inputClass} placeholder="说明本次草稿变更"/></Field><div className="md:col-span-2"><Field label="规则说明"><textarea name="规则说明" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={`${inputClass} h-auto py-2`} placeholder="说明规则适用背景和边界"/></Field></div></div>{isActiveRule ? <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">规则名称、类别和适用部门用于标识同一规则，修订时保持不变；触发条件、输出和生效信息均可调整。</div> : null}</ConfigBlock>
      <ConfigBlock title="2. 触发条件"><div className="grid gap-4 md:grid-cols-3"><Field label="数据来源"><div className="flex h-10 items-center rounded-lg bg-muted/50 px-3 text-sm">{sourceLabels[category]}</div></Field><Field label="触发字段"><select name="触发字段" value={selectedField?.id ?? ""} onChange={(event) => { const nextField = availableFields.find((field) => field.id === event.target.value); setFieldId(event.target.value); setComparisonValue(restrictionComparisonOptions(data, nextField, departmentId)[0]?.value ?? ""); }} required className={inputClass}>{availableFields.map((field) => <option key={field.id} value={field.id}>{field.displayName}</option>)}</select></Field><Field label="触发字段值"><select name="触发字段值" value={comparisonValueAvailable ? comparisonValue : ""} onChange={(event) => setComparisonValue(event.target.value)} required disabled={!comparisonOptions.length} className={inputClass}><option value="" disabled>{comparisonOptions.length ? "请选择" : "暂无可用选项"}</option>{comparisonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>{selectedField ? configuredTriggerSource && !comparisonOptions.length ? <RestrictionWarning text={`当前适用部门尚未发布可用的${configuredTriggerSource.configurationName}，请先完成配置并发布。`}/> : configuredTriggerSource && comparisonValue && !comparisonValueAvailable ? <RestrictionWarning text={`当前规则引用的${configuredTriggerSource.valueName}已不在最新发布的${configuredTriggerSource.configurationName}中，请重新选择后保存。`}/> : <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">判断方式固定为“等于”。{configuredTriggerSource ? `${configuredTriggerSource.valueName}选项来自当前部门已发布的${configuredTriggerSource.configurationName}。` : selectedField.description || "字段值由对应业务模块提供。"}</div> : <RestrictionWarning text="当前规则类别没有可用触发字段。"/>}</ConfigBlock>
      <ConfigBlock title="3. 处罚规则">
        <p className="mb-3 text-xs text-muted-foreground">选择需要产生的结构化处理定义；同一类型最多配置一次，每种处理占一行。</p>
        <div className="mb-4 flex flex-wrap gap-2">{Object.entries(outputTypeLabels).map(([value, label]) => <Button key={value} type="button" variant="outline" className={actionButtonClass} disabled={usedOutputTypes.has(value as EditableRestrictionOutput["outputType"])} onClick={() => addOutput(value as EditableRestrictionOutput["outputType"])}><Plus className="h-4 w-4"/>添加{label}</Button>)}</div>
        {editableOutputs.length ? <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[1320px] table-fixed text-sm">
            <colgroup><col className="w-[150px]"/><col className="w-[180px]"/><col className="w-[100px]"/><col className="w-[110px]"/><col className="w-[145px]"/><col className="w-[190px]"/><col/><col className="w-[64px]"/></colgroup>
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-2.5 text-left font-medium">处罚类型</th><th className="px-3 py-2.5 text-left font-medium">处理方式</th><th className="px-3 py-2.5 text-left font-medium">扣分值</th><th className="px-3 py-2.5 text-left font-medium">限制时长</th><th className="px-3 py-2.5 text-left font-medium">时长单位</th><th className="px-3 py-2.5 text-left font-medium">作用周期或结束方式</th><th className="px-3 py-2.5 text-left font-medium">处理说明</th><th className="px-3 py-2.5 text-center font-medium">操作</th></tr></thead>
            <tbody className="divide-y divide-border">{editableOutputs.map((output, index) => <tr key={output.clientId} className="align-middle">
              <td className="px-3 py-2"><div className="font-medium">{index + 1}. {outputTypeLabels[output.outputType]}</div></td>
              <td className="px-3 py-2"><select aria-label={`${outputTypeLabels[output.outputType]}处理方式`} value={output.handlingCode} onChange={(event) => updateOutput(output.clientId, { handlingCode: event.target.value })} className={inputClass}>{restrictionHandlingOptions[output.outputType].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
              <td className="px-3 py-2">{output.outputType === "KPI_PROCESSING" && output.handlingCode === "DEDUCT_POINTS" ? <input aria-label="扣分值" type="number" min="0.01" step="0.01" value={output.numericValue} onChange={(event) => updateOutput(output.clientId, { numericValue: event.target.value })} className={inputClass}/> : <span className="px-3 text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2"><input aria-label={`${outputTypeLabels[output.outputType]}限制时长`} type="number" min="1" step="1" value={output.durationValue} onChange={(event) => updateOutput(output.clientId, { durationValue: event.target.value })} className={inputClass} placeholder="可选"/></td>
              <td className="px-3 py-2"><select aria-label={`${outputTypeLabels[output.outputType]}时长单位`} value={output.durationUnit} onChange={(event) => updateOutput(output.clientId, { durationUnit: event.target.value })} className={inputClass}><option value="">不按固定时长</option>{restrictionDurationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
              <td className="px-3 py-2"><select aria-label={`${outputTypeLabels[output.outputType]}作用周期或结束方式`} value={output.effectPeriodCode} onChange={(event) => updateOutput(output.clientId, { effectPeriodCode: event.target.value })} className={inputClass}><option value="">不单独设置</option>{restrictionEffectPeriodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
              <td className="px-3 py-2"><input aria-label={`${outputTypeLabels[output.outputType]}处理说明`} value={output.description} onChange={(event) => updateOutput(output.clientId, { description: event.target.value })} className={inputClass} placeholder="可选，补充制度原文或执行口径"/></td>
              <td className="px-3 py-2 text-center"><button type="button" className={rowIconButtonClass} aria-label={`删除${outputTypeLabels[output.outputType]}`} onClick={() => setEditableOutputs((current) => current.filter((item) => item.clientId !== output.clientId))}><Trash2 className="h-4 w-4 text-destructive"/></button></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">请至少添加一项处罚规则</div>}
      </ConfigBlock>
      <ConfigBlock title="4. 规则内容预览"><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="font-semibold">{name || "未命名规则"}</div><div className="mt-2 text-sm">当“{selectedField?.displayName || "未选择字段"}”等于“{comparisonOptions.find((option) => option.value === comparisonValue)?.label || "未选择"}”时：</div><div className="mt-3 flex flex-wrap gap-2">{previewOutputs.length ? previewOutputs.map((output, index) => <Badge key={`${output.outputType}-${index}`} tone="primary">{outputSummary(output)}</Badge>) : <span className="text-sm text-muted-foreground">尚未配置处罚规则</span>}</div><div className="mt-3 text-xs text-muted-foreground">适用部门：{data.departments.find((department) => department.id === departmentId)?.name || "未选择"} · 生效日期：{effectiveFrom || "未设置"}</div></div></ConfigBlock>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{saveState.status !== "idle" ? <span className={`text-sm ${saveState.status === "error" ? "text-destructive" : "text-emerald-600"}`}>{saveState.message}</span> : null}</div><div className="flex gap-2"><Button type="button" variant="outline" className={actionButtonClass} onClick={onBack}>取消</Button><Button type="submit" className={actionButtonClass} disabled={saving || !selectedField || editableOutputs.length === 0}><Save className="h-4 w-4"/>{saving ? "保存中" : "保存草稿"}</Button></div></div>
    </form>
    {effectiveRuleId && canDeleteDraft ? <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-4"><div><div className="text-sm font-medium">{isActiveRule ? "删除修订草稿" : "删除规则草稿"}</div><div className="mt-1 text-xs text-muted-foreground">{isActiveRule ? "只删除尚未发布的下一修订，当前生效版本不受影响" : "只允许删除尚未发布的草稿规则"}</div>{deleteState.status === "error" ? <div className="mt-1 text-xs text-destructive">{deleteState.message}</div> : null}</div><Button type="button" variant="outline" className={`${actionButtonClass} text-destructive`} disabled={deleting} onClick={() => setDeleteDialogOpen(true)}><Trash2 className="h-4 w-4"/>{deleting ? "删除中" : isActiveRule ? "删除修订草稿" : "删除规则草稿"}</Button><RestrictionActionDialog open={deleteDialogOpen} title={isActiveRule ? "删除修订草稿" : "删除规则草稿"} description={isActiveRule ? "删除后只撤销尚未发布的下一修订草稿，当前生效版本不会受到影响。" : "删除后该规则草稿及其全部配置将永久移除，且无法恢复。"} confirmLabel="确认删除" pending={deleting} errorMessage={deleteState.status === "error" ? deleteState.message : undefined} danger ruleId={effectiveRuleId} action={deleteAction} onClose={() => setDeleteDialogOpen(false)}/></div> : null}
  </div>;
}

function RestrictionSelect({ value, onChange, emptyLabel, options }: { value: string; onChange: (value: string) => void; emptyLabel: string; options: Array<[string, string]> }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">{emptyLabel}</option>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
}

function RestrictionActionDialog({ open, title, description, confirmLabel, pending, errorMessage, danger = false, ruleId, action, onClose }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  errorMessage?: string;
  danger?: boolean;
  ruleId: string;
  action: (formData: FormData) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby={`restriction-action-${ruleId}`}>
    <button type="button" aria-label="关闭确认弹窗" className="absolute inset-0 bg-slate-950/40" disabled={pending} onClick={onClose}/>
    <form action={action} className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <input type="hidden" name="ruleId" value={ruleId}/>
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{danger ? <ShieldAlert className="h-5 w-5"/> : <Check className="h-5 w-5"/>}</div>
      <h2 id={`restriction-action-${ruleId}`} className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {errorMessage ? <div className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</div> : null}
      <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button><Button type="submit" disabled={pending} className={danger ? "bg-destructive text-white hover:bg-destructive/90" : ""}>{pending ? "处理中" : confirmLabel}</Button></div>
    </form>
  </div>;
}

function RestrictionRulePublishButton({ ruleId, revisionNo, compact = false, replacesCurrent = false }: { ruleId: string; revisionNo: number; compact?: boolean; replacesCurrent?: boolean }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, action, pending] = useActionState(publishTalentRestrictionRuleDraft, initialRestrictionRuleState);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);
  return <div className="inline-flex items-center gap-1.5">
    {compact
      ? <button type="button" disabled={pending} onClick={() => setDialogOpen(true)} className="shrink-0 whitespace-nowrap font-medium text-primary disabled:opacity-50">{pending ? "发布中" : "发布"}</button>
      : <Button type="button" className={actionButtonClass} disabled={pending} onClick={() => setDialogOpen(true)}><Check className="h-4 w-4"/>{pending ? "发布中" : "发布规则"}</Button>}
    {state.status === "error" ? <span className="text-xs text-destructive" title={state.message}>失败</span> : null}
    <RestrictionActionDialog open={dialogOpen && state.status !== "success"} title="发布规则" description={replacesCurrent ? `确认发布 R${revisionNo}？发布成功后，该修订将替换当前生效版本，原版本转为历史版本。` : `确认发布 R${revisionNo}？发布成功后，该规则将进入生效状态。`} confirmLabel="确认发布" pending={pending} errorMessage={state.status === "error" ? state.message : undefined} ruleId={ruleId} action={action} onClose={() => setDialogOpen(false)}/>
  </div>;
}

function RestrictionRuleLifecycleButton({ ruleId, ruleName, mode, compact = false }: { ruleId: string; ruleName: string; mode: "disable" | "delete"; compact?: boolean }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const actionHandler = mode === "disable" ? disableTalentRestrictionRule : deleteTalentRestrictionRule;
  const [state, action, pending] = useActionState(actionHandler, initialRestrictionRuleState);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);
  const label = mode === "disable" ? "禁用" : "删除";
  const description = mode === "disable"
    ? `禁用“${ruleName}”后，该规则将立即退出生效范围，未发布修订将同时撤回。历史版本仍会保留。`
    : `删除“${ruleName}”后，规则及全部修订历史将永久删除，且无法恢复。`;
  return <div className="inline-flex items-center gap-1.5">
    {compact
      ? <button type="button" disabled={pending} onClick={() => setDialogOpen(true)} className="shrink-0 whitespace-nowrap font-medium text-destructive disabled:opacity-50">{pending ? `${label}中` : label}</button>
      : <Button type="button" variant="outline" className={`${actionButtonClass} text-destructive`} disabled={pending} onClick={() => setDialogOpen(true)}>{mode === "delete" ? <Trash2 className="h-4 w-4"/> : <X className="h-4 w-4"/>}{pending ? `${label}中` : `${label}规则`}</Button>}
    {state.status === "error" ? <span className="text-xs text-destructive" title={state.message}>失败</span> : null}
    <RestrictionActionDialog open={dialogOpen && state.status !== "success"} title={mode === "disable" ? "禁用规则" : "删除规则"} description={description} confirmLabel={mode === "disable" ? "确认禁用" : "确认删除"} pending={pending} errorMessage={state.status === "error" ? state.message : undefined} danger ruleId={ruleId} action={action} onClose={() => setDialogOpen(false)}/>
  </div>;
}

function RestrictionSummary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/40 px-4 py-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
function RestrictionInfo({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium leading-5">{value}</div></div>; }
function RestrictionWarning({ text }: { text: string }) { return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">{text}</div>; }
function formatRestrictionDate(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString("zh-CN") : "长期有效"; }
function formatRestrictionDateTime(value: string | null | undefined) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; }

const initialBusinessAssessmentRuleState: BusinessAssessmentRuleActionState = { status: "idle", message: "" };
const initialTalentRuleState: TalentRuleActionState = { status: "idle", message: "" };

type IncidentLevelDefinition = {
  level: string;
  name?: string;
};

function incidentConfigurationName(name: string) {
  return name === "工作事故规则" ? "工作事故等级配置" : name;
}

function IncidentRuleConfiguration({ data }: { data: TalentDecisionRuleWorkspaceData }) {
  const [createState, createAction, creating] = useActionState(createWorkIncidentRuleVersion, initialTalentRuleState);
  const [screen, setScreen] = useState<"list" | "create" | "detail">("list");
  const [selectedVersionId, setSelectedVersionId] = useState(data.incidentRuleVersions[0]?.id ?? "");
  const departmentNames = new Map(data.departments.map((row) => [row.id, row.name]));
  const selected = data.incidentRuleVersions.find((row) => row.id === selectedVersionId);

  if (screen === "list") return <div>
    <div className="mb-4 flex justify-end"><Button className={actionButtonClass} onClick={() => setScreen("create")}><Plus className="h-4 w-4"/>新建规则版本</Button></div>
    <div className="space-y-2">{data.incidentRuleVersions.map((rule) => <button key={rule.id} type="button" onClick={() => { setSelectedVersionId(rule.id); setScreen("detail"); }} className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left hover:border-primary/40"><div><div className="font-medium">{incidentConfigurationName(rule.name)} · V{rule.version}</div><div className="mt-1 text-xs text-muted-foreground">{departmentNames.get(rule.departmentOrgNodeId)} · 正式制度 {rule.policyVersion}</div></div><div className="flex items-center gap-3"><Badge tone={rule.status === "ACTIVE" ? "success" : rule.status === "DRAFT" ? "warning" : "default"}>{rule.status === "ACTIVE" ? "已发布" : rule.status === "DRAFT" ? "草稿" : "历史版本"}</Badge><span className="text-xs text-primary">{rule.status === "DRAFT" ? "编辑" : "查看"} ›</span></div></button>)}{!data.incidentRuleVersions.length && <div className="py-10 text-center text-sm text-muted-foreground">暂无配置版本，请新建第一版</div>}</div>
  </div>;

  if (screen === "create") return <div><WorkbenchHeader title="新建工作事故等级配置" description="建立独立的工作事故等级定义版本" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/><ConfigBlock title="基本信息"><form action={createAction} className="space-y-3"><Field label="适用部门"><select name="departmentOrgNodeId" required className={inputClass}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="配置名称"><input name="name" required defaultValue="工作事故等级配置" className={inputClass}/></Field><div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">本页面只定义S/A/B/C/D工作事故等级。KPI扣分、晋升、加薪、奖励和合同处罚均在“人才决策规则配置”中，以事故等级作为触发条件独立维护。</div><Button type="submit" disabled={creating} className={actionButtonClass}>{creating ? "创建中" : "创建草稿"}</Button><ActionFeedback state={createState}/></form></ConfigBlock></div>;

  if (!selected) return <ConfigBlock title="规则版本不存在"><Button variant="outline" onClick={() => setScreen("list")}>返回版本列表</Button></ConfigBlock>;
  let levelDefinitions: IncidentLevelDefinition[] = [];
  try { levelDefinitions = JSON.parse(selected.matrixJson) as IncidentLevelDefinition[]; } catch { levelDefinitions = []; }
  return <div className="space-y-4"><WorkbenchHeader title={`${incidentConfigurationName(selected.name)} · V${selected.version}`} description={`${departmentNames.get(selected.departmentOrgNodeId)} · 正式制度 ${selected.policyVersion}`} action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/><ConfigBlock title="事故等级定义"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Badge tone={selected.status === "ACTIVE" ? "success" : selected.status === "DRAFT" ? "warning" : "default"}>{selected.status === "ACTIVE" ? "已发布" : selected.status === "DRAFT" ? "草稿" : "历史版本"}</Badge><span className="text-xs text-muted-foreground">仅提供事故等级，不包含任何处罚规则</span></div><div className="flex gap-2">{selected.status === "DRAFT" ? <IncidentRulePublishButton id={selected.id}/> : <IncidentRuleCloneButton id={selected.id}/>}</div></div><div className="rounded-xl border border-border"><table className="w-full table-fixed text-sm"><thead className="bg-muted/40"><tr><th className="w-1/3 p-3 text-left">事故等级</th><th className="p-3 text-left">等级名称</th></tr></thead><tbody className="divide-y divide-border">{levelDefinitions.map((row) => <tr key={row.level}><td className="p-3 font-semibold">{row.level}</td><td className="p-3">{row.name || `${row.level}级事故`}</td></tr>)}</tbody></table></div>{!levelDefinitions.length && <div className="mt-3 text-sm text-destructive">事故等级定义无法读取，请勿发布。</div>}<div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">需要针对某个事故等级配置KPI扣分、晋升、加薪、奖励或合同处罚时，请前往“人才决策规则配置”，选择“工作事故 → 事故等级”作为触发条件。</div></ConfigBlock></div>;
}

function IncidentRulePublishButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(publishWorkIncidentRuleVersion, initialTalentRuleState);
  return <form action={action} className="flex items-center gap-2"><input type="hidden" name="id" value={id}/><Button type="submit" disabled={pending} className={actionButtonClass}>{pending ? "发布中" : "发布"}</Button><ActionFeedback state={state}/></form>;
}

function IncidentRuleCloneButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cloneWorkIncidentRuleVersion, initialTalentRuleState);
  return <form action={action} className="flex items-center gap-2"><input type="hidden" name="sourceId" value={id}/><Button type="submit" disabled={pending} variant="outline" className={actionButtonClass}>{pending ? "复制中" : "复制为新草稿"}</Button><ActionFeedback state={state}/></form>;
}

function KpiRatingRuleConfiguration({ data }: { data: TalentDecisionRuleWorkspaceData }) {
  const [kpiState, createKpiAction, creatingKpi] = useActionState(createDefaultKpiRatingRule, initialTalentRuleState);
  const departmentNames = new Map(data.departments.map((row) => [row.id, row.name]));
  const versions = data.kpiRuleVersions;
  const [screen, setScreen] = useState<"list" | "create" | "detail">("list");
  const [selectedVersionId, setSelectedVersionId] = useState(versions[0]?.id ?? "");
  if (screen === "list") return <div>
    <div className="mb-4 flex justify-end"><Button className={actionButtonClass} onClick={() => setScreen("create")}><Plus className="h-4 w-4"/>新建规则版本</Button></div>
    <div className="space-y-2">{versions.map((rule) => <button key={rule.id} type="button" onClick={() => { setSelectedVersionId(rule.id); setScreen("detail"); }} className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left hover:border-primary/40"><div><div className="font-medium">{rule.name} · V{rule.version}</div><div className="mt-1 text-xs text-muted-foreground">{departmentNames.get(rule.departmentOrgNodeId)} · {data.kpiBands.filter((band) => band.ruleVersionId === rule.id).length}个等级区间</div></div><div className="flex items-center gap-3"><Badge tone={rule.status === "ACTIVE" ? "success" : rule.status === "DRAFT" ? "warning" : "default"}>{rule.status === "ACTIVE" ? "已发布" : rule.status === "DRAFT" ? "草稿" : "历史版本"}</Badge><span className="text-xs text-primary">{rule.status === "DRAFT" ? "编辑" : "查看"} ›</span></div></button>)}{!versions.length && <div className="py-10 text-center text-sm text-muted-foreground">暂无规则版本，请新建第一版</div>}</div>
  </div>;
  if (screen === "create") return <div><WorkbenchHeader title="新建绩效等级规则" description="创建后进入独立草稿编辑页" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/><ConfigBlock title="规则基本信息"><form action={createKpiAction} className="space-y-3"><Field label="适用部门"><select name="departmentOrgNodeId" required className={inputClass}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="规则名称"><input name="name" required defaultValue="KPI 绩效等级规则" className={inputClass}/></Field><Field label="季度KPI总分"><input name="quarterlyKpiTotalScore" type="number" step="0.01" min="0" required defaultValue="110" className={inputClass}/></Field><Button type="submit" disabled={creatingKpi} className={actionButtonClass}>{creatingKpi ? "创建中" : "创建草稿"}</Button><ActionFeedback state={kpiState}/></form></ConfigBlock></div>;
  const selectedVersions = versions.filter((rule) => rule.id === selectedVersionId);
  return <div className="space-y-4">
    <WorkbenchHeader title="规则版本详情" description="草稿可编辑，已发布版本只读" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/>
    <ConfigBlock title="绩效等级规则版本"><div className="space-y-3">{selectedVersions.map((rule) => { const bands = data.kpiBands.filter((band) => band.ruleVersionId === rule.id); return <div key={rule.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{rule.name} · V{rule.version}</div><div className="mt-1 text-xs text-muted-foreground">{departmentNames.get(rule.departmentOrgNodeId)} · 季度KPI总分 {rule.quarterlyKpiTotalScore ?? "—"}</div></div><div className="flex items-center gap-2"><Badge tone={rule.status === "ACTIVE" ? "success" : rule.status === "DRAFT" ? "warning" : "default"}>{rule.status === "ACTIVE" ? "已发布" : rule.status === "DRAFT" ? "草稿" : "已归档"}</Badge>{rule.status === "DRAFT" && <KpiRulePublishButton id={rule.id}/>}</div></div><KpiRuleOverview bands={bands}/>{rule.status === "DRAFT" ? <div className="mt-4 space-y-2"><div className="text-xs font-medium text-muted-foreground">编辑等级名称、分数区间和评价说明</div>{bands.map((band) => <KpiBandEditor key={band.id} band={band}/>)}</div> : null}</div>; })}</div></ConfigBlock>
  </div>;
}

function KpiRulePublishButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(publishKpiRatingRule, initialTalentRuleState);
  return <form action={formAction} className="flex items-center gap-2"><input type="hidden" name="id" value={id}/><Button type="submit" disabled={pending} className={actionButtonClass}>{pending ? "发布中" : "发布"}</Button>{state.status === "error" && <span className="text-xs text-red-600">{state.message}</span>}</form>;
}

function RuleSaveFeedback({ state }: { state: TalentRuleActionState }) {
  if (state.status === "idle") return null;
  return <span className={`text-xs ${state.status === "error" ? "text-red-600" : "text-emerald-600"}`}>{state.message}</span>;
}

function KpiRuleOverview({ bands }: { bands: TalentDecisionRuleWorkspaceData["kpiBands"] }) {
  const ordered = [...bands].sort((left, right) => right.minScore - left.minScore);
  const ascending = [...bands].sort((left, right) => left.minScore - right.minScore);
  const isContinuous = ascending.length > 0
    && ascending[0].minScore === 0
    && ascending.filter((band) => band.isUnbounded).length === 1
    && ascending.at(-1)?.isUnbounded === true
    && ascending.every((band, index) => index === 0 || band.minScore === Number(ascending[index - 1].maxScore) + 1);
  return <div className="mt-4 overflow-hidden rounded-lg border border-border">
    <div className="flex items-center justify-between bg-muted/40 px-3 py-2"><span className="text-xs font-semibold">规则内容快速核验</span><Badge tone={isContinuous ? "success" : "danger"}>{isContinuous ? "区间连续完整" : "区间存在断档或重叠"}</Badge></div>
    <table className="w-full text-sm"><thead><tr className="border-t border-border text-xs text-muted-foreground"><th className="p-3 text-left">绩效等级</th><th className="p-3 text-left">适用分数</th><th className="p-3 text-left">评价说明</th></tr></thead><tbody className="divide-y divide-border">{ordered.map((band) => <tr key={band.id}><td className="p-3 font-semibold">{band.name}</td><td className="p-3">{band.isUnbounded ? `${band.minScore}分及以上` : `${band.minScore}–${band.maxScore}分`}</td><td className="p-3 text-muted-foreground">{band.description || "—"}</td></tr>)}</tbody></table>
  </div>;
}

function KpiBandEditor({ band }: { band: TalentDecisionRuleWorkspaceData["kpiBands"][number] }) {
  const [state, action, pending] = useActionState(saveKpiRatingBand, initialTalentRuleState);
  const [isUnbounded, setIsUnbounded] = useState(band.isUnbounded);
  return <form action={action} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-6">
    <input type="hidden" name="id" value={band.id}/>
    <Field label="等级名称"><input name="name" required defaultValue={band.name} className={inputClass}/></Field>
    <Field label="最低分"><input name="minScore" type="number" required defaultValue={band.minScore} className={inputClass}/></Field>
    <Field label="最高分"><input name="maxScore" type="number" disabled={isUnbounded} defaultValue={band.maxScore ?? ""} className={inputClass}/></Field>
    <Field label="评价说明"><input name="description" defaultValue={band.description ?? ""} className={inputClass}/></Field>
    <label className="flex h-9 items-center gap-2 self-end text-xs"><input name="isUnbounded" type="checkbox" checked={isUnbounded} onChange={(event) => setIsUnbounded(event.target.checked)}/>不设上限</label>
    <Button type="submit" disabled={pending} className={`${actionButtonClass} self-end`}>{pending ? "保存中" : "保存等级"}</Button>
    <div className="md:col-span-6"><RuleSaveFeedback state={state}/></div>
  </form>;
}

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

function BusinessAssessmentRuleConfiguration({ data }: { data: AssessmentWorkspaceData }) {
  const [selectedRuleId, setSelectedRuleId] = useState(data.rules[0]?.id ?? "");
  const [screen, setScreen] = useState<"list" | "create" | "detail">("list");
  const selectedRule = data.rules.find((row) => row.id === selectedRuleId) ?? null;
  const [subjectRows, setSubjectRows] = useState<QuarterlySubjectRow[]>([]);
  const [createState, createAction, creating] = useActionState(createBusinessAssessmentRuleVersion, initialBusinessAssessmentRuleState);
  const [saveState, saveAction, saving] = useActionState(saveBusinessAssessmentRuleVersion, initialBusinessAssessmentRuleState);
  const [publishState, publishAction, publishing] = useActionState(publishBusinessAssessmentRuleVersion, initialBusinessAssessmentRuleState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteBusinessAssessmentRuleVersion, initialBusinessAssessmentRuleState);

  useEffect(() => {
    if (createState.status === "success" && createState.ruleId && selectedRuleId !== createState.ruleId) {
      // The returned id is only available after the server action has created the rule.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedRuleId(createState.ruleId);
      setScreen("detail");
    }
  }, [createState, selectedRuleId]);
  useEffect(() => {
    if (deleteState.status !== "success" || !deleteState.ruleId) return;
    const nextRule = data.rules.find((rule) => rule.id !== deleteState.ruleId);
    // Deletion changes which server-backed rule can be selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRuleId(nextRule?.id ?? "");
  }, [data.rules, deleteState]);
  useEffect(() => {
    if (!selectedRule) {
      // Rule selection is the source of truth for this editable draft buffer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubjectRows([]);
      return;
    }
    const subjects = data.ruleSubjects.filter((row) => row.ruleId === selectedRule.id);
    // Rebuild the draft buffer when switching versions or after a server refresh.
    setSubjectRows(subjects.map((subject) => ({ key: subject.id, code: subject.code, name: subject.name, scoringType: subject.scoringType, standards: data.standards.filter((standard) => standard.ruleSubjectId === subject.id).map((standard) => ({ key: standard.id, scopeType: standard.scopeType, scopeId: standard.scopeId, passingNumericScore: standard.passingNumericScore ?? 80, requiredGradeCode: standard.requiredGradeCode ?? "A" })) })));
  }, [selectedRule, data.ruleSubjects, data.standards]);

  const editable = Boolean(selectedRule && selectedRule.status === "DRAFT" && data.canManage);
  const updateSubject = (key: string, patch: Partial<QuarterlySubjectRow>) => setSubjectRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const updateStandard = (subjectKey: string, standardKey: string, patch: Partial<QuarterlyStandardRow>) => setSubjectRows((current) => current.map((subject) => subject.key === subjectKey ? { ...subject, standards: subject.standards.map((standard) => standard.key === standardKey ? { ...standard, ...patch } : standard) } : subject));

  if (screen === "list") return <div><div className="mb-4 flex justify-end">{data.canManage && <Button className={actionButtonClass} onClick={() => setScreen("create")}><Plus className="h-4 w-4"/>新建规则版本</Button>}</div><div className="space-y-2">{data.rules.map((rule) => <div key={rule.id} className="flex items-stretch rounded-xl border border-border hover:border-primary/40"><button type="button" onClick={() => { setSelectedRuleId(rule.id); setScreen("detail"); }} className="min-w-0 flex-1 p-4 text-left"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{rule.name} · V{rule.version}</div><div className="mt-1 text-xs text-muted-foreground">{data.departments.find((row) => row.id === rule.departmentOrgNodeId)?.name} · {rule.year}年 Q{rule.quarter}</div></div><div className="flex items-center gap-3"><Badge tone={rule.status === "CONFIRMED" ? "success" : rule.status === "DRAFT" ? "warning" : "default"}>{rule.status === "CONFIRMED" ? "已发布" : rule.status === "DRAFT" ? "草稿" : "历史版本"}</Badge><span className="text-xs text-primary">{rule.status === "DRAFT" ? "编辑" : "查看"} ›</span></div></div></button>{data.canManage && <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`确认删除“${rule.name} V${rule.version}”吗？已用于考核批次的规则将不能删除。`)) event.preventDefault(); }} className="flex items-center border-l border-border px-3"><input type="hidden" name="ruleId" value={rule.id}/><button type="submit" disabled={deleting} className={`${rowIconButtonClass} text-red-600`} aria-label={`删除${rule.name} V${rule.version}`}><Trash2 className="h-4 w-4"/></button></form>}</div>)}{!data.rules.length && <div className="py-10 text-center text-sm text-muted-foreground">暂无季度业务考核规则</div>}</div><ActionFeedback state={deleteState}/></div>;
  if (screen === "create") return <div><WorkbenchHeader title="新建业务考核规则" description="为指定部门和季度创建独立草稿版本" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/><ConfigBlock title="规则基本信息"><form action={createAction} className="space-y-3"><select name="departmentOrgNodeId" required className={inputClass}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input name="year" type="number" min="2020" defaultValue={new Date().getFullYear()} required className={inputClass}/><select name="quarter" className={inputClass}>{[1,2,3,4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}</select></div><Button type="submit" className={actionButtonClass} disabled={creating || !data.departments.length}><Plus className="h-4 w-4"/>{creating ? "创建中" : "创建规则草稿"}</Button><ActionFeedback state={createState}/></form></ConfigBlock></div>;

  return <div className="space-y-4"><WorkbenchHeader title="业务考核规则详情" description="草稿可编辑，已发布版本只读" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/>
    <div className="hidden">
      <ConfigBlock title="规则版本">
        <div className="space-y-2">{data.rules.map((rule) => <div key={rule.id} className={`flex items-stretch rounded-xl border transition ${selectedRuleId === rule.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}><button type="button" onClick={() => setSelectedRuleId(rule.id)} className="min-w-0 flex-1 p-3 text-left"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{rule.name} V{rule.version}</span><Badge tone={rule.status === "CONFIRMED" ? "success" : rule.status === "DRAFT" ? "warning" : "default"}>{rule.status === "CONFIRMED" ? "已发布" : rule.status === "DRAFT" ? "草稿" : "历史"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{rule.year}年 Q{rule.quarter}</p></button>{data.canManage && <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`确认删除“${rule.name} V${rule.version}”吗？已用于考核批次的规则将不能删除。`)) event.preventDefault(); }} className="flex items-center border-l border-border px-2"><input type="hidden" name="ruleId" value={rule.id}/><button type="submit" disabled={deleting} className={`${rowIconButtonClass} text-red-600`} aria-label={`删除${rule.name} V${rule.version}`} title="删除规则版本"><Trash2 className="h-4 w-4"/></button></form>}</div>)}{!data.rules.length && <p className="py-6 text-center text-sm text-muted-foreground">暂无季度业务考核规则</p>}</div>
        <ActionFeedback state={deleteState}/>
      </ConfigBlock>
      {data.canManage && <ConfigBlock title="新建季度规则"><form action={createAction} className="space-y-2"><select name="departmentOrgNodeId" required className={inputClass}>{data.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input name="year" type="number" min="2020" defaultValue={new Date().getFullYear()} required className={inputClass}/><select name="quarter" className={inputClass}>{[1,2,3,4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}</select></div><Button type="submit" className={`${actionButtonClass} w-full`} disabled={creating || !data.departments.length}><Plus className="h-4 w-4"/>{creating ? "创建中" : "新建业务考核规则"}</Button><ActionFeedback state={createState}/></form></ConfigBlock>}
    </div>
    {!selectedRule ? <Card className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">请新建或选择一条季度业务考核规则</Card> : <div className="space-y-4">
      <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{selectedRule.name} V{selectedRule.version}</h3><Badge tone={selectedRule.status === "CONFIRMED" ? "success" : selectedRule.status === "DRAFT" ? "warning" : "default"}>{selectedRule.status === "CONFIRMED" ? "已发布" : selectedRule.status === "DRAFT" ? "草稿可编辑" : "历史版本"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{data.departments.find((row) => row.id === selectedRule.departmentOrgNodeId)?.name} · {selectedRule.year}年 Q{selectedRule.quarter}</p></div>{editable && <form action={publishAction}><input type="hidden" name="ruleId" value={selectedRule.id}/><Button type="submit" className={actionButtonClass} disabled={publishing}><Check className="h-4 w-4"/>{publishing ? "发布中" : "校验并发布"}</Button></form>}</div><ActionFeedback state={publishState}/></Card>
      <form action={saveAction} className="space-y-4"><input type="hidden" name="ruleId" value={selectedRule.id}/><input type="hidden" name="ruleSubjectsJson" value={JSON.stringify(subjectRows.map((subject) => ({ code: subject.code, name: subject.name, scoringType: subject.scoringType, standards: subject.standards.map((standard) => ({ scopeType: standard.scopeType, scopeId: standard.scopeId, passingNumericScore: standard.passingNumericScore, requiredGradeCode: standard.requiredGradeCode })) })))}/>
        <ConfigBlock title="计分规则"><p className="mb-4 text-xs leading-5 text-muted-foreground">本规则仅用于 {selectedRule.year} 年 Q{selectedRule.quarter}；每科满分按科目数平均分配。</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Field label="业务考核总分"><input name="totalKpiScore" type="number" min="0.01" step="0.01" required defaultValue={selectedRule.totalKpiScore} disabled={!editable || saving} className={inputClass}/></Field><PercentageField name="initialPassPercent" label="首次及格" defaultValue={selectedRule.initialPassPercent} disabled={!editable || saving}/><PercentageField name="retestPassPercent" label="补考及格" defaultValue={selectedRule.retestPassPercent} disabled={!editable || saving}/><PercentageField name="finalFailPercent" label="补考不及格" defaultValue={selectedRule.finalFailPercent} disabled={!editable || saving}/><Field label="科目分配"><select disabled className={inputClass}><option>按科目平均摊分</option></select></Field></div></ConfigBlock>
        <ConfigBlock title="考核科目与小组及格标准"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-muted-foreground">每个科目先确定评分方式，再分别设置本部门各小组的及格线；个人规则仅作为同科目下的特殊覆盖。</p>{editable && <Button type="button" variant="outline" className={actionButtonClass} onClick={() => setSubjectRows((current) => [...current, makeQuarterlySubject(data, selectedRule.departmentOrgNodeId)])}><Plus className="h-4 w-4"/>添加科目</Button>}</div><div className="space-y-3">{subjectRows.map((subject, subjectIndex) => <div key={subject.key} className="rounded-xl border border-border p-3"><div className="grid gap-2 md:grid-cols-[140px_minmax(180px,1fr)_150px_76px] md:items-end"><Field label="科目编码"><input value={subject.code} disabled={!editable || saving} onChange={(event) => updateSubject(subject.key, { code: event.target.value })} placeholder="如 PPT" className={inputClass}/></Field><Field label="科目名称"><input value={subject.name} disabled={!editable || saving} onChange={(event) => updateSubject(subject.key, { name: event.target.value })} placeholder="如 PPT 演讲" className={inputClass}/></Field><Field label="评分方式"><select value={subject.scoringType} disabled={!editable || saving} onChange={(event) => updateSubject(subject.key, { scoringType: event.target.value as "NUMERIC" | "GRADE" })} className={inputClass}><option value="NUMERIC">分数评分</option><option value="GRADE">等级评分</option></select></Field><div className="flex justify-end gap-1 pb-0.5"><button type="button" disabled={!editable || saving || subjectRows.length === 1} onClick={() => setSubjectRows((current) => current.filter((row) => row.key !== subject.key))} className={`${rowIconButtonClass} text-red-600`} aria-label="删除科目"><Trash2 className="h-4 w-4"/></button><button type="button" disabled={!editable || saving} onClick={() => setSubjectRows((current) => [...current.slice(0, subjectIndex + 1), makeQuarterlySubject(data, selectedRule.departmentOrgNodeId), ...current.slice(subjectIndex + 1)])} className={rowIconButtonClass} aria-label="添加科目"><Plus className="h-4 w-4"/></button></div></div><div className="mt-3 space-y-2 border-t border-border pt-3"><p className="text-xs font-medium">小组及格标准</p>{subject.standards.map((standard, standardIndex) => { const targets = standard.scopeType === "ORG_NODE" ? departmentTeams(data, selectedRule.departmentOrgNodeId) : departmentUsers(data, selectedRule.departmentOrgNodeId); return <div key={standard.key} className="grid gap-2 rounded-lg bg-muted/30 p-2 md:grid-cols-[110px_minmax(180px,1fr)_minmax(150px,1fr)_76px] md:items-end"><Field label="适用范围"><select value={standard.scopeType} disabled={!editable || saving} onChange={(event) => { const scopeType = event.target.value as "ORG_NODE" | "USER"; const nextTargets = scopeType === "ORG_NODE" ? departmentTeams(data, selectedRule.departmentOrgNodeId) : departmentUsers(data, selectedRule.departmentOrgNodeId); updateStandard(subject.key, standard.key, { scopeType, scopeId: nextTargets[0]?.id ?? "" }); }} className={inputClass}><option value="ORG_NODE">小组</option><option value="USER">个人例外</option></select></Field><Field label={standard.scopeType === "ORG_NODE" ? "选择小组" : "选择员工"}><select value={standard.scopeId} disabled={!editable || saving} onChange={(event) => updateStandard(subject.key, standard.key, { scopeId: event.target.value })} className={inputClass}><option value="">请选择</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>{subject.scoringType === "NUMERIC" ? <Field label="分数及格线"><div className="relative"><input type="number" min="0" max="100" step="0.01" value={standard.passingNumericScore} disabled={!editable || saving} onChange={(event) => updateStandard(subject.key, standard.key, { passingNumericScore: Number(event.target.value) })} className={`${inputClass} w-full pr-9`}/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">分</span></div></Field> : <Field label="要求等级"><select value={standard.requiredGradeCode} disabled={!editable || saving} onChange={(event) => updateStandard(subject.key, standard.key, { requiredGradeCode: event.target.value })} className={inputClass}>{["S","A","B","C","D"].map((grade) => <option key={grade} value={grade}>达到 {grade} 级及以上</option>)}</select></Field>}<div className="flex justify-end gap-1 pb-0.5"><button type="button" disabled={!editable || saving || subject.standards.length === 1} onClick={() => updateSubject(subject.key, { standards: subject.standards.filter((row) => row.key !== standard.key) })} className={`${rowIconButtonClass} text-red-600`} aria-label="删除及格标准"><Trash2 className="h-4 w-4"/></button><button type="button" disabled={!editable || saving} onClick={() => updateSubject(subject.key, { standards: [...subject.standards.slice(0, standardIndex + 1), makeQuarterlyStandard(data, selectedRule.departmentOrgNodeId, standard.scopeType), ...subject.standards.slice(standardIndex + 1)] })} className={rowIconButtonClass} aria-label="添加及格标准"><Plus className="h-4 w-4"/></button></div></div>; })}</div></div>)}{!subjectRows.length && <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">暂无科目，请先添加考核科目</div>}</div></ConfigBlock>
        <div className="flex flex-wrap items-center justify-between gap-3"><ActionFeedback state={saveState}/>{editable && <Button type="submit" className={actionButtonClass} disabled={saving}><Save className="h-4 w-4"/>{saving ? "保存中" : "保存规则草稿"}</Button>}</div>
      </form>
    </div>}
  </div>;
}

function PercentageField({ name, label, defaultValue, disabled }: { name: string; label: string; defaultValue: number; disabled: boolean }) {
  return <Field label={label}><div className="relative"><input name={name} type="number" min="0" max="100" step="0.01" inputMode="decimal" required defaultValue={defaultValue} disabled={disabled} className={`${inputClass} w-full pr-9`}/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div></Field>;
}

type CareerLevelRow = { key: string; code: string; levelsText: string };
type CareerRoleRow = {
  key: string;
  id: string;
  departmentOrgNodeId: string;
  trackName: "技术岗" | "管理岗";
  familyName: string;
  name: string;
};
const initialCareerRoleState: CareerRoleStructureActionState = { status: "idle", message: "" };
const initialJobLevelState: JobLevelStructureActionState = { status: "idle", message: "" };

function CareerConfiguration({ data }: { data: CareerWorkspaceData }) {
  const [screen, setScreen] = useState<"list" | "roles" | "levels">("list");
  if (screen === "list") return <div className="space-y-2">{[
    { key: "roles" as const, title: "职业通道与人才岗位", detail: `${data.roles.filter((row) => row.isActive).length}个人才岗位` },
    { key: "levels" as const, title: "职级段与细分档", detail: `${data.levelGroups.filter((row) => row.isActive).length}个职级段` },
  ].map((item) => <button key={item.key} type="button" onClick={() => setScreen(item.key)} className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left hover:border-primary/40"><div><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.detail}</div></div><span className="text-xs text-primary">编辑 ›</span></button>)}</div>;
  return <div className="space-y-4"><WorkbenchHeader title={screen === "roles" ? "职业通道与人才岗位" : "职级段与细分档"} description="独立编辑当前配置项" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回配置列表</Button>}/>{screen === "roles" ? <CareerRoleRows data={data}/> : <CareerLevelRows data={data}/>}</div>;
}

const competencyLevelOptions = [
  [1, "L1 入门：了解基本概念，需要指导"],
  [2, "L2 基础：能完成常规任务"],
  [3, "L3 胜任：能独立完成工作"],
  [4, "L4 熟练：能处理复杂问题并指导他人"],
  [5, "L5 专家：能制定标准并引领改进"],
] as const;

function CompetencyConfiguration({ data }: { data: CompetencyWorkspaceData }) {
  const [screen, setScreen] = useState<"overview" | "items" | "packages" | "models">("overview");
  const itemNames = new Map(data.items.map((item) => [item.id, item.name]));
  const roleNames = new Map(data.roles.map((role) => [role.id, role.name]));
  const levelNames = new Map(data.levels.map((level) => [level.id, `${level.code} ${level.name}`]));
  const draftPackages = data.packages.filter((item) => item.status === "DRAFT");

  if (screen === "overview") return <div className="space-y-4">
    <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><div className="font-semibold">配置顺序</div><div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span>① 建立能力项</span><ChevronRight className="h-3.5 w-3.5"/><span>② 组合能力包（可选）</span><ChevronRight className="h-3.5 w-3.5"/><span>③ 建立岗位能力模型</span><ChevronRight className="h-3.5 w-3.5"/><span>④ 设置达标等级并发布</span></div><p className="mt-2 text-xs text-blue-700">能力包是复用模板；岗位能力模型才是最终用于晋升能力判断的正式配置。</p></div>
    {[
      { key: "items" as const, title: "能力库", detail: "定义可以被能力包和岗位模型复用的能力项", count: `${data.items.length} 项能力` },
      { key: "packages" as const, title: "能力包", detail: "把常用能力项组合为可批量导入模型的模板", count: `${data.packages.length} 个能力包` },
      { key: "models" as const, title: "岗位能力模型", detail: "按岗位和目标职级配置最低能力要求并发布", count: `${data.models.length} 个版本` },
    ].map((item) => <button key={item.key} type="button" onClick={() => setScreen(item.key)} className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left hover:border-primary/40"><div><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.detail}</div></div><div className="flex items-center gap-3"><Badge>{item.count}</Badge><span className="whitespace-nowrap text-xs text-primary">查看和编辑 ›</span></div></button>)}
  </div>;

  const subHeader = (title: string, description: string) => <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Button type="button" variant="outline" className={actionButtonClass} onClick={() => setScreen("overview")}><ArrowRight className="h-4 w-4 rotate-180"/>返回配置列表</Button></div>;

  if (screen === "items") return <div>{subHeader("能力库", "能力项是最小评价单元；系统自动生成内部编码，用户只维护业务信息。")}
    <ConfigBlock title="新增能力项"><form action={createCompetencyItem} className="grid gap-3 md:grid-cols-2"><Field label="能力名称"><input name="name" required placeholder="例如：需求分析" className={inputClass}/></Field><Field label="能力类别"><select name="category" className={inputClass}><option>公司通用能力</option><option>岗位专业能力</option><option>管理能力</option><option>成果和影响力</option></select></Field><Field label="能力说明"><input name="description" placeholder="说明这项能力关注什么" className={inputClass}/></Field><Field label="衡量指引或举证要求"><input name="measurementGuide" placeholder="例如：提供需求文档及评审记录" className={inputClass}/></Field><div className="md:col-span-2 text-right"><Button type="submit" className={actionButtonClass}><Plus className="h-4 w-4"/>新增能力项</Button></div></form></ConfigBlock>
    <div className="mt-4 divide-y divide-border rounded-xl border border-border">{data.items.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div><div className="font-medium">{item.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.description || "未填写能力说明"}</div></div><Badge>{item.category}</Badge></div>)}{!data.items.length && <div className="p-8 text-center text-sm text-muted-foreground">暂无能力项</div>}</div>
  </div>;

  if (screen === "packages") return <div>{subHeader("能力包", "能力包是能力项组合模板，可批量导入岗位能力模型；版本和顺序由系统维护。")}
    <ConfigBlock title="新建能力包"><form action={createCompetencyPackage} className="grid gap-3 md:grid-cols-2"><Field label="能力包名称"><input name="name" required placeholder="例如：产品经理通用能力包" className={inputClass}/></Field><Field label="说明"><input name="description" placeholder="说明适用岗位或使用场景" className={inputClass}/></Field><div className="md:col-span-2 text-right"><Button type="submit" className={actionButtonClass}><Plus className="h-4 w-4"/>新建能力包</Button></div></form></ConfigBlock>
    <ConfigBlock title="向能力包添加能力项"><form action={addCompetencyPackageItem} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><Field label="草稿能力包"><select name="packageId" required className={inputClass}><option value="">请选择能力包</option>{draftPackages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="能力项"><select name="competencyItemId" required className={inputClass}><option value="">请选择能力项</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Button type="submit" className={actionButtonClass} disabled={!draftPackages.length || !data.items.length}>加入能力包</Button></form><p className="mt-3 text-xs text-muted-foreground">原“权重 1”和“排序 10”属于内部默认值，不参与当前正式判断，已改由系统维护。</p></ConfigBlock>
    <div className="mt-4 space-y-2">{data.packages.map((item) => { const packageItems = data.packageItems.filter((row) => row.packageId === item.id); return <div key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><div className="font-medium">{item.name}</div><Badge tone={item.status === "ACTIVE" ? "success" : "warning"}>{item.status === "ACTIVE" ? "已发布" : "草稿"}</Badge></div><div className="mt-2 text-xs text-muted-foreground">{packageItems.length ? packageItems.map((row) => itemNames.get(row.competencyItemId)).join("、") : "尚未添加能力项"}</div></div>; })}{!data.packages.length && <div className="p-8 text-center text-sm text-muted-foreground">暂无能力包；不需要复用组合时可以跳过</div>}</div>
  </div>;

  return <div>{subHeader("岗位能力模型", "岗位模型用于定义某岗位晋升到目标职级时需要满足的能力要求。")}
    <ConfigBlock title="新建岗位能力模型草稿"><form action={createCompetencyModel} className="grid gap-3 md:grid-cols-2"><Field label="模型名称"><input name="name" required placeholder="例如：B端产品经理晋升R2能力模型" className={inputClass}/></Field><Field label="版本说明（可选）"><input name="description" placeholder="说明本次调整内容" className={inputClass}/></Field><Field label="适用岗位"><select name="jobRoleId" required className={inputClass}><option value="">请选择岗位</option>{data.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="目标职级"><select name="targetJobLevelId" required className={inputClass}><option value="">请选择目标职级</option>{data.levels.map((item) => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}</select></Field><div className="md:col-span-2 text-right"><Button type="submit" className={actionButtonClass}><Plus className="h-4 w-4"/>新建模型草稿</Button></div></form></ConfigBlock>
    <div className="mt-4 space-y-3">{data.models.map((model) => { const requirements = data.requirements.filter((item) => item.modelVersionId === model.id); return <div key={model.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium">{model.name} · V{model.version}</div><div className="mt-1 text-xs text-muted-foreground">{roleNames.get(model.jobRoleId)} → {levelNames.get(model.targetJobLevelId)} · {requirements.length} 项能力要求</div></div><Badge tone={model.status === "ACTIVE" ? "success" : "warning"}>{model.status === "ACTIVE" ? "已发布" : "草稿"}</Badge></div>{model.status === "DRAFT" && <div className="mt-4 space-y-4 border-t border-border pt-4">{data.packages.length > 0 && <form action={addCompetencyPackageToModel} className="grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end"><input type="hidden" name="modelVersionId" value={model.id}/><Field label="从能力包批量导入"><select name="packageId" required className={inputClass}><option value="">请选择能力包</option>{data.packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="导入后的默认达标等级"><CompetencyLevelSelect name="requiredLevel"/></Field><Button type="submit" className={actionButtonClass}>导入能力包</Button></form>}<form action={addJobLevelRequirement} className="grid gap-3 xl:grid-cols-[1fr_1.5fr_130px_1.4fr_auto] xl:items-end"><input type="hidden" name="modelVersionId" value={model.id}/><Field label="添加单项能力"><select name="competencyItemId" required className={inputClass}><option value="">请选择能力项</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="最低达标等级"><CompetencyLevelSelect name="requiredLevel"/></Field><Field label="必须达标"><label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"><input name="isMandatory" type="checkbox"/>是</label></Field><Field label="证据要求（可选）"><input name="evidenceRequirement" placeholder="例如：提供已上线项目材料" className={inputClass}/></Field><Button type="submit" className={actionButtonClass}>添加要求</Button></form><form action={publishCompetencyModel} className="text-right"><input type="hidden" name="id" value={model.id}/><Button type="submit" variant="outline" className={actionButtonClass}>发布此模型</Button></form></div>}{requirements.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{requirements.map((item) => <Badge key={item.id}>{itemNames.get(item.competencyItemId)} · 最低 L{item.requiredLevel}{item.isMandatory ? " · 必须达标" : ""}</Badge>)}</div>}</div>; })}{!data.models.length && <div className="p-8 text-center text-sm text-muted-foreground">暂无岗位能力模型</div>}</div>
  </div>;
}

function CompetencyLevelSelect({ name }: { name: string }) { return <select name={name} defaultValue="3" required className={inputClass}>{competencyLevelOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>; }

function SalaryConfiguration() {
  const [screen, setScreen] = useState<"list" | "edit">("list");
  if (screen === "list") return <div className="flex items-center justify-between rounded-xl border border-border p-4"><div><div className="font-medium">岗位职级薪资上限</div><div className="mt-1 text-xs text-muted-foreground">R1至R6及细分职级继承规则</div></div><Button variant="outline" className={actionButtonClass} onClick={() => setScreen("edit")}>编辑</Button></div>;
  return <div className="space-y-4"><WorkbenchHeader title="编辑岗位职级薪资上限" description="独立维护职级段上限与细分职级覆盖值" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回配置列表</Button>}/><ConfigBlock title="岗位职级薪资上限"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["R1","10000"],["R2","15000"],["R3","20000"],["R4","30000"],["R5","40000"],["R6","50000"]].map(([level, cap]) => <Field key={level} label={`${level} 薪资上限`}><input type="number" defaultValue={cap} className={inputClass}/></Field>)}</div><div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">R3-1、R3-2、R3-3 默认继承 R3 上限；可另行设置细分职级覆盖值。</div></ConfigBlock></div>;
}

function splitLevelCodes(value: string) {
  return value.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function CareerRoleRows({ data }: { data: CareerWorkspaceData }) {
  const router = useRouter();
  const familyById = new Map(data.families.map((family) => [family.id, family]));
  const trackById = new Map(data.tracks.map((track) => [track.id, track]));
  const configuredRows: CareerRoleRow[] = data.roles.filter((role) => role.isActive).map((role) => {
    const family = familyById.get(role.jobFamilyId);
    const track = family ? trackById.get(family.careerTrackId) : undefined;
    return {
      key: role.id,
      id: role.id,
      departmentOrgNodeId: track?.departmentOrgNodeId ?? data.departments[0]?.id ?? "",
      trackName: track?.name === "管理岗" ? "管理岗" : "技术岗",
      familyName: family?.name ?? "",
      name: role.name,
    };
  });
  const [rows, setRows] = useState<CareerRoleRow[]>(configuredRows.length > 0 ? configuredRows : [{
    key: "new-role-1",
    id: "",
    departmentOrgNodeId: data.departments[0]?.id ?? "",
    trackName: "技术岗",
    familyName: "产品序列",
    name: "",
  }]);
  const [state, formAction, pending] = useActionState(saveCareerRoleStructure, initialCareerRoleState);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  const updateRow = (key: string, patch: Partial<CareerRoleRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const addAfter = (index: number) => setRows((current) => {
    const next = [...current];
    const source = current[index];
    next.splice(index + 1, 0, {
      key: `new-role-${Date.now()}-${index}`,
      id: "",
      departmentOrgNodeId: source.departmentOrgNodeId,
      trackName: source.trackName,
      familyName: source.familyName,
      name: "",
    });
    return next;
  });
  const serialized = JSON.stringify(rows.map(({ id, departmentOrgNodeId, trackName, familyName, name }) => ({ id, departmentOrgNodeId, trackName, familyName, name })));
  const isIncomplete = rows.some((row) => !row.departmentOrgNodeId || !row.familyName.trim() || !row.name.trim());

  return <ConfigBlock title="职业通道与人才岗位">
    <p className="mb-3 text-xs text-muted-foreground">人才岗位在这里统一维护，保存后可在员工档案中直接选择。</p>
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rowsJson" value={serialized}/>
      <input type="hidden" name="originalRoleIdsJson" value={JSON.stringify(configuredRows.map((row) => row.id))}/>
      <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1.05fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,1.35fr)_76px] gap-2 px-2 text-xs text-muted-foreground sm:grid"><span>适用部门</span><span>职业通道</span><span>岗位序列</span><span>人才岗位</span><span className="text-center">操作</span></div>
          {rows.map((row, index) => <div key={row.key} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-border bg-muted/20 p-2 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,1.35fr)_76px]">
            <select aria-label="适用部门" value={row.departmentOrgNodeId} onChange={(event) => updateRow(row.key, { departmentOrgNodeId: event.target.value })} className={`${inputClass} min-w-0`}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
            <select aria-label="职业通道" value={row.trackName} onChange={(event) => updateRow(row.key, { trackName: event.target.value as CareerRoleRow["trackName"] })} className={`${inputClass} min-w-0`}><option value="技术岗">技术岗</option><option value="管理岗">管理岗</option></select>
            <input value={row.familyName} onChange={(event) => updateRow(row.key, { familyName: event.target.value })} placeholder="如 产品序列" className={`${inputClass} min-w-0`}/>
            <input value={row.name} onChange={(event) => updateRow(row.key, { name: event.target.value })} placeholder="如 B端产品" className={`${inputClass} min-w-0`}/>
            <div className="flex justify-end gap-1"><button type="button" title="删除此人才岗位" aria-label="删除此人才岗位" disabled={rows.length === 1} onClick={() => setRows((current) => current.length > 1 ? current.filter((item) => item.key !== row.key) : current)} className={`${rowIconButtonClass} text-red-600`}><Trash2 className="h-4 w-4"/></button><button type="button" title="在此行后新增人才岗位" aria-label="在此行后新增人才岗位" onClick={() => addAfter(index)} className={rowIconButtonClass}><Plus className="h-4 w-4"/></button></div>
          </div>)}
      </div>
      <div className="flex items-center justify-between gap-3"><p className={`text-xs ${state.status === "error" ? "text-red-600" : state.status === "success" ? "text-emerald-600" : "text-muted-foreground"}`}>{state.message || `共 ${rows.length} 个人才岗位`}</p><Button type="submit" className={actionButtonClass} disabled={pending || isIncomplete}><Save className="h-4 w-4"/>{pending ? "保存中" : "保存全部人才岗位"}</Button></div>
    </form>
  </ConfigBlock>;
}

function CareerLevelRows({ data }: { data: CareerWorkspaceData }) {
  const router = useRouter();
  const configuredRows = data.levelGroups
    .filter((group) => group.isActive)
    .map((group) => ({
      key: group.id,
      code: group.code,
      levelsText: data.levels.filter((level) => level.jobLevelGroupId === group.id && level.isActive && level.code !== group.code).sort((a, b) => a.stepOrder - b.stepOrder).map((level) => level.code).join("、"),
    }));
  const defaults = Array.from({ length: 6 }, (_, index) => {
    const code = `R${index + 1}`;
    return { key: `default-${code}`, code, levelsText: "" };
  });
  const [rows, setRows] = useState<CareerLevelRow[]>(configuredRows.length > 0 ? configuredRows : defaults);
  const [state, formAction, pending] = useActionState(saveJobLevelStructure, initialJobLevelState);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  const updateRow = (key: string, patch: Partial<CareerLevelRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const addAfter = (index: number) => setRows((current) => {
    const next = [...current];
    next.splice(index + 1, 0, { key: `new-${Date.now()}-${index}`, code: "", levelsText: "" });
    return next;
  });
  const removeRow = (key: string) => setRows((current) => current.length > 1 ? current.filter((row) => row.key !== key) : current);
  const serialized = JSON.stringify(rows.map((row) => ({ code: row.code, levels: splitLevelCodes(row.levelsText) })));

  return <ConfigBlock title="职级段与细分档">
    <p className="mb-3 text-xs text-muted-foreground">一行配置一个职级段；不需要细分时可留空，系统直接使用职级段本身。填写细分档后按顺序自动形成段内晋升路径。</p>
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rowsJson" value={serialized}/>
      <div className="overflow-x-auto">
        <div className="min-w-[720px] space-y-2">
          <div className="grid grid-cols-[100px_minmax(240px,1fr)_minmax(220px,1fr)_84px] gap-2 px-2 text-xs text-muted-foreground">
            <span>职级段</span><span>细分职级</span><span>段内晋升路径（自动）</span><span className="text-center">操作</span>
          </div>
          {rows.map((row, index) => {
            const path = splitLevelCodes(row.levelsText).join(" → ");
            return <div key={row.key} className="grid grid-cols-[100px_minmax(240px,1fr)_minmax(220px,1fr)_84px] items-center gap-2 rounded-xl border border-border bg-muted/20 p-2">
              <input value={row.code} onChange={(event) => updateRow(row.key, { code: event.target.value })} placeholder="如 R3" className={inputClass}/>
              <input value={row.levelsText} onChange={(event) => updateRow(row.key, { levelsText: event.target.value })} placeholder={row.code ? `可选，如 ${row.code}-1、${row.code}-2` : "可选，填写细分职级"} className={inputClass}/>
              <div className="truncate rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground" title={path || "无段内晋升路径"}>{path || "无细分档，使用职级段本身"}</div>
              <div className="flex justify-end gap-1">
                <button type="button" title="删除此职级段" aria-label="删除此职级段" onClick={() => removeRow(row.key)} disabled={rows.length === 1} className={`${rowIconButtonClass} text-red-600`}><Trash2 className="h-4 w-4"/></button>
                <button type="button" title="在此行后新增职级段" aria-label="在此行后新增职级段" onClick={() => addAfter(index)} className={rowIconButtonClass}><Plus className="h-4 w-4"/></button>
              </div>
            </div>;
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${state.status === "error" ? "text-red-600" : state.status === "success" ? "text-emerald-600" : "text-muted-foreground"}`}>{state.message || `共 ${rows.length} 个职级段`}</p>
        <Button type="submit" className={actionButtonClass} disabled={pending}><Save className="h-4 w-4"/>{pending ? "保存中" : "保存全部职级段"}</Button>
      </div>
    </form>
  </ConfigBlock>;
}

function ReviewModelConfiguration({ data }: { data: ReviewWorkspaceData }) {
  const [moduleTab, setModuleTab] = useState<"ability" | "review">("ability");
  const [selectedId, setSelectedId] = useState(data.config.templates[0]?.id ?? "");
  const [screen, setScreen] = useState<"list" | "create" | "detail">("list");
  const [ruleTab, setRuleTab] = useState<"dimension" | "rating" | "threshold" | "box">("dimension");
  const selected = data.config.templates.find((item) => item.id === selectedId) ?? data.config.templates[0];
  const departmentName = new Map(data.config.departments.map((item) => [item.id, item.name]));
  const dimensions = data.config.dimensions.filter((item) => item.templateVersionId === selected?.id);
  const ratings = data.config.ratings.filter((item) => item.templateVersionId === selected?.id);
  const modelFullScore = dimensions.reduce((sum, item) => sum + item.maxScore, 0);
  const thresholds = data.config.thresholds.filter((item) => item.templateVersionId === selected?.id);
  const boxes = data.config.nineBoxRules.filter((item) => item.templateVersionId === selected?.id);
  const isDraft = selected?.status === "DRAFT";
  const moduleTabs = (
    <div className="border-b border-border">
      <div className="flex gap-6">
        <button onClick={() => setModuleTab("ability")} className={`pb-2 text-sm border-b-2 transition-colors ${moduleTab === "ability" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>人才能力测算模型</button>
        <button onClick={() => setModuleTab("review")} className={`pb-2 text-sm border-b-2 transition-colors ${moduleTab === "review" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>人才盘点模型</button>
      </div>
    </div>
  );
  if (moduleTab === "ability") {
    const [showCreate, setShowCreate] = useState(false);
    return (
      <div className="space-y-4">
        {moduleTabs}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">人才能力测算模型版本</h3>
            <p className="text-xs text-muted-foreground mt-1">每个版本独立维护 KPI 与人才盘点的权重配比；仅草稿版本可编辑权重。</p>
          </div>
          <Button className={actionButtonClass} onClick={() => setShowCreate((value) => !value)}><Plus className="h-4 w-4" />{showCreate ? "取消新建" : "新建模型版本"}</Button>
        </div>
        {showCreate && (
          <ConfigBlock title="新建模型版本">
            <form action={createTalentReviewTemplate} onSubmit={() => setShowCreate(false)} className="space-y-3">
              <select name="departmentOrgNodeId" required className={inputClass}>{data.config.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <input name="name" required placeholder="模型名称" className={inputClass}/>
              <input name="description" placeholder="模型用途或本版本说明" className={inputClass}/>
              <p className="text-xs leading-5 text-muted-foreground">模型编号和初始版本由系统自动生成；新建后默认权重为 KPI 60% + 人才盘点 40%。</p>
              <Button type="submit" className={actionButtonClass} disabled={data.config.departments.length === 0}><Plus className="w-4 h-4"/>保存为草稿</Button>
            </form>
          </ConfigBlock>
        )}
        <AbilityTemplateVersionList templates={data.config.templates} departments={data.config.departments} selectedId={selected?.id} onSelect={setSelectedId} />
        {selected ? (
          <Card className="space-y-4">
            <div>
              <h3 className="font-semibold">{selected.name} V{selected.version} · 人才能力测算权重</h3>
              <p className="text-xs text-muted-foreground mt-1">配置该版本在人才画像中“能力匹配度”的 KPI 与人才盘点权重，两者之和须为 100%。</p>
            </div>
            <form action={updateTalentAbilityCalculationWeights} className="space-y-4">
              <input type="hidden" name="id" value={selected.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">KPI 权重</span>
                  <input name="kpiWeight" type="number" min="0" max="1" step="0.01" required defaultValue={selected.kpiWeight} disabled={!isDraft} className={inputClass} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">人才盘点权重</span>
                  <input name="reviewWeight" type="number" min="0" max="1" step="0.01" required defaultValue={selected.reviewWeight} disabled={!isDraft} className={inputClass} />
                </label>
              </div>
              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground leading-5">
                当前公式：能力匹配度 =（当前聘期内 KPI 均值 / 季度 KPI 总分）× {Math.round(selected.kpiWeight * 100)}% +（当前聘期内盘点均值 / 盘点模型总分 {modelFullScore}）× {Math.round(selected.reviewWeight * 100)}%
              </div>
              {isDraft ? <Button type="submit" className={actionButtonClass}><Save className="h-4 w-4" />保存权重</Button> : <div className="text-xs text-muted-foreground">仅草稿版本可编辑权重；如需调整请复制为新草稿版本。</div>}
            </form>
          </Card>
        ) : (
          <Card className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">暂无模型版本，请点击右上角“新建模型版本”创建。</Card>
        )}
      </div>
    );
  }
  if (screen === "list") return <div className="space-y-4">{moduleTabs}<div><div className="mb-4 flex justify-end"><Button className={actionButtonClass} onClick={() => setScreen("create")}><Plus className="h-4 w-4"/>新建模型版本</Button></div><div className="space-y-2">{data.config.templates.map((item) => <div key={item.id} className="flex w-full items-center justify-between rounded-xl border border-border p-4 hover:border-primary/40"><button onClick={() => { setSelectedId(item.id); setScreen("detail"); }} className="min-w-0 flex-1 text-left"><div><div className="font-medium">{item.name} · V{item.version}</div><div className="mt-1 text-xs text-muted-foreground">{departmentName.get(item.departmentOrgNodeId)}</div></div></button><div className="flex items-center gap-3"><Badge tone={item.status === "ACTIVE" ? "success" : item.status === "DRAFT" ? "warning" : "default"}>{item.status === "ACTIVE" ? "已发布" : item.status === "DRAFT" ? "草稿" : "历史版本"}</Badge><span className="text-xs text-primary">{item.status === "DRAFT" ? "编辑" : "查看"} ›</span>{item.status === "DRAFT" && <DeleteDraftTemplateDialog id={item.id} name={`${item.name} V${item.version}`}/>}</div></div>)}{!data.config.templates.length && <div className="py-10 text-center text-sm text-muted-foreground">暂无模型版本</div>}</div></div></div>;
  if (screen === "create") return <div className="space-y-4">{moduleTabs}<WorkbenchHeader title="新建人才盘点模型" description="新建后形成独立草稿版本" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/><ConfigBlock title="模型基本信息"><form action={createTalentReviewTemplate} className="space-y-3"><select name="departmentOrgNodeId" required className={inputClass}>{data.config.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="name" required placeholder="模型名称" className={inputClass}/><input name="description" placeholder="模型用途或本版本说明" className={inputClass}/><p className="text-xs leading-5 text-muted-foreground">模型编号和初始版本由系统自动生成；后续调整通过“复制为新草稿版本”进行。</p><Button type="submit" className={actionButtonClass} disabled={data.config.departments.length === 0}><Plus className="w-4 h-4"/>保存为草稿</Button></form></ConfigBlock></div>;
  return <div className="space-y-4">{moduleTabs}<WorkbenchHeader title="人才盘点模型详情" description="草稿可编辑，已发布和历史版本只读" action={<Button variant="outline" className={actionButtonClass} onClick={() => setScreen("list")}><ArrowRight className="h-4 w-4 rotate-180"/>返回版本列表</Button>}/>
    {!selected ? <Card className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">规则版本不存在</Card> : <div className="space-y-4">
      <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{selected.name} V{selected.version}</h3><Badge tone={selected.status === "ACTIVE" ? "success" : selected.status === "DRAFT" ? "warning" : "default"}>{selected.status === "ACTIVE" ? "已发布" : selected.status === "DRAFT" ? "草稿可编辑" : "历史版本"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{departmentName.get(selected.departmentOrgNodeId)} · 模型版本 V{selected.version}</p></div><div className="flex gap-2">{isDraft ? <><form action={initializeDefaultTalentReviewTemplate}><input type="hidden" name="templateVersionId" value={selected.id}/><Button type="submit" className={actionButtonClass} variant="outline" disabled={dimensions.length > 0}>初始化默认规则</Button></form><PublishTemplateForm templateId={selected.id}/></> : <form action={cloneTalentReviewTemplateVersion}><input type="hidden" name="sourceId" value={selected.id}/><Button type="submit" className={actionButtonClass}><Plus className="w-4 h-4"/>复制为新草稿版本</Button></form>}</div></div>
        {isDraft ? <form action={updateTalentReviewTemplate} className="mt-4 grid gap-2 md:grid-cols-[1fr_2fr_auto]"><input type="hidden" name="id" value={selected.id}/><input name="name" defaultValue={selected.name} required className={inputClass}/><input name="description" defaultValue={selected.description ?? ""} placeholder="本版本调整说明" className={inputClass}/><Button type="submit" className={actionButtonClass} variant="outline"><Save className="w-4 h-4"/>保存基础信息</Button></form> : <div className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">已发布版本不可直接修改；如需调整，请复制为新草稿版本。历史盘点继续使用原版本快照。</div>}
      </Card>
      <Card className="!p-0 overflow-hidden"><div className="flex overflow-x-auto border-b border-border">{([ ["dimension", `评价维度 ${dimensions.length}`], ["rating", `评分档 ${ratings.length}`], ["threshold", `等级区间 ${thresholds.length}`], ["box", `九宫格 ${boxes.length}/9`] ] as const).map(([key, label]) => <button key={key} onClick={() => setRuleTab(key)} className={`px-5 py-3 text-sm border-b-2 ${ruleTab === key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"}`}>{label}</button>)}</div><div className="p-4">
        {ruleTab === "dimension" && <RuleEditor title="评价维度" description={`每个维度可独立设置满分；当前模型总分为 ${modelFullScore} 分。`} isDraft={isDraft} rows={dimensions.map((item) => ({ id: item.id, cells: [categoryLabel(item.category), item.name, item.isRequired ? "必填" : "选填"], editForm: <form action={updateTalentReviewDimension} className="flex items-center gap-2"><input type="hidden" name="id" value={item.id}/><input name="maxScore" type="number" min="1" step="1" required defaultValue={item.maxScore} aria-label={`${item.name}满分`} className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-xs"/><span className="text-xs text-muted-foreground">分</span><button className="text-xs text-primary hover:underline">保存满分</button></form> }))} addForm={<DimensionBatchForm key={`dimension-batch-${dimensions.length}`} templateId={selected.id}/>} />} 
        {ruleTab === "rating" && <RuleEditor title="评分档" description="配置评价时可选择的等级及其计分比例基础，例如 S=5、A=4、B=3、C=2、D=1；显示顺序按新增顺序自动生成。" isDraft={isDraft} rows={ratings.map((item) => ({ id: item.id, cells: [item.code, item.label, `等级分值 ${item.numericScore}`] }))} addForm={<RatingBatchForm key={`rating-batch-${ratings.length}`} templateId={selected.id}/>} />} 
        {ruleTab === "threshold" && <RuleEditor title="等级区间" description="配置人才盘点总分对应的等级范围；显示顺序按照新增顺序自动生成。" isDraft={isDraft} rows={thresholds.map((item) => ({ id: item.id, cells: [item.gradeCode, item.label, `${item.minScore}–${item.maxScore} 分`] }))} addForm={<ThresholdBatchForm key={`threshold-batch-${thresholds.length}`} templateId={selected.id}/>} />} 
        {ruleTab === "box" && <NineBoxConfiguration templateId={selected.id} boxes={boxes} isDraft={isDraft}/>} 
      </div></Card>
    </div>}
  </div>;
}

function AbilityTemplateVersionList({ templates, departments, selectedId, onSelect }: { templates: ReviewWorkspaceData["config"]["templates"]; departments: ReviewWorkspaceData["config"]["departments"]; selectedId?: string; onSelect: (id: string) => void }) {
  const departmentName = new Map(departments.map((item) => [item.id, item.name]));
  if (templates.length === 0) return <Card className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">暂无模型版本</Card>;
  return <div className="space-y-2">{templates.map((item) => {
    const isSelected = item.id === selectedId;
    const isDraft = item.status === "DRAFT";
    return <div key={item.id} className={`rounded-xl border p-4 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button onClick={() => onSelect(item.id)} className="min-w-0 flex-1 text-left">
          <div className="font-medium">{item.name} · V{item.version}</div>
          <div className="mt-1 text-xs text-muted-foreground">{departmentName.get(item.departmentOrgNodeId)} · KPI {Math.round(item.kpiWeight * 100)}% / 盘点 {Math.round(item.reviewWeight * 100)}%</div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={item.status === "ACTIVE" ? "success" : item.status === "DRAFT" ? "warning" : "default"}>{item.status === "ACTIVE" ? "已发布" : item.status === "DRAFT" ? "草稿" : "历史版本"}</Badge>
          {isDraft ? <>
            <Button className={actionButtonClass} variant="outline" onClick={() => onSelect(item.id)}>编辑权重</Button>
            <PublishTemplateForm templateId={item.id}/>
            <DeleteDraftTemplateDialog id={item.id} name={`${item.name} V${item.version}`}/>
          </> : <>
            <form action={cloneTalentReviewTemplateVersion}><input type="hidden" name="sourceId" value={item.id}/><Button type="submit" className={actionButtonClass} variant="outline"><Plus className="h-4 w-4"/>复制为新草稿</Button></form>
            <Button className={actionButtonClass} variant="outline" onClick={() => onSelect(item.id)}>查看</Button>
          </>}
        </div>
      </div>
    </div>;
  })}</div>;
}

function HiddenTemplate({ id }: { id: string }) { return <input type="hidden" name="templateVersionId" value={id}/>; }
function PublishTemplateForm({ templateId }: { templateId: string }) {
  const [state, formAction, pending] = useActionState(publishTalentReviewTemplateWithState, { status: "idle" as const, message: "", requestId: "" });
  return <><form action={formAction}><input type="hidden" name="id" value={templateId}/><Button type="submit" className={actionButtonClass} disabled={pending}>{pending ? "正在校验…" : "校验并发布"}</Button></form><ActionFeedback key={state.requestId} state={state}/></>;
}

function ActionFeedback({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) {
  const [visible, setVisible] = useState(Boolean(state.message));
  useEffect(() => {
    if (!state.message) return;
    // Every server-action result must reopen the user feedback, including repeated errors.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [state]);
  if (!state.message || !visible) return null;
  return <div role="status" aria-live="polite" className={`fixed bottom-6 left-1/2 z-[80] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg py-3 pl-4 pr-2 text-sm text-white shadow-xl ${state.status === "error" ? "bg-red-600" : "bg-emerald-600"}`}>{state.status === "error" ? <AlertCircle className="h-4 w-4 shrink-0"/> : <Check className="h-4 w-4 shrink-0"/>}<span>{state.message}</span><button type="button" onClick={() => setVisible(false)} title="关闭提示" aria-label="关闭提示" className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-white/15"><X className="h-4 w-4"/></button></div>;
}
type PendingDimension = { id: number; name: string; category: string; maxScore: number; isRequired: boolean };
function DimensionBatchForm({ templateId }: { templateId: string }) {
  const [nextId, setNextId] = useState(2);
  const [rows, setRows] = useState<PendingDimension[]>([{ id: 1, name: "", category: "VALUE", maxScore: 5, isRequired: true }]);
  function updateRow(id: number, patch: Partial<PendingDimension>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function addRow(afterId: number) { setRows((current) => { const index = current.findIndex((row) => row.id === afterId); const next = { id: nextId, name: "", category: "VALUE", maxScore: 5, isRequired: true }; return [...current.slice(0, index + 1), next, ...current.slice(index + 1)]; }); setNextId((value) => value + 1); }
  function removeRow(id: number) { setRows((current) => current.filter((row) => row.id !== id)); }
  const payload = rows.map(({ name, category, maxScore, isRequired }) => ({ name, category, maxScore, isRequired }));
  return <form action={addTalentReviewDimensions} className="space-y-2"><HiddenTemplate id={templateId}/><input type="hidden" name="dimensionsJson" value={JSON.stringify(payload)}/>{rows.map((row, index) => <div key={row.id} className="grid min-w-0 items-end gap-2 rounded-lg border border-border bg-background p-2 lg:grid-cols-[32px_minmax(150px,1fr)_140px_90px_70px_80px]"><span className="flex h-10 items-center justify-center text-xs text-muted-foreground">{index + 1}</span><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">维度名称</span><input required value={row.name} onChange={(event) => updateRow(row.id, { name: event.target.value })} placeholder="如工作态度" className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">维度分类</span><select value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })} className={inputClass}><option value="VALUE">价值观</option><option value="POTENTIAL">发展潜力</option><option value="PERFORMANCE">当前绩效</option></select></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">维度满分</span><input type="number" min="1" step="1" required value={row.maxScore} onChange={(event) => updateRow(row.id, { maxScore: Number(event.target.value) })} className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-center text-xs text-muted-foreground">是否必填</span><span className="flex h-10 items-center justify-center"><input type="checkbox" checked={row.isRequired} onChange={(event) => updateRow(row.id, { isRequired: event.target.checked })}/></span></label><RowActions canDelete={rows.length > 1} onDelete={() => removeRow(row.id)} onAdd={() => addRow(row.id)}/></div>)}<div className="flex justify-end pt-1"><Button type="submit" className={actionButtonClass} disabled={rows.some((row) => !row.name.trim() || !Number.isInteger(row.maxScore) || row.maxScore <= 0)}><Save className="h-4 w-4"/>保存全部维度（{rows.length}项）</Button></div></form>;
}
type PendingRating = { id: number; code: string; label: string; numericScore: number };
function RatingBatchForm({ templateId }: { templateId: string }) {
  const [nextId, setNextId] = useState(2);
  const [rows, setRows] = useState<PendingRating[]>([{ id: 1, code: "", label: "", numericScore: 5 }]);
  function updateRow(id: number, patch: Partial<PendingRating>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function addRow(afterId: number) { setRows((current) => { const index = current.findIndex((row) => row.id === afterId); const next = { id: nextId, code: "", label: "", numericScore: Math.max(1, 5 - current.length) }; return [...current.slice(0, index + 1), next, ...current.slice(index + 1)]; }); setNextId((value) => value + 1); }
  const payload = rows.map(({ code, label, numericScore }) => ({ code, label, numericScore }));
  const invalid = rows.some((row) => !row.code.trim() || !row.label.trim() || !Number.isInteger(row.numericScore) || row.numericScore <= 0);
  return <form action={addTalentRatingOptions} className="space-y-2"><HiddenTemplate id={templateId}/><input type="hidden" name="ratingsJson" value={JSON.stringify(payload)}/>{rows.map((row, index) => <div key={row.id} className="grid min-w-0 items-end gap-2 rounded-lg border border-border bg-background p-2 lg:grid-cols-[32px_100px_minmax(150px,1fr)_110px_80px]"><span className="flex h-10 items-center justify-center text-xs text-muted-foreground">{index + 1}</span><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">等级</span><input required value={row.code} onChange={(event) => updateRow(row.id, { code: event.target.value.toUpperCase() })} placeholder="如 S" className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">等级名称</span><input required value={row.label} onChange={(event) => updateRow(row.id, { label: event.target.value })} placeholder="如杰出" className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">等级分值</span><input type="number" min="1" step="1" required value={row.numericScore} onChange={(event) => updateRow(row.id, { numericScore: Number(event.target.value) })} className={inputClass}/></label><RowActions canDelete={rows.length > 1} onDelete={() => setRows((current) => current.filter((item) => item.id !== row.id))} onAdd={() => addRow(row.id)}/></div>)}<div className="flex justify-end pt-1"><Button type="submit" className={actionButtonClass} disabled={invalid}><Save className="h-4 w-4"/>保存全部评分档（{rows.length}项）</Button></div></form>;
}
type PendingThreshold = { id: number; gradeCode: string; label: string; minScore: number; maxScore: number };
function ThresholdBatchForm({ templateId }: { templateId: string }) {
  const [nextId, setNextId] = useState(2);
  const [rows, setRows] = useState<PendingThreshold[]>([{ id: 1, gradeCode: "", label: "", minScore: 0, maxScore: 0 }]);
  function updateRow(id: number, patch: Partial<PendingThreshold>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function addRow(afterId: number) { setRows((current) => { const index = current.findIndex((row) => row.id === afterId); const next = { id: nextId, gradeCode: "", label: "", minScore: 0, maxScore: 0 }; return [...current.slice(0, index + 1), next, ...current.slice(index + 1)]; }); setNextId((value) => value + 1); }
  const payload = rows.map(({ gradeCode, label, minScore, maxScore }) => ({ gradeCode, label, minScore, maxScore }));
  const invalid = rows.some((row) => !row.gradeCode.trim() || !row.label.trim() || row.minScore < 0 || row.minScore > row.maxScore);
  return <form action={addTalentGradeThresholds} className="space-y-2"><HiddenTemplate id={templateId}/><input type="hidden" name="thresholdsJson" value={JSON.stringify(payload)}/>{rows.map((row, index) => <div key={row.id} className="grid min-w-0 items-end gap-2 rounded-lg border border-border bg-background p-2 lg:grid-cols-[32px_100px_minmax(140px,1fr)_100px_100px_80px]"><span className="flex h-10 items-center justify-center text-xs text-muted-foreground">{index + 1}</span><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">等级</span><input required value={row.gradeCode} onChange={(event) => updateRow(row.id, { gradeCode: event.target.value.toUpperCase() })} placeholder="如 S" className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">等级名称</span><input required value={row.label} onChange={(event) => updateRow(row.id, { label: event.target.value })} placeholder="如杰出" className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">最低分</span><input type="number" min="0" required value={row.minScore} onChange={(event) => updateRow(row.id, { minScore: Number(event.target.value) })} className={inputClass}/></label><label className="min-w-0"><span className="mb-1 block text-xs text-muted-foreground">最高分</span><input type="number" min="0" required value={row.maxScore} onChange={(event) => updateRow(row.id, { maxScore: Number(event.target.value) })} className={inputClass}/></label><RowActions canDelete={rows.length > 1} onDelete={() => setRows((current) => current.filter((item) => item.id !== row.id))} onAdd={() => addRow(row.id)}/></div>)}<div className="flex justify-end pt-1"><Button type="submit" className={actionButtonClass} disabled={invalid}><Save className="h-4 w-4"/>保存全部等级区间（{rows.length}项）</Button></div></form>;
}
function RowActions({ canDelete, onDelete, onAdd }: { canDelete: boolean; onDelete: () => void; onAdd: () => void }) {
  const iconButtonClass = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30";
  return <div className="flex min-w-0 items-center justify-end gap-1"><button type="button" title="删除此行" aria-label="删除此行" onClick={onDelete} disabled={!canDelete} className={`${iconButtonClass} text-red-600`}><Trash2 className="h-4 w-4"/></button><button type="button" title="在此行后添加一行" aria-label="在此行后添加一行" onClick={onAdd} className={iconButtonClass}><Plus className="h-4 w-4"/></button></div>;
}
const nineBoxLayout = [
  { code: "HIGH_LOW", defaultLabel: "熟练员工", legacyLabel: "明星员工", tone: "border-orange-200 bg-orange-100/70" },
  { code: "HIGH_MID", defaultLabel: "绩效之星", legacyLabel: "核心骨干", tone: "border-orange-300 bg-orange-200/70" },
  { code: "HIGH_HIGH", defaultLabel: "超级明星", legacyLabel: "高潜高绩", tone: "border-red-300 bg-red-100/80" },
  { code: "MID_LOW", defaultLabel: "基本胜任", legacyLabel: "稳定贡献", tone: "border-orange-100 bg-orange-50/70" },
  { code: "MID_MID", defaultLabel: "中坚力量", legacyLabel: "中坚力量", tone: "border-orange-200 bg-orange-100/60" },
  { code: "MID_HIGH", defaultLabel: "潜力之星", legacyLabel: "高潜中绩", tone: "border-orange-200 bg-orange-100/70" },
  { code: "LOW_LOW", defaultLabel: "问题员工", legacyLabel: "观察", tone: "border-red-200 bg-background" },
  { code: "LOW_MID", defaultLabel: "差距员工", legacyLabel: "待发展", tone: "border-orange-100 bg-orange-50/50" },
  { code: "LOW_HIGH", defaultLabel: "待发展者", legacyLabel: "潜力新星", tone: "border-orange-200 bg-orange-100/60" },
] as const;
function NineBoxConfiguration({ templateId, boxes, isDraft }: { templateId: string; boxes: ReviewWorkspaceData["config"]["nineBoxRules"]; isDraft: boolean }) {
  const [revision, setRevision] = useState(0);
  const [state, formAction, pending] = useActionState(saveDefaultTalentNineBoxRules, { status: "idle" as const, message: "", requestId: "", clientRevision: 0 });
  const boxByCode = new Map(boxes.map((item) => [item.code, item]));
  const saved = (boxes.length === 9 && revision === 0) || (state.status === "success" && state.clientRevision === revision);
  return <div><div className="mb-4"><h4 className="font-medium">九宫格模型</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">横轴潜力＝忠诚度＋匹配度＋成长度；纵轴绩效＝工作态度＋能力度＋产出度。高、中、低区间根据这两组维度的满分和评分档自动计算，内部编码、颜色和位置由系统维护。</p></div><form action={formAction}><HiddenTemplate id={templateId}/><input type="hidden" name="clientRevision" value={revision}/><div className="grid grid-cols-[24px_minmax(0,1fr)] gap-2"><div className="flex items-center justify-center"><span className="-rotate-90 whitespace-nowrap text-xs text-muted-foreground">绩效：低 → 高</span></div><div><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{nineBoxLayout.map((item) => { const current = boxByCode.get(item.code); const currentLabel = current?.label === item.legacyLabel ? item.defaultLabel : current?.label; return <label key={item.code} className={`min-w-0 rounded-xl border p-3 ${item.tone}`}><span className="mb-2 block text-[11px] text-muted-foreground">{current ? `绩效 ${current.performanceMin}–${current.performanceMax} · 潜力 ${current.potentialMin}–${current.potentialMax}` : "区间自动计算"}</span><input name={`label_${item.code}`} required defaultValue={currentLabel ?? item.defaultLabel} onChange={() => setRevision((value) => value + 1)} disabled={!isDraft || pending} aria-label={`${item.defaultLabel}人才类型名称`} className="h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-medium focus:border-primary focus:outline-none disabled:opacity-70"/></label>; })}</div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>潜力：低 → 高</span>{isDraft && <Button type="submit" className={actionButtonClass} disabled={pending || saved}>{pending ? "正在生成…" : boxes.length === 9 ? "保存九宫格名称" : "生成并保存九宫格"}</Button>}</div></div></div></form>{!isDraft && <p className="mt-3 text-xs text-muted-foreground">已发布版本仅供查看；调整人才类型名称请复制为新草稿版本。</p>}<ActionFeedback key={state.requestId} state={state}/></div>;
}
function categoryLabel(category: string) { return ({ VALUE: "价值观", POTENTIAL: "发展潜力", PERFORMANCE: "当前绩效" } as Record<string, string>)[category] ?? category; }
function RuleEditor({ title, description, rows, isDraft, addForm }: { title: string; description?: string; rows: Array<{ id: string; cells: string[]; editForm?: React.ReactNode }>; isDraft: boolean; addForm: React.ReactNode }) {
  return <div><div className="mb-3 flex items-center justify-between"><div><h4 className="font-medium">{title}</h4><p className="mt-1 text-xs text-muted-foreground">{description ?? "草稿可新增或删除；发布前系统会校验规则完整性。"}</p></div></div>{isDraft && <div className="mb-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3">{addForm}</div>}<div className="space-y-2">{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5">{row.cells.map((cell, index) => <span key={`${row.id}-${index}`} className={index === 1 ? "min-w-28 flex-1 text-sm font-medium" : "text-xs text-muted-foreground"}>{cell}</span>)}{isDraft && row.editForm}{isDraft && <form action={deleteTalentReviewRule}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="ruleType" value={title === "评价维度" ? "DIMENSION" : title === "评分档" ? "RATING" : title === "等级区间" ? "THRESHOLD" : "NINE_BOX"}/><button className="text-xs text-red-600 hover:underline">删除</button></form>}</div>)}{rows.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">暂无{title}，可初始化默认规则或逐项新增</div>}</div></div>;
}

function ConfigBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><h3 className="mb-4 font-semibold">{title}</h3>{children}</Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Internal codes are maintained by the system and must never be exposed as user input.
  if (label.includes("编码")) return <div className="hidden" aria-hidden="true">{children}</div>;
  return <label className={`block ${label === "科目名称" ? "md:col-span-2" : ""}`}><span className="block text-xs font-medium mb-2">{label}</span>{children}</label>;
}
const inputClass = "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:border-primary";

function QuickCard({ icon, tone, hoverTone, label, value, names, action }: { icon: React.ReactNode; tone: string; hoverTone: string; label: string; value: string; names: string[]; action: () => void }) {
  const displayNames = names.join("、");
  return <button onClick={action} className="w-full text-left"><Card className={`!p-4 hover:border-primary/35 hover:shadow-md ${hoverTone} transition-all`}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</div><div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold mt-0.5">{value}</div></div></div>{names.length > 0 && <div className="text-xs text-muted-foreground text-right max-w-[55%] break-words" title={displayNames}>{displayNames}</div>}</div></Card></button>;
}

function PersonDrawer({ person, tab, setTab, onClose, onNotice }: { person: Person; tab: Tab; setTab: (tab: Tab) => void; onClose: () => void; onNotice: (message: string) => void }) {
  const tabs: { key: Tab; label: string }[] = [{ key: "overview", label: "画像概览" }, { key: "review", label: "人才盘点" }, { key: "ability", label: "晋升能力" }, { key: "decision", label: "决策履历" }];
  const extras = person.profileExtras;
  const yearsText = extras ? `在职 ${extras.yearsOfService} 年` : `在职 ${person.years} 年`;
  const contractText = extras?.contractEndAt ? `合同到期 ${extras.contractEndAt}` : person.contract ? `合同到期 ${person.contract}` : "合同未配置";
  return <div className="fixed inset-0 z-50 flex justify-end">
    <button aria-label="关闭员工画像" className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" onClick={onClose} />
    <aside className="relative w-full max-w-[720px] h-full bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <div className="px-6 py-5 border-b border-border bg-card flex items-start gap-4">
        <div className={`w-14 h-14 rounded-full text-white text-lg font-semibold flex items-center justify-center ${avatarColor(person.name)}`}>{person.name[0]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-nowrap">
            <h2 className="text-xl font-semibold shrink-0">{person.name}</h2>
            <Badge tone="default">{person.level}</Badge>
            <Badge tone={person.tone}>{person.grid}</Badge>
            <Badge tone="default">{person.team} · {person.title}</Badge>
            <Badge tone="default">{yearsText}</Badge>
            <Badge tone="default">{contractText}</Badge>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center shrink-0"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-6 border-b border-border bg-card flex gap-6 overflow-x-auto">
        {tabs.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`py-3 text-sm whitespace-nowrap border-b-2 transition ${tab === item.key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {tab === "overview" && <Overview person={person} setTab={setTab} />}
        {tab === "review" && <Review />}
        {tab === "ability" && <Ability person={person} />}
        {tab === "decision" && <DecisionHistory />}
      </div>
      <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between"><div className="text-xs text-muted-foreground">画像数据更新于 2026-07-31 18:20</div><div className="flex gap-2"><Button className={actionButtonClass} variant="outline" onClick={() => onNotice("已导出员工画像（交互示意）")}>导出画像</Button><Button className={actionButtonClass} onClick={() => onNotice("已创建部门决策建议草稿")}>新建决策建议</Button></div></div>
    </aside>
  </div>;
}

function Overview({ person }: { person: Person; setTab: (tab: Tab) => void }) {
  const extras = person.profileExtras;
  const reviewHistory = extras?.reviewHistory ?? [];
  const kpiHistory = extras?.kpiHistory ?? [];
  const latestReview = reviewHistory[0];
  const latestKpi = kpiHistory[0];
  const incidentLevel = extras?.latestIncidentLevel ?? null;

  return <div className="space-y-5">
    <section>
      <h3 className="text-sm font-semibold mb-3">近期表现</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">人才盘点</div>
          <div className="text-xl font-semibold mt-2">{latestReview?.grade ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{latestReview ? `${latestReview.score}分` : "暂无数据"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">有效 KPI</div>
          <div className="text-xl font-semibold mt-2">{person.hasKpi ? `${person.kpi}分` : "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{latestKpi?.period ?? (person.hasKpi ? "—" : "暂无数据")}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">业务考核</div>
          <div className="text-xl font-semibold mt-2">{person.hasAssessment ? `${person.assessment}/${person.assessmentMax}` : "—"}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{person.hasAssessment ? (person.assessment >= person.assessmentMax ? "全部及格" : "存在补考项") : "暂无数据"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">工作事故</div>
          <div className="text-xl font-semibold mt-2">{incidentLevel ?? 0}</div>
          <div className="text-[11px] text-muted-foreground mt-1">最近一次</div>
        </div>
      </div>
    </section>

    <section>
      <h3 className="text-sm font-semibold mb-3">人才履历</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <HistorySignal
          icon={<span className="text-sm font-semibold">C</span>}
          title="聘期内人才盘点 2 次 C 级"
          detail="当前聘期内累计出现 2 次 C 级盘点结果"
          status={extras?.hasTwoCReviews}
          positiveTone="danger"
        />
        <HistorySignal
          icon={<span className="text-sm font-semibold">C</span>}
          title="聘期内人才盘点连续 2 次 C 级"
          detail="当前聘期内存在连续 2 次 C 级盘点结果"
          status={extras?.hasConsecutiveTwoCReviews}
          positiveTone="danger"
        />
        <HistorySignal
          icon={<span className="text-sm font-semibold">C</span>}
          title="最近一次人才盘点为 C 级"
          detail="最近一期盘点结果为 C 级"
          status={extras?.isLatestReviewC}
          positiveTone="danger"
        />
        <HistorySignal
          icon={<span className="text-sm font-semibold">晋</span>}
          title="当前聘期内是否有晋升"
          detail="当前聘期内已发生正式晋升记录"
          status={extras?.hasPromotionInCurrentContract}
          positiveTone="success"
        />
      </div>
    </section>

    <section>
      <h3 className="text-sm font-semibold mb-3">能力表现</h3>
      <Card className="!p-4 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">能力匹配度</div>
            <div className="text-xs text-muted-foreground mt-1">(当前聘期内 KPI 均值 / 季度 KPI 总分) × {Math.round((extras?.kpiWeight ?? 0.6) * 100)}% + (当前聘期内盘点均值 / 盘点模型总分) × {Math.round((extras?.reviewWeight ?? 0.4) * 100)}%</div>
          </div>
          <div className="text-2xl font-semibold text-primary">{extras?.abilityMatchScore != null ? `${extras.abilityMatchScore}%` : "—"}</div>
        </div>
      </Card>
      <div className="space-y-3">
        <Card className="!p-4">
          <div className="text-sm font-medium mb-3">聘期内 KPI 历史趋势</div>
          {kpiHistory.length > 0 ? <LineChart data={[...kpiHistory].reverse().map((item) => ({ label: item.period, value: item.score, display: `${item.score}/${item.rating ?? "—"}` }))} color="#10b981" minValue={0} maxValue={extras?.kpiTotalScore ?? 110} /> : <div className="text-xs text-muted-foreground py-6 text-center">暂无聘期内 KPI 数据</div>}
        </Card>
        <Card className="!p-4">
          <div className="text-sm font-medium mb-3">聘期内人才盘点趋势</div>
          {reviewHistory.length > 0 ? <LineChart data={[...reviewHistory].reverse().map((item) => ({ label: item.period, value: item.score, display: `${item.grade ?? "—"}/${item.score}` }))} color="#3b82f6" minValue={0} maxValue={extras?.reviewTotalScore ?? 30} /> : <div className="text-xs text-muted-foreground py-6 text-center">暂无聘期内盘点数据</div>}
        </Card>
      </div>
    </section>
  </div>;
}

function HistorySignal({ icon, title, detail, status, positiveTone = "danger" }: { icon: React.ReactNode; title: string; detail: string; status?: boolean; positiveTone?: "danger" | "success" }) {
  const isPositive = status === true;
  const toneClass = positiveTone === "success"
    ? { icon: "bg-emerald-50 text-emerald-600", text: "text-emerald-600" }
    : { icon: "bg-red-50 text-red-600", text: "text-red-600" };
  return <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isPositive ? toneClass.icon : "bg-slate-50 text-slate-400"}`}>{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
    </div>
    <div className={`text-sm font-semibold shrink-0 ${isPositive ? toneClass.text : "text-emerald-600"}`}>{isPositive ? "是" : "否"}</div>
  </div>;
}

function LineChart({ data, color, minValue, maxValue }: { data: Array<{ label: string; value: number; display?: string }>; color: string; minValue?: number; maxValue?: number }) {
  if (data.length === 0) return null;
  const values = data.map((item) => item.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const min = minValue ?? Math.min(0, dataMin);
  const max = maxValue ?? Math.max(dataMax, min + 1);
  const range = max - min || 1;
  const leftPadding = 48;
  const rightPadding = 48;
  const topPadding = 36;
  const bottomPadding = 36;
  const width = 600;
  const height = 200;
  const chartWidth = width - leftPadding - rightPadding;
  const chartHeight = height - topPadding - bottomPadding;
  const singlePoint = data.length === 1;
  const points = data.map((item, index) => {
    const x = singlePoint ? leftPadding + chartWidth / 2 : leftPadding + (index / (data.length - 1)) * chartWidth;
    const y = height - bottomPadding - ((item.value - min) / range) * chartHeight;
    return { x, y, value: item.value, label: item.label, display: item.display };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const yTicks = 5;
  return <div className="w-full overflow-x-auto">
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[520px]" preserveAspectRatio="xMidYMid meet">
      {/* grid lines and y-axis labels */}
      {Array.from({ length: yTicks + 1 }).map((_, index) => {
        const ratio = index / yTicks;
        const y = topPadding + ratio * chartHeight;
        const value = Math.round(max - ratio * range);
        return <g key={index}>
          <line x1={leftPadding} y1={y} x2={width - rightPadding} y2={y} stroke="#e5e7eb" strokeWidth={1} />
          <text x={leftPadding - 10} y={y + 3} textAnchor="end" className="text-[10px] fill-muted-foreground">{value}</text>
        </g>;
      })}
      {/* line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
      {/* points and labels */}
      {points.map((point, index) => {
        const isFirst = index === 0;
        const isLast = index === data.length - 1;
        const valueAnchor = singlePoint ? "middle" : isFirst ? "start" : isLast ? "end" : "middle";
        const valueDx = singlePoint ? 0 : isFirst ? 6 : isLast ? -6 : 0;
        const labelAnchor = singlePoint ? "middle" : isFirst ? "start" : isLast ? "end" : "middle";
        const labelDx = singlePoint ? 0 : isFirst ? 4 : isLast ? -4 : 0;
        const valueY = point.y - 14 < topPadding ? point.y + 14 : point.y - 10;
        return <g key={index}>
          <circle cx={point.x} cy={point.y} r={4} fill={color} stroke="white" strokeWidth={2} />
          <text x={point.x} y={valueY} dx={valueDx} textAnchor={valueAnchor} className="text-[10px] fill-foreground">{point.display ?? point.value}</text>
          <text x={point.x} y={height - 10} dx={labelDx} textAnchor={labelAnchor} className="text-[10px] fill-muted-foreground">{point.label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function Review() {
  return <div className="space-y-4"><Card><div className="flex items-center justify-between"><div><h3 className="font-semibold">最近一次人才盘点</h3><p className="text-xs text-muted-foreground mt-1">评价模型：产品部通用六维模型 V1.0</p></div><div className="text-right"><div className="text-3xl font-semibold">27</div><Badge tone="success">S 级 · 杰出</Badge></div></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">{dimensions.map((item) => <div key={item.label} className="rounded-xl bg-muted/60 p-4"><div className="text-xs text-muted-foreground">{item.label}</div><div className="mt-2 flex items-end justify-between"><span className="text-xl font-semibold">{item.value}</span><span className="text-xs text-muted-foreground">{item.score} 分</span></div></div>)}</div></Card><Card><h3 className="font-semibold mb-3">评价说明</h3><p className="text-sm leading-7 text-muted-foreground">本次盘点在需求交付质量、跨组协作与主动承担方面表现突出。建议继续加强复杂业务抽象能力，为下一职级承担更完整的产品线责任做准备。</p></Card></div>;
}

function Ability({ person }: { person: Person }) {
  const items = [{ label: "业务洞察", value: 88 }, { label: "产品规划", value: 92 }, { label: "方案设计", value: 86 }, { label: "项目推动", value: 84 }, { label: "数据分析", value: 78 }];
  return <div className="space-y-4"><Card><div className="flex items-center justify-between mb-5"><div><h3 className="font-semibold">{person.nextLevel} 晋升能力匹配</h3><p className="text-xs text-muted-foreground mt-1">B端产品职业能力模型 V2.1</p></div><span className="text-2xl font-semibold text-primary">86%</span></div><div className="space-y-4">{items.map((item) => <div key={item.label}><div className="flex justify-between text-xs mb-1.5"><span>{item.label}</span><span className="text-muted-foreground">{item.value}%</span></div><Progress value={item.value} tone={item.value >= 85 ? "success" : "primary"} /></div>)}</div></Card><Card><div className="flex gap-3"><div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center"><ShieldAlert className="w-5 h-5" /></div><div><h3 className="font-medium">尚有 2 项需要补足</h3><p className="text-xs text-muted-foreground leading-5 mt-1">数据驱动决策需达到熟练级；需补充一个跨产品线复杂项目案例。能力达成仅作为晋升依据之一，最终仍需结合人才盘点和绩效规则。</p></div></div></Card></div>;
}

function DecisionHistory() {
  return <div className="space-y-4"><Card><div className="flex items-center justify-between mb-5"><div><h3 className="font-semibold">正式结果履历</h3><p className="text-xs text-muted-foreground mt-1">仅展示公司流程最终结果，与部门建议分别留痕</p></div><History className="w-5 h-5 text-muted-foreground" /></div><div className="relative pl-4">{decisions.map((item, index) => { const Icon = item.icon; return <div key={item.title} className="relative pl-10 pb-7 last:pb-0"><div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center ${item.tone}`}><Icon className="w-4 h-4" /></div>{index < decisions.length - 1 && <div className="absolute left-[15px] top-9 bottom-1 w-px bg-border" />}<div className="text-[11px] text-muted-foreground">{item.date} · {item.type}</div><div className="font-medium mt-1">{item.title}</div><div className="text-xs text-muted-foreground mt-1">{item.detail}</div></div>; })}</div></Card><Card><div className="flex items-start gap-3"><div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Clock3 className="w-4 h-4" /></div><div><div className="font-medium">为什么单独记录正式结果？</div><p className="text-xs text-muted-foreground leading-5 mt-1">部门建议可能未被采纳或调整。晋升、续签、加薪、奖励的最终结果独立保存后，才能完整查询个人历史并追溯“建议—公司流程—最终生效”的差异。</p></div></div></Card></div>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold mt-2">{value}</div><div className="text-[11px] text-muted-foreground mt-1">{hint}</div></div>;
}

function Signal({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: string }) {
  return <div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>{icon}</div><div><div className="text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground mt-0.5">{detail}</div></div></div>;
}
