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
  const data = await getPersonalKpiDetail(currentUser, id);

  return <KpiDetailContent data={data} viewOnly={mode === "view"} />;
}
