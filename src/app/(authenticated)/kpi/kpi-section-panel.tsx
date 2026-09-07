import { requireCurrentUser } from "@/server/auth/current-user";
import { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import { getWorkIncidentPageData } from "@/server/talent/incident-query";
import { getCachedKpiPageData } from "@/server/kpi/cached-kpi-query";
import { KpiContent } from "./content";
import type { KpiSectionTab } from "./kpi-sections";

export async function KpiSectionPanel({
  activeSection,
  selectedYear,
  selectedQuarter,
}: {
  activeSection: KpiSectionTab;
  selectedYear?: number;
  selectedQuarter?: number;
}) {
  const currentUser = await requireCurrentUser();
  const data = await getCachedKpiPageData(currentUser, { selectedYear, selectedQuarter });
  const resolvedYear = selectedYear ?? data.year;
  const resolvedQuarter = selectedQuarter ?? data.quarter;

  if (activeSection === "business-assessment") {
    const assessmentData = await getBusinessAssessmentPageData(currentUser, { selectedYear, selectedQuarter });
    return (
      <KpiContent
        data={data}
        selectedYear={resolvedYear}
        selectedQuarter={resolvedQuarter}
        activeSection={activeSection}
        assessmentData={JSON.parse(JSON.stringify(assessmentData))}
      />
    );
  }

  if (activeSection === "work-incident") {
    const incidentData = await getWorkIncidentPageData(currentUser, { selectedYear, selectedQuarter });
    return (
      <KpiContent
        data={data}
        selectedYear={resolvedYear}
        selectedQuarter={resolvedQuarter}
        activeSection={activeSection}
        incidentData={JSON.parse(JSON.stringify(incidentData))}
      />
    );
  }

  return (
    <KpiContent
      data={data}
      selectedYear={resolvedYear}
      selectedQuarter={resolvedQuarter}
      activeSection={activeSection}
    />
  );
}
