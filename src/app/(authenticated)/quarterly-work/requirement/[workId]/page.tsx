import QuarterlyWorkPage from "../../page";

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  return QuarterlyWorkPage({
    searchParams: Promise.resolve({ panel: "task", workId }),
  });
}
