import { requireCurrentUser } from "@/server/auth/current-user";
import { getAnnualGoalsData } from "@/server/annual-goals/annual-goals-query";
import { AnnualGoalsContent } from "./content";

type PageProps = {
  searchParams?: Promise<{ year?: string | string[] | undefined }>;
};

function parseSelectedYear(rawYear: string | string[] | undefined) {
  const value = Array.isArray(rawYear) ? rawYear[0] : rawYear;
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function AnnualGoalsPage({ searchParams }: PageProps) {
  const currentUser = await requireCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const selectedYear = parseSelectedYear(params?.year);
  const data = await getAnnualGoalsData(currentUser, { selectedYear });

  return <AnnualGoalsContent data={data} />;
}
