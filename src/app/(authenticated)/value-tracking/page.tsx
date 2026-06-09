import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { getOwnerWhereByScope } from "@/server/permissions/data-scope";
import { Badge, Card, PageHeader, Progress } from "@/components/ui-kit";
import { TrendingUp, TrendingDown } from "lucide-react";

function calculateRoi(expected: string, actual: string | null): { roi: number; trend: "up" | "down"; tone: "primary" | "success" | "warning" } {
  // Simple heuristic: if actual contains a number, compare with expected
  const extractNum = (s: string) => {
    const m = s.match(/(\d+\.?\d*)/);
    return m ? parseFloat(m[1]) : 0;
  };
  const e = extractNum(expected);
  const a = actual ? extractNum(actual) : 0;
  if (e === 0) return { roi: 100, trend: "up", tone: "success" };
  const roi = Math.round((a / e) * 100);
  return {
    roi: Math.min(200, Math.max(0, roi)),
    trend: roi >= 100 ? "up" : "down",
    tone: roi >= 100 ? "success" : roi >= 70 ? "primary" : "warning",
  };
}

export default async function ValueTrackingPage() {
  const currentUser = await requireCurrentUser();

  const tracks = await prisma.requirementValueTrack.findMany({
    where: getOwnerWhereByScope(currentUser),
    orderBy: { createdAt: "desc" },
  });

  // Resolve owner names
  const ownerIds = [...new Set(tracks.map((t) => t.ownerId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true },
  });
  const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

  return (
    <>
      <PageHeader title="需求价值跟踪" description="对已上线需求的预期收益 vs 实际收益对比与 ROI 跟踪" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tracks.length ? (
          tracks.map((t) => {
            const meta = calculateRoi(t.expectedValue, t.actualValue);
            return (
              <Card key={t.id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold">{t.requirementName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      负责人：{ownerMap.get(t.ownerId) ?? "—"} · 项目：{t.projectName}
                    </div>
                  </div>
                  <Badge tone={meta.tone}>ROI {meta.roi}%</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-xs text-muted-foreground">预期</div>
                    <div className="font-medium mt-0.5">{t.expectedValue}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <div className="text-xs text-muted-foreground">实际</div>
                    <div className="font-medium mt-0.5 flex items-center gap-1">
                      {t.actualValue ?? "—"}
                      {meta.trend === "up" ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : <TrendingDown className="w-3.5 h-3.5 text-warning-foreground" />}
                    </div>
                  </div>
                </div>
                <Progress value={meta.roi} tone={meta.tone} />
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
