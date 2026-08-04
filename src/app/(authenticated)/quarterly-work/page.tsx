import { requireCurrentUser } from "@/server/auth/current-user";
import { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { QuarterlyWorkContent } from "./content";

type PageProps = {
  searchParams?: Promise<{ year?: string | string[] | undefined; quarter?: string | string[] | undefined }>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(value: string | string[] | undefined) {
  const raw = readParam(value);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export default async function QuarterlyWorkPage({ searchParams }: PageProps) {
  const currentUser = await requireCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const selectedYear = parseIntParam(params?.year);
  const selectedQuarterRaw = readParam(params?.quarter);
  const selectedQuarter = selectedQuarterRaw === "all" ? "all" : parseIntParam(params?.quarter);
  const data = await getQuarterlyWorkData(currentUser, { selectedYear, selectedQuarter });
  return <QuarterlyWorkContent data={data} />;
}
