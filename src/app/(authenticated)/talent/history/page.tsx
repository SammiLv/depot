import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import {
  getCachedEmployeeProfileManagementData,
  getCachedTalentHistoryData,
} from "@/server/talent/cached-talent-page-data";
import { TalentHistoryPageContent } from "../history-content";
import { requireTalentSection, resolveTalentVisibleSections } from "../resolve-visible-sections";
import { resolveLegacyTalentSectionRedirect } from "../talent-sections";
import { TalentSectionPage } from "../talent-section-page";

type PageProps = {
  searchParams?: Promise<{ userId?: string; importBatchId?: string; category?: string; section?: string; tab?: string }>;
};

function parseHistoryCategory(value: string | undefined): "profiles" | "promotion" | "contract" | "salary" | "reward" {
  if (value === "promotion" || value === "contract" || value === "salary" || value === "reward") return value;
  return "profiles";
}

export default async function TalentHistoryPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const legacySection = params?.section ?? params?.tab;
  const legacyRedirect = resolveLegacyTalentSectionRedirect(legacySection, new URLSearchParams(Object.entries(params ?? {}).flatMap(([key, value]) => {
    if (value === undefined || key === "section" || key === "tab") return [];
    return [[key, String(value)]];
  })));
  if (legacyRedirect && legacySection !== "history") redirect(legacyRedirect);

  const user = await requireCurrentUser();
  const visibleSections = await resolveTalentVisibleSections(user);
  if (!(await requireTalentSection(user, "history"))) redirect("/talent");

  const [historyData, employeeProfiles] = await Promise.all([
    getCachedTalentHistoryData(user, params?.userId, params?.importBatchId),
    getCachedEmployeeProfileManagementData(user),
  ]);

  return (
    <TalentSectionPage visibleSections={visibleSections} activeSection="history">
      <TalentHistoryPageContent
        historyData={JSON.parse(JSON.stringify(historyData))}
        employeeProfiles={JSON.parse(JSON.stringify(employeeProfiles))}
        initialCategory={parseHistoryCategory(params?.category)}
      />
    </TalentSectionPage>
  );
}
