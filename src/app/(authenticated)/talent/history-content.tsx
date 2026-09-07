"use client";

import { TalentHistoryWorkspace } from "./operation-workspaces";
import type { EmployeeProfileWorkspaceData, HistoryWorkspaceData } from "./operation-workspace-types";

export function TalentHistoryPageContent({
  historyData,
  employeeProfiles,
  initialCategory = "profiles",
}: {
  historyData: HistoryWorkspaceData;
  employeeProfiles: EmployeeProfileWorkspaceData;
  initialCategory?: "profiles" | "promotion" | "contract" | "salary" | "reward";
}) {
  return (
    <TalentHistoryWorkspace
      data={historyData}
      employeeProfiles={employeeProfiles}
      initialCategory={initialCategory}
    />
  );
}
