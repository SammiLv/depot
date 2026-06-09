import { requireCurrentUser } from "@/server/auth/current-user";
import { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { QuarterlyWorkContent } from "./content";

export default async function QuarterlyWorkPage() {
  const currentUser = await requireCurrentUser();
  const data = await getQuarterlyWorkData(currentUser);
  return <QuarterlyWorkContent data={data} />;
}
