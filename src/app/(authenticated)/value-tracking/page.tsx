import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope } from "@/server/permissions/data-scope";
import { Badge, Card, PageHeader } from "@/components/ui-kit";

function calculateRoi(expected: string | null, actual: string | null): { roi: number; tone: "primary" | "success" | "warning" } {
  const extractNum = (s: string | null) => {
    if (!s) return 0;
    const m = s.match(/(\d+\.?\d*)/);
    return m ? parseFloat(m[1]) : 0;
  };
  const e = extractNum(expected);
  const a = extractNum(actual);
  if (e === 0) return { roi: 100, tone: "success" };
  const roi = Math.round((a / e) * 100);
  return {
    roi: Math.min(200, Math.max(0, roi)),
    tone: roi >= 100 ? "success" : roi >= 70 ? "primary" : "warning",
  };
}

function formatDateLabel(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export default async function ValueTrackingPage() {
  const currentUser = await requireCurrentUser();
  const projectWhere = await getOwnerWhereByScope(currentUser);
  const tracks = await prisma.requirementValueTrack.findMany({
    where: {
      deletedAt: null,
      projectId: {
        in: (await prisma.project.findMany({
          where: projectWhere,
          select: { id: true },
        })).map((project) => project.id),
      },
    },
    orderBy: { trackedAt: "desc" },
  });

  const projectIds = [...new Set(tracks.map((track) => track.projectId))];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      title: true,
      ownerId: true,
      expectedOutcome: true,
      actualValue: true,
      otherCost: true,
      workloadPersonDay: true,
      valueJudgement: true,
      completedAt: true,
    },
  });
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  const ownerIds = [...new Set(projects.map((project) => project.ownerId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true },
  });
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner.name]));

  return (
    <>
      <PageHeader title="需求价值跟踪" description="对已上线需求的预期收益 vs 实际收益对比与 ROI 跟踪" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tracks.length ? (
          tracks.map((track) => {
            const project = projectMap.get(track.projectId);
            const meta = calculateRoi(project?.expectedOutcome ?? null, project?.actualValue ?? null);
            return (
              <Card key={track.id}>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{project?.title ?? "—"}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      负责人：{project ? ownerMap.get(project.ownerId) ?? "—" : "—"} · 完成时间：{formatDateLabel(project?.completedAt ?? null)}
                    </div>
                  </div>
                  <Badge tone={meta.tone}>ROI {meta.roi}%</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">预期收益</div>
                    <div className="mt-0.5 font-medium">{project?.expectedOutcome ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">实际收益</div>
                    <div className="mt-0.5 font-medium">{project?.actualValue ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">工作量(人天)</div>
                    <div className="mt-0.5 font-medium">{project?.workloadPersonDay ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">价值判断</div>
                    <div className="mt-0.5 font-medium">{project?.valueJudgement ?? "—"}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">跟踪结果描述</div>
                    <div className="mt-1 whitespace-pre-wrap break-words">{track.trackingResult}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">后续优化</div>
                    <div className="mt-1 whitespace-pre-wrap break-words">{track.followUpOptimization || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">其他成本</div>
                    <div className="mt-1 whitespace-pre-wrap break-words">{project?.otherCost ?? "—"}</div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full py-12 text-center text-sm text-muted-foreground">暂无需求价值跟踪数据</div>
        )}
      </div>
    </>
  );
}
