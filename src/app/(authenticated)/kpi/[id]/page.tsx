import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getPersonalKpiDetail } from "@/server/kpi/kpi-query";
import { KpiDetailContent } from "./content";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function KpiDetailPage({ params, searchParams }: PageProps) {
  const currentUser = await requireCurrentUser();
  const { id } = await params;
  const { mode } = await searchParams;

  try {
    const data = await getPersonalKpiDetail(currentUser, id);
    return <KpiDetailContent data={data} viewOnly={mode === "view"} />;
  } catch (error) {
    if (error instanceof Error && error.message === "季度 KPI 不存在或无权限查看") {
      redirect(`/kpi?error=${encodeURIComponent("你浏览的KPI数据已删除或无权限查看")}`);
    }
    throw error;
  }
}
