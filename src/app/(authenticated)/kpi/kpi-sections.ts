export type KpiSectionTab = "quarterly-kpi" | "business-assessment" | "work-incident" | "kpi-template";

export const KPI_SECTION_TABS: { key: KpiSectionTab; label: string; href: string }[] = [
  { key: "quarterly-kpi", label: "季度KPI", href: "/kpi" },
  { key: "business-assessment", label: "业务考核", href: "/kpi/business-assessment" },
  { key: "work-incident", label: "工作事故", href: "/kpi/work-incidents" },
  { key: "kpi-template", label: "KPI模板", href: "/kpi/templates" },
];

const legacyTabRedirects: Record<string, string> = {
  "business-assessment": "/kpi/business-assessment",
  "work-incident": "/kpi/work-incidents",
  "kpi-template": "/kpi/templates",
};

export function resolveLegacyKpiTabRedirect(tab: string | undefined, searchParams: URLSearchParams) {
  const target = tab ? legacyTabRedirects[tab] : undefined;
  if (!target) return null;
  const params = new URLSearchParams(searchParams.toString());
  params.delete("tab");
  const query = params.toString();
  return query ? `${target}?${query}` : target;
}

export function buildKpiSectionHref(sectionHref: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  const year = searchParams.get("year");
  const quarter = searchParams.get("quarter");
  if (year) params.set("year", year);
  if (quarter) params.set("quarter", quarter);
  const query = params.toString();
  return query ? `${sectionHref}?${query}` : sectionHref;
}
