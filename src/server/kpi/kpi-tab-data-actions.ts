"use server";

import { requireCurrentUser } from "@/server/auth/current-user";
import { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import { getWorkIncidentPageData } from "@/server/talent/incident-query";

export async function loadKpiAssessmentTabData(selectedYear?: number, selectedQuarter?: number) {
  const user = await requireCurrentUser();
  const data = await getBusinessAssessmentPageData(user, { selectedYear, selectedQuarter });
  return JSON.parse(JSON.stringify(data));
}

export async function loadKpiIncidentTabData(selectedYear?: number, selectedQuarter?: number) {
  const user = await requireCurrentUser();
  const data = await getWorkIncidentPageData(user, { selectedYear, selectedQuarter });
  return JSON.parse(JSON.stringify(data));
}
