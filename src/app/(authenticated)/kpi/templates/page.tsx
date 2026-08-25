import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
import { KpiContent } from "../content";
import { parsePeriodFromSearchParams, type PeriodSearchParams } from "../parse-period-params";

type PageProps = {
  searchParams?: Promise<PeriodSearchParams>;
};

export default async function KpiTemplatesPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { selectedYear, selectedQuarter } = parsePeriodFromSearchParams(params);
  const currentUser = await requireCurrentUser();
  const data = await getKpiData(currentUser, { selectedYear, selectedQuarter });

  return (
    <KpiContent
      data={data}
      selectedYear={selectedYear ?? data.year}
      selectedQuarter={selectedQuarter ?? data.quarter}
      activeSection="kpi-template"
    />
  );
}
