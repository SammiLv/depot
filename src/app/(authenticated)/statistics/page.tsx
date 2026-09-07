import { requireCurrentUser } from "@/server/auth/current-user";
import { PageHeader } from "@/components/ui-kit";

export default async function StatisticsPage() {
  await requireCurrentUser();

  return (
    <>
      <PageHeader title="数据统计" description="数据统计模块建设中，敬请期待。" />
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <img src="/icons/empty-no-statistics.png" alt="" width={160} height={160} className="h-40 w-40 opacity-80" />
        <p className="text-sm text-muted-foreground">数据统计功能正在建设中，后续将在此模块提供。</p>
      </div>
    </>
  );
}
