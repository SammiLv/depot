import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
import { getWorkIncidentPageData } from "@/server/talent/incident-query";
import { KpiContent } from "../content";
import { parsePeriodFromSearchParams, type PeriodSearchParams } from "../parse-period-params";

type PageProps = {
  searchParams?: Promise<PeriodSearchParams>;
};

export default async function KpiWorkIncidentsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { selectedYear, selectedQuarter } = parsePeriodFromSearchParams(params);
  const currentUser = await requireCurrentUser();
  const [data, incidentData] = await Promise.all([
    getKpiData(currentUser, { selectedYear, selectedQuarter }),
    getWorkIncidentPageData(currentUser, { selectedYear, selectedQuarter }),
  ]);

  return (
    <KpiContent
      data={data}
      selectedYear={selectedYear ?? data.year}
      selectedQuarter={selectedQuarter ?? data.quarter}
      activeSection="work-incident"
      incidentData={JSON.parse(JSON.stringify(incidentData))}
    />
  );
}
