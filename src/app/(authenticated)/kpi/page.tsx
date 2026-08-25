import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { KpiSectionPanel } from "./kpi-section-panel";
import { resolveLegacyKpiTabRedirect } from "./kpi-sections";
import { parsePeriodFromSearchParams, type PeriodSearchParams } from "./parse-period-params";

type PageProps = {
  searchParams?: Promise<PeriodSearchParams>;
};

function toSearchParams(params: PeriodSearchParams | undefined) {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, item);
    } else {
      searchParams.set(key, value);
    }
  }
  return searchParams;
}

export default async function KpiPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { selectedYear, selectedQuarter, tab } = parsePeriodFromSearchParams(params);
  const legacyRedirect = resolveLegacyKpiTabRedirect(tab, toSearchParams(params));
  if (legacyRedirect) redirect(legacyRedirect);

  await requireCurrentUser();

  return (
    <KpiSectionPanel
      activeSection="quarterly-kpi"
      selectedYear={selectedYear}
      selectedQuarter={selectedQuarter}
    />
  );
}
