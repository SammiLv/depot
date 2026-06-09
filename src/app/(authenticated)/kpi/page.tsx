import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
import { KpiContent } from "./content";

export default async function KpiPage() {
  const currentUser = await requireCurrentUser();
  const data = await getKpiData(currentUser);
  return <KpiContent data={data} />;
}
