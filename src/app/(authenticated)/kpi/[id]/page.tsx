import { requireCurrentUser } from "@/server/auth/current-user";
import { getPersonalKpiDetail } from "@/server/kpi/kpi-query";
import { KpiDetailContent } from "./content";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function KpiDetailPage({ params }: PageProps) {
  const currentUser = await requireCurrentUser();
  const { id } = await params;
  const data = await getPersonalKpiDetail(currentUser, id);

  return <KpiDetailContent data={data} />;
}
