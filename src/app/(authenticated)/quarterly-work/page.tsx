import { requireCurrentUser } from "@/server/auth/current-user";
import { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { QuarterlyWorkContent } from "./content";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  const data = await getQuarterlyWorkData(currentUser, {
    selectedYear,
    selectedQuarter,
    goalId: readParam(params?.goalId),
    view: readParam(params?.view) === "list" ? "list" : "card",
    projectPanel: readParam(params?.projectPanel) === "value" ? "value" : "task",
    status: readParam(params?.status) as NonNullable<Parameters<typeof getQuarterlyWorkData>[1]>["status"],
    orgNodeId: readParam(params?.orgNodeId),
    teamId: readParam(params?.teamId),
    ownerId: readParam(params?.ownerId),
    projectId: readParam(params?.projectId),
    query: readParam(params?.q),
  });
  return <QuarterlyWorkContent data={data} />;
}
