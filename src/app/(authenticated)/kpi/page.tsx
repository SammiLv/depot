import { requireCurrentUser } from "@/server/auth/current-user";
import { getKpiData } from "@/server/kpi/kpi-query";
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
  const data = await getKpiData(currentUser, { selectedYear, selectedQuarter });
  return <KpiContent data={data} />;
}
