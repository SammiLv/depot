import QuarterlyWorkPage from "../../page";

export default async function ValueTrackDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return QuarterlyWorkPage({
    searchParams: Promise.resolve({ panel: "value", projectId }),
  });
}
