import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
import { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import { KpiContent } from "../content";
import { parsePeriodFromSearchParams, type PeriodSearchParams } from "../parse-period-params";

type PageProps = {
  searchParams?: Promise<PeriodSearchParams>;
};

export default async function KpiBusinessAssessmentPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { selectedYear, selectedQuarter } = parsePeriodFromSearchParams(params);
  const currentUser = await requireCurrentUser();
  const [data, assessmentData] = await Promise.all([
    getKpiData(currentUser, { selectedYear, selectedQuarter }),
    getBusinessAssessmentPageData(currentUser, { selectedYear, selectedQuarter }),
  ]);

  return (
    <KpiContent
      data={data}
      selectedYear={selectedYear ?? data.year}
      selectedQuarter={selectedQuarter ?? data.quarter}
      activeSection="business-assessment"
      assessmentData={JSON.parse(JSON.stringify(assessmentData))}
    />
  );
}
