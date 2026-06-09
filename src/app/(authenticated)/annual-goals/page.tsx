import { requireCurrentUser } from "@/server/auth/current-user";
import { getAnnualGoalsData } from "@/server/annual-goals/annual-goals-query";
import { AnnualGoalsContent } from "./content";

export default async function AnnualGoalsPage() {
  const currentUser = await requireCurrentUser();
  const data = await getAnnualGoalsData(currentUser);

  return <AnnualGoalsContent data={data} />;
}
