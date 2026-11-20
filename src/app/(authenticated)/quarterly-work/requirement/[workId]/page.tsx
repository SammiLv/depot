import QuarterlyWorkPage from "../../page";

export default async function RequirementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workId } = await params;
  const query = await searchParams;
  return QuarterlyWorkPage({
    searchParams: Promise.resolve({ ...query, panel: "task", detailWorkId: workId }),
  });
}
