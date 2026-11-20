import QuarterlyWorkPage from "../../page";

export default async function ValueTrackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  return QuarterlyWorkPage({
    searchParams: Promise.resolve({ ...query, panel: "value", detailProjectId: projectId }),
  });
}
