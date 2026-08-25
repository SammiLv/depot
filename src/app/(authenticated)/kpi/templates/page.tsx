import { requireCurrentUser } from "@/server/auth/current-user";
import { KpiSectionPanel } from "../kpi-section-panel";
import { parsePeriodFromSearchParams, type PeriodSearchParams } from "../parse-period-params";

type PageProps = {
  searchParams?: Promise<PeriodSearchParams>;
};

export default async function KpiTemplatesPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { selectedYear, selectedQuarter } = parsePeriodFromSearchParams(params);
  await requireCurrentUser();

  return (
    <KpiSectionPanel
      activeSection="kpi-template"
      selectedYear={selectedYear}
      selectedQuarter={selectedQuarter}
    />
  );
}
