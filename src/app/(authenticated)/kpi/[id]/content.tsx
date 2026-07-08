"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { approvePersonalKpiScoring, rejectPersonalKpiScoring, savePersonalKpiScoring, submitPersonalKpiScoring } from "@/server/kpi/actions";
import { Badge, Button, Card } from "@/components/ui-kit";

type EditableStage = "SELF" | "LEADER" | "MANAGER" | "FINAL" | null;
type PendingAction = "submit" | "approve" | "reject" | null;

type Props = {
  data: {
    id: string;
    year: number;
    quarter: number;
    stageKey: string;
    status: string;
    tone: "default" | "primary" | "info" | "success" | "warning";
    editableStage: EditableStage;
    availableActions: {
      canSave: boolean;
      canSubmit: boolean;
      canApprove: boolean;
      canReject: boolean;
    };
    stages: Array<{
      key: string;
      label: string;
      count: number;
      active: boolean;
      completed: boolean;
    }>;
    approvalSteps: Array<{
      stepOrder: number;
      stageKey: string;
      approverName: string;
      status: string;
    }>;
    basicInfo: {
      department: string;
      team: string;
      name: string;
      title: string;
      quarterLabel: string;
    };
    items: Array<{
      id: string;
      name: string;
      scoringStandard: string;
      targetDetail: string;
      score: number;
      selfScore: number;
      leaderScore: number;
      managerScore: number;
    }>;
    totals: {
      scoreTotal: number;
      selfTotal: number;
      leaderTotal: number;
      managerTotal: number;
      attendanceScore: number;
      finalTotal: number;
    };
    summary: {
      self: {
        workSummary: string;
        abilitySummary: string;
      };
      leader: {
        praise: string;
        opportunity: string;
      };
      manager: {
        praise: string;
        opportunity: string;
      };
      crossDepartment: {
        department: string;
        praise: string;
        opportunity: string;
        complaint: string;
      };
    };
    actionLogs: Array<{
      id: string;
      actorName: string;
      action: string;
      actedAt: string;
      remark: string | null;
    }>;
  };
  viewOnly?: boolean;
};

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function parseScoreInput(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEditableScore(value: number) {
  return value === 0 ? "" : formatScore(value);
}

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

function ScoreInput({ value }: { value: number | string }) {
  return (
    <input
      value={String(value)}
      readOnly
      className="h-10 w-full rounded-lg border border-border bg-muted/20 px-3 text-right text-sm"
    />
  );
}

function EditableScoreInput({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-right text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function SummaryTextarea({
  name,
  value,
  placeholder,
  readOnly,
  required,
  onChange,
}: {
  name?: string;
  value: string;
  placeholder: string;
  readOnly?: boolean;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <textarea
      name={name}
      value={value}
      readOnly={readOnly}
      required={required}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      placeholder={placeholder}
      rows={4}
      className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm read-only:bg-muted/20"
    />
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  submitting,
  requireRemark,
  remark,
  onRemarkChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  submitting: boolean;
  requireRemark?: boolean;
  remark?: string;
  onRemarkChange?: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {requireRemark ? (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium">退回原因</div>
            <textarea
              value={remark ?? ""}
              onChange={onRemarkChange ? (event) => onRemarkChange(event.target.value) : undefined}
              placeholder="请输入退回原因"
              rows={4}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>取消</Button>
          <Button type="button" disabled={submitting || (requireRemark ? !(remark ?? "").trim() : false)} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function KpiDetailContent({ data, viewOnly = false }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoreValues, setScoreValues] = useState(
    data.items.map((item) => {
      if (data.editableStage === "LEADER") return formatEditableScore(item.leaderScore);
      if (data.editableStage === "MANAGER") return formatEditableScore(item.managerScore);
      return formatEditableScore(item.selfScore);
    })
  );
  const [workSummary, setWorkSummary] = useState(data.summary.self.workSummary);
  const [abilitySummary, setAbilitySummary] = useState(data.summary.self.abilitySummary);
  const [praise, setPraise] = useState(
    data.editableStage === "MANAGER" ? data.summary.manager.praise : data.summary.leader.praise
  );
  const [opportunity, setOpportunity] = useState(
    data.editableStage === "MANAGER" ? data.summary.manager.opportunity : data.summary.leader.opportunity
  );
  const [attendanceScore, setAttendanceScore] = useState(formatEditableScore(data.totals.attendanceScore));
  const [rejectRemark, setRejectRemark] = useState("");

  const scorePenaltyTotal = useMemo(() => {
    if (data.editableStage !== "SELF" && data.editableStage !== "LEADER" && data.editableStage !== "MANAGER") {
      return 0;
    }
    return scoreValues.reduce((sum, value) => sum + Math.abs(Math.min(parseScoreInput(value), 0)), 0);
  }, [data.editableStage, scoreValues]);

  const derivedTotals = useMemo(() => {
    const selfTotal = data.editableStage === "SELF" ? data.totals.scoreTotal - scorePenaltyTotal : data.totals.selfTotal;
    const leaderTotal = data.editableStage === "LEADER" ? data.totals.scoreTotal - scorePenaltyTotal : data.totals.leaderTotal;
    const managerTotal = data.editableStage === "MANAGER" ? data.totals.scoreTotal - scorePenaltyTotal : data.totals.managerTotal;
    const normalizedAttendanceScore = data.editableStage === "FINAL" ? parseScoreInput(attendanceScore) : data.totals.attendanceScore;
    return {
      selfTotal,
      leaderTotal,
      managerTotal,
      attendanceScore: normalizedAttendanceScore,
      finalTotal: managerTotal + normalizedAttendanceScore,
    };
  }, [attendanceScore, data.editableStage, data.totals.attendanceScore, data.totals.leaderTotal, data.totals.managerTotal, data.totals.scoreTotal, data.totals.selfTotal, scorePenaltyTotal]);

  const upperSummary = useMemo(() => {
    if (data.editableStage === "LEADER" || data.editableStage === "MANAGER") {
      return { praise, opportunity };
    }
    return {
      praise: data.summary.manager.praise || data.summary.leader.praise,
      opportunity: data.summary.manager.opportunity || data.summary.leader.opportunity,
    };
  }, [data.editableStage, data.summary.leader.opportunity, data.summary.leader.praise, data.summary.manager.opportunity, data.summary.manager.praise, opportunity, praise]);

  const canEditSelf = !viewOnly && data.editableStage === "SELF";
  const canEditLeader = !viewOnly && data.editableStage === "LEADER";
  const canEditManager = !viewOnly && data.editableStage === "MANAGER";
  const canEditFinal = !viewOnly && data.editableStage === "FINAL";

  async function runAction(action: "save" | "submit" | "approve" | "reject") {
    if (!formRef.current) return;
    if (action !== "save" && action !== "reject" && !formRef.current.reportValidity()) {
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const formData = new FormData(formRef.current);
      if (action === "reject") {
        formData.set("rejectRemark", rejectRemark);
      }
      if (action === "save") {
        await savePersonalKpiScoring(formData);
      } else if (action === "submit") {
        await submitPersonalKpiScoring(formData);
      } else if (action === "approve") {
        await approvePersonalKpiScoring(formData);
      } else {
        await rejectPersonalKpiScoring(formData);
      }
      setPendingAction(null);
      setRejectRemark("");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "KPI 评分保存失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openPendingAction(action: "submit" | "approve" | "reject") {
    if (!formRef.current) return;
    if ((action === "submit" || action === "approve") && !formRef.current.reportValidity()) {
      return;
    }
    setPendingAction(action);
  }

  return (
    <>
      <form ref={formRef} className="space-y-6 pb-24">
        <input type="hidden" name="personalKpiId" value={data.id} />
        {!canEditFinal ? <input type="hidden" name="attendanceScore" value={formatScore(data.totals.attendanceScore)} /> : null}
        <Card className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{`${data.basicInfo.name} · ${data.basicInfo.quarterLabel} KPI`}</h1>
                <Badge tone={data.tone}>{data.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {!viewOnly && data.availableActions.canSave ? "处理季度 KPI 评分并推进当前流程。" : "查看季度 KPI 单据详情、评分汇总与绩效总结。"}
              </p>
            </div>
            <Link href="/kpi">
              <Button className="rounded-lg" variant="outline">返回 KPI 列表</Button>
            </Link>
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMessage}</div>
          ) : null}

          <div>
            <h3 className="mb-4 text-lg font-semibold">KPI流程进度条</h3>
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-5">
              {data.stages.map((stage) => {
                const progressWidth = stage.completed ? "100%" : stage.active ? "50%" : "0%";
                const approvalStep = data.approvalSteps.find((step) => {
                  if (stage.key === "PENDING_LEADER_SCORE") return step.stageKey === "LEADER";
                  if (stage.key === "PENDING_MANAGER_SCORE") return step.stageKey === "MANAGER";
                  if (stage.key === "PENDING_FINAL_REVIEW") return step.stageKey === "FINAL";
                  return false;
                });
                return (
                  <div key={stage.key} className="min-w-0">
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: progressWidth }} />
                    </div>
                    <div className="mt-2 text-sm font-medium">{stage.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {stage.active ? "当前阶段" : stage.completed ? "已完成" : "未开始"}
                    </div>
                    {approvalStep ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        审批人：{approvalStep.approverName}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold">基本信息</h3>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              {[
                ["部门", data.basicInfo.department],
                ["小组", data.basicInfo.team],
                ["姓名", data.basicInfo.name],
                ["岗位", data.basicInfo.title],
                ["考核季度", data.basicInfo.quarterLabel],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-1 whitespace-nowrap">
                  <span className="text-muted-foreground">{label}：</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold">考核指标</h3>
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-sm text-muted-foreground">
                      <th className="px-5 py-3 font-medium">指标项</th>
                      <th className="px-5 py-3 font-medium">评分标准</th>
                      <th className="px-5 py-3 font-medium">季度指标得分明细</th>
                      <th className="px-4 py-3 font-medium text-right">分值</th>
                      <th className="px-4 py-3 font-medium text-right">自评</th>
                      <th className="px-4 py-3 font-medium text-right">组长评</th>
                      <th className="px-4 py-3 font-medium text-right">主管评</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, index) => (
                      <tr key={item.id} className="border-t border-border align-top">
                        <td className="px-5 py-4 text-sm font-medium">
                          <input type="hidden" name="itemId" value={item.id} />
                          {item.name}
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground whitespace-pre-wrap">{item.scoringStandard}</td>
                        <td className="px-5 py-4 text-sm text-muted-foreground whitespace-pre-wrap">{item.targetDetail || "—"}</td>
                        <td className="px-4 py-4"><ScoreInput value={formatScore(item.score)} /></td>
                        <td className="px-4 py-4">
                          {canEditSelf ? (
                            <EditableScoreInput
                              name="selfScore"
                              value={scoreValues[index]}
                              onChange={(value) => setScoreValues((current) => current.map((itemValue, itemIndex) => itemIndex === index ? value : itemValue))}
                            />
                          ) : (
                            <ScoreInput value={formatScore(item.selfScore)} />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {canEditLeader ? (
                            <EditableScoreInput
                              name="leaderScore"
                              value={scoreValues[index]}
                              onChange={(value) => setScoreValues((current) => current.map((itemValue, itemIndex) => itemIndex === index ? value : itemValue))}
                            />
                          ) : (
                            <ScoreInput value={formatScore(item.leaderScore)} />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {canEditManager ? (
                            <EditableScoreInput
                              name="managerScore"
                              value={scoreValues[index]}
                              onChange={(value) => setScoreValues((current) => current.map((itemValue, itemIndex) => itemIndex === index ? value : itemValue))}
                            />
                          ) : (
                            <ScoreInput value={formatScore(item.managerScore)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-5 py-4 text-sm font-semibold" colSpan={3}>汇总</td>
                      <td className="px-4 py-4"><ScoreInput value={formatScore(data.totals.scoreTotal)} /></td>
                      <td className="px-4 py-4"><ScoreInput value={formatScore(derivedTotals.selfTotal)} /></td>
                      <td className="px-4 py-4"><ScoreInput value={formatScore(derivedTotals.leaderTotal)} /></td>
                      <td className="px-4 py-4"><ScoreInput value={formatScore(derivedTotals.managerTotal)} /></td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-5 py-4" colSpan={3} />
                      <td className="px-4 py-4 text-sm font-medium text-right whitespace-nowrap">考勤分</td>
                      <td className="px-4 py-4">
                        {canEditFinal ? (
                          <EditableScoreInput name="attendanceScore" value={attendanceScore} onChange={setAttendanceScore} />
                        ) : (
                          <ScoreInput value={formatScore(derivedTotals.attendanceScore)} />
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-right whitespace-nowrap">最终绩效总分</td>
                      <td className="px-4 py-4"><ScoreInput value={formatScore(derivedTotals.finalTotal)} /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold">绩效总结</h3>
            <div className="py-5">
              <div className="space-y-6">
                <div>
                  <div className="mb-3 text-sm font-semibold">个人总结</div>
                  <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-medium">季度工作任务总结</div>
                      <SummaryTextarea name="workSummary" value={workSummary} onChange={setWorkSummary} required={canEditSelf} readOnly={!canEditSelf} placeholder="请输入季度工作任务总结" />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-medium">季度工作能力总结</div>
                      <SummaryTextarea name="abilitySummary" value={abilitySummary} onChange={setAbilitySummary} required={canEditSelf} readOnly={!canEditSelf} placeholder="请输入季度工作能力总结" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold">上级点评</div>
                  <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-medium">表扬</div>
                      <SummaryTextarea name="praise" value={upperSummary.praise} onChange={setPraise} required={canEditLeader} readOnly={!canEditLeader && !canEditManager} placeholder="请输入上级表扬" />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-medium">机会</div>
                      <SummaryTextarea name="opportunity" value={upperSummary.opportunity} onChange={setOpportunity} required={canEditLeader} readOnly={!canEditLeader && !canEditManager} placeholder="请输入上级建议与机会" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold">跨部门评价</div>
                  <div className="space-y-4">
                    <div className="text-sm">
                      <span className="font-medium">评选部门：</span>
                      <span>{data.summary.crossDepartment.department}</span>
                    </div>
                    <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
                      <div>
                        <div className="mb-2 text-sm font-medium">表扬</div>
                        <SummaryTextarea value={data.summary.crossDepartment.praise} readOnly placeholder="请输入跨部门表扬" />
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-medium">机会</div>
                        <SummaryTextarea value={data.summary.crossDepartment.opportunity} readOnly placeholder="请输入跨部门改进机会" />
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-medium">跨部门投诉栏</div>
                        <SummaryTextarea value={data.summary.crossDepartment.complaint} readOnly placeholder="请输入跨部门投诉内容" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold">操作日志</h3>
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full">
                <thead className="bg-muted/40">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-5 py-3 font-medium">操作人</th>
                    <th className="px-5 py-3 font-medium">操作内容</th>
                    <th className="px-5 py-3 font-medium">时间</th>
                    <th className="px-5 py-3 font-medium">操作备注</th>
                  </tr>
                </thead>
                <tbody>
                  {data.actionLogs.length ? data.actionLogs.map((log) => (
                    <tr key={log.id} className="border-t border-border text-sm">
                      <td className="px-5 py-3">{log.actorName}</td>
                      <td className="px-5 py-3">{log.action}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(log.actedAt)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{log.remark || "—"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">暂无操作日志</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!viewOnly && data.availableActions.canSave ? (
            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <Button className="rounded-lg" variant="outline" disabled={isSubmitting} onClick={() => void runAction("save")}>保存</Button>
              {data.availableActions.canReject ? <Button className="rounded-lg" variant="outline" disabled={isSubmitting} onClick={() => openPendingAction("reject")}>退回</Button> : null}
              {data.availableActions.canSubmit ? <Button className="rounded-lg" disabled={isSubmitting} onClick={() => openPendingAction("submit")}>提交</Button> : null}
              {data.availableActions.canApprove ? <Button className="rounded-lg" disabled={isSubmitting} onClick={() => openPendingAction("approve")}>审核通过</Button> : null}
            </div>
          ) : null}
        </Card>
      </form>

      <ConfirmDialog open={pendingAction === "submit"} title="确认提交" description="确认提交后，当前 KPI 将流转到下一阶段。" confirmLabel="确认提交" submitting={isSubmitting} onClose={() => setPendingAction(null)} onConfirm={() => void runAction("submit")} />
      <ConfirmDialog open={pendingAction === "approve"} title="确认审核通过" description="确认审核通过后，当前 KPI 将流转到下一阶段。" confirmLabel="确认通过" submitting={isSubmitting} onClose={() => setPendingAction(null)} onConfirm={() => void runAction("approve")} />
      <ConfirmDialog open={pendingAction === "reject"} title="确认退回" description="确认退回后，当前 KPI 将回退到上一阶段。" confirmLabel="确认退回" submitting={isSubmitting} requireRemark remark={rejectRemark} onRemarkChange={setRejectRemark} onClose={() => { setPendingAction(null); setRejectRemark(""); }} onConfirm={() => void runAction("reject")} />
    </>
  );
}
