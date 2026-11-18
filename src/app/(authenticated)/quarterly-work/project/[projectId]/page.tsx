import QuarterlyWorkPage from "../../page";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return QuarterlyWorkPage({
    searchParams: Promise.resolve({ panel: "project", projectId }),
  });
}
