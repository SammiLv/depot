"use server";

import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
import { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import { getWorkIncidentPageData } from "@/server/talent/incident-query";
import type { KpiSectionTab } from "@/app/(authenticated)/kpi/kpi-sections";

export async function loadKpiSectionPageData(
  activeSection: KpiSectionTab,
  selectedYear?: number,
  selectedQuarter?: number,
) {
  const user = await requireCurrentUser();
  const data = await getKpiData(user, { selectedYear, selectedQuarter });
  const resolvedYear = selectedYear ?? data.year;
  const resolvedQuarter = selectedQuarter ?? data.quarter;

  if (activeSection === "business-assessment") {
    const assessmentData = await getBusinessAssessmentPageData(user, { selectedYear, selectedQuarter });
    return JSON.parse(JSON.stringify({
      activeSection,
      data,
      selectedYear: resolvedYear,
      selectedQuarter: resolvedQuarter,
      assessmentData,
    }));
  }

  if (activeSection === "work-incident") {
    const incidentData = await getWorkIncidentPageData(user, { selectedYear, selectedQuarter });
    return JSON.parse(JSON.stringify({
      activeSection,
      data,
      selectedYear: resolvedYear,
      selectedQuarter: resolvedQuarter,
      incidentData,
    }));
  }

  return JSON.parse(JSON.stringify({
    activeSection,
    data,
    selectedYear: resolvedYear,
    selectedQuarter: resolvedQuarter,
  }));
}
