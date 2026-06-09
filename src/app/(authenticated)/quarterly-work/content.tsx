"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, PageHeader, Progress } from "@/components/ui-kit";
import { createQuarterlyWork, updateQuarterlyWork } from "@/server/quarterly-work/actions";
import type { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { Plus, AlertTriangle, Pencil, X } from "lucide-react";

type Props = { data: Awaited<ReturnType<typeof getQuarterlyWorkData>> };
type ColumnStatus = Props["data"]["columns"][number]["status"];
type BoardItem = Props["data"]["columns"][number]["items"][number];
type TeamTab = "all" | Props["data"]["teamOptions"][number]["id"];

type CreateDialogState = {
  status: ColumnStatus;
  title: string;
} | null;

type EditDialogState = {
  item: BoardItem;
  title: string;
} | null;

const columnTitleByStatus: Record<ColumnStatus, string> = {
  NOT_STARTED: "未启动",
  IN_PROGRESS: "进行中",
  DELAYED_COMPLETED: "延期",
  COMPLETED: "已完成",
};

const editableStatuses: ColumnStatus[] = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];

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

function QuarterlyWorkForm({
  data,
  mode,
  status,
  title,
  item,
  onClose,
}: {
  data: Props["data"];
  mode: "create" | "edit";
  status: ColumnStatus;
  title: string;
  item?: BoardItem;
  onClose: () => void;
}) {
  const actionLabel = `${title}工作`;
  const memberOptions = useMemo(
    () => data.memberOptions.map((member) => ({
      ...member,
      label: member.teamName ? `${member.name} · ${member.teamName}` : member.name,
    })),
    [data.memberOptions]
  );
  const statusOptions = useMemo(() => editableStatuses, []);

  const submitAction = async (fd: FormData) => {
    if (mode === "edit") {
      await updateQuarterlyWork(fd);
    } else {
      await createQuarterlyWork(fd);
    }
    onClose();
  };

  return (
    <form action={submitAction}>
      {mode === "edit" ? <input type="hidden" name="workId" value={item?.id ?? ""} /> : null}
      {mode === "create" ? <input type="hidden" name="status" value={status} /> : null}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">项目名称 *</label>
          <input
            name="title"
            required
            defaultValue={item?.title ?? ""}
            placeholder={`请输入${actionLabel}名称`}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">负责人 *</label>
          <select
            name="ownerId"
            required
            defaultValue={item?.ownerId ?? memberOptions[0]?.id ?? ""}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
          >
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>{member.label}</option>
            ))}
          </select>
        </div>
        {mode === "edit" && (
          <div>
            <label className="mb-1 block text-sm font-medium">工作状态 *</label>
            <select
              name="status"
              required
              defaultValue={item?.status ?? status}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>{columnTitleByStatus[option]}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">本季度工作目标 *</label>
          <textarea
            name="description"
            required
            defaultValue={item?.description ?? ""}
            rows={4}
            placeholder="请输入本季度工作目标"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">项目预期收益 *</label>
          <textarea
            name="expectedOutcome"
            required
            defaultValue={item?.expectedOutcome ?? ""}
            rows={3}
            placeholder="请输入项目预期收益"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
        <Button type="submit">
          {mode === "edit" ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {mode === "edit" ? "保存" : "创建"}
        </Button>
      </div>
    </form>
  );
}

export function QuarterlyWorkContent({ data }: Props) {
  const [tab, setTab] = useState<"board" | "value">("board");
  const [teamTab, setTeamTab] = useState<TeamTab>("all");
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null);
  const [editDialog, setEditDialog] = useState<EditDialogState>(null);
  const visibleColumns = useMemo(
    () => data.columns.map((column) => ({
      ...column,
      items: teamTab === "all" ? column.items : column.items.filter((item) => item.teamId === teamTab),
    })),
    [data.columns, teamTab]
  );
  const visibleReminders = useMemo(
    () => teamTab === "all"
      ? data.updateReminders
      : data.updateReminders.filter((reminder) => {
          const work = data.columns.flatMap((column) => column.items).find((item) => item.id === reminder.id);
          return work?.teamId === teamTab;
        }),
    [data.columns, data.updateReminders, teamTab]
  );
  const teamTabs = useMemo(
    () => [{ id: "all" as const, name: "全部" }, ...data.teamOptions],
    [data.teamOptions]
  );

  return (
    <>
      <PageHeader
        title={`${data.year} Q${data.quarter} 季度工作`}
        description="按小组规划季度工作 · 月度拆解 · 每周更新进展，延期自动预警；上线后跟踪需求价值"
        action={
          data.canCreate
            ? <Button onClick={() => setCreateDialog({ status: "NOT_STARTED", title: "未启动" })}><Plus className="w-4 h-4" />新增季度工作</Button>
            : undefined
        }
      />

      <div className="mb-4 rounded-xl bg-card border border-border p-5 shadow-sm">
        <div className="inline-flex p-1 rounded-lg bg-muted">
          {[
            { k: "board", label: "工作看板" },
            { k: "value", label: "需求价值跟踪" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as "board" | "value")}
              className={`px-4 py-1.5 rounded-md text-sm transition ${
                tab === t.k ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "board" ? (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {teamTabs.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => setTeamTab(team.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${teamTab === team.id ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}
              >
                {team.name}
              </button>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">当前看板：{data.year} Q{data.quarter}</div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted-foreground">
            对季度工作中已上线需求的<span className="text-foreground font-medium"> 预期收益 vs 实际收益 </span>进行对比与 ROI 跟踪。
          </div>
        )}
      </div>

      {tab === "board" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {visibleColumns.map((c) => (
              <div key={c.key} className="rounded-xl border border-border p-3 min-h-[400px] shadow-sm" style={{ background: "var(--card)" }}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.tone}>{c.title}</Badge>
                    <span className="text-xs text-muted-foreground">{c.items.length}</span>
                  </div>
                  {data.canCreate && (
                    <button
                      type="button"
                      onClick={() => setCreateDialog({ status: c.status, title: c.title })}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      + 添加
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {c.items.length ? (
                    c.items.map((it) => (
                      <div key={it.id} className="bg-muted/50 rounded-lg p-3 border border-border hover:border-primary/40 hover:shadow-md transition shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-medium leading-snug">{it.title}</div>
                          <button
                            type="button"
                            onClick={() => setEditDialog({ item: it, title: c.title })}
                            className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                            aria-label={`编辑${it.title}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{it.owner}</span>
                          <span>{it.weeks} 周</span>
                        </div>
                        {it.progress !== undefined && (
                          <div className="mt-2">
                            <Progress value={it.progress} tone={c.key === "delayed" ? "warning" : "primary"} />
                          </div>
                        )}
                        {it.delay && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="w-3 h-3" />延期 {it.delay} 周
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-xs text-muted-foreground py-8">暂无</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {visibleReminders.length > 0 && (
            <Card className="mt-6">
              <h3 className="font-semibold mb-3">本周更新提醒</h3>
              <div className="space-y-2">
                {visibleReminders.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{r.who[0]}</div>
                      <div>
                        <div className="text-sm font-medium">{r.task}</div>
                        <div className="text-xs text-muted-foreground">{r.who}</div>
                      </div>
                    </div>
                    <Badge tone={r.tone}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          对季度工作中已上线需求的<span className="text-foreground font-medium"> 预期收益 vs 实际收益 </span>进行对比与 ROI 跟踪。
          <div className="mt-4">
            <Link href="/value-tracking" className="text-primary hover:underline font-medium">
              前往需求价值跟踪页面 →
            </Link>
          </div>
        </div>
      )}

      <Dialog open={!!createDialog} onClose={() => setCreateDialog(null)} title={createDialog ? `新增${createDialog.title}工作` : "新增季度工作"}>
        {createDialog && (
          <QuarterlyWorkForm
            data={data}
            mode="create"
            status={createDialog.status}
            title={createDialog.title}
            onClose={() => setCreateDialog(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} title={editDialog ? `编辑${editDialog.title}工作` : "编辑季度工作"}>
        {editDialog && (
          <QuarterlyWorkForm
            data={data}
            mode="edit"
            status={editDialog.item.status}
            title={editDialog.title}
            item={editDialog.item}
            onClose={() => setEditDialog(null)}
          />
        )}
      </Dialog>
    </>
  );
}
