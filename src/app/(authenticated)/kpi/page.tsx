import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
import { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import { getWorkIncidentPageData } from "@/server/talent/incident-query";
import { KpiContent } from "./content";

type PageProps = {
  searchParams?: Promise<{ year?: string | string[] | undefined; quarter?: string | string[] | undefined }>;
};

function parseIntParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export default async function KpiPage({ searchParams }: PageProps) {
  const currentUser = await requireCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const selectedYear = parseIntParam(params?.year);
  const selectedQuarter = parseIntParam(params?.quarter);
  const [data, assessmentData, incidentData] = await Promise.all([
    getKpiData(currentUser, { selectedYear, selectedQuarter }),
    getBusinessAssessmentPageData(currentUser, { selectedYear, selectedQuarter }),
    getWorkIncidentPageData(currentUser, { selectedYear, selectedQuarter }),
  ]);
  return (
    <KpiContent
      data={data}
      assessmentData={JSON.parse(JSON.stringify(assessmentData))}
      incidentData={JSON.parse(JSON.stringify(incidentData))}
      selectedYear={selectedYear ?? data.year}
      selectedQuarter={selectedQuarter ?? data.quarter}
    />
  );
}
